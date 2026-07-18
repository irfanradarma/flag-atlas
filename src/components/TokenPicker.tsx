import { useState } from 'react';
import { COLOR_PRESETS, TOKENS, getColor, getToken, setColor, setToken } from '../lib/profile';

/** Monopoly-style token + colour chooser. Persists to localStorage. */
export default function TokenPicker() {
  const [token, setTok] = useState(getToken);
  const [color, setCol] = useState(getColor);

  const pickToken = (t: string) => {
    setToken(t);
    setTok(t);
  };
  const pickColor = (c: string) => {
    setColor(c);
    setCol(c);
  };

  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-2">
        <span
          className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0
            border-2 border-black/20 shadow-lg"
          style={{ background: color }}
        >
          {token}
        </span>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Your token
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5 mb-3">
        {TOKENS.map((t) => (
          <button
            key={t}
            onClick={() => pickToken(t)}
            className={`h-10 rounded-xl text-lg flex items-center justify-center transition cursor-pointer ${
              t === token
                ? 'bg-amber-400/20 ring-2 ring-amber-400'
                : 'bg-white/5 hover:bg-white/15'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => pickColor(c)}
            aria-label={`color ${c}`}
            className={`w-7 h-7 rounded-full transition cursor-pointer ${
              c === color ? 'ring-2 ring-offset-2 ring-offset-transparent ring-white scale-110' : 'hover:scale-110'
            }`}
            style={{ background: c }}
          />
        ))}
        <label
          className="w-7 h-7 rounded-full cursor-pointer overflow-hidden relative border-2 border-dashed
            border-slate-500 flex items-center justify-center text-[10px] text-slate-400 hover:border-slate-300"
          title="Custom color"
        >
          🎨
          <input
            type="color"
            value={color}
            onChange={(e) => pickColor(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}
