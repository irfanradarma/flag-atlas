import { motion } from 'motion/react';

export default function Loader({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
        className="text-5xl"
      >
        🌍
      </motion.div>
      <div className="text-slate-400 font-semibold">{label}</div>
    </div>
  );
}
