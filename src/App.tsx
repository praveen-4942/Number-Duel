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
  Menu,
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
  clueMode: "classic",
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
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-3xl px-5 py-3 text-sm font-black uppercase tracking-[0.04em] transition-transform duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-300 text-slate-950 shadow-[0_0_40px_rgba(67,206,255,0.25)] hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(236,72,153,0.3)]",
        variant === "ghost" &&
          "border border-white/20 bg-white/10 text-white hover:bg-white/15 light:border-slate-900/20 light:text-slate-900",
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
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-4">
        <div className="rounded-full border border-white/15 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-100 shadow-[0_0_30px_rgba(0,0,0,0.14)] backdrop-blur light:border-slate-200/70 light:bg-white/85 light:text-slate-800">
          Created by Praveenkumar G 2026
        </div>
      </div>
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
  const [joinRoomSettings, setJoinRoomSettings] = useState<Pick<GameSettings, "numberLength" | "clueMode"> | null>(null);
  const [joinRoomFetchError, setJoinRoomFetchError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const effectiveNumberLength = tab === "join" ? joinRoomSettings?.numberLength ?? settings.numberLength : settings.numberLength;
  const effectiveClueMode = tab === "join" ? joinRoomSettings?.clueMode ?? settings.clueMode : settings.clueMode;
  const secretError = tab === "spectate" ? "" : validateNumber(secret, effectiveNumberLength);

  useEffect(() => {
    setSecret((value) => (value.length === effectiveNumberLength ? value : ""));
  }, [effectiveNumberLength]);

  useEffect(() => {
    if (tab !== "join") {
      setJoinRoomSettings(null);
      setJoinRoomFetchError("");
      return;
    }

    if (roomCode.length !== 6) {
      setJoinRoomSettings(null);
      setJoinRoomFetchError("");
      return;
    }

    let active = true;
    setJoinRoomFetchError("");
    api.getRoomSettings({ roomCode })
      .then(({ data }) => {
        if (!active) {
          return;
        }
        setJoinRoomSettings({
          numberLength: data.numberLength,
          clueMode: data.clueMode
        });
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        setJoinRoomSettings(null);
        setJoinRoomFetchError(err instanceof Error ? err.message : "Room not found.");
      });

    return () => {
      active = false;
    };
  }, [roomCode, tab]);

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

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-3xl bg-gradient-to-br from-cyan-400/20 to-fuchsia-400/10 text-cyan-200 shadow-[0_0_18px_rgba(67,206,255,0.2)]">
              <Gamepad2 size={22} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-cyan-300/80">Number Duel</div>
              <div className="text-lg font-black text-white light:text-slate-950">Arena Menu</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {[
              { label: "Home", id: "home" },
              { label: "Play", id: "play" },
              { label: "Rule Book", id: "rule-book" }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="focus-ring rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white light:text-slate-950 transition hover:border-cyan-300/40 hover:bg-white/10"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </motion.header>

      <main className="mx-auto w-full max-w-7xl space-y-12 px-4 py-16 sm:space-y-16 sm:px-6 lg:px-8">
        <section id="home" className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 shadow-[0_0_30px_rgba(67,206,255,0.16)]">
              <Radio size={16} /> Next-level number duels
            </div>
            <div className="space-y-5">
              <h1 className="text-5xl font-black tracking-[-0.04em] text-white light:text-slate-950 sm:text-6xl lg:text-7xl">
                Simplified arena launch.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                This home page now keeps only the essentials: a clean entry, quick actions, and direct navigation to the game and rule book.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="primary" className="w-full rounded-full sm:w-auto" onClick={() => scrollToSection("play")}>Enter the arena</Button>
              <Button type="button" variant="ghost" className="w-full rounded-full sm:w-auto" onClick={() => scrollToSection("rule-book")}>View rule book</Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            className="grid gap-4"
          >
            {[
              { title: "Fast Setup", text: "Create or join a room instantly with a clean play panel." },
              { title: "Hidden Secrets", text: "Your number stays private while clues reveal the game." },
              { title: "Rule Book", text: "Everything you need to know is available in the menu." }
            ].map((item) => (
              <div key={item.title} className="glass rounded-[2rem] p-6 shadow-[0_30px_90px_rgba(2,26,57,0.35)]">
                <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">{item.title}</div>
                <p className="mt-3 text-slate-300">{item.text}</p>
              </div>
            ))}
          </motion.div>
        </section>

        <section id="play" className="grid gap-8 lg:grid-cols-[0.95fr_1fr] lg:items-start">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/85 p-8 shadow-[0_30px_90px_rgba(2,26,57,0.35)]">
              <div className="text-sm uppercase tracking-[0.32em] text-cyan-300/70">Quick Start</div>
              <h2 className="mt-3 text-3xl font-black text-white light:text-slate-950">Pick your path</h2>
              <p className="mt-4 max-w-2xl text-slate-300">
                Use the panel to create a new room, join an existing duel, or spectate a match. Keep the interface minimal and get into the game fast.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="glass rounded-[2rem] p-6">
                <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Ready in seconds</div>
                <div className="mt-3 text-2xl font-black text-white light:text-slate-950">Fast entry</div>
              </div>
              <div className="glass rounded-[2rem] p-6">
                <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Secure play</div>
                <div className="mt-3 text-2xl font-black text-white light:text-slate-950">Server-validated secrets</div>
              </div>
            </div>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            onSubmit={submit}
            className="glass rounded-[2.5rem] border border-cyan-300/20 p-6 shadow-[0_30px_90px_rgba(20,58,127,0.35)]"
          >
            <div className="mb-5 grid grid-cols-1 gap-2 rounded-[1.75rem] bg-slate-900/80 p-1 shadow-[inset_0_0_1px_rgba(255,255,255,0.06)] sm:grid-cols-3">
              {(["create", "join", "spectate"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={cx(
                    "focus-ring rounded-[1.25rem] px-4 py-3 text-sm font-black uppercase tracking-[0.12em] transition duration-200",
                    tab === item
                      ? "bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-amber-300 text-slate-950 shadow-[0_0_30px_rgba(67,206,255,0.2)]"
                      : "text-slate-300 hover:bg-white/10"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="space-y-4">
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
                  <div className="grid gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-300">Number length</div>
                      <Segmented
                        value={settings.numberLength}
                        options={[3, 4, 5, 6].map((value) => ({ label: `${value}`, value: value as 3 | 4 | 5 | 6 }))}
                        onChange={(numberLength) => setSettings((current) => ({ ...current, numberLength }))}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-300">Clue mode</div>
                      <Segmented<ClueMode>
                        value={settings.clueMode}
                        options={[
                          { label: "Classic", value: "classic" },
                          { label: "Advanced", value: "advanced" }
                        ]}
                        onChange={(clueMode) => setSettings((current) => ({ ...current, clueMode }))}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-300">Turn timer</div>
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
                    <label className="flex items-center justify-between rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200">
                      Spectator mode
                      <input
                        type="checkbox"
                        checked={settings.allowSpectators}
                        onChange={(e) => setSettings((current) => ({ ...current, allowSpectators: e.target.checked }))}
                        className="h-5 w-5 accent-cyan-300"
                      />
                    </label>
                  </div>
                </>
              ) : null}

              {tab !== "spectate" ? (
                <div className="grid gap-3">
                  <Field
                    label={`Secret number (${effectiveNumberLength} unique digits)`}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value.replace(/\D/g, "").slice(0, effectiveNumberLength))}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={effectiveNumberLength}
                    error={secret ? secretError : ""}
                    required
                  />
                  <Button type="button" variant="ghost" className="rounded-full" onClick={() => setSecret(generateSecret(effectiveNumberLength))}>
                    <Sparkles size={18} /> Random
                  </Button>
                  {tab === "join" && joinRoomSettings ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 light:border-slate-900/10 light:bg-white/80 light:text-slate-900">
                      Room expects {joinRoomSettings.numberLength} digits and uses {joinRoomSettings.clueMode === "classic" ? "Classic" : "Advanced"} clues.
                    </div>
                  ) : null}
                  {tab === "join" && joinRoomFetchError ? (
                    <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 light:text-rose-700">
                      {joinRoomFetchError}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <div className="rounded-[1.75rem] border border-rose-300/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-200">{error}</div> : null}

              <Button type="submit" disabled={busy || submitting || (tab !== "spectate" && (!name || !!secretError))} className="w-full rounded-full">
                {submitting ? <Loader2 className="animate-spin" size={18} /> : <Gamepad2 size={18} />}
                {tab === "create" ? "Create Room" : tab === "join" ? "Join Room" : "Watch Room"}
              </Button>
            </div>
          </motion.form>
        </section>

        <section id="rule-book" className="space-y-8">
          <div className="glass rounded-[2rem] border border-white/10 bg-slate-950/85 p-8 shadow-[0_30px_90px_rgba(2,26,57,0.35)]">
            <div className="text-sm uppercase tracking-[0.32em] text-cyan-300/70">Rule Book</div>
            <h2 className="mt-3 text-3xl font-black text-white light:text-slate-950">All the rules</h2>
            <div className="mt-8 space-y-6 text-slate-300">
              <div>
                <h3 className="text-xl font-bold text-white light:text-slate-950">Room Creation</h3>
                <p className="mt-2 leading-7">Choose a name, select a unique secret number, and create a room. Secrets remain hidden on the server, and only safe game state is shared with your opponent.</p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white light:text-slate-950">Joining & Spectating</h3>
                <p className="mt-2 leading-7">Enter a room code to join as a player. If spectating is enabled, watch live matches without revealing secrets or histories.</p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white light:text-slate-950">Clue Modes</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-slate-300">
                  <li><span className="font-semibold text-white light:text-slate-950">Classic:</span> only correct digits in the correct position are shown.</li>
                  <li><span className="font-semibold text-white light:text-slate-950">Advanced:</span> both correct digits and correct positions are reported.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white light:text-slate-950">Turn Flow</h3>
                <p className="mt-2 leading-7">Players take alternating turns. Each guess is evaluated server-side, and the resulting clue is revealed to the guesser.</p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white light:text-slate-950">Winning</h3>
                <p className="mt-2 leading-7">The first player to correctly guess the opponent’s secret number wins the duel. After completion, players may request a rematch to begin a new game.</p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white light:text-slate-950">Reconnect Safety</h3>
                <p className="mt-2 leading-7">Disconnects are handled gracefully with a 60-second reconnect window. Player secrets remain protected regardless of connection state.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    <header className="glass sticky top-3 z-30 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-7xl rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-cyan-300 p-2 text-slate-950 shadow-glow">
            <Gamepad2 size={22} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400 light:text-slate-600">Duel Info</div>
            <div className="text-lg font-black text-white light:text-slate-950">Room details are hidden</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={() => setDetailsOpen((value) => !value)}>
            <Menu size={17} /> {detailsOpen ? "Hide details" : "Menu"}
          </Button>
          <Button type="button" variant="danger" onClick={onExit}>
            <DoorOpen size={17} /> Exit
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {detailsOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 light:bg-white/90 light:border-slate-200/60">
              <div className="grid gap-1">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 light:text-slate-600">Room Code</div>
                <div className="font-mono text-2xl font-black tracking-[0.2em] text-white light:text-slate-950">{room.roomCode}</div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-black/10 p-3 light:bg-slate-100">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500 light:text-slate-600">Latency</div>
                  <div className="font-black text-white light:text-slate-950">{latency ?? "--"} ms</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={copyCode}>
                    <Copy size={17} /> Copy
                  </Button>
                  <Button type="button" variant="ghost" onClick={shareRoom}>
                    <Share2 size={17} /> Share
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
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

function History({ myRecords, opponentRecords, opponentName, meName }: {
  myRecords: Array<GuessRecord & { owner: string; name: string }>;
  opponentRecords: Array<GuessRecord & { owner: string; name: string }>;
  opponentName: string;
  meName: string;
}) {
  return (
    <div className="glass rounded-2xl p-4 h-full min-h-0 max-h-[calc(100vh-26rem)] overflow-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Guess Log</h2>
          <p className="text-sm text-slate-400 light:text-slate-600">Both players’ guesses are shown side-by-side.</p>
        </div>
        <Clipboard className="text-cyan-200 light:text-cyan-700" size={20} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm font-semibold uppercase tracking-[0.24em] text-slate-400 light:text-slate-600">
            <span>{meName}</span>
            <span className="inline-flex rounded-full bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-200">Your guesses</span>
          </div>
          {myRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm font-semibold text-slate-400 light:border-slate-900/15">
              No guesses yet from you.
            </div>
          ) : (
            <div className="grid gap-2">
              {myRecords.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-lg border border-white/10 bg-white/6 p-3 light:border-slate-900/10 light:bg-white/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-mono text-xl font-black text-cyan-100 light:text-cyan-800">{record.guess}</div>
                      <div className="mt-2 inline-flex rounded-full bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-200">
                        {record.owner}
                      </div>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.26em] text-slate-300 light:text-slate-600">Round {record.round}</div>
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-100 light:text-slate-900">{clueLabel(record)}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm font-semibold uppercase tracking-[0.24em] text-slate-400 light:text-slate-600">
            <span>{opponentName}</span>
            <span className="inline-flex rounded-full bg-fuchsia-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-fuchsia-200">Their guesses</span>
          </div>
          {opponentRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm font-semibold text-slate-400 light:border-slate-900/15">
              No guesses yet from your opponent.
            </div>
          ) : (
            <div className="grid gap-2">
              {opponentRecords.map((record) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-lg border border-white/10 bg-white/6 p-3 light:border-slate-900/10 light:bg-white/70"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-mono text-xl font-black text-cyan-100 light:text-cyan-800">{record.guess}</div>
                      <div className="mt-2 inline-flex rounded-full bg-fuchsia-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-fuchsia-200">
                        {record.owner}
                      </div>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.26em] text-slate-300 light:text-slate-600">Round {record.round}</div>
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-100 light:text-slate-900">{clueLabel(record)}</div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Countdown({ room, active }: { room: PublicRoom; active: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
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
  myRecords,
  opponentRecords,
  role
}: {
  room: PublicRoom;
  uid: string;
  myRecords: Array<GuessRecord & { owner: string; name: string }>;
  opponentRecords: Array<GuessRecord & { owner: string; name: string }>;
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
    <div className="glass relative min-h-[60vh] sm:min-h-[calc(100vh-16rem)] flex flex-col gap-4 rounded-2xl p-5 pb-32">
      <div className="grid gap-5 pb-28 sm:pb-0">
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
          </motion.div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0">
        <History myRecords={myRecords} opponentRecords={opponentRecords} opponentName={opponentRecords[0]?.name ?? "Opponent"} meName={myRecords[0]?.name ?? "You"} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-slate-950/95 px-4 py-4 backdrop-blur light:bg-white/95 sm:static sm:bg-transparent sm:px-0 sm:py-0">
        {room.status === "finished" ? (
          role === "player" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input
                className="focus-ring rounded-full border border-white/12 bg-white/8 px-4 py-3 font-mono text-xl font-black light:border-slate-900/10 light:bg-white/80"
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
          ) : null
        ) : (
          <form onSubmit={submitGuess} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                className="focus-ring min-h-16 rounded-full border border-white/12 bg-black/22 px-5 text-center font-mono text-3xl font-black tracking-[0.25em] text-white placeholder:tracking-normal placeholder:text-slate-600 disabled:opacity-50 light:border-slate-900/10 light:bg-white/75 light:text-slate-950"
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
                {room.settings.clueMode === "classic"
                  ? "Classic: Correct Positions only"
                  : room.settings.clueMode === "advanced"
                  ? "Advanced: Correct Digits and Correct Positions"
                  : "Bulls & Cows: Bulls are exact, cows are wrong-position digits"}
              </div>
              <div className="flex gap-1">
                {reactions.map((emoji) => (
                  <button key={emoji} type="button" onClick={() => react(emoji)} className="focus-ring rounded-lg bg-white/8 px-2 py-1 text-xl transition hover:bg-white/15">
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            {error || guessError ? (
              <div className="rounded-lg bg-rose-500/10 p-3 text-sm font-bold text-rose-200 light:text-rose-700">{error || guessError}</div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}

function FloatingReactions({ room }: { room: PublicRoom }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const list = useMemo(
    () =>
      Object.entries(room.reactions ?? {})
        .map(([id, reaction]) => ({ id, reaction }))
        .filter(({ reaction }) => reaction.createdAt > now - 4000)
        .sort((a, b) => a.reaction.createdAt - b.reaction.createdAt)
        .slice(-5),
    [room.reactions, now]
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 hidden justify-center sm:flex">
      <AnimatePresence>
        {list.map(({ id, reaction }, index) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: -index * 18, scale: 1 }}
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
  opponentHistory,
  me,
  opponent,
  presence,
  latency,
  role,
  onExit
}: {
  room: PublicRoom;
  uid: string;
  history: Record<string, GuessRecord>;
  opponentHistory: Record<string, GuessRecord>;
  me?: PublicPlayer;
  opponent?: PublicPlayer;
  presence: Record<string, { online: boolean; lastSeen: number }>;
  latency: number | null;
  role: "player" | "spectator";
  onExit: () => void;
}) {
  const [sound, setSound] = useState(true);
  const allRecords = useMemo(() => {
    const combined = [...orderedHistory(history), ...orderedHistory(opponentHistory)];
    const seen = new Map<string, GuessRecord>();
    combined.forEach((record) => {
      if (!seen.has(record.id)) {
        seen.set(record.id, record);
      }
    });
    return Array.from(seen.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [history, opponentHistory]);

  const myRecords = useMemo(
    () =>
      allRecords
        .filter((record) =>
          record.ownerUid ? record.ownerUid === uid : record.ownerName === me?.name
        )
        .map((record) => ({
          ...record,
          owner: "You",
          name: me?.name ?? "You"
        })),
    [allRecords, me, uid]
  );

  const opponentRecords = useMemo(
    () =>
      allRecords
        .filter((record) =>
          record.ownerUid ? record.ownerUid !== uid : record.ownerName !== me?.name
        )
        .map((record) => ({
          ...record,
          owner: record.ownerName ?? opponent?.name ?? "Opponent",
          name: record.ownerName ?? opponent?.name ?? "Opponent"
        })),
    [allRecords, opponent, me, uid]
  );

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

        <GamePanel room={room} uid={uid} myRecords={myRecords} opponentRecords={opponentRecords} role={role} />
      </main>
      <FloatingReactions room={room} />
    </>
  );
}

export default function App() {
  const { user, loading, error } = useAuth();
  const [selectedRoom, setSelectedRoom] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return localStorage.getItem("selectedRoom") ?? "";
  });
  const { roomCode, setRoomCode, room, history, opponentHistory, presence, latency, role, me, opponent } = useRoom(user?.uid, selectedRoom);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (selectedRoom) {
      localStorage.setItem("selectedRoom", selectedRoom);
    } else {
      localStorage.removeItem("selectedRoom");
    }
  }, [selectedRoom]);

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
    if (typeof window !== "undefined") {
      localStorage.removeItem("selectedRoom");
    }
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
          opponentHistory={opponentHistory}
          presence={presence}
          latency={latency}
          role={role}
          me={me}
          opponent={opponent}
          onExit={exitRoom}
        />
      ) : (
        <Home onRoom={setSelectedRoom} busy={!user} />
      )}
    </Shell>
  );
}
