import { useState } from 'react';
import { motion } from 'motion/react';
import { useStore } from '../lib/store';
import { createLobby, joinLobby } from '../lib/mp';
import { randomName } from '../lib/names';
import { mpConfigured } from '../lib/config';
import TokenPicker from './TokenPicker';

const NAME_KEY = 'fa-name';

export default function MultiplayerMenu() {
  const setScreen = useStore((s) => s.setScreen);
  const [name, setName] = useState(() => sessionStorage.getItem(NAME_KEY) ?? '');
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get('join')?.toUpperCase() ?? '',
  );
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const finalName = () => {
    const n = name.trim() || randomName();
    sessionStorage.setItem(NAME_KEY, n);
    if (!name.trim()) setName(n);
    return n;
  };

  const onCreate = async () => {
    setBusy('create');
    await createLobby(finalName());
    setBusy(null);
  };

  const onJoin = async () => {
    if (code.trim().length < 4) return;
    setBusy('join');
    await joinLobby(code.trim(), finalName());
    setBusy(null);
  };

  return (
    <div className="h-full flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-8 max-w-md w-full"
      >
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">⚔️</div>
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
          className="input mb-5"
          placeholder="e.g. Swift Falcon"
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <TokenPicker />

        <button
          className="btn-primary w-full py-4 text-lg mb-6"
          disabled={busy !== null || !mpConfigured()}
          onClick={onCreate}
        >
          {busy === 'create' ? 'Creating…' : '✨ Create a lobby'}
        </button>

        <div className="flex items-center gap-3 mb-5 text-slate-500 text-xs font-bold uppercase tracking-widest">
          <div className="h-px bg-white/10 flex-1" /> or join one <div className="h-px bg-white/10 flex-1" />
        </div>

        <div className="flex gap-3">
          <input
            className="input flex-1 uppercase tracking-[0.3em] font-black text-center"
            placeholder="CODE"
            maxLength={5}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && onJoin()}
          />
          <button
            className="btn-secondary px-6"
            disabled={busy !== null || code.trim().length < 4 || !mpConfigured()}
            onClick={onJoin}
          >
            {busy === 'join' ? '…' : 'Join'}
          </button>
        </div>

        <button className="btn-ghost w-full py-2 mt-6 text-sm" onClick={() => setScreen('landing')}>
          ← Back
        </button>
      </motion.div>
    </div>
  );
}
