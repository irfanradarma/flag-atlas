import { useEffect, useState } from 'react';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type CountryFeature = Feature<
  Polygon | MultiPolygon,
  { iso: string; name: string; pool: number }
>;

export interface CountryData {
  fc: FeatureCollection;
  byIso: Map<string, CountryFeature>;
  pool: { iso: string; name: string }[];
}

let cache: CountryData | null = null;
let promise: Promise<CountryData> | null = null;

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
  return cache?.byIso.get(iso)?.properties.name ?? iso.toUpperCase();
}

export function flagUrl(iso: string, width: 320 | 640 = 640): string {
  return `https://flagcdn.com/w${width}/${iso}.png`;
}

export function preloadFlag(iso: string): void {
  const img = new Image();
  img.src = flagUrl(iso);
}
