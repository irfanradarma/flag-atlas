import { pointToPolygonDistance } from '@turf/point-to-polygon-distance';
import { point } from '@turf/helpers';
import { SCORE_DECAY_KM, SCORE_MAX } from './config';
import { getCountries } from './countries';

/** Distance in km from a guess to the nearest edge of the country polygon.
 *  0 when the guess is inside the country. */
export function distanceToCountry(lat: number, lng: number, iso: string): number {
  const data = getCountries();
  const feature = data?.byIso.get(iso);
  if (!feature) return Infinity;
  const d = pointToPolygonDistance(point([lng, lat]), feature, {
    units: 'kilometers',
  });
  return Math.max(0, d);
}

export function scoreFromDistance(km: number): number {
  if (!isFinite(km)) return 0;
  return Math.min(SCORE_MAX, Math.round(SCORE_MAX * Math.exp(-km / SCORE_DECAY_KM)));
}

export function formatKm(km: number): string {
  if (km <= 0) return 'Direct hit!';
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}
