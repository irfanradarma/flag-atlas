import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../lib/store';
import { countryAt, countryName, pickRoundCountries, useCountries } from '../lib/countries';
import FactBlast from './FactBlast';
import { distanceToCountry, formatKm, scoreFromDistance } from '../lib/scoring';
import { SCORE_MAX } from '../lib/config';
import { getColor, getToken } from '../lib/profile';
import { sfx } from '../lib/sound';
import MapView from './MapView';
import FlagCard from './FlagCard';
import ExitButton from './ExitButton';
import Loader from './Loader';
import TokenPicker from './TokenPicker';

interface RoundResult {
  iso: string;
  lat: number;
  lng: number;
  km: number;
  score: number;
  pinned: string | null;
}

type Stage = 'intro' | 'play' | 'reveal' | 'done';

const BEST_KEY = 'fa-best-';

export default function SinglePlayer() {
  const setScreen = useStore((s) => s.setScreen);
  const countries = useCountries();

  const [stage, setStage] = useState<Stage>('intro');
  const [plan, setPlan] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [resetKey, setResetKey] = useState(0);

  const total = useMemo(() => results.reduce((a, r) => a + r.score, 0), [results]);

  if (!countries) return <Loader label="Loading the world…" />;

  const start = (n: number) => {
    setPlan(pickRoundCountries(n));
    setResults([]);
    setI(0);
    setPin(null);
    setStage('play');
    setResetKey((k) => k + 1);
    sfx.round();
  };

  const confirm = () => {
    if (!pin) return;
    const iso = plan[i];
    const km = distanceToCountry(pin.lat, pin.lng, iso);
    const score = scoreFromDistance(km);
    const pinned = countryAt(pin.lat, pin.lng)?.name ?? null;
    setResults((r) => [...r, { iso, lat: pin.lat, lng: pin.lng, km, score, pinned }]);
    setStage('reveal');
    sfx.reveal(score);
  };

  const next = () => {
    if (i + 1 < plan.length) {
      setI(i + 1);
      setPin(null);
      setStage('play');
      setResetKey((k) => k + 1);
      sfx.round();
    } else {
      const key = BEST_KEY + plan.length;
      const best = Number(localStorage.getItem(key) ?? 0);
      if (total > best) localStorage.setItem(key, String(total));
      setStage('done');
      sfx.fanfare();
    }
  };

  const current = results[results.length - 1];
  const best = Number(localStorage.getItem(BEST_KEY + plan.length) ?? 0);

  return (
    <div className="h-full relative">
      {/* map is always mounted during play/reveal */}
      {stage !== 'intro' && stage !== 'done' && (
        <MapView
          countries={countries}
          interactive={stage === 'play'}
          myPin={pin}
          onPlacePin={(lat, lng) => {
            setPin({ lat, lng });
            sfx.place();
          }}
          revealIso={stage === 'reveal' ? plan[i] : null}
          revealPins={
            stage === 'reveal' && current
              ? [{
                  id: 'me', label: 'You', lat: current.lat, lng: current.lng,
                  color: getColor(), km: current.km, token: getToken(),
                  pinned: current.pinned,
                }]
              : []
          }
          resetKey={resetKey}
          myToken={getToken()}
          myColor={getColor()}
        />
      )}

      {/* ── intro ── */}
      <AnimatePresence>
        {stage === 'intro' && (
          <motion.div
            key="intro"
            className="absolute inset-0 flex flex-col items-center justify-center px-6"
            exit={{ opacity: 0 }}
          >
            <div className="glass rounded-3xl p-8 max-w-md w-full text-center">
              <div className="text-5xl mb-4">🧭</div>
              <h2 className="text-2xl font-extrabold text-white mb-2">Solo Journey</h2>
              <p className="text-slate-400 text-sm mb-5">
                A flag appears — tap the world map where you think that country is,
                then confirm. Land inside the country for a perfect {SCORE_MAX.toLocaleString()}.
              </p>
              <div className="text-left">
                <TokenPicker />
              </div>
              <div className="flex gap-3">
                <button className="btn-primary flex-1 py-3" onClick={() => start(5)}>5 rounds</button>
                <button className="btn-secondary flex-1 py-3" onClick={() => start(10)}>10 rounds</button>
              </div>
              <button className="btn-ghost w-full py-2 mt-3 text-sm" onClick={() => setScreen('landing')}>
                ← Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── play HUD ── */}
      {(stage === 'play' || stage === 'reveal') && (
        <>
          <div className="absolute top-3 left-3 z-10">
            <FlagCard iso={plan[i]} roundLabel={`Round ${i + 1}/${plan.length}`} />
          </div>
          <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
            <div className="glass rounded-2xl px-4 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Score</div>
              <div className="text-xl font-black text-amber-300">{total.toLocaleString()}</div>
            </div>
            <ExitButton onExit={() => setScreen('landing')} />
          </div>
        </>
      )}

      {/* ── confirm bar ── */}
      <AnimatePresence>
        {stage === 'play' && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[min(92vw,380px)]"
          >
            {pin ? (
              <button className="btn-primary w-full py-4 text-lg" onClick={confirm}>
                Confirm guess 🎯
              </button>
            ) : (
              <div className="glass rounded-2xl px-5 py-3 text-center text-sm font-semibold text-slate-300">
                Tap the map where you think this country is
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── reveal panel ── */}
      <AnimatePresence>
        {stage === 'reveal' && current && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[min(92vw,420px)] glass rounded-3xl p-5"
          >
            <div className="text-center mb-4">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">It was</div>
              <div className="text-2xl font-black text-white">{countryName(current.iso)}</div>
            </div>
            {current.km <= 0 && <FactBlast iso={current.iso} />}
            <div className="flex items-center justify-between bg-white/5 rounded-2xl px-5 py-3 mb-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Distance</div>
                <div className="font-extrabold text-white">{formatKm(current.km)}</div>
                {current.km > 0 && (
                  <div className="text-xs font-semibold text-slate-400 mt-0.5">
                    you pinned {current.pinned ?? 'the open sea 🌊'}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Points</div>
                <div className="font-black text-2xl text-amber-300">+{current.score.toLocaleString()}</div>
              </div>
            </div>
            <button className="btn-primary w-full py-3" onClick={next}>
              {i + 1 < plan.length ? 'Next round →' : 'See results 🏁'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── done ── */}
      <AnimatePresence>
        {stage === 'done' && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center px-6 bg-ocean"
          >
            <div className="glass rounded-3xl p-8 max-w-md w-full text-center">
              <div className="text-5xl mb-3">🏁</div>
              <h2 className="text-2xl font-extrabold text-white mb-1">Journey complete!</h2>
              <div className="text-5xl font-black text-amber-300 my-4">{total.toLocaleString()}</div>
              <div className="text-sm text-slate-400 mb-6">
                out of {(plan.length * SCORE_MAX).toLocaleString()}
                {best > 0 && <> · best: <span className="text-slate-200 font-bold">{best.toLocaleString()}</span></>}
              </div>
              <div className="space-y-2 mb-6 max-h-44 overflow-y-auto pr-1">
                {results.map((r, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white/5 rounded-xl px-4 py-2 text-sm">
                    <span className="font-semibold text-slate-300">{idx + 1}. {countryName(r.iso)}</span>
                    <span className="font-bold text-amber-300">+{r.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button className="btn-primary flex-1 py-3" onClick={() => setStage('intro')}>Play again</button>
                <button className="btn-secondary flex-1 py-3" onClick={() => setScreen('landing')}>Home</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
