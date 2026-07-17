import { motion } from 'motion/react';
import { flagUrl } from '../lib/countries';

export default function FlagCard({ iso, roundLabel }: { iso: string; roundLabel: string }) {
  return (
    <motion.div
      key={iso}
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="glass rounded-2xl p-3 w-[172px] sm:w-[210px]"
    >
      <div className="text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-2 flex justify-between">
        <span>{roundLabel}</span>
        <span className="text-amber-300">Find it! 📍</span>
      </div>
      <img
        src={flagUrl(iso)}
        alt="Mystery flag"
        draggable={false}
        className="w-full rounded-lg shadow-lg shadow-black/50 border border-white/10 select-none"
      />
    </motion.div>
  );
}
