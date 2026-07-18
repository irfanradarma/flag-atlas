export function fmtPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} thousand`;
  return String(n);
}

export function fmtArea(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M km²`;
  return `${Math.round(n).toLocaleString()} km²`;
}
