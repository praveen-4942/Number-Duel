import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import { get, getDatabase, push, ref, remove, serverTimestamp, set, update } from "firebase/database";
import type { ClueMode, GameSettings, PublicPlayer, PublicRoom } from "../types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const requiredKeys = [
  "apiKey",
  "authDomain",
  "databaseURL",
  "projectId",
  "appId"
] as const;

export const firebaseSetupError = requiredKeys.some((key) => !firebaseConfig[key])
  ? "Firebase is not configured yet. Create .env.local from .env.example and restart the dev server."
  : "";

export const app = firebaseSetupError ? null : initializeApp(firebaseConfig);
export const auth = app ? getAuth(app) : null;
export const database = app ? getDatabase(app) : null;

export function ensureAnonymousAuth(): Promise<User> {
  if (!auth) {
    return Promise.reject(new Error(firebaseSetupError));
  }
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          unsub();
          resolve(user);
          return;
        }
        const result = await signInAnonymously(auth);
        unsub();
        resolve(result.user);
      } catch (error) {
        unsub();
        reject(error);
      }
    });
  });
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function requireDatabase() {
  if (!database) {
    throw new Error(firebaseSetupError);
  }
  return database;
}

function requireCurrentUid() {
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    throw new Error("Authentication is still connecting. Try again in a moment.");
  }
  return uid;
}

function randomRoomCode() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

async function uniqueRoomCode() {
  const db = requireDatabase();
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const code = randomRoomCode();
    const snap = await get(ref(db, `publicRooms/${code}`));
    if (!snap.exists()) {
      return code;
    }
  }
  throw new Error("Could not create a unique room code.");
}

function validateSecret(secret: string, length: number) {
  if (!new RegExp(`^\\d{${length}}$`).test(secret) || new Set(secret).size !== secret.length) {
    throw new Error(`Secret must be ${length} unique digits.`);
  }
}

function publicPlayer(uid: string, name: string): PublicPlayer {
  return {
    uid,
    name: name.trim().slice(0, 20),
    ready: true,
    connected: true,
    wins: 0,
    losses: 0
  };
}

export function scoreGuess(secret: string, guess: string, mode: ClueMode) {
  const correctPositions = guess.split("").filter((digit, index) => digit === secret[index]).length;
  const correctDigits = guess.split("").filter((digit) => secret.includes(digit)).length;
  if (mode === "classic") {
    return { correctPositions };
  }
  if (mode === "advanced") {
    return { correctDigits, correctPositions };
  }
  return { bulls: correctPositions, cows: correctDigits - correctPositions };
}

export const api = {
  async createRoom(payload: { name: string; secret: string } & GameSettings) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    validateSecret(payload.secret, payload.numberLength);
    const roomCode = await uniqueRoomCode();
    const room: PublicRoom = {
      roomCode,
      hostUid: uid,
      status: "lobby",
      settings: {
        numberLength: payload.numberLength,
        clueMode: payload.clueMode,
        timerSeconds: payload.timerSeconds,
        allowSpectators: payload.allowSpectators
      },
      players: { [uid]: publicPlayer(uid, payload.name) },
      playerOrder: [uid],
      currentTurnUid: null,
      round: 1,
      turnStartedAt: null,
      rematchVotes: {}
    };
    await update(ref(db), {
      [`publicRooms/${roomCode}`]: room,
      [`playerRooms/${uid}`]: { roomCode, role: "player" },
      [`playerData/${uid}/${roomCode}/secret`]: payload.secret,
      [`presence/${roomCode}/${uid}`]: { online: true, lastSeen: serverTimestamp() }
    });
    return { data: { roomCode } };
  },

  async joinRoom(payload: { roomCode: string; name: string; secret: string }) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    const roomCode = payload.roomCode.trim().toUpperCase();
    const roomSnap = await get(ref(db, `publicRooms/${roomCode}`));
    if (!roomSnap.exists()) {
      throw new Error("Room not found.");
    }
    const room = roomSnap.val() as PublicRoom;
    validateSecret(payload.secret, room.settings.numberLength);
    if (room.status !== "lobby" && !room.players?.[uid]) {
      throw new Error("This room has already started.");
    }
    if (!room.players?.[uid] && room.playerOrder.length >= 2) {
      throw new Error("This room already has two players.");
    }
    const playerOrder = room.players?.[uid] ? room.playerOrder : [...room.playerOrder, uid];
    const players = { ...room.players, [uid]: publicPlayer(uid, payload.name) };
    const startsNow = playerOrder.length === 2;
    const currentTurnUid = startsNow ? playerOrder[Math.floor(Math.random() * 2)] : null;
    await update(ref(db), {
      [`publicRooms/${roomCode}/players`]: players,
      [`publicRooms/${roomCode}/playerOrder`]: playerOrder,
      [`publicRooms/${roomCode}/status`]: startsNow ? "playing" : "lobby",
      [`publicRooms/${roomCode}/currentTurnUid`]: currentTurnUid,
      [`publicRooms/${roomCode}/turnStartedAt`]: startsNow ? Date.now() : null,
      [`playerRooms/${uid}`]: { roomCode, role: "player" },
      [`playerData/${uid}/${roomCode}/secret`]: payload.secret,
      [`presence/${roomCode}/${uid}`]: { online: true, lastSeen: serverTimestamp() }
    });
    return { data: { roomCode } };
  },

  async joinSpectator(payload: { roomCode: string }) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    const roomCode = payload.roomCode.trim().toUpperCase();
    const snap = await get(ref(db, `publicRooms/${roomCode}`));
    if (!snap.exists()) {
      throw new Error("Room not found.");
    }
    const room = snap.val() as PublicRoom;
    if (!room.settings.allowSpectators) {
      throw new Error("Spectators are disabled for this room.");
    }
    await update(ref(db), {
      [`publicRooms/${roomCode}/spectators/${uid}`]: { joinedAt: serverTimestamp() },
      [`playerRooms/${uid}`]: { roomCode, role: "spectator" }
    });
    return { data: { roomCode } };
  },

  async submitGuess(payload: { roomCode: string; guess: string }) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    const roomSnap = await get(ref(db, `publicRooms/${payload.roomCode}`));
    if (!roomSnap.exists()) {
      throw new Error("Room not found.");
    }
    const room = roomSnap.val() as PublicRoom;
    if (room.status !== "playing" || room.currentTurnUid !== uid) {
      throw new Error("It is not your turn.");
    }
    validateSecret(payload.guess, room.settings.numberLength);
    const opponentUid = room.playerOrder.find((id) => id !== uid);
    if (!opponentUid) {
      throw new Error("Waiting for opponent.");
    }
    const inboxRef = push(ref(db, `playerData/${opponentUid}/${payload.roomCode}/inbox`));
    await set(inboxRef, {
      id: inboxRef.key,
      fromUid: uid,
      toUid: opponentUid,
      guess: payload.guess,
      round: room.round,
      createdAt: Date.now(),
      status: "pending"
    });
    return { data: { won: false } };
  },

  async rematch(payload: { roomCode: string; secret: string }) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    const roomSnap = await get(ref(db, `publicRooms/${payload.roomCode}`));
    if (!roomSnap.exists()) {
      throw new Error("Room not found.");
    }
    const room = roomSnap.val() as PublicRoom;
    validateSecret(payload.secret, room.settings.numberLength);
    const votes = { ...(room.rematchVotes ?? {}), [uid]: true };
    const bothReady = room.playerOrder.length === 2 && room.playerOrder.every((id) => votes[id]);
    const updates: Record<string, unknown> = {
      [`playerData/${uid}/${payload.roomCode}/secret`]: payload.secret,
      [`publicRooms/${payload.roomCode}/rematchVotes`]: bothReady ? {} : votes,
      [`publicRooms/${payload.roomCode}/winnerUid`]: null,
      [`publicRooms/${payload.roomCode}/finishedAt`]: null,
      [`playerData/${uid}/${payload.roomCode}/history`]: null,
      [`playerData/${uid}/${payload.roomCode}/inbox`]: null
    };
    if (bothReady) {
      updates[`publicRooms/${payload.roomCode}/status`] = "playing";
      updates[`publicRooms/${payload.roomCode}/round`] = 1;
      updates[`publicRooms/${payload.roomCode}/currentTurnUid`] = room.playerOrder[Math.floor(Math.random() * 2)];
      updates[`publicRooms/${payload.roomCode}/turnStartedAt`] = Date.now();
      room.playerOrder.forEach((id) => {
        updates[`playerData/${id}/${payload.roomCode}/history`] = null;
        updates[`playerData/${id}/${payload.roomCode}/inbox`] = null;
      });
    }
    await update(ref(db), updates);
    return { data: { started: bothReady } };
  },

  async sendReaction(payload: { roomCode: string; emoji: string }) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    await push(ref(db, `publicRooms/${payload.roomCode}/reactions`), {
      uid,
      emoji: payload.emoji,
      createdAt: Date.now()
    });
    return { data: { ok: true } };
  },

  async heartbeat(payload: { roomCode: string }) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    await set(ref(db, `presence/${payload.roomCode}/${uid}`), { online: true, lastSeen: serverTimestamp() });
    return { data: { serverTime: Date.now() } };
  },

  async leaveRoom(payload: { roomCode: string }) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    await update(ref(db), {
      [`presence/${payload.roomCode}/${uid}`]: { online: false, lastSeen: serverTimestamp() },
      [`playerRooms/${uid}`]: null
    });
    return { data: { ok: true } };
  },

  async cleanupDisconnectedRoom(payload: { roomCode: string }) {
    const db = requireDatabase();
    await update(ref(db), {
      [`publicRooms/${payload.roomCode}/status`]: "closed",
      [`publicRooms/${payload.roomCode}/closedAt`]: Date.now()
    });
    return { data: { closed: true } };
  },

  async publishOwnSecret(roomCode: string) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    const secretSnap = await get(ref(db, `playerData/${uid}/${roomCode}/secret`));
    const secret = secretSnap.val() as string | null;
    if (secret) {
      await update(ref(db), {
        [`publicRooms/${roomCode}/players/${uid}/secret`]: secret
      });
    }
  },

  async resolvePendingGuess(room: PublicRoom, pendingId: string, fromUid: string, guess: string, round: number) {
    const db = requireDatabase();
    const uid = requireCurrentUid();
    const secretSnap = await get(ref(db, `playerData/${uid}/${room.roomCode}/secret`));
    const secret = secretSnap.val() as string | null;
    if (!secret) {
      return;
    }
    const clue = scoreGuess(secret, guess, room.settings.clueMode);
    const won = guess === secret;
    const historyId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id: historyId,
      guess,
      ownerUid: fromUid,
      ownerName: room.players[fromUid]?.name ?? "Opponent",
      ...clue,
      createdAt: Date.now(),
      round
    };
    const updates: Record<string, unknown> = {
      [`playerData/${fromUid}/${room.roomCode}/history/${historyId}`]: record,
      [`playerData/${uid}/${room.roomCode}/history/${historyId}`]: record,
      [`playerData/${uid}/${room.roomCode}/inbox/${pendingId}`]: null
    };
    if (won) {
      updates[`publicRooms/${room.roomCode}/status`] = "finished";
      updates[`publicRooms/${room.roomCode}/winnerUid`] = fromUid;
      updates[`publicRooms/${room.roomCode}/finishedAt`] = Date.now();
      updates[`publicRooms/${room.roomCode}/players/${uid}/secret`] = secret;
      updates[`publicRooms/${room.roomCode}/players/${fromUid}/wins`] = (room.players[fromUid]?.wins ?? 0) + 1;
      updates[`publicRooms/${room.roomCode}/players/${uid}/losses`] = (room.players[uid]?.losses ?? 0) + 1;
    } else {
      updates[`publicRooms/${room.roomCode}/currentTurnUid`] = uid;
      updates[`publicRooms/${room.roomCode}/round`] = room.round + 1;
      updates[`publicRooms/${room.roomCode}/turnStartedAt`] = Date.now();
    }
    await update(ref(db), updates);
  }
};
