import { useEffect, useState } from 'react';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import bbox from '@turf/bbox';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { nearestPointOnLine } from '@turf/nearest-point-on-line';
import { polygonToLine } from '@turf/polygon-to-line';
import { point } from '@turf/helpers';

export type CountryFeature = Feature<
  Polygon | MultiPolygon,
  { iso: string; name: string; pool: number }
>;

export interface CountryData {
  fc: FeatureCollection;
  byIso: Map<string, CountryFeature>;
  pool: { iso: string; name: string }[];
}

export interface CountryFacts {
  name: string;
  capital: string | null;
  region: string | null;
  languages: string[];
  area: number | null;
  pop: number | null;
  landmark: string | null;
}

let cache: CountryData | null = null;
let promise: Promise<CountryData> | null = null;
let factsCache: Record<string, CountryFacts> | null = null;
let factsPromise: Promise<Record<string, CountryFacts>> | null = null;

export function loadFacts(): Promise<Record<string, CountryFacts>> {
  if (!factsPromise) {
    factsPromise = fetch(`${import.meta.env.BASE_URL}data/facts.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`facts data HTTP ${r.status}`);
        return r.json();
      })
      .then((f: Record<string, CountryFacts>) => {
        factsCache = f;
        return f;
      });
  }
  return factsPromise;
}

export function useFacts(iso: string): CountryFacts | null {
  const [facts, setFacts] = useState(factsCache);
  useEffect(() => {
    if (!facts) loadFacts().then(setFacts);
  }, [facts]);
  return facts?.[iso] ?? null;
}

export function loadCountries(): Promise<CountryData> {
  if (!promise) {
    promise = fetch(`${import.meta.env.BASE_URL}data/countries.geo.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`countries data HTTP ${r.status}`);
        return r.json();
      })
      .then((fc: FeatureCollection) => {
        const byIso = new Map<string, CountryFeature>();
        const pool: { iso: string; name: string }[] = [];
        for (const f of fc.features as CountryFeature[]) {
          const { iso, name, pool: inPool } = f.properties;
          if (iso) byIso.set(iso, f);
          if (inPool === 1) pool.push({ iso, name });
        }
        cache = { fc, byIso, pool };
        return cache;
      });
  }
  return promise;
}

export function getCountries(): CountryData | null {
  return cache;
}

export function useCountries(): CountryData | null {
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (!data) loadCountries().then(setData);
  }, [data]);
  return data;
}

export function pickRoundCountries(n: number): string[] {
  if (!cache) throw new Error('countries not loaded');
  const isos = cache.pool.map((c) => c.iso);
  for (let i = isos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [isos[i], isos[j]] = [isos[j], isos[i]];
  }
  return isos.slice(0, Math.min(n, isos.length));
}

export function countryName(iso: string): string {
  return (
    factsCache?.[iso]?.name ??
    cache?.byIso.get(iso)?.properties.name ??
    iso.toUpperCase()
  );
}

export function flagUrl(iso: string, width: 320 | 640 = 640): string {
  return `https://flagcdn.com/w${width}/${iso}.png`;
}

export function preloadFlag(iso: string): void {
  const img = new Image();
  img.src = flagUrl(iso);
}

// ── reverse lookup: which country contains a point? ──────────────────────────
let bboxes: Map<CountryFeature, [number, number, number, number]> | null = null;

export function countryAt(lat: number, lng: number): { iso: string; name: string } | null {
  if (!cache) return null;
  if (!bboxes) {
    bboxes = new Map();
    for (const f of cache.fc.features as CountryFeature[]) {
      bboxes.set(f, bbox(f) as [number, number, number, number]);
    }
  }
  const p = point([lng, lat]);
  for (const [f, [w, s, e, n]] of bboxes) {
    if (lng < w || lng > e || lat < s || lat > n) continue;
    if (booleanPointInPolygon(p, f)) {
      return { iso: f.properties.iso, name: f.properties.name || f.properties.iso.toUpperCase() };
    }
  }
  return null;
}

/** Closest point on a country's border to the given location (for miss lines). */
export function nearestPointOnCountry(lat: number, lng: number, iso: string): [number, number] | null {
  const feature = cache?.byIso.get(iso);
  if (!feature) return null;
  const lines = polygonToLine(feature);
  const features = 'features' in lines ? lines.features : [lines];
  let best: [number, number] | null = null;
  let bestDist = Infinity;
  for (const line of features) {
    const np = nearestPointOnLine(line, point([lng, lat]), { units: 'kilometers' });
    const d = np.properties.dist ?? Infinity;
    if (d < bestDist) {
      bestDist = d;
      best = [np.geometry.coordinates[0], np.geometry.coordinates[1]];
    }
  }
  return best;
}
