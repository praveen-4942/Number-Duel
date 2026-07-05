export type ClueMode = "classic" | "advanced" | "bullsCows";
export type RoomStatus = "lobby" | "playing" | "finished" | "closed";
export type Role = "player" | "spectator";

export type GameSettings = {
  numberLength: 3 | 4 | 5 | 6;
  clueMode: ClueMode;
  timerSeconds: 0 | 30 | 45 | 60 | 90;
  allowSpectators: boolean;
};

export type PublicPlayer = {
  uid: string;
  name: string;
  ready: boolean;
  connected: boolean;
  wins: number;
  losses: number;
  secret?: string;
};

export type PublicRoom = {
  roomCode: string;
  hostUid: string;
  status: RoomStatus;
  settings: GameSettings;
  players: Record<string, PublicPlayer>;
  playerOrder: string[];
  currentTurnUid?: string | null;
  round: number;
  turnStartedAt?: number | null;
  rematchVotes?: Record<string, boolean>;
  winnerUid?: string | null;
  closedAt?: number;
  reactions?: Record<string, Reaction>;
};

export type GuessRecord = {
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

export type Reaction = {
  uid: string;
  emoji: string;
  createdAt: number;
};

export type PendingGuess = {
  id: string;
  fromUid: string;
  toUid: string;
  guess: string;
  round: number;
  createdAt: number;
  status: "pending" | "resolved";
};
