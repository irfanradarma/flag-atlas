# 🌍 Flag Atlas

See the flag. Pin the country on the world map. Closest wins.

A GeoGuessr-style game for the [seruseruan.xyz](https://seruseruan.xyz) game hub.
Solo mode, or multiplayer lobbies with a 5-letter join code.

## How scoring works

Distance is measured from your pin to the **nearest edge of the country's polygon**
(Turf.js `pointToPolygonDistance`). Landing anywhere inside the country = 0 km = a
perfect 5,000 points. Otherwise `score = 5000 · e^(−km/2000)`.

## Stack

- React 19 + TypeScript + Vite, Tailwind CSS v4, Motion
- MapLibre GL JS rendering Natural Earth 50m country polygons directly (no tile provider)
- Flags from [flagcdn.com](https://flagcdn.com)
- Multiplayer: Supabase Realtime (Broadcast + Presence) — no server code, no database
- Deployed to GitHub Pages via Actions

## Develop

```bash
npm install
npm run dev
```

Multiplayer needs a free Supabase project. Set env vars (or repo Variables in CI):

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Without them the game runs single-player only.

## Country data

`public/data/countries.geo.json` is Natural Earth 50m admin-0, processed with mapshaper
(`-simplify 12% keep-shapes`, properties reduced to `iso`/`name`/`pool`). Public domain.
