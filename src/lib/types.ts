export interface PlayerInfo {
  id: string;
  name: string;
  host: boolean;
  playing: boolean;
  token?: string;
  color?: string;
}

export interface RoundInfo {
  i: number;
  total: number;
  iso: string;
  endsAt: number | null; // ms epoch; null = untimed (single player)
}

export interface GuessEntry {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  token?: string;
  color?: string;
}

export interface ResultEntry {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  km: number | null;
  score: number;
  isMe: boolean;
  token?: string;
  color?: string;
}

export interface MpSettings {
  rounds: number;
  seconds: number;
}

export type Screen = 'landing' | 'single' | 'mp-menu' | 'mp-wait' | 'mp-game';
export type MpPhase = 'idle' | 'wait' | 'round' | 'reveal' | 'final';
