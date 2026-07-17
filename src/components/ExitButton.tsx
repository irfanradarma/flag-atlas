import { useEffect, useRef, useState } from 'react';

/** Two-tap exit: first tap arms it for 3s so a stray tap can't dump a player
 *  out of a running game. */
export default function ExitButton({ onExit }: { onExit: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const click = () => {
    if (armed) {
      onExit();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 3000);
  };

  return (
    <button
      onClick={click}
      className={`glass rounded-2xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
        armed
          ? 'text-rose-300 !border-rose-400/40'
          : 'text-slate-300 hover:text-white'
      }`}
    >
      {armed ? 'Tap again to exit!' : '🏠 Exit'}
    </button>
  );
}
