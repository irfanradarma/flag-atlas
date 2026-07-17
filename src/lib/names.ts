const ADJECTIVES = [
  'Brave', 'Swift', 'Clever', 'Mighty', 'Lucky', 'Cosmic', 'Golden', 'Silent',
  'Wandering', 'Daring', 'Curious', 'Bold', 'Sunny', 'Arctic', 'Crimson', 'Jolly',
];

const EXPLORERS = [
  'Fox', 'Owl', 'Panda', 'Falcon', 'Otter', 'Tiger', 'Dolphin', 'Koala',
  'Lynx', 'Puffin', 'Gecko', 'Marmot', 'Heron', 'Ibex', 'Quokka', 'Toucan',
];

export function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = EXPLORERS[Math.floor(Math.random() * EXPLORERS.length)];
  return `${a} ${b}`;
}

const PALETTE = [
  '#fbbf24', '#38bdf8', '#f472b6', '#a78bfa',
  '#34d399', '#fb923c', '#e879f9', '#4ade80',
  '#f87171', '#22d3ee', '#facc15', '#818cf8',
];

/** Stable color per player id (hash → palette). */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
