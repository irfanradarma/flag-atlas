import { useEffect, useRef, useState } from 'react';
import { IDLE_KICK_COUNTDOWN_S, IDLE_WARN_AFTER_MS, LOBBY_MAX_AGE_MS } from './config';

/**
 * Watches user activity while `enabled`. After IDLE_WARN_AFTER_MS without
 * pointer/key/touch activity (or with the tab hidden), raises a warning with a
 * countdown; if the user doesn't respond, calls `onKick`. Also enforces an
 * absolute cap (`maxAgeMs`, default 10 min) on how long the guarded screen can
 * exist — protects the free-tier connection budget from parked lobbies.
 */
export function useIdleGuard(enabled: boolean, onKick: () => void, maxAgeMs = LOBBY_MAX_AGE_MS) {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(IDLE_KICK_COUNTDOWN_S);
  const lastActivity = useRef(Date.now());
  const mountedAt = useRef(Date.now());
  const kickRef = useRef(onKick);
  kickRef.current = onKick;

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    mountedAt.current = Date.now();
    setWarning(false);

    const bump = () => {
      lastActivity.current = Date.now();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        // A hidden tab counts as idle from this moment.
        lastActivity.current = Math.min(lastActivity.current, Date.now() - IDLE_WARN_AFTER_MS + 30_000);
      } else {
        bump();
      }
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('touchstart', bump);
    document.addEventListener('visibilitychange', onVis);

    let warned = false;
    let countdown = IDLE_KICK_COUNTDOWN_S;
    const tick = setInterval(() => {
      const now = Date.now();
      if (now - mountedAt.current > maxAgeMs) {
        kickRef.current();
        return;
      }
      if (!warned && now - lastActivity.current > IDLE_WARN_AFTER_MS) {
        warned = true;
        countdown = IDLE_KICK_COUNTDOWN_S;
        setSecondsLeft(countdown);
        setWarning(true);
      } else if (warned) {
        if (now - lastActivity.current <= IDLE_WARN_AFTER_MS) {
          // user came back via the Stay button (which bumps activity)
          warned = false;
          setWarning(false);
        } else {
          countdown -= 1;
          setSecondsLeft(countdown);
          if (countdown <= 0) kickRef.current();
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('touchstart', bump);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(tick);
    };
  }, [enabled, maxAgeMs]);

  const stay = () => {
    lastActivity.current = Date.now();
    setWarning(false);
  };

  return { warning, secondsLeft, stay };
}
