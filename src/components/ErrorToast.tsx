import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../lib/store';

export default function ErrorToast() {
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error, setError]);

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] glass rounded-2xl px-5 py-3
            text-sm font-semibold text-rose-300 border-rose-400/30 max-w-[90vw]"
          onClick={() => setError(null)}
        >
          ⚠️ {error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
