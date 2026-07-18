import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useFacts } from '../lib/countries';
import { fmtArea, fmtPop } from '../lib/format';

/** Direct-hit celebration: a couple of random facts about the country. */
export default function FactBlast({ iso }: { iso: string }) {
  const facts = useFacts(iso);

  const lines = useMemo(() => {
    if (!facts) return [];
    const all: string[] = [];
    if (facts.capital) all.push(`🏛️ The capital of ${facts.name} is ${facts.capital}.`);
    if (facts.pop != null) all.push(`👥 About ${fmtPop(facts.pop)} people live in ${facts.name}.`);
    if (facts.area != null) all.push(`📐 ${facts.name} covers ${fmtArea(facts.area)}.`);
    if (facts.languages.length) all.push(`🗣️ People there speak ${facts.languages.join(' and ')}.`);
    if (facts.landmark) all.push(`🗿 Don't miss the ${facts.landmark}!`);
    if (facts.region) all.push(`🌏 It's part of ${facts.region}.`);
    // pick two random distinct facts
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, 2);
  }, [facts]);

  if (!lines.length) return null;

  return (
    <div className="mb-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        className="text-center text-xl font-black text-good mb-3"
      >
        🎯 DIRECT HIT!
      </motion.div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <motion.div
            key={l}
            initial={{ opacity: 0, x: i % 2 ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 + i * 0.45 }}
            className="bg-emerald-400/10 border border-emerald-400/25 rounded-xl px-4 py-2.5
              text-sm font-semibold text-slate-200 leading-snug"
          >
            {l}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
