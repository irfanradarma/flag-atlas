import { colorFor } from './names';

export const TOKENS = ['🎩', '🚗', '🐕', '🚢', '👢', '🐈', '🦖', '✈️', '⭐', '🤖', '🦊', '🎸'];

export const COLOR_PRESETS = [
  '#fbbf24', '#38bdf8', '#f472b6', '#a78bfa',
  '#34d399', '#fb923c', '#f87171', '#4ade80',
];

export function myId(): string {
  let id = sessionStorage.getItem('fa-player-id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('fa-player-id', id);
  }
  return id;
}

export function getToken(): string {
  const t = localStorage.getItem('fa-token');
  return t && TOKENS.includes(t) ? t : TOKENS[0];
}

export function setToken(t: string): void {
  localStorage.setItem('fa-token', t);
}

export function getColor(): string {
  return localStorage.getItem('fa-color') ?? colorFor(myId());
}

export function setColor(c: string): void {
  localStorage.setItem('fa-color', c);
}
