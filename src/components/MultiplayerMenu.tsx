import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../lib/store';
import { createLobby, joinLobby, startBrowsing, stopBrowsing } from '../lib/mp';
import { randomName } from '../lib/names';
import { mpConfigured } from '../lib/config';
import TokenPicker from './TokenPicker';

const NAME_KEY = 'fa-name';
type Tab = 'public' | 'private';

export default function MultiplayerMenu() {
  const setScreen = useStore((s) => s.setScreen);
  const publicLobbies = useStore((s) => s.publicLobbies);
  const [tab, setTab] = useState<Tab>('public');
  const [name, setName] = useState(() => sessionStorage.getItem(NAME_KEY) ?? '');
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get('join')?.toUpperCase() ?? '',
  );
  const [busy, setBusy] = useState<string | null>(null);

  // a deep link means the player has a private code in hand
  useEffect(() => {
    if (new URLSearchParams(location.search).get('join')) setTab('private');
  }, []);

  // Browse the public directory only while the tab is visible & active —
  // keeps idle menus from holding realtime connections.
  useEffect(() => {
    if (tab !== 'public' || !mpConfigured()) return;
    const sync = () => {
      if (document.visibilityState === 'hidden') void stopBrowsing();
      else void startBrowsing();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      void stopBrowsing();
    };
  }, [tab]);

  const finalName = () => {
    const n = name.trim() || randomName();
    sessionStorage.setItem(NAME_KEY, n);
    if (!name.trim()) setName(n);
    return n;
  };

  const onCreate = async (asPublic: boolean) => {
    setBusy('create');
    await createLobby(finalName(), asPublic);
    setBusy(null);
  };

  const onJoin = async (joinCode: string) => {
    if (joinCode.trim().length < 4) return;
    setBusy(joinCode);
    await joinLobby(joinCode.trim(), finalName());
    setBusy(null);
  };

  return (
    <div className="h-full flex items-center justify-center px-6 py-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-7 max-w-md w-full max-h-full overflow-y-auto"
      >
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">⚔️</div>
          <h2 className="text-2xl font-extrabold text-white">Play with Friends</h2>
          {!mpConfigured() && (
            <p className="mt-2 text-xs font-semibold text-rose-300 bg-rose-400/10 rounded-xl px-3 py-2">
              Multiplayer isn't configured yet — Supabase keys are missing.
            </p>
          )}
        </div>

        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
          Display name <span className="text-slate-600">(optional)</span>
        </label>
        <input
          className="input mb-4"
          placeholder="e.g. Swift Falcon"
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <TokenPicker />

        {/* tabs */}
        <div className="flex gap-1.5 mb-4 bg-white/5 rounded-2xl p-1.5">
          {(['public', 'private'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl py-2 text-sm font-bold transition cursor-pointer ${
                tab === t
                  ? 'bg-amber-400 text-slate-900'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {t === 'public' ? '🌐 Public games' : '🔒 Private'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'public' ? (
            <motion.div
              key="public"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <button
                className="btn-primary w-full py-3.5 mb-4"
                disabled={busy !== null || !mpConfigured()}
                onClick={() => onCreate(true)}
              >
                {busy === 'create' ? 'Creating…' : '✨ Create a public lobby'}
              </button>

              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Open games
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {publicLobbies.length === 0 && (
                  <div className="text-center text-sm text-slate-500 font-semibold bg-white/5 rounded-2xl py-5">
                    No public games right now.
                    <br />
                    Create one and invite the world! 🌍
                  </div>
                )}
                {publicLobbies.map((l) => (
                  <motion.div
                    key={l.code}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm truncate">
                        {l.host}'s game
                      </div>
                      <div className="text-[11px] font-semibold text-slate-400">
                        👥 {l.players} player{l.players !== 1 ? 's' : ''} ·{' '}
                        {l.playing ? (
                          <span className="text-amber-300">🎮 In progress — watch, then play</span>
                        ) : (
                          <span className="text-good">🟢 Waiting to start</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn-secondary px-4 py-2 text-sm shrink-0"
                      disabled={busy !== null}
                      onClick={() => onJoin(l.code)}
                    >
                      {busy === l.code ? '…' : l.playing ? 'Watch' : 'Join'}
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="private"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <button
                className="btn-primary w-full py-3.5 mb-5"
                disabled={busy !== null || !mpConfigured()}
                onClick={() => onCreate(false)}
              >
                {busy === 'create' ? 'Creating…' : '🔒 Create a private lobby'}
              </button>

              <div className="flex items-center gap-3 mb-4 text-slate-500 text-xs font-bold uppercase tracking-widest">
                <div className="h-px bg-white/10 flex-1" /> or join with a code{' '}
                <div className="h-px bg-white/10 flex-1" />
              </div>

              <div className="flex gap-3">
                <input
                  className="input flex-1 uppercase tracking-[0.3em] font-black text-center"
                  placeholder="CODE"
                  maxLength={5}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && onJoin(code)}
                />
                <button
                  className="btn-secondary px-6"
                  disabled={busy !== null || code.trim().length < 4 || !mpConfigured()}
                  onClick={() => onJoin(code)}
                >
                  {busy === code ? '…' : 'Join'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button className="btn-ghost w-full py-2 mt-5 text-sm" onClick={() => setScreen('landing')}>
          ← Back
        </button>
      </motion.div>
    </div>
  );
}
