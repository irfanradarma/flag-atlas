import { create } from 'zustand';
import type {
  MpPhase, MpSettings, PlayerInfo, ResultEntry, RoundInfo, Screen,
} from './types';
import { DEFAULT_ROUNDS, DEFAULT_SECONDS } from './config';

interface AppState {
  screen: Screen;
  error: string | null;

  // Multiplayer state (written by lib/mp.ts)
  phase: MpPhase;
  code: string;
  isHost: boolean;
  players: PlayerInfo[];
  settings: MpSettings;
  round: RoundInfo | null;
  guessedIds: string[];
  myGuess: { lat: number; lng: number } | null;
  results: ResultEntry[] | null;
  totals: Record<string, number>;

  setScreen: (s: Screen) => void;
  setError: (e: string | null) => void;
  setMyGuess: (g: { lat: number; lng: number } | null) => void;
  resetMp: () => void;
}

export const useStore = create<AppState>((set) => ({
  screen: 'landing',
  error: null,

  phase: 'idle',
  code: '',
  isHost: false,
  players: [],
  settings: { rounds: DEFAULT_ROUNDS, seconds: DEFAULT_SECONDS },
  round: null,
  guessedIds: [],
  myGuess: null,
  results: null,
  totals: {},

  setScreen: (screen) => set({ screen }),
  setError: (error) => set({ error }),
  setMyGuess: (myGuess) => set({ myGuess }),
  resetMp: () =>
    set({
      phase: 'idle',
      code: '',
      isHost: false,
      players: [],
      round: null,
      guessedIds: [],
      myGuess: null,
      results: null,
      totals: {},
    }),
}));
