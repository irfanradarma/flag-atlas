// Supabase project credentials. The anon key is designed to be public
// (this app uses Broadcast/Presence channels only — no database, no RLS surface).
// Fill these in after creating a free project at https://supabase.com.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const mpConfigured = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export const HUB_URL = 'https://seruseruan.xyz';

// Gameplay constants
export const SCORE_MAX = 5000;
export const SCORE_DECAY_KM = 2000;
export const REVEAL_PAUSE_MS = 9000;
export const DEFAULT_ROUNDS = 5;
export const DEFAULT_SECONDS = 45;

// Session lifecycle (see plan §4)
export const IDLE_WARN_AFTER_MS = 3 * 60 * 1000;
export const IDLE_KICK_COUNTDOWN_S = 30;
export const LOBBY_MAX_AGE_MS = 10 * 60 * 1000;
