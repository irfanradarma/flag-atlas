import { motion } from 'motion/react';
import { useStore } from '../lib/store';
import { HUB_URL } from '../lib/config';

export default function Landing() {
  const setScreen = useStore((s) => s.setScreen);

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* soft background glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-sky-500/15 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-amber-400/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="text-center mb-12 relative"
      >
        <motion.div
          animate={{ rotate: [0, 6, -6, 0] }}
          transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
          className="text-7xl sm:text-8xl mb-4"
        >
          🌍
        </motion.div>
        <h1 className="text-5xl sm:text-7xl font-black tracking-tight text-white">
          Flag<span className="text-amber-400">Atlas</span>
        </h1>
        <p className="mt-3 text-slate-400 font-medium text-base sm:text-lg">
          See the flag. Pin the country. Closest wins.
        </p>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-2xl">
        <motion.button
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ y: -4 }}
          onClick={() => setScreen('single')}
          className="glass flex-1 rounded-3xl p-6 text-left hover:border-amber-400/50 transition group cursor-pointer"
        >
          <div className="text-4xl mb-3">🧭</div>
          <div className="text-xl font-extrabold text-white group-hover:text-amber-300 transition">
            Solo Journey
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Practice at your own pace. No timer, no pressure.
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ y: -4 }}
          onClick={() => setScreen('mp-menu')}
          className="glass flex-1 rounded-3xl p-6 text-left hover:border-sky-400/50 transition group cursor-pointer"
        >
          <div className="text-4xl mb-3">⚔️</div>
          <div className="text-xl font-extrabold text-white group-hover:text-sky-300 transition">
            Play with Friends
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Create a lobby, share the code, race the clock together.
          </div>
        </motion.button>
      </div>

      <motion.a
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        href={HUB_URL}
        className="mt-12 text-sm text-slate-500 hover:text-slate-300 transition font-semibold"
      >
        🪐 Back to Game Zone
      </motion.a>
    </div>
  );
}
