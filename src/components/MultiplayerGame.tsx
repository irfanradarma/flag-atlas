import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../lib/store';
import { countryName, useCountries } from '../lib/countries';
import { formatKm } from '../lib/scoring';
import { leave, playAgain, playerColor, submitGuess } from '../lib/mp';
import { getColor, getToken, myId } from '../lib/profile';
import { sfx } from '../lib/sound';
import { useIdleGuard } from '../lib/useIdleGuard';
import type { RevealPin } from './MapView';
import MapView from './MapView';
import ExitButton from './ExitButton';
import FlagCard from './FlagCard';
import IdleModal from './IdleModal';
import Loader from './Loader';

function useCountdown(endsAt: number | null): number {
  const [left, setLeft] = useState(() => (endsAt ? Math.max(0, endsAt - Date.now()) : 0));
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 200);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
}

export default function MultiplayerGame() {
  const countries = useCountries();
  const { phase, round, players, guessedIds, myGuess, results, totals, isHost, settings } = useStore();
  const setScreen = useStore((s) => s.setScreen);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const locked = myGuess !== null;
  const msLeft = useCountdown(phase === 'round' && round ? round.endsAt : null);

  // A parked final-standings tab shouldn't hold a connection slot forever.
  const idle = useIdleGuard(phase === 'final', () => {
    void leave(true);
    useStore.setState({ error: 'Disconnected for inactivity — rejoin with the code.' });
  });

  // reset local pin each new round
  useEffect(() => {
    if (phase === 'round') {
      setPin(null);
      setResetKey((k) => k + 1);
      sfx.round();
    }
  }, [phase, round?.i]);

  // reveal / final jingles
  useEffect(() => {
    if (phase === 'reveal' && results) {
      sfx.reveal(results.find((r) => r.isMe)?.score ?? 0);
    }
    if (phase === 'final') sfx.fanfare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // countdown ticks in the last five seconds
  const secLeft = Math.ceil(msLeft / 1000);
  useEffect(() => {
    if (phase === 'round' && secLeft > 0 && secLeft <= 5) sfx.tick();
  }, [phase, secLeft]);

  const revealPins: RevealPin[] = useMemo(
    () =>
      (results ?? [])
        .filter((r): r is typeof r & { lat: number; lng: number } => r.lat != null && r.lng != null)
        .map((r) => ({
          id: r.id,
          label: r.isMe ? 'You' : r.name,
          lat: r.lat,
          lng: r.lng,
          color: r.color ?? playerColor(r.id),
          km: r.km,
          token: r.token,
        })),
    [results],
  );

  const standings = useMemo(() => {
    const infoOf = new Map(players.map((p) => [p.id, { name: p.name, token: p.token, color: p.color }]));
    for (const r of results ?? []) {
      if (!infoOf.has(r.id)) infoOf.set(r.id, { name: r.name, token: r.token, color: r.color });
    }
    return Object.entries(totals)
      .map(([id, score]) => ({
        id, score,
        ...(infoOf.get(id) ?? { name: 'Explorer', token: undefined, color: undefined }),
      }))
      .sort((a, b) => b.score - a.score);
  }, [totals, players, results]);

  if (!countries || !round) return <Loader label="Getting ready…" />;

  const secondsTotal = settings.seconds * 1000;
  const frac = Math.min(1, msLeft / secondsTotal);

  return (
    <div className="h-full relative">
      {phase !== 'final' && (
        <MapView
          countries={countries}
          interactive={phase === 'round' && !locked}
          myPin={phase === 'round' ? pin : null}
          onPlacePin={(lat, lng) => {
            setPin({ lat, lng });
            sfx.place();
          }}
          myToken={getToken()}
          myColor={getColor()}
          revealIso={phase === 'reveal' ? round.iso : null}
          revealPins={phase === 'reveal' ? revealPins : []}
          resetKey={resetKey}
        />
      )}

      {/* countdown bar */}
      {phase === 'round' && (
        <div className="absolute top-0 left-0 right-0 z-20 h-1.5 bg-white/10">
          <div
            className={`h-full transition-[width] duration-200 ${frac < 0.25 ? 'bg-rose-400' : 'bg-amber-400'}`}
            style={{ width: `${frac * 100}%` }}
          />
        </div>
      )}

      {(phase === 'round' || phase === 'reveal') && (
        <>
          <div className="absolute top-4 left-3 z-10">
            <FlagCard iso={round.iso} roundLabel={`Round ${round.i + 1}/${round.total}`} />
          </div>
          <div className="absolute top-4 right-3 z-10 flex flex-col items-end gap-2">
            {phase === 'round' && (
              <div className="glass rounded-2xl px-4 py-2 text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Time</div>
                <div className={`text-xl font-black ${frac < 0.25 ? 'text-rose-300' : 'text-white'}`}>
                  {Math.ceil(msLeft / 1000)}s
                </div>
              </div>
            )}
            <div className="glass rounded-2xl px-4 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Locked in</div>
              <div className="text-lg font-black text-sky-300">
                {guessedIds.length}/{players.length}
              </div>
            </div>
            <ExitButton
              onExit={() => {
                void leave(false);
                setScreen('landing');
              }}
            />
          </div>
        </>
      )}

      {/* confirm bar */}
      <AnimatePresence>
        {phase === 'round' && (
          <motion.div
            key="mp-confirm"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[min(92vw,380px)]"
          >
            {locked ? (
              <div className="glass rounded-2xl px-5 py-3 text-center text-sm font-bold text-good">
                ✅ Locked in! Waiting for the others…
              </div>
            ) : pin ? (
              <button
                className="btn-primary w-full py-4 text-lg"
                onClick={() => {
                  submitGuess(pin.lat, pin.lng);
                  sfx.lock();
                }}
              >
                Lock it in 🎯
              </button>
            ) : (
              <div className="glass rounded-2xl px-5 py-3 text-center text-sm font-semibold text-slate-300">
                Tap the map where you think this country is
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* reveal panel */}
      <AnimatePresence>
        {phase === 'reveal' && results && (
          <motion.div
            key="mp-reveal"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(94vw,440px)] glass rounded-3xl p-5"
          >
            <div className="text-center mb-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">It was </span>
              <span className="text-lg font-black text-white">{countryName(round.iso)}</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {results.map((r, idx) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-2 ${
                    r.isMe ? 'bg-amber-400/10 border border-amber-400/25' : 'bg-white/5'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs border border-black/20"
                    style={{ background: r.color ?? playerColor(r.id) }}
                  >
                    {r.token ?? ''}
                  </span>
                  <span className="font-bold text-white text-sm flex-1 truncate">
                    {r.isMe ? 'You' : r.name}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">
                    {r.km != null ? formatKm(r.km) : 'no guess'}
                  </span>
                  <span className="font-black text-amber-300 text-sm w-14 text-right">
                    +{r.score.toLocaleString()}
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="text-center text-[11px] text-slate-500 font-semibold mt-3">
              next round starting soon…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* final leaderboard */}
      <AnimatePresence>
        {phase === 'final' && (
          <motion.div
            key="mp-final"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-20 bg-ocean flex items-center justify-center px-6"
          >
            <div className="glass rounded-3xl p-8 max-w-md w-full text-center">
              <div className="text-5xl mb-2">🏆</div>
              <h2 className="text-2xl font-extrabold text-white mb-6">Final standings</h2>
              <div className="space-y-2 mb-7 max-h-64 overflow-y-auto pr-1">
                {standings.map((p, idx) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.12 }}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                      idx === 0
                        ? 'bg-amber-400/15 border border-amber-400/40'
                        : p.id === myId()
                          ? 'bg-white/10 border border-white/15'
                          : 'bg-white/5'
                    }`}
                  >
                    <span className="text-xl w-8">{['🥇', '🥈', '🥉'][idx] ?? `${idx + 1}.`}</span>
                    <span
                      className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm border border-black/20"
                      style={{ background: p.color ?? playerColor(p.id) }}
                    >
                      {p.token ?? ''}
                    </span>
                    <span className="font-bold text-white flex-1 text-left truncate">
                      {p.name}
                      {p.id === myId() && <span className="text-slate-500 font-semibold"> (you)</span>}
                    </span>
                    <span className="font-black text-amber-300">{p.score.toLocaleString()}</span>
                  </motion.div>
                ))}
              </div>
              <div className="flex gap-3">
                {isHost ? (
                  <button className="btn-primary flex-1 py-3" onClick={playAgain}>
                    Play again 🔁
                  </button>
                ) : (
                  <div className="flex-1 py-3 text-sm text-slate-400 font-semibold self-center">
                    Host can restart the lobby
                  </div>
                )}
                <button className="btn-secondary flex-1 py-3" onClick={() => void leave(true)}>
                  Leave
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <IdleModal open={idle.warning} secondsLeft={idle.secondsLeft} onStay={idle.stay} />
    </div>
  );
}
