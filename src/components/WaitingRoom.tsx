import { useState } from 'react';
import { motion } from 'motion/react';
import { useStore } from '../lib/store';
import { leave, myId, playerColor, startGame } from '../lib/mp';
import { useIdleGuard } from '../lib/useIdleGuard';
import IdleModal from './IdleModal';

const ROUND_CHOICES = [3, 5, 10];
const TIME_CHOICES = [30, 45, 60];

export default function WaitingRoom() {
  const { code, isHost, players, settings } = useStore();
  const [rounds, setRounds] = useState(settings.rounds);
  const [seconds, setSeconds] = useState(settings.seconds);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const { warning, secondsLeft, stay } = useIdleGuard(true, () => {
    void leave(true);
    useStore.setState({ error: 'Disconnected for inactivity — rejoin with the code.' });
  });

  const shareUrl = `${location.origin}${location.pathname}?join=${code}`;

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      ok = true;
    } catch { /* blocked (e.g. iframe without permission) — try fallback */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { ok = false; }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      // Never fail silently — show the link so it can be copied by hand.
      setShowLink(true);
    }
  };

  return (
    <div className="h-full flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-8 max-w-md w-full"
      >
        <div className="text-center mb-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Lobby code — share it!
          </div>
          <button
            onClick={copy}
            className="text-5xl font-black tracking-[0.25em] text-amber-300 hover:text-amber-200 transition cursor-pointer"
            title="Copy invite link"
          >
            {code}
          </button>
          <div className="text-xs text-slate-500 mt-2 font-semibold">
            {copied ? '✅ Invite link copied!' : 'tap the code to copy an invite link'}
          </div>
          {showLink && (
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              className="input mt-2 text-xs text-center"
            />
          )}
        </div>

        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            Explorers ({players.length})
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {players.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: playerColor(p.id) }} />
                <span className="font-bold text-white flex-1 truncate">
                  {p.name}
                  {p.id === myId() && <span className="text-slate-500 font-semibold"> (you)</span>}
                </span>
                {p.host && <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-400/10 rounded-full px-2 py-0.5">Host</span>}
              </motion.div>
            ))}
          </div>
        </div>

        {isHost ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Rounds</div>
                <div className="flex gap-1.5">
                  {ROUND_CHOICES.map((n) => (
                    <button
                      key={n}
                      onClick={() => setRounds(n)}
                      className={`flex-1 rounded-lg py-1.5 text-sm font-bold transition cursor-pointer ${
                        rounds === n ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Seconds</div>
                <div className="flex gap-1.5">
                  {TIME_CHOICES.map((n) => (
                    <button
                      key={n}
                      onClick={() => setSeconds(n)}
                      className={`flex-1 rounded-lg py-1.5 text-sm font-bold transition cursor-pointer ${
                        seconds === n ? 'bg-amber-400 text-slate-900' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button className="btn-primary w-full py-4 text-lg" onClick={() => startGame({ rounds, seconds })}>
              🚀 Start game
            </button>
          </>
        ) : (
          <div className="text-center text-slate-400 font-semibold py-3 bg-white/5 rounded-2xl mb-1">
            Waiting for the host to start…
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="inline-block ml-1"
            >
              ⏳
            </motion.span>
          </div>
        )}

        <button className="btn-ghost w-full py-2 mt-4 text-sm" onClick={() => void leave(true)}>
          ← Leave lobby
        </button>
      </motion.div>

      <IdleModal open={warning} secondsLeft={secondsLeft} onStay={stay} />
    </div>
  );
}
