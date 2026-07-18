import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from './lib/store';
import { loadCountries, loadFacts } from './lib/countries';
import Landing from './components/Landing';
import SinglePlayer from './components/SinglePlayer';
import MultiplayerMenu from './components/MultiplayerMenu';
import WaitingRoom from './components/WaitingRoom';
import MultiplayerGame from './components/MultiplayerGame';
import ErrorToast from './components/ErrorToast';
import SettingsFab from './components/SettingsFab';

const SCREENS = {
  landing: Landing,
  single: SinglePlayer,
  'mp-menu': MultiplayerMenu,
  'mp-wait': WaitingRoom,
  'mp-game': MultiplayerGame,
} as const;

export default function App() {
  const screen = useStore((s) => s.screen);
  const setScreen = useStore((s) => s.setScreen);
  const Screen = SCREENS[screen];

  useEffect(() => {
    document.documentElement.dataset.theme = useStore.getState().theme;
    void loadCountries();
    void loadFacts();
    // deep link: ?join=CODE goes straight to the multiplayer menu
    const code = new URLSearchParams(location.search).get('join');
    if (code) setScreen('mp-menu');
  }, [setScreen]);

  return (
    <div className="h-full w-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          className="h-full w-full"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
      <ErrorToast />
      <SettingsFab />
    </div>
  );
}
