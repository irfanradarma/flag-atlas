import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, mpConfigured, REVEAL_PAUSE_MS } from './config';
import { loadCountries, pickRoundCountries, preloadFlag } from './countries';
import { distanceToCountry, scoreFromDistance } from './scoring';
import { colorFor } from './names';
import { getColor, getToken, myId } from './profile';
import { useStore } from './store';
import type { GuessEntry, MpSettings, PlayerInfo, ResultEntry } from './types';

// ── module state ──────────────────────────────────────────────────────────────
let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let me: { id: string; name: string } | null = null;
let isHost = false;

// host-only round orchestration
let roundPlan: string[] = [];
let settings: MpSettings = { rounds: 5, seconds: 45 };
let collected = new Map<number, Map<string, GuessEntry>>();
let revealSent = new Set<number>();
let roundTimer: ReturnType<typeof setTimeout> | undefined;
let advanceTimer: ReturnType<typeof setTimeout> | undefined;
let hostGoneTimer: ReturnType<typeof setTimeout> | undefined;

// Presence needs time to converge when several players join at once — with
// 3+ concurrent joins the full member list can take multiple seconds to sync.
const JOIN_VALIDATION_MS = 8000;
const HOST_GONE_GRACE_MS = 4000;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function genCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++)
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export { myId };

function myPresence(asHost: boolean, playing: boolean) {
  return { name: me!.name, host: asHost, playing, token: getToken(), color: getColor() };
}

type StoreState = ReturnType<typeof useStore.getState>;

function set(partial: Partial<StoreState>) {
  useStore.setState(partial);
}

function clearTimers() {
  clearTimeout(roundTimer);
  clearTimeout(advanceTimer);
  clearTimeout(hostGoneTimer);
  roundTimer = undefined;
  advanceTimer = undefined;
  hostGoneTimer = undefined;
}

// Release the websocket slot the moment the tab closes (plan §4.3).
window.addEventListener('pagehide', () => {
  if (channel) void leave(false);
});

// ── connection ────────────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return client;
}

function readPlayers(): PlayerInfo[] {
  if (!channel) return [];
  const state = channel.presenceState<{
    name: string; host: boolean; playing: boolean; token?: string; color?: string;
  }>();
  return Object.entries(state).map(([id, metas]) => ({
    id,
    name: metas[0]?.name ?? 'Explorer',
    host: metas[0]?.host ?? false,
    playing: metas[0]?.playing ?? false,
    token: metas[0]?.token,
    color: metas[0]?.color,
  }));
}

function attachHandlers(ch: RealtimeChannel) {
  ch.on('presence', { event: 'sync' }, () => {
    const players = readPlayers();
    set({ players });
    const st = useStore.getState();
    // Guest: host vanished mid-session → end gracefully. Presence state can
    // transiently miss members while several players join at once, so require
    // the host to stay absent for a grace period before kicking anyone.
    if (!isHost && st.phase !== 'idle' && players.length > 0) {
      const hostPresent = players.some((p) => p.host);
      if (hostPresent) {
        clearTimeout(hostGoneTimer);
        hostGoneTimer = undefined;
      } else if (!hostGoneTimer) {
        hostGoneTimer = setTimeout(() => {
          hostGoneTimer = undefined;
          const now = readPlayers();
          if (
            channel && !isHost && useStore.getState().phase !== 'idle' &&
            now.length > 0 && !now.some((p) => p.host)
          ) {
            void leave(false);
            set({ error: 'The host left the lobby.', screen: 'mp-menu' });
          }
        }, HOST_GONE_GRACE_MS);
      }
      if (!hostPresent) return;
    }
    // Host: a player leaving mid-round may complete the "everyone guessed" set.
    if (isHost && st.phase === 'round' && st.round) maybeReveal(st.round.i);
  });

  ch.on('broadcast', { event: 'round' }, ({ payload }) => onRound(payload));
  ch.on('broadcast', { event: 'guess' }, ({ payload }) => onGuess(payload));
  ch.on('broadcast', { event: 'reveal' }, ({ payload }) => void onReveal(payload));
  ch.on('broadcast', { event: 'final' }, ({ payload }) => onFinal(payload));
  ch.on('broadcast', { event: 'again' }, () => onAgain());
}

async function openChannel(code: string, asHost: boolean): Promise<'ok' | 'not-found' | 'in-progress' | 'taken' | 'error'> {
  const supa = getClient();
  const ch = supa.channel(`room:${code}`, {
    config: { broadcast: { self: true }, presence: { key: me!.id } },
  });
  attachHandlers(ch);

  const subscribed = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 8000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(true); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); resolve(false); }
    });
  });
  if (!subscribed) {
    await supa.removeChannel(ch);
    return 'error';
  }

  channel = ch;
  isHost = asHost;
  await ch.track(myPresence(asHost, false));

  if (asHost) {
    // Brief settle to detect an (astronomically unlikely) code collision.
    await new Promise((r) => setTimeout(r, 600));
    if (readPlayers().some((p) => p.id !== me!.id && p.host)) {
      await teardownChannel();
      return 'taken'; // caller retries with a fresh code
    }
    return 'ok';
  }

  // Guest: wait for the host to appear in presence. Under concurrent joins
  // the member list converges slowly, so give it a generous window.
  const deadline = Date.now() + JOIN_VALIDATION_MS;
  let hostSeen: PlayerInfo | undefined;
  while (Date.now() < deadline) {
    hostSeen = readPlayers().find((p) => p.id !== me!.id && p.host);
    if (hostSeen) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!hostSeen) {
    await teardownChannel();
    return 'not-found';
  }
  if (hostSeen.playing) {
    await teardownChannel();
    return 'in-progress';
  }
  return 'ok';
}

async function teardownChannel() {
  if (channel) {
    const ch = channel;
    channel = null;
    try {
      await ch.unsubscribe();
      if (client) await client.removeChannel(ch);
    } catch { /* already gone */ }
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export async function createLobby(name: string): Promise<void> {
  if (!mpConfigured()) {
    set({ error: 'Multiplayer is not configured yet (missing Supabase keys).' });
    return;
  }
  await loadCountries();
  me = { id: myId(), name };
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = genCode();
    const res = await openChannel(code, true);
    if (res === 'ok') {
      set({ screen: 'mp-wait', phase: 'wait', code, isHost: true, totals: {}, results: null, round: null });
      return;
    }
    if (res !== 'taken') break;
  }
  set({ error: 'Could not create a lobby. Please try again.' });
}

export async function joinLobby(code: string, name: string): Promise<void> {
  if (!mpConfigured()) {
    set({ error: 'Multiplayer is not configured yet (missing Supabase keys).' });
    return;
  }
  await loadCountries();
  me = { id: myId(), name };
  const res = await openChannel(code.toUpperCase(), false);
  if (res === 'ok') {
    set({ screen: 'mp-wait', phase: 'wait', code: code.toUpperCase(), isHost: false, totals: {}, results: null, round: null });
  } else if (res === 'not-found') {
    set({ error: `Lobby "${code.toUpperCase()}" not found.` });
  } else if (res === 'in-progress') {
    set({ error: 'That game is already in progress.' });
  } else {
    set({ error: 'Could not join the lobby. Please try again.' });
  }
}

export async function leave(backToMenu = true): Promise<void> {
  clearTimers();
  collected = new Map();
  revealSent = new Set();
  roundPlan = [];
  isHost = false;
  await teardownChannel();
  useStore.getState().resetMp();
  if (backToMenu) set({ screen: 'mp-menu' });
}

export function startGame(s: MpSettings): void {
  if (!channel || !isHost) return;
  settings = s;
  roundPlan = pickRoundCountries(s.rounds);
  collected = new Map();
  revealSent = new Set();
  set({ settings: s, totals: {} });
  void channel.track(myPresence(true, true));
  sendRound(0);
}

export function submitGuess(lat: number, lng: number): void {
  const st = useStore.getState();
  if (!channel || !st.round || st.phase !== 'round') return;
  if (st.guessedIds.includes(me!.id)) return;
  set({ myGuess: { lat, lng } });
  void channel.send({
    type: 'broadcast',
    event: 'guess',
    payload: {
      i: st.round.i, id: me!.id, name: me!.name, lat, lng,
      token: getToken(), color: getColor(),
    },
  });
}

export function playAgain(): void {
  if (!channel || !isHost) return;
  void channel.track(myPresence(true, false));
  void channel.send({ type: 'broadcast', event: 'again', payload: {} });
}

// ── host round orchestration ─────────────────────────────────────────────────

function sendRound(i: number) {
  if (!channel) return;
  const iso = roundPlan[i];
  const endsAt = Date.now() + settings.seconds * 1000;
  collected.set(i, new Map());
  void channel.send({
    type: 'broadcast',
    event: 'round',
    payload: { i, total: settings.rounds, iso, endsAt },
  });
  clearTimeout(roundTimer);
  roundTimer = setTimeout(() => fireReveal(i), endsAt - Date.now() + 500);
}

function maybeReveal(i: number) {
  const st = useStore.getState();
  const present = st.players.map((p) => p.id);
  const got = collected.get(i);
  if (!got || present.length === 0) return;
  if (present.every((id) => got.has(id))) fireReveal(i);
}

function fireReveal(i: number) {
  if (!channel || revealSent.has(i)) return;
  revealSent.add(i);
  clearTimeout(roundTimer);
  const got = collected.get(i) ?? new Map<string, GuessEntry>();
  // Players present but silent get a null guess (0 points).
  for (const p of useStore.getState().players) {
    if (!got.has(p.id)) {
      got.set(p.id, { id: p.id, name: p.name, lat: null, lng: null, token: p.token, color: p.color });
    }
  }
  void channel.send({
    type: 'broadcast',
    event: 'reveal',
    payload: { i, iso: roundPlan[i], guesses: [...got.values()] },
  });
  advanceTimer = setTimeout(() => {
    if (i + 1 < settings.rounds) sendRound(i + 1);
    else sendFinal();
  }, REVEAL_PAUSE_MS);
}

function sendFinal() {
  if (!channel) return;
  void channel.send({ type: 'broadcast', event: 'final', payload: {} });
}

// ── event handlers (all clients, host included via self-broadcast) ───────────

function onRound(p: { i: number; total: number; iso: string; endsAt: number }) {
  preloadFlag(p.iso);
  set({
    phase: 'round',
    screen: 'mp-game',
    round: { i: p.i, total: p.total, iso: p.iso, endsAt: p.endsAt },
    guessedIds: [],
    myGuess: null,
    results: null,
  });
}

function onGuess(p: {
  i: number; id: string; name: string; lat: number; lng: number;
  token?: string; color?: string;
}) {
  const st = useStore.getState();
  if (!st.round || p.i !== st.round.i) return;
  if (!st.guessedIds.includes(p.id)) set({ guessedIds: [...st.guessedIds, p.id] });
  if (isHost) {
    const got = collected.get(p.i);
    if (got && !got.has(p.id)) {
      got.set(p.id, { id: p.id, name: p.name, lat: p.lat, lng: p.lng, token: p.token, color: p.color });
      maybeReveal(p.i);
    }
  }
}

async function onReveal(p: { i: number; iso: string; guesses: GuessEntry[] }) {
  await loadCountries();
  const myIdV = me?.id;
  const results: ResultEntry[] = p.guesses
    .map((g) => {
      const km = g.lat != null && g.lng != null ? distanceToCountry(g.lat, g.lng, p.iso) : null;
      return {
        id: g.id,
        name: g.name,
        lat: g.lat,
        lng: g.lng,
        km,
        score: km != null ? scoreFromDistance(km) : 0,
        isMe: g.id === myIdV,
        token: g.token,
        color: g.color ?? colorFor(g.id),
      };
    })
    .sort((a, b) => b.score - a.score);

  const totals = { ...useStore.getState().totals };
  for (const r of results) totals[r.id] = (totals[r.id] ?? 0) + r.score;
  set({ phase: 'reveal', results, totals });
}

function onFinal(_p: unknown) {
  set({ phase: 'final' });
}

function onAgain() {
  set({ phase: 'wait', screen: 'mp-wait', round: null, results: null, guessedIds: [], myGuess: null, totals: {} });
}

export function playerColor(id: string): string {
  return colorFor(id);
}
