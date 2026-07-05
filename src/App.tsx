import { FormEvent, useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Clipboard,
  Clock3,
  Copy,
  DoorOpen,
  Eye,
  Gamepad2,
  Loader2,
  Moon,
  Radio,
  RefreshCcw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Timer,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi
} from "lucide-react";
import { useAuth } from "./hooks/useAuth";
import { useRoom } from "./hooks/useRoom";
import { api } from "./lib/firebase";
import { clueLabel, generateSecret, orderedHistory, validateNumber } from "./lib/game";
import { playTone, setSoundEnabled } from "./lib/sound";
import type { ClueMode, GameSettings, GuessRecord, PublicPlayer, PublicRoom } from "./types";

const defaultSettings: GameSettings = {
  numberLength: 4,
  clueMode: "bullsCows",
  timerSeconds: 45,
  allowSpectators: true
};

const reactions = ["🔥", "⚡", "😎", "🎯", "🤯", "👀", "👏", "💫"];

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      className={cx(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-cyan-300 text-slate-950 shadow-glow hover:bg-cyan-200",
        variant === "ghost" && "border border-white/15 bg-white/8 text-white hover:bg-white/14 light:border-slate-900/15 light:text-slate-900",
        variant === "danger" && "bg-rose-500 text-white hover:bg-rose-400",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-200 light:text-slate-800">
      {label}
      <input
        className="focus-ring rounded-lg border border-white/12 bg-white/8 px-4 py-3 font-medium text-white placeholder:text-slate-500 light:border-slate-900/10 light:bg-white/80 light:text-slate-950"
        {...props}
      />
      {error ? <span className="text-xs font-semibold text-rose-300 light:text-rose-600">{error}</span> : null}
    </label>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/18 p-1 light:border-slate-900/10 light:bg-white/55 sm:flex">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            "focus-ring rounded-lg px-3 py-2 text-sm font-bold transition",
            value === option.value
              ? "bg-white text-slate-950 shadow-glow"
              : "text-slate-300 hover:bg-white/10 light:text-slate-700"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [light, setLight] = useState(() => localStorage.getItem("theme") === "light");

  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    localStorage.setItem("theme", light ? "light" : "dark");
  }, [light]);

  return (
    <div className={cx("min-h-screen text-white light:text-slate-950", light && "light")}>
      <div className="aurora fixed inset-0 -z-20" />
      <div className="grid-mask fixed inset-0 -z-10 opacity-70" />
      <motion.button
        whileTap={{ scale: 0.96 }}
        className="focus-ring fixed right-4 top-4 z-50 rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur light:border-slate-900/10 light:bg-white/75"
        onClick={() => setLight((value) => !value)}
        aria-label="Toggle theme"
      >
        {light ? <Moon size={18} /> : <Sun size={18} />}
      </motion.button>
      {children}
    </div>
  );
}

function Home({
  onRoom,
  busy
}: {
  onRoom: (roomCode: string) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"create" | "join" | "spectate">("create");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [secret, setSecret] = useState("");
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const secretError = tab === "spectate" ? "" : validateNumber(secret, settings.numberLength);

  useEffect(() => {
    setSecret((value) => (value.length === settings.numberLength ? value : ""));
  }, [settings.numberLength]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    playTone("tap");
    try {
      if (tab === "create") {
        if (secretError) {
          throw new Error(secretError);
        }
        const result = await api.createRoom({ name, secret, ...settings });
        onRoom(result.data.roomCode);
      } else if (tab === "join") {
        if (secretError) {
          throw new Error(secretError);
        }
        const result = await api.joinRoom({ roomCode, name, secret });
        onRoom(result.data.roomCode);
      } else {
        const result = await api.joinSpectator({ roomCode });
        onRoom(result.data.roomCode);
      }
    } catch (err) {
      playTone("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm font-bold text-cyan-100 light:text-cyan-800">
            <Radio size={16} /> Real-time two-player duel
          </div>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl font-black tracking-normal sm:text-6xl lg:text-7xl">
              Number <span className="neon-text">Duel</span>
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-300 light:text-slate-700">
              Create a room, hide your number, and out-think your opponent with clues, tempo, and a little neon pressure.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Server scored", Icon: ShieldCheck },
              { label: "Private histories", Icon: Eye },
              { label: "60s reconnect", Icon: Wifi }
            ].map(({ label, Icon }) => (
              <div key={label} className="glass rounded-lg p-4">
                <Icon className="mb-3 text-cyan-200 light:text-cyan-700" size={22} />
                <div className="font-bold">{label}</div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.form
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          onSubmit={submit}
          className="glass rounded-2xl p-5 sm:p-6"
        >
          <div className="mb-5 grid grid-cols-3 gap-2 rounded-xl bg-black/20 p-1 light:bg-white/60">
            {(["create", "join", "spectate"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={cx(
                  "focus-ring rounded-lg px-3 py-2 text-sm font-black capitalize transition",
                  tab === item ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 light:text-slate-700"
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="grid gap-4">
            {tab !== "spectate" ? <Field label="Player name" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required /> : null}
            {tab !== "create" ? (
              <Field
                label="Room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                maxLength={6}
                required
              />
            ) : null}

            {tab === "create" ? (
              <>
                <div className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-200 light:text-slate-800">Number length</span>
                  <Segmented
                    value={settings.numberLength}
                    options={[3, 4, 5, 6].map((value) => ({ label: `${value}`, value: value as 3 | 4 | 5 | 6 }))}
                    onChange={(numberLength) => setSettings((current) => ({ ...current, numberLength }))}
                  />
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-200 light:text-slate-800">Clue mode</span>
                  <Segmented<ClueMode>
                    value={settings.clueMode}
                    options={[
                      { label: "Classic", value: "classic" },
                      { label: "Advanced", value: "advanced" },
                      { label: "Bulls & Cows", value: "bullsCows" }
                    ]}
                    onChange={(clueMode) => setSettings((current) => ({ ...current, clueMode }))}
                  />
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-200 light:text-slate-800">Turn timer</span>
                  <Segmented
                    value={settings.timerSeconds}
                    options={[
                      { label: "Off", value: 0 },
                      { label: "30s", value: 30 },
                      { label: "45s", value: 45 },
                      { label: "60s", value: 60 },
                      { label: "90s", value: 90 }
                    ]}
                    onChange={(timerSeconds) => setSettings((current) => ({ ...current, timerSeconds }))}
                  />
                </div>
                <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3 text-sm font-bold light:border-slate-900/10 light:bg-white/65">
                  Spectator mode
                  <input
                    type="checkbox"
                    checked={settings.allowSpectators}
                    onChange={(e) => setSettings((current) => ({ ...current, allowSpectators: e.target.checked }))}
                    className="h-5 w-5 accent-cyan-300"
                  />
                </label>
              </>
            ) : null}

            {tab !== "spectate" ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Field
                  label={`Secret number (${settings.numberLength} unique digits)`}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value.replace(/\D/g, "").slice(0, settings.numberLength))}
                  inputMode="numeric"
                  autoComplete="off"
                  error={secret ? secretError : ""}
                  required
                />
                <Button type="button" variant="ghost" className="self-end" onClick={() => setSecret(generateSecret(settings.numberLength))}>
                  <Sparkles size={18} /> Random
                </Button>
              </div>
            ) : null}

            {error ? <div className="rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm font-semibold text-rose-200 light:text-rose-700">{error}</div> : null}

            <Button type="submit" disabled={busy || submitting || (tab !== "spectate" && (!name || !!secretError))}>
              {submitting ? <Loader2 className="animate-spin" size={18} /> : <Gamepad2 size={18} />}
              {tab === "create" ? "Create Room" : tab === "join" ? "Join Room" : "Watch Room"}
            </Button>
          </div>
        </motion.form>
      </div>
    </main>
  );
}

function RoomHeader({
  room,
  latency,
  onExit
}: {
  room: PublicRoom;
  latency: number | null;
  onExit: () => void;
}) {
  async function copyCode() {
    await navigator.clipboard.writeText(room.roomCode);
    playTone("tap");
  }

  async function shareRoom() {
    const text = `Join my Number Duel room: ${room.roomCode}`;
    if (navigator.share) {
      await navigator.share({ title: "Number Duel", text });
    } else {
      await navigator.clipboard.writeText(text);
    }
    playTone("tap");
  }

  return (
    <header className="glass sticky top-3 z-30 mx-auto mt-3 flex w-[calc(100%-1.5rem)] max-w-7xl flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-cyan-300 p-2 text-slate-950 shadow-glow">
          <Gamepad2 size={22} />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400 light:text-slate-600">Room Code</div>
          <div className="font-mono text-2xl font-black tracking-[0.2em]">{room.roomCode}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-emerald-200 light:text-emerald-700">
          <Wifi size={16} /> {latency ?? "--"} ms
        </div>
        <Button type="button" variant="ghost" onClick={copyCode}>
          <Copy size={17} /> Copy
        </Button>
        <Button type="button" variant="ghost" onClick={shareRoom}>
          <Share2 size={17} /> Share
        </Button>
        <Button type="button" variant="danger" onClick={onExit}>
          <DoorOpen size={17} /> Exit
        </Button>
      </div>
    </header>
  );
}

function PlayerTile({
  player,
  active,
  online,
  winner
}: {
  player?: PublicPlayer;
  active?: boolean;
  online?: boolean;
  winner?: boolean;
}) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-lg border p-4 transition",
        active ? "border-cyan-300 bg-cyan-300/10 shadow-glow" : "border-white/10 bg-white/6 light:border-slate-900/10 light:bg-white/65"
      )}
    >
      {active ? <span className="absolute right-4 top-4 h-3 w-3 rounded-full bg-cyan-200 before:absolute before:inset-0 before:animate-pulseRing before:rounded-full before:bg-cyan-200" /> : null}
      <div className="flex items-center gap-3">
        <div className={cx("h-3 w-3 rounded-full", online ? "bg-emerald-300" : "bg-rose-400")} />
        <div className="min-w-0">
          <div className="truncate text-lg font-black">{player?.name ?? "Waiting..."}</div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            {online ? "Online" : "Disconnected"} · {player?.ready ? "Ready" : "Not ready"}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-black/18 p-3 light:bg-white/60">
          <div className="text-slate-400 light:text-slate-600">Wins</div>
          <div className="font-mono text-xl font-black">{player?.wins ?? 0}</div>
        </div>
        <div className="rounded-lg bg-black/18 p-3 light:bg-white/60">
          <div className="text-slate-400 light:text-slate-600">Losses</div>
          <div className="font-mono text-xl font-black">{player?.losses ?? 0}</div>
        </div>
      </div>
      {winner ? <div className="mt-3 inline-flex items-center gap-2 text-sm font-black text-amber-200 light:text-amber-700"><Trophy size={16} /> Winner</div> : null}
    </div>
  );
}

function History({ records }: { records: GuessRecord[] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-black">Your Guess History</h2>
        <Clipboard className="text-cyan-200 light:text-cyan-700" size={20} />
      </div>
      <div className="grid max-h-[420px] gap-2 overflow-auto pr-1">
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm font-semibold text-slate-400 light:border-slate-900/15">
            Your guesses appear here. Opponent guesses stay hidden.
          </div>
        ) : (
          records.map((record) => (
            <motion.div
              key={record.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-white/10 bg-white/6 p-3 light:border-slate-900/10 light:bg-white/70"
            >
              <div className="font-mono text-xl font-black text-cyan-100 light:text-cyan-800">{record.guess}</div>
              <div className="text-sm">
                <div className="font-bold">{clueLabel(record)}</div>
                <div className="text-xs text-slate-400 light:text-slate-600">Round {record.round}</div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function Countdown({ room, active }: { room: PublicRoom; active: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  if (!room.settings.timerSeconds || !room.turnStartedAt || room.status !== "playing") {
    return null;
  }
  const elapsed = Math.floor((now - room.turnStartedAt) / 1000);
  const remaining = Math.max(0, room.settings.timerSeconds - elapsed);
  return (
    <div className={cx("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black", active ? "bg-cyan-300 text-slate-950" : "bg-white/10")}>
      <Timer size={16} /> {remaining}s
    </div>
  );
}

function GamePanel({
  room,
  uid,
  records,
  role
}: {
  room: PublicRoom;
  uid: string;
  records: GuessRecord[];
  role: "player" | "spectator";
}) {
  const [guess, setGuess] = useState("");
  const [rematchSecret, setRematchSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isMyTurn = room.currentTurnUid === uid;
  const canGuess = role === "player" && room.status === "playing" && isMyTurn;
  const guessError = guess ? validateNumber(guess, room.settings.numberLength) : "";

  useEffect(() => {
    if (isMyTurn && room.status === "playing") {
      playTone("turn");
    }
  }, [isMyTurn, room.status, room.round]);

  useEffect(() => {
    if (room.status === "finished") {
      playTone("win");
      confetti({ particleCount: 180, spread: 75, origin: { y: 0.65 } });
    }
  }, [room.status]);

  async function submitGuess(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (guessError) {
      setError(guessError);
      return;
    }
    setBusy(true);
    try {
      await api.submitGuess({ roomCode: room.roomCode, guess });
      setGuess("");
    } catch (err) {
      playTone("error");
      setError(err instanceof Error ? err.message : "Guess failed.");
    } finally {
      setBusy(false);
    }
  }

  async function rematch() {
    const message = validateNumber(rematchSecret, room.settings.numberLength);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    try {
      await api.rematch({ roomCode: room.roomCode, secret: rematchSecret });
      setRematchSecret("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rematch failed.");
    } finally {
      setBusy(false);
    }
  }

  async function react(emoji: string) {
    await api.sendReaction({ roomCode: room.roomCode, emoji });
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400 light:text-slate-600">Round {room.round}</div>
          <h2 className="text-2xl font-black">{room.status === "finished" ? "Duel complete" : canGuess ? "Your turn" : role === "spectator" ? "Spectating" : "Opponent turn"}</h2>
        </div>
        <Countdown room={room} active={canGuess} />
      </div>

      {room.status === "finished" ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5">
            <div className="flex items-center gap-3 text-2xl font-black text-amber-100 light:text-amber-700">
              <Trophy /> {room.players[room.winnerUid ?? ""]?.name ?? "A player"} wins
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {room.playerOrder.map((id) => (
                <div key={id} className="rounded-lg bg-black/20 p-3 light:bg-white/65">
                  <div className="text-sm font-bold text-slate-400 light:text-slate-600">{room.players[id]?.name}</div>
                  <div className="font-mono text-2xl font-black">{room.players[id]?.secret ?? "Hidden"}</div>
                </div>
              ))}
            </div>
          </div>
          {role === "player" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input
                className="focus-ring rounded-lg border border-white/12 bg-white/8 px-4 py-3 font-mono text-xl font-black light:border-slate-900/10 light:bg-white/80"
                value={rematchSecret}
                onChange={(e) => setRematchSecret(e.target.value.replace(/\D/g, "").slice(0, room.settings.numberLength))}
                placeholder="New secret"
                inputMode="numeric"
              />
              <Button type="button" variant="ghost" onClick={() => setRematchSecret(generateSecret(room.settings.numberLength))}>
                <Sparkles size={18} /> Random
              </Button>
              <Button type="button" onClick={rematch} disabled={busy}>
                <RefreshCcw size={18} /> Play Again
              </Button>
            </div>
          ) : null}
        </motion.div>
      ) : (
        <form onSubmit={submitGuess} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className="focus-ring min-h-16 rounded-lg border border-white/12 bg-black/22 px-5 text-center font-mono text-3xl font-black tracking-[0.25em] text-white placeholder:tracking-normal placeholder:text-slate-600 disabled:opacity-50 light:border-slate-900/10 light:bg-white/75 light:text-slate-950"
              value={guess}
              onChange={(e) => setGuess(e.target.value.replace(/\D/g, "").slice(0, room.settings.numberLength))}
              placeholder={"0".repeat(room.settings.numberLength)}
              inputMode="numeric"
              disabled={!canGuess || busy}
            />
            <Button type="submit" disabled={!canGuess || busy || !!guessError || guess.length !== room.settings.numberLength}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} Guess
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-400 light:text-slate-600">
              {room.settings.clueMode === "classic" ? "Classic: Correct Positions only" : room.settings.clueMode === "advanced" ? "Advanced: Correct Digits and Correct Positions" : "Bulls & Cows: Bulls are exact, cows are wrong-position digits"}
            </div>
            <div className="flex gap-1">
              {reactions.map((emoji) => (
                <button key={emoji} type="button" onClick={() => react(emoji)} className="focus-ring rounded-lg bg-white/8 px-2 py-1 text-xl transition hover:bg-white/15">
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          {error || guessError ? <div className="rounded-lg bg-rose-500/10 p-3 text-sm font-bold text-rose-200 light:text-rose-700">{error || guessError}</div> : null}
        </form>
      )}

      <History records={records} />
    </div>
  );
}

function FloatingReactions({ room }: { room: PublicRoom }) {
  const list = Object.entries(room.reactions ?? {}).slice(-8);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center">
      <AnimatePresence>
        {list.map(([id, reaction], index) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: -index * 14, scale: 1 }}
            exit={{ opacity: 0, y: -60 }}
            className="absolute rounded-full bg-white/12 px-4 py-2 text-3xl backdrop-blur"
          >
            {reaction.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function RoomView({
  room,
  uid,
  history,
  presence,
  latency,
  role,
  onExit
}: {
  room: PublicRoom;
  uid: string;
  history: Record<string, GuessRecord>;
  presence: Record<string, { online: boolean; lastSeen: number }>;
  latency: number | null;
  role: "player" | "spectator";
  onExit: () => void;
}) {
  const [sound, setSound] = useState(true);
  const records = useMemo(() => orderedHistory(history), [history]);
  const players = room.playerOrder.map((id) => room.players[id]);
  const opponentId = room.playerOrder.find((id) => id !== uid);
  const opponentOffline = opponentId ? presence[opponentId]?.online === false : false;

  useEffect(() => setSoundEnabled(sound), [sound]);

  useEffect(() => {
    if (!opponentOffline || room.status !== "playing") {
      return;
    }
    const id = window.setTimeout(() => api.cleanupDisconnectedRoom({ roomCode: room.roomCode }).catch(() => undefined), 60000);
    return () => window.clearTimeout(id);
  }, [opponentOffline, room.roomCode, room.status]);

  return (
    <>
      <RoomHeader room={room} latency={latency} onExit={onExit} />
      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <section className="space-y-4">
          <div className="glass rounded-2xl p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black">Duel Status</h2>
              <Button type="button" variant="ghost" className="min-h-10 px-3" onClick={() => setSound((value) => !value)} aria-label="Toggle sound">
                {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </Button>
            </div>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/6 p-3 light:bg-white/65">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Mode</div>
                  <div className="font-black">{room.settings.clueMode === "bullsCows" ? "Bulls & Cows" : room.settings.clueMode}</div>
                </div>
                <div className="rounded-lg bg-white/6 p-3 light:bg-white/65">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Digits</div>
                  <div className="font-mono text-xl font-black">{room.settings.numberLength}</div>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/6 p-3 light:border-slate-900/10 light:bg-white/65">
                <div className="flex items-center gap-2 text-sm font-black">
                  <Clock3 size={16} /> Current turn
                </div>
                <div className="mt-1 text-2xl font-black">{room.players[room.currentTurnUid ?? ""]?.name ?? "Waiting"}</div>
              </div>
              {opponentOffline && room.status === "playing" ? (
                <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-200 light:text-rose-700">
                  Opponent Disconnected. Reconnection window closes in 60 seconds.
                </div>
              ) : null}
              {room.status === "closed" ? (
                <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-200 light:text-rose-700">
                  Room closed.
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-slate-400">
              <Users size={17} /> Players
            </div>
            {players.map((player) => (
              <PlayerTile
                key={player.uid}
                player={player}
                active={room.currentTurnUid === player.uid}
                online={presence[player.uid]?.online ?? player.connected}
                winner={room.winnerUid === player.uid}
              />
            ))}
            {players.length < 2 ? <PlayerTile online={false} /> : null}
          </div>
        </section>

        <GamePanel room={room} uid={uid} records={records} role={role} />
      </main>
      <FloatingReactions room={room} />
    </>
  );
}

export default function App() {
  const { user, loading, error } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState("");
  const { roomCode, setRoomCode, room, history, presence, latency, role } = useRoom(user?.uid, selectedRoom);

  useEffect(() => {
    if (selectedRoom && selectedRoom !== roomCode) {
      setRoomCode(selectedRoom);
    }
  }, [selectedRoom, roomCode, setRoomCode]);

  async function exitRoom() {
    if (room?.roomCode) {
      await api.leaveRoom({ roomCode: room.roomCode }).catch(() => undefined);
    }
    setSelectedRoom("");
    setRoomCode("");
  }

  return (
    <Shell>
      {loading ? (
        <main className="flex min-h-screen items-center justify-center">
          <div className="glass rounded-2xl p-8 text-center">
            <Loader2 className="mx-auto mb-4 animate-spin text-cyan-200" size={34} />
            <div className="font-black">Connecting to arena</div>
          </div>
        </main>
      ) : error ? (
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="glass max-w-md rounded-2xl p-6 text-center text-rose-200">{error}</div>
        </main>
      ) : room && user ? (
        <RoomView
          room={room}
          uid={user.uid}
          history={history}
          presence={presence}
          latency={latency}
          role={role}
          onExit={exitRoom}
        />
      ) : (
        <Home onRoom={setSelectedRoom} busy={!user} />
      )}
    </Shell>
  );
}
