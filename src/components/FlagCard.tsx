import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { flagUrl, useFacts } from '../lib/countries';

function fmtPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} thousand`;
  return String(n);
}

function fmtArea(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M km²`;
  return `${Math.round(n).toLocaleString()} km²`;
}

export default function FlagCard({ iso, roundLabel }: { iso: string; roundLabel: string }) {
  const facts = useFacts(iso);
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 640,
  );

  const rows: [string, string, string][] = facts
    ? ([
        ['🏛️', 'Capital', facts.capital],
        ['🌏', 'Region', facts.region],
        ['👥', 'People', facts.pop != null ? fmtPop(facts.pop) : null],
        ['📐', 'Area', facts.area != null ? fmtArea(facts.area) : null],
        ['🗣️', 'Language', facts.languages.length ? facts.languages.join(', ') : null],
        ['🗿', 'Landmark', facts.landmark],
      ].filter((r): r is [string, string, string] => r[2] != null))
    : [];

  return (
    <motion.div
      key={iso}
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="glass rounded-2xl p-3 w-[190px] sm:w-[240px] max-h-[calc(100vh-140px)] overflow-y-auto"
    >
      <div className="text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-2 flex justify-between">
        <span>{roundLabel}</span>
        <span className="text-amber-300">Find it! 📍</span>
      </div>
      <img
        src={flagUrl(iso)}
        alt="Mystery flag"
        draggable={false}
        className="w-full rounded-lg shadow-lg shadow-black/50 border border-white/10 select-none"
      />
      {facts && (
        <div className="mt-2 text-center text-base sm:text-lg font-extrabold text-white leading-tight">
          {facts.name}
        </div>
      )}
      {facts && rows.length > 0 && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-[11px] font-bold
              uppercase tracking-widest text-sky-300 hover:text-sky-200 transition cursor-pointer py-1"
          >
            📖 Geo facts
            <span className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-1 space-y-1">
                  {rows.map(([icon, label, value]) => (
                    <div key={label} className="flex items-start gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
                      <span className="text-sm leading-tight">{icon}</span>
                      <div className="min-w-0">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 leading-none">
                          {label}
                        </div>
                        <div className="text-[11px] sm:text-xs font-semibold text-slate-200 leading-snug break-words">
                          {value}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
