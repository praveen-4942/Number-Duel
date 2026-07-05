import { useEffect, useMemo, useRef, useState } from "react";
import { onDisconnect, onValue, ref, serverTimestamp, set } from "firebase/database";
import type { GuessRecord, PendingGuess, PublicRoom, Role } from "../types";
import { api, database } from "../lib/firebase";

export function useRoom(uid?: string, initialRoomCode?: string) {
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? "");
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [history, setHistory] = useState<Record<string, GuessRecord>>({});
  const [opponentHistory, setOpponentHistory] = useState<Record<string, GuessRecord>>({});
  const [inbox, setInbox] = useState<Record<string, PendingGuess>>({});
  const [presence, setPresence] = useState<Record<string, { online: boolean; lastSeen: number }>>({});
  const [role, setRole] = useState<Role>("player");
  const [latency, setLatency] = useState<number | null>(null);
  const resolvingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!uid || !roomCode || !database) {
      return;
    }

    const roomRef = ref(database, `publicRooms/${roomCode}`);
    const unsubRoom = onValue(roomRef, (snap) => setRoom(snap.val()));
    const historyRef = ref(database, `playerData/${uid}/${roomCode}/history`);
    const unsubHistory = onValue(historyRef, (snap) => setHistory(snap.val() ?? {}));
    const inboxRef = ref(database, `playerData/${uid}/${roomCode}/inbox`);
    const unsubInbox = onValue(inboxRef, (snap) => setInbox(snap.val() ?? {}));
    const presenceListRef = ref(database, `presence/${roomCode}`);
    const unsubPresence = onValue(presenceListRef, (snap) => setPresence(snap.val() ?? {}));
    const presenceRef = ref(database, `presence/${roomCode}/${uid}`);
    set(presenceRef, { online: true, lastSeen: serverTimestamp() });
    onDisconnect(presenceRef).set({ online: false, lastSeen: serverTimestamp() });

    const heartbeat = async () => {
      const start = performance.now();
      try {
        await api.heartbeat({ roomCode });
        setLatency(Math.round(performance.now() - start));
      } catch {
        setLatency(null);
      }
    };
    heartbeat();
    const id = window.setInterval(heartbeat, 10000);

    return () => {
      window.clearInterval(id);
      unsubRoom();
      unsubHistory();
      unsubInbox();
      unsubPresence();
    };
  }, [uid, roomCode]);

  useEffect(() => {
    if (!room || !uid || room.status !== "playing") {
      return;
    }
    Object.values(inbox).forEach((pending) => {
      if (pending.status !== "pending" || pending.toUid !== uid || resolvingRef.current.has(pending.id)) {
        return;
      }
      resolvingRef.current.add(pending.id);
      api.resolvePendingGuess(room, pending.id, pending.fromUid, pending.guess, pending.round).finally(() => {
        resolvingRef.current.delete(pending.id);
      });
    });
  }, [inbox, room, uid]);

  useEffect(() => {
    if (!room || !uid || room.status !== "finished" || !room.players?.[uid] || room.players[uid].secret) {
      return;
    }
    api.publishOwnSecret(room.roomCode).catch(() => undefined);
  }, [room, uid]);

  useEffect(() => {
    if (!room || !uid) {
      return;
    }
    setRole(room.players?.[uid] ? "player" : "spectator");
  }, [room, uid]);

  const me = useMemo(() => (uid && room ? room.players?.[uid] : undefined), [room, uid]);
  const opponent = useMemo(() => {
    if (!uid || !room) {
      return undefined;
    }
    const opponentUid = room.playerOrder?.find((id) => id !== uid);
    return opponentUid ? room.players?.[opponentUid] : undefined;
  }, [room, uid]);

  useEffect(() => {
    if (!uid || !room || !room.playerOrder || room.playerOrder.length < 2 || !database) {
      setOpponentHistory({});
      return;
    }
    const opponentUid = room.playerOrder.find((id) => id !== uid);
    if (!opponentUid) {
      setOpponentHistory({});
      return;
    }
    const opponentHistoryRef = ref(database, `playerData/${opponentUid}/${room.roomCode}/history`);
    const unsubscribe = onValue(opponentHistoryRef, (snap) => setOpponentHistory(snap.val() ?? {}));
    return () => unsubscribe();
  }, [uid, room]);

  return { roomCode, setRoomCode, room, history, opponentHistory, presence, me, opponent, role, latency };
}
