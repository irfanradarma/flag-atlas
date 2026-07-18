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
let isPublic = false;
let dirChannel: RealtimeChannel | null = null;
let dirHeartbeat: ReturnType<typeof setInterval> | undefined;
let browseChannel: RealtimeChannel | null = null;
let browsePrune: ReturnType<typeof setInterval> | undefined;

const DIRECTORY = 'public-lobbies';
// Hosts refresh their listing every 20s; browsers drop entries not refreshed
// within 50s — heals ghost listings if a presence leave diff is ever missed.
const DIR_HEARTBEAT_MS = 20_000;
const DIR_STALE_MS = 50_000;

// host-only round orchestration
let gameNo = 0; // host: unique id per started game, rides round/reveal payloads
let clientGame = -1; // all clients: the game id currently being played
let roundPlan: string[] = [];

// Host-side catch-up state: phones drop their websocket constantly (screen
// dim, app switch, radio idle). Broadcasts sent during the gap are gone, so
// reconnecting clients request a sync and replay what they missed.
type RoundPayload = { g: number; i: number; total: number; iso: string; endsAt: number };
type RevealPayload = { g: number; i: number; iso: string; guesses: GuessEntry[] };
let currentRoundPayload: RoundPayload | null = null;
let revealHistory: RevealPayload[] = [];
let gameFinished = false;
let lastSyncSent = 0;
let lastSyncReq = 0;
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

function myPresence(asHost: boolean, playing: boolean, spectator = false) {
  return {
    name: me!.name, host: asHost, playing, spectator,
    token: getToken(), color: getColor(),
    // Lets readers pick the newest meta when re-tracks briefly leave
    // stale+fresh payloads side by side (array order is not guaranteed).
    ts: Date.now(),
  };
}

/** Deliver a broadcast with server ack + retries — plain send is fire-and-forget
 *  and silently drops on flaky connections (lost guesses / missed reveals). */
async function sendReliable(event: string, payload: object): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!channel) return;
    try {
      const res = await channel.send({ type: 'broadcast', event, payload });
      if (res === 'ok') return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
}

const isPlayingPhase = (p: string) => p === 'round' || p === 'reveal' || p === 'final';

/** Host of a public lobby advertises it on the shared directory channel. */
function updateDirectory(playingOverride?: boolean) {
  if (!dirChannel || !isHost || !isPublic) return;
  const st = useStore.getState();
  void dirChannel.track({
    host: me?.name ?? 'Host',
    players: Math.max(1, st.players.filter((p) => !p.spectator).length),
    playing: playingOverride ?? isPlayingPhase(st.phase),
    ts: Date.now(),
  });
}

async function openDirectoryAsHost(code: string) {
  const supa = getClient();
  const ch = supa.channel(DIRECTORY, { config: { presence: { key: code } } });
  ch.on('presence', { event: 'sync' }, () => {});
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => resolve(), 8000);
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        clearTimeout(t);
        resolve();
      }
    });
  });
  dirChannel = ch;
  updateDirectory(false);
  clearInterval(dirHeartbeat);
  dirHeartbeat = setInterval(() => updateDirectory(), DIR_HEARTBEAT_MS);
}

async function teardownDirectory() {
  clearInterval(dirHeartbeat);
  dirHeartbeat = undefined;
  if (dirChannel) {
    const d = dirChannel;
    dirChannel = null;
    try {
      await d.unsubscribe();
      if (client) await client.removeChannel(d);
    } catch { /* already gone */ }
  }
}

// ── public lobby browsing (multiplayer menu) ─────────────────────────────────

interface DirEntry { code: string; host: string; players: number; playing: boolean; ts: number }
let browseRaw: DirEntry[] = [];
const dirSeen = new Map<string, { marker: number; seenAt: number }>();

function publishLobbies() {
  const now = Date.now();
  const fresh = browseRaw.filter((l) => {
    const s = dirSeen.get(l.code);
    return s && now - s.seenAt < DIR_STALE_MS;
  });
  useStore.setState({
    publicLobbies: fresh.map(({ code, host, players, playing }) => ({ code, host, players, playing })),
  });
}

export async function startBrowsing(): Promise<void> {
  if (!mpConfigured() || browseChannel) return;
  const supa = getClient();
  const ch = supa.channel(DIRECTORY);
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState<{ host: string; players: number; playing: boolean; ts?: number }>();
    browseRaw = Object.entries(state).map(([code, metas]) => {
      const m = metas[metas.length - 1]; // newest meta wins after re-tracks
      return {
        code,
        host: m?.host ?? 'Host',
        players: m?.players ?? 1,
        playing: m?.playing ?? false,
        ts: m?.ts ?? 0,
      };
    });
    for (const e of browseRaw) {
      const s = dirSeen.get(e.code);
      if (!s || s.marker !== e.ts) dirSeen.set(e.code, { marker: e.ts, seenAt: Date.now() });
    }
    publishLobbies();
  });
  browseChannel = ch;
  clearInterval(browsePrune);
  browsePrune = setInterval(publishLobbies, 10_000);
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => resolve(), 8000);
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

export async function stopBrowsing(): Promise<void> {
  clearInterval(browsePrune);
  browsePrune = undefined;
  browseRaw = [];
  dirSeen.clear();
  if (browseChannel) {
    const b = browseChannel;
    browseChannel = null;
    try {
      await b.unsubscribe();
      if (client) await client.removeChannel(b);
    } catch { /* already gone */ }
  }
  useStore.setState({ publicLobbies: [] });
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
    spectator?: boolean; ts?: number;
  }>();
  // A re-track (e.g. host flipping `playing`, spectator converting) can briefly
  // leave old+new metas side by side — the newest (highest ts) is authoritative.
  return Object.entries(state).map(([id, metas]) => {
    const m = metas.reduce((a, b) => ((b?.ts ?? 0) >= (a?.ts ?? 0) ? b : a), metas[0]);
    return {
      id,
      name: m?.name ?? 'Explorer',
      host: m?.host ?? false,
      playing: m?.playing ?? false,
      token: m?.token,
      color: m?.color,
      spectator: m?.spectator ?? false,
    };
  });
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
    // Host of a public lobby: keep the directory listing fresh.
    if (isHost) updateDirectory();
  });

  ch.on('broadcast', { event: 'round' }, ({ payload }) => onRound(payload));
  ch.on('broadcast', { event: 'guess' }, ({ payload }) => onGuess(payload));
  ch.on('broadcast', { event: 'reveal' }, ({ payload }) => void onReveal(payload));
  ch.on('broadcast', { event: 'final' }, ({ payload }) => onFinal(payload));
  ch.on('broadcast', { event: 'again' }, () => onAgain());
  ch.on('broadcast', { event: 'sync-req' }, () => hostSendSync());
  ch.on('broadcast', { event: 'sync' }, ({ payload }) => void onSync(payload));
}

/** Host: answer a catch-up request with the game so far (rate-limited). */
function hostSendSync() {
  if (!isHost || !channel) return;
  if (Date.now() - lastSyncSent < 800) return;
  lastSyncSent = Date.now();
  void sendReliable('sync', {
    round: currentRoundPayload,
    reveals: revealHistory,
    final: gameFinished,
  });
}

/** Client: replay missed events — dedupe guards make this idempotent. */
async function onSync(p: { round?: RoundPayload | null; reveals?: RevealPayload[]; final?: boolean }) {
  if (isHost || !p) return;
  for (const r of p.reveals ?? []) await onReveal(r);
  if (p.round) onRound(p.round);
  if (p.final) onFinal({});
}

/** Client: ask the host for anything we missed (reconnects, tab refocus). */
function requestSync(force = false) {
  if (isHost || !channel) return;
  const ph = useStore.getState().phase;
  if (!force && ph !== 'round' && ph !== 'reveal' && ph !== 'final') return;
  if (Date.now() - lastSyncReq < 1500) return;
  lastSyncReq = Date.now();
  void sendReliable('sync-req', { id: me?.id ?? '' });
}

// A phone coming back to the foreground may have silently missed broadcasts.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && channel && !isHost) {
    const ph = useStore.getState().phase;
    if (ph === 'round' || ph === 'reveal' || ph === 'final') requestSync();
  }
});

async function openChannel(code: string, asHost: boolean): Promise<'ok' | 'spectate' | 'not-found' | 'taken' | 'error'> {
  const supa = getClient();
  const ch = supa.channel(`room:${code}`, {
    config: { broadcast: { self: true, ack: true }, presence: { key: me!.id } },
  });
  attachHandlers(ch);

  let joinedOnce = false;
  const subscribed = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 8000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (joinedOnce) {
          // websocket dropped and rejoined — catch up on missed broadcasts
          setTimeout(() => requestSync(), 400);
        }
        joinedOnce = true;
        clearTimeout(t);
        resolve(true);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); resolve(false); }
    });
  });
  if (!subscribed) {
    await supa.removeChannel(ch);
    return 'error';
  }

  channel = ch;
  isHost = asHost;

  if (asHost) {
    await ch.track(myPresence(true, false));
    // Brief settle to detect an (astronomically unlikely) code collision.
    await new Promise((r) => setTimeout(r, 600));
    if (readPlayers().some((p) => p.id !== me!.id && p.host)) {
      await teardownChannel();
      return 'taken'; // caller retries with a fresh code
    }
    return 'ok';
  }

  // Guest: wait for the host to appear in presence BEFORE tracking ourselves,
  // so we can join with the right role. Under concurrent joins the member list
  // converges slowly, so give it a generous window.
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
  // Game in progress → join as a spectator; converted to a player when the
  // lobby reopens.
  const spectate = hostSeen.playing;
  await ch.track(myPresence(false, false, spectate));
  return spectate ? 'spectate' : 'ok';
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

export async function createLobby(name: string, asPublic = false): Promise<void> {
  if (!mpConfigured()) {
    set({ error: 'Multiplayer is not configured yet (missing Supabase keys).' });
    return;
  }
  await stopBrowsing();
  await loadCountries();
  me = { id: myId(), name };
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = genCode();
    const res = await openChannel(code, true);
    if (res === 'ok') {
      isPublic = asPublic;
      set({
        screen: 'mp-wait', phase: 'wait', code, isHost: true,
        totals: {}, results: null, round: null, isSpectator: false,
      });
      if (asPublic) await openDirectoryAsHost(code);
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
  await stopBrowsing();
  await loadCountries();
  me = { id: myId(), name };
  const res = await openChannel(code.toUpperCase(), false);
  if (res === 'ok') {
    set({
      screen: 'mp-wait', phase: 'wait', code: code.toUpperCase(), isHost: false,
      totals: {}, results: null, round: null, isSpectator: false,
    });
  } else if (res === 'spectate') {
    set({
      screen: 'mp-game', phase: 'wait', code: code.toUpperCase(), isHost: false,
      totals: {}, results: null, round: null, isSpectator: true,
    });
    // catch up on the game in progress right away
    setTimeout(() => requestSync(true), 600);
  } else if (res === 'not-found') {
    set({ error: `Lobby "${code.toUpperCase()}" not found.` });
  } else {
    set({ error: 'Could not join the lobby. Please try again.' });
  }
}

export async function leave(backToMenu = true): Promise<void> {
  clearTimers();
  collected = new Map();
  revealSent = new Set();
  revealsSeen = new Set();
  clientGame = -1;
  roundPlan = [];
  isHost = false;
  isPublic = false;
  await teardownDirectory();
  await teardownChannel();
  useStore.getState().resetMp();
  if (backToMenu) set({ screen: 'mp-menu' });
}

export function startGame(s: MpSettings): void {
  if (!channel || !isHost) return;
  settings = s;
  gameNo = Date.now();
  roundPlan = pickRoundCountries(s.rounds);
  collected = new Map();
  revealSent = new Set();
  revealsSeen = new Set();
  revealHistory = [];
  currentRoundPayload = null;
  gameFinished = false;
  set({ settings: s, totals: {} });
  void channel.track(myPresence(true, true));
  updateDirectory(true);
  sendRound(0);
}

export function submitGuess(lat: number, lng: number): void {
  const st = useStore.getState();
  if (!channel || !st.round || st.phase !== 'round') return;
  if (st.guessedIds.includes(me!.id)) return;
  set({ myGuess: { lat, lng } });
  const payload = {
    i: st.round.i, id: me!.id, name: me!.name, lat, lng,
    token: getToken(), color: getColor(),
  };
  // Process locally first — never depend on receiving our own echo.
  onGuess(payload);
  void sendReliable('guess', payload);
}

export function playAgain(): void {
  if (!channel || !isHost) return;
  currentRoundPayload = null;
  revealHistory = [];
  gameFinished = false;
  void channel.track(myPresence(true, false));
  updateDirectory(false);
  void sendReliable('again', {});
  onAgain(); // local-first; guests get the broadcast
}

// ── host round orchestration ─────────────────────────────────────────────────

function sendRound(i: number) {
  if (!channel) return;
  const iso = roundPlan[i];
  const endsAt = Date.now() + settings.seconds * 1000;
  collected.set(i, new Map());
  const payload: RoundPayload = { g: gameNo, i, total: settings.rounds, iso, endsAt };
  currentRoundPayload = payload;
  onRound(payload); // host processes locally, never waits for its own echo
  void sendReliable('round', payload);
  // second delivery for clients whose first copy got lost (handlers dedupe)
  setTimeout(() => void sendReliable('round', payload), 1500);
  clearTimeout(roundTimer);
  roundTimer = setTimeout(() => fireReveal(i), endsAt - Date.now() + 500);
}

function maybeReveal(i: number) {
  const st = useStore.getState();
  const present = st.players.filter((p) => !p.spectator).map((p) => p.id);
  const got = collected.get(i);
  if (!got || present.length === 0) return;
  if (present.every((id) => got.has(id))) fireReveal(i);
}

function fireReveal(i: number) {
  if (!channel || revealSent.has(i)) return;
  revealSent.add(i);
  clearTimeout(roundTimer);
  const got = collected.get(i) ?? new Map<string, GuessEntry>();
  // Players present but silent get a null guess (0 points). Spectators are
  // not part of the round.
  for (const p of useStore.getState().players) {
    if (!p.spectator && !got.has(p.id)) {
      got.set(p.id, { id: p.id, name: p.name, lat: null, lng: null, token: p.token, color: p.color });
    }
  }
  const payload: RevealPayload = { g: gameNo, i, iso: roundPlan[i], guesses: [...got.values()] };
  revealHistory.push(payload);
  void onReveal(payload); // local-first
  void sendReliable('reveal', payload);
  setTimeout(() => void sendReliable('reveal', payload), 1200);
  advanceTimer = setTimeout(() => {
    if (i + 1 < settings.rounds) sendRound(i + 1);
    else sendFinal();
  }, REVEAL_PAUSE_MS);
}

function sendFinal() {
  if (!channel) return;
  gameFinished = true;
  onFinal({}); // local-first
  void sendReliable('final', {});
  setTimeout(() => void sendReliable('final', {}), 1200);
}

// ── event handlers (all clients, host included via self-broadcast) ───────────

let revealsSeen = new Set<number>();

function onRound(p: { g?: number; i: number; total: number; iso: string; endsAt: number }) {
  const st = useStore.getState();
  const g = p.g ?? 0;
  if (g === clientGame) {
    // Same game: ignore duplicate or stale deliveries. Crucially this must
    // hold during 'reveal' too — a late duplicate of the current round used
    // to re-enter round phase and wipe the reveal off the screen.
    if ((st.phase === 'round' || st.phase === 'reveal') && st.round && p.i <= st.round.i) return;
  } else {
    clientGame = g;
    revealsSeen = new Set();
  }
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

async function onReveal(p: { g?: number; i: number; iso: string; guesses: GuessEntry[] }) {
  const g = p.g ?? 0;
  if (g !== clientGame) {
    // reveal from a game we haven't tracked yet (e.g. spectator joining
    // mid-round) — adopt it
    clientGame = g;
    revealsSeen = new Set();
  }
  if (revealsSeen.has(p.i)) return; // duplicate delivery
  revealsSeen.add(p.i);
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
  // Self-healing: if this client missed the round broadcast, sync the round
  // info from the reveal payload so the correct country gets highlighted.
  const st = useStore.getState();
  const round =
    st.round && st.round.i === p.i && st.round.iso === p.iso
      ? st.round
      : { i: p.i, total: Math.max(st.round?.total ?? 0, p.i + 1), iso: p.iso, endsAt: null };
  set({ phase: 'reveal', results, totals, round });
}

function onFinal(_p: unknown) {
  set({ phase: 'final' });
}

function onAgain() {
  const st = useStore.getState();
  if (st.phase === 'wait' && st.screen === 'mp-wait') return; // duplicate delivery
  revealsSeen = new Set();
  // Spectators become full players once the lobby reopens.
  if (st.isSpectator && channel) {
    void channel.track(myPresence(false, false, false));
  }
  set({
    phase: 'wait', screen: 'mp-wait', round: null, results: null,
    guessedIds: [], myGuess: null, totals: {}, isSpectator: false,
  });
}

export function playerColor(id: string): string {
  return colorFor(id);
}
