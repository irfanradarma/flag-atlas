import { AnimatePresence, motion } from 'motion/react';

interface Props {
  open: boolean;
  secondsLeft: number;
  onStay: () => void;
}

export default function IdleModal({ open, secondsLeft, onStay }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="glass rounded-3xl p-8 max-w-sm w-full text-center"
          >
            <div className="text-5xl mb-3">😴</div>
            <h3 className="text-xl font-extrabold text-white mb-2">Still there?</h3>
            <p className="text-sm text-slate-400 mb-5">
              You'll be disconnected in{' '}
              <span className="text-rose-300 font-black text-lg">{secondsLeft}s</span> to free up
              the room for active players.
            </p>
            <button className="btn-primary w-full py-3" onClick={onStay}>
              I'm here! 👋
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
