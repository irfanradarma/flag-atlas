import { useState } from 'react';
import { useStore } from '../lib/store';
import { isMuted, setMuted } from '../lib/sound';

/** Always-available corner controls: sound on/off, dark/light theme. */
export default function SettingsFab() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [muted, setM] = useState(isMuted);

  const toggleMute = () => {
    setMuted(!muted);
    setM(!muted);
  };

  return (
    <div className="fixed bottom-3 left-3 z-40 flex gap-2">
      <button
        onClick={toggleMute}
        title={muted ? 'Unmute sounds' : 'Mute sounds'}
        className="glass w-10 h-10 rounded-full flex items-center justify-center text-base
          hover:scale-110 transition cursor-pointer"
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="glass w-10 h-10 rounded-full flex items-center justify-center text-base
          hover:scale-110 transition cursor-pointer"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
