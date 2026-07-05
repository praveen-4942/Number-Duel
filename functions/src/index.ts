import { initializeApp } from "firebase-admin/app";
import { getDatabase, ServerValue } from "firebase-admin/database";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

initializeApp();

const db = getDatabase();
const ROOM_TTL_MS = 60 * 60 * 1000;
const DISCONNECT_GRACE_MS = 60 * 1000;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EMOJIS = new Set(["🔥", "⚡", "😎", "🎯", "🤯", "👀", "👏", "💫"]);
const MODES = new Set(["classic", "advanced", "bullsCows"]);
const LENGTHS = new Set([3, 4, 5, 6]);

type ClueMode = "classic" | "advanced" | "bullsCows";
type RoomStatus = "lobby" | "playing" | "finished" | "closed";

type PlayerPrivate = {
  uid: string;
  name: string;
  secret: string;
  ready: boolean;
  wins: number;
  losses: number;
};

type PrivateRoom = {
  roomCode: string;
  hostUid: string;
  status: RoomStatus;
  settings: {
    numberLength: number;
    clueMode: ClueMode;
    timerSeconds: number;
    allowSpectators: boolean;
  };
  players: Record<string, PlayerPrivate>;
  playerOrder: string[];
  currentTurnUid?: string;
  round: number;
  createdAt: number;
  expiresAt: number;
  turnStartedAt?: number;
  rematchVotes?: Record<string, boolean>;
};

type GuessRecord = {
  id: string;
  guess: string;
  ownerUid?: string;
  ownerName?: string;
  correctDigits?: number;
  correctPositions?: number;
  bulls?: number;
  cows?: number;
  createdAt: number;
  round: number;
};

function requireUid(auth: { uid?: string } | undefined): string {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in anonymously before playing.");
  }
  return auth.uid;
}

function normalizeCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "Room code is required.");
  }
  return value.trim().toUpperCase();
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "Name is required.");
  }
  const name = value.trim().slice(0, 20);
  if (name.length < 1) {
    throw new HttpsError("invalid-argument", "Name cannot be empty.");
  }
  return name;
}

function validateSecret(value: unknown, length: number): string {
  if (typeof value !== "string" || !new RegExp(`^\\d{${length}}$`).test(value)) {
    throw new HttpsError("invalid-argument", `Number must be exactly ${length} digits.`);
  }
  if (new Set(value).size !== value.length) {
    throw new HttpsError("invalid-argument", "Repeated digits are not allowed.");
  }
  return value;
}

function validateSettings(data: Record<string, unknown>) {
  const numberLength = Number(data.numberLength ?? 4);
  const clueMode = String(data.clueMode ?? "bullsCows") as ClueMode;
  const timerSeconds = Number(data.timerSeconds ?? 0);
  const allowSpectators = Boolean(data.allowSpectators ?? false);

  if (!LENGTHS.has(numberLength)) {
    throw new HttpsError("invalid-argument", "Number length must be 3, 4, 5, or 6.");
  }
  if (!MODES.has(clueMode)) {
    throw new HttpsError("invalid-argument", "Unsupported clue mode.");
  }
  if (![0, 30, 45, 60, 90].includes(timerSeconds)) {
    throw new HttpsError("invalid-argument", "Unsupported timer length.");
  }

  return { numberLength, clueMode, timerSeconds, allowSpectators };
}

function randomRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

async function createUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const code = randomRoomCode();
    const snap = await db.ref(`privateRooms/${code}`).get();
    if (!snap.exists()) {
      return code;
    }
  }
  throw new HttpsError("resource-exhausted", "Could not allocate a room code.");
}

function publicPlayer(player: PlayerPrivate, connected = true) {
  return {
    uid: player.uid,
    name: player.name,
    ready: player.ready,
    connected,
    wins: player.wins,
    losses: player.losses
  };
}

function scoreGuess(secret: string, guess: string, mode: ClueMode) {
  const correctPositions = guess.split("").filter((digit, index) => digit === secret[index]).length;
  const correctDigits = guess.split("").filter((digit) => secret.includes(digit)).length;
  if (mode === "classic") {
    return { correctPositions };
  }
  if (mode === "advanced") {
    return { correctDigits, correctPositions };
  }
  return {
    bulls: correctPositions,
    cows: correctDigits - correctPositions
  };
}

async function publishRoom(room: PrivateRoom, revealSecrets = false) {
  const presenceSnap = await db.ref(`presence/${room.roomCode}`).get();
  const presence = presenceSnap.val() ?? {};
  const players = Object.fromEntries(
    Object.entries(room.players).map(([uid, player]) => [
      uid,
      {
        ...publicPlayer(player, presence[uid]?.online === true),
        ...(revealSecrets ? { secret: player.secret } : {})
      }
    ])
  );

  await db.ref(`publicRooms/${room.roomCode}`).update({
    roomCode: room.roomCode,
    hostUid: room.hostUid,
    status: room.status,
    settings: room.settings,
    players,
    playerOrder: room.playerOrder,
    currentTurnUid: room.currentTurnUid ?? null,
    round: room.round,
    turnStartedAt: room.turnStartedAt ?? null,
    rematchVotes: room.rematchVotes ?? {},
    updatedAt: ServerValue.TIMESTAMP
  });
}

async function getRoom(roomCode: string): Promise<PrivateRoom> {
  const snap = await db.ref(`privateRooms/${roomCode}`).get();
  if (!snap.exists()) {
    throw new HttpsError("not-found", "Room not found.");
  }
  return snap.val() as PrivateRoom;
}

async function assertPlayer(room: PrivateRoom, uid: string) {
  const player = room.players?.[uid];
  if (!player) {
    throw new HttpsError("permission-denied", "You are not a player in this room.");
  }
  return player;
}

async function closeExpiredRooms() {
  const now = Date.now();
  const snap = await db.ref("privateRooms").orderByChild("expiresAt").endAt(now).get();
  const updates: Record<string, unknown> = {};
  snap.forEach((child) => {
    const code = child.key;
    if (code) {
      updates[`privateRooms/${code}`] = null;
      updates[`publicRooms/${code}/status`] = "closed";
      updates[`publicRooms/${code}/closedAt`] = now;
    }
  });
  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }
}

export const createRoom = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const data = request.data as Record<string, unknown>;
  const name = cleanName(data.name);
  const settings = validateSettings(data);
  const secret = validateSecret(data.secret, settings.numberLength);
  const roomCode = await createUniqueRoomCode();
  const now = Date.now();
  const room: PrivateRoom = {
    roomCode,
    hostUid: uid,
    status: "lobby",
    settings,
    players: {
      [uid]: { uid, name, secret, ready: true, wins: 0, losses: 0 }
    },
    playerOrder: [uid],
    round: 1,
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    rematchVotes: {}
  };

  await db.ref(`privateRooms/${roomCode}`).set(room);
  await db.ref(`playerRooms/${uid}`).set({ roomCode, role: "player" });
  await db.ref(`presence/${roomCode}/${uid}`).set({ online: true, lastSeen: ServerValue.TIMESTAMP });
  await publishRoom(room);
  return { roomCode };
});

export const joinRoom = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const data = request.data as Record<string, unknown>;
  const roomCode = normalizeCode(data.roomCode);
  const name = cleanName(data.name);
  const room = await getRoom(roomCode);

  if (room.status !== "lobby") {
    throw new HttpsError("failed-precondition", "This room has already started.");
  }
  if (room.players[uid]) {
    await db.ref(`presence/${roomCode}/${uid}`).set({ online: true, lastSeen: ServerValue.TIMESTAMP });
    await publishRoom(room);
    return { roomCode };
  }
  if (room.playerOrder.length >= 2) {
    throw new HttpsError("resource-exhausted", "This room already has two players.");
  }

  const secret = validateSecret(data.secret, room.settings.numberLength);
  room.players[uid] = { uid, name, secret, ready: true, wins: 0, losses: 0 };
  room.playerOrder.push(uid);
  room.status = "playing";
  room.currentTurnUid = room.playerOrder[Math.floor(Math.random() * 2)];
  room.turnStartedAt = Date.now();
  room.expiresAt = Date.now() + ROOM_TTL_MS;

  await db.ref(`privateRooms/${roomCode}`).set(room);
  await db.ref(`playerRooms/${uid}`).set({ roomCode, role: "player" });
  await db.ref(`presence/${roomCode}/${uid}`).set({ online: true, lastSeen: ServerValue.TIMESTAMP });
  await publishRoom(room);
  return { roomCode };
});

export const joinSpectator = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const roomCode = normalizeCode((request.data as Record<string, unknown>).roomCode);
  const room = await getRoom(roomCode);
  if (!room.settings.allowSpectators) {
    throw new HttpsError("permission-denied", "Spectators are disabled for this room.");
  }
  await db.ref(`publicRooms/${roomCode}/spectators/${uid}`).set({ joinedAt: ServerValue.TIMESTAMP });
  await db.ref(`playerRooms/${uid}`).set({ roomCode, role: "spectator" });
  return { roomCode };
});

export const submitGuess = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const data = request.data as Record<string, unknown>;
  const roomCode = normalizeCode(data.roomCode);
  const room = await getRoom(roomCode);
  await assertPlayer(room, uid);

  if (room.status !== "playing" || room.currentTurnUid !== uid) {
    throw new HttpsError("failed-precondition", "It is not your turn.");
  }

  const guess = validateSecret(data.guess, room.settings.numberLength);
  const opponentUid = room.playerOrder.find((id) => id !== uid);
  if (!opponentUid) {
    throw new HttpsError("failed-precondition", "Waiting for opponent.");
  }

  const opponent = room.players[opponentUid];
  const clue = scoreGuess(opponent.secret, guess, room.settings.clueMode);
  const won = guess === opponent.secret;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: GuessRecord = {
    id,
    guess,
    ownerUid: uid,
    ownerName: room.players[uid].name,
    ...clue,
    createdAt: Date.now(),
    round: room.round
  };

  const updates: Record<string, unknown> = {
    [`privateRooms/${roomCode}/expiresAt`]: Date.now() + ROOM_TTL_MS,
    [`playerData/${uid}/${roomCode}/history/${id}`]: record,
    [`playerData/${opponentUid}/${roomCode}/history/${id}`]: record
  };

  if (won) {
    room.status = "finished";
    room.players[uid].wins += 1;
    room.players[opponentUid].losses += 1;
    updates[`privateRooms/${roomCode}/status`] = "finished";
    updates[`privateRooms/${roomCode}/players/${uid}/wins`] = room.players[uid].wins;
    updates[`privateRooms/${roomCode}/players/${opponentUid}/losses`] = room.players[opponentUid].losses;
    updates[`publicRooms/${roomCode}/winnerUid`] = uid;
    updates[`publicRooms/${roomCode}/finishedAt`] = ServerValue.TIMESTAMP;
  } else {
    room.currentTurnUid = opponentUid;
    room.round += 1;
    room.turnStartedAt = Date.now();
    updates[`privateRooms/${roomCode}/currentTurnUid`] = opponentUid;
    updates[`privateRooms/${roomCode}/round`] = room.round;
    updates[`privateRooms/${roomCode}/turnStartedAt`] = room.turnStartedAt;
  }

  await db.ref().update(updates);
  await publishRoom(room, won);
  return { clue, won };
});

export const rematch = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const data = request.data as Record<string, unknown>;
  const roomCode = normalizeCode(data.roomCode);
  const room = await getRoom(roomCode);
  const player = await assertPlayer(room, uid);
  if (room.status !== "finished") {
    throw new HttpsError("failed-precondition", "Rematch is available after the duel finishes.");
  }
  const secret = validateSecret(data.secret, room.settings.numberLength);

  player.secret = secret;
  player.ready = true;
  room.rematchVotes = { ...(room.rematchVotes ?? {}), [uid]: true };

  const bothReady = room.playerOrder.length === 2 && room.playerOrder.every((id) => room.rematchVotes?.[id]);
  if (bothReady) {
    room.status = "playing";
    room.round = 1;
    room.currentTurnUid = room.playerOrder[Math.floor(Math.random() * 2)];
    room.turnStartedAt = Date.now();
    room.rematchVotes = {};
  }
  room.expiresAt = Date.now() + ROOM_TTL_MS;

  const historyUpdates = Object.fromEntries(room.playerOrder.map((id) => [`playerData/${id}/${roomCode}/history`, null]));
  await db.ref().update({
    [`privateRooms/${roomCode}`]: room,
    [`publicRooms/${roomCode}/winnerUid`]: null,
    [`publicRooms/${roomCode}/finishedAt`]: null,
    ...historyUpdates
  });
  await publishRoom(room);
  return { started: bothReady };
});

export const sendReaction = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const data = request.data as Record<string, unknown>;
  const roomCode = normalizeCode(data.roomCode);
  const emoji = String(data.emoji ?? "");
  const room = await getRoom(roomCode);
  await assertPlayer(room, uid);
  if (!EMOJIS.has(emoji)) {
    throw new HttpsError("invalid-argument", "Unsupported reaction.");
  }
  await db.ref(`publicRooms/${roomCode}/reactions`).push({
    uid,
    emoji,
    createdAt: ServerValue.TIMESTAMP
  });
  return { ok: true };
});

export const heartbeat = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const roomCode = normalizeCode((request.data as Record<string, unknown>).roomCode);
  await db.ref(`presence/${roomCode}/${uid}`).set({ online: true, lastSeen: ServerValue.TIMESTAMP });
  await closeExpiredRooms();
  return { serverTime: Date.now() };
});

export const leaveRoom = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const roomCode = normalizeCode((request.data as Record<string, unknown>).roomCode);
  const room = await getRoom(roomCode);
  if (!room.players[uid]) {
    await db.ref(`playerRooms/${uid}`).remove();
    return { ok: true };
  }

  const updates: Record<string, unknown> = {
    [`presence/${roomCode}/${uid}`]: { online: false, lastSeen: ServerValue.TIMESTAMP },
    [`playerRooms/${uid}`]: null
  };
  await db.ref().update(updates);
  await publishRoom(room);
  return { ok: true };
});

export const cleanupDisconnectedRoom = onCall(async (request) => {
  const uid = requireUid(request.auth);
  const roomCode = normalizeCode((request.data as Record<string, unknown>).roomCode);
  const room = await getRoom(roomCode);
  await assertPlayer(room, uid);
  const presenceSnap = await db.ref(`presence/${roomCode}`).get();
  const presence = presenceSnap.val() ?? {};
  const now = Date.now();
  const staleOpponent = room.playerOrder.some((id) => {
    if (id === uid) {
      return false;
    }
    return presence[id]?.online !== true && now - Number(presence[id]?.lastSeen ?? 0) > DISCONNECT_GRACE_MS;
  });
  if (!staleOpponent) {
    return { closed: false };
  }
  await db.ref().update({
    [`privateRooms/${roomCode}`]: null,
    [`publicRooms/${roomCode}/status`]: "closed",
    [`publicRooms/${roomCode}/closedAt`]: ServerValue.TIMESTAMP
  });
  logger.info("Closed disconnected room", { roomCode });
  return { closed: true };
});
