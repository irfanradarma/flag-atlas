import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import bbox from '@turf/bbox';
import type { FeatureCollection } from 'geojson';
import type { CountryData } from '../lib/countries';
import { nearestPointOnCountry } from '../lib/countries';
import { formatKm } from '../lib/scoring';
import { useStore } from '../lib/store';

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

const THEMES = {
  dark: { ocean: '#0b1526', land: '#2e4160', line: '#0b1526', hl: '#34d399' },
  light: { ocean: '#c9dbeb', land: '#f3ecda', line: '#93a5b8', hl: '#10b981' },
} as const;

export interface RevealPin {
  id: string;
  label: string;
  lat: number;
  lng: number;
  color: string;
  km: number | null;
  token?: string;
  /** name of the country the pin landed in (null = ocean) */
  pinned?: string | null;
}

interface Props {
  countries: CountryData;
  interactive: boolean;
  myPin: { lat: number; lng: number } | null;
  onPlacePin?: (lat: number, lng: number) => void;
  revealIso: string | null;
  revealPins: RevealPin[];
  /** bump to re-center the world view for a new round */
  resetKey: number;
  myToken?: string;
  myColor?: string;
}

function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export default function MapView({
  countries, interactive, myPin, onPlacePin, revealIso, revealPins, resetKey,
  myToken, myColor,
}: Props) {
  const theme = useStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const myMarkerRef = useRef<maplibregl.Marker | null>(null);
  const revealMarkersRef = useRef<maplibregl.Marker[]>([]);
  const interactiveRef = useRef(interactive);
  const onPlaceRef = useRef(onPlacePin);
  interactiveRef.current = interactive;
  onPlaceRef.current = onPlacePin;

  // init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const c = THEMES[useStore.getState().theme];
    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: { compact: true, customAttribution: 'Natural Earth' },
      style: {
        version: 8,
        sources: {
          countries: { type: 'geojson', data: countries.fc as never, tolerance: 0 },
          'miss-lines': { type: 'geojson', data: EMPTY_FC as never },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': c.ocean } },
          {
            id: 'land', type: 'fill', source: 'countries',
            paint: { 'fill-color': c.land, 'fill-opacity': 1 },
          },
          {
            id: 'borders', type: 'line', source: 'countries',
            paint: { 'line-color': c.line, 'line-width': 0.8 },
          },
          {
            id: 'hl-fill', type: 'fill', source: 'countries',
            filter: ['==', ['get', 'iso'], '__none__'],
            paint: { 'fill-color': c.hl, 'fill-opacity': 0.45 },
          },
          {
            id: 'hl-line', type: 'line', source: 'countries',
            filter: ['==', ['get', 'iso'], '__none__'],
            paint: { 'line-color': c.hl, 'line-width': 2 },
          },
          {
            id: 'miss-lines', type: 'line', source: 'miss-lines',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': 2.5,
              'line-dasharray': [1.2, 1.6],
              'line-opacity': 0.9,
            },
          },
        ],
      },
      center: [15, 22],
      zoom: 1.3,
      minZoom: 0.8,
      maxZoom: 9,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();

    map.on('click', (e) => {
      if (!interactiveRef.current || !onPlaceRef.current) return;
      onPlaceRef.current(e.lngLat.lat, normalizeLng(e.lngLat.lng));
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      myMarkerRef.current = null;
      revealMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme change → recolor base layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = THEMES[theme];
    const apply = () => {
      map.setPaintProperty('bg', 'background-color', c.ocean);
      map.setPaintProperty('land', 'fill-color', c.land);
      map.setPaintProperty('borders', 'line-color', c.line);
      map.setPaintProperty('hl-fill', 'fill-color', c.hl);
      map.setPaintProperty('hl-line', 'line-color', c.hl);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [theme]);

  // my pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (myPin) {
      if (!myMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'fa-pin';
        const color = myColor ?? '#fbbf24';
        el.innerHTML = `<div class="fa-pin-tok" style="background:${color}">${myToken ?? ''}</div><div class="fa-pin-pulse" style="border-color:${color}"></div>`;
        myMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([myPin.lng, myPin.lat])
          .addTo(map);
      } else {
        myMarkerRef.current.setLngLat([myPin.lng, myPin.lat]);
      }
    } else if (myMarkerRef.current) {
      myMarkerRef.current.remove();
      myMarkerRef.current = null;
    }
  }, [myPin, myToken, myColor]);

  // reveal: highlight country, drop everyone's pins, fit view
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of revealMarkersRef.current) m.remove();
    revealMarkersRef.current = [];

    const apply = () => {
      if (revealIso) {
        map.setFilter('hl-fill', ['==', ['get', 'iso'], revealIso]);
        map.setFilter('hl-line', ['==', ['get', 'iso'], revealIso]);

        // dashed line from each missed pin to the nearest border point
        const lineFeatures = revealPins
          .filter((p) => p.km != null && p.km > 0)
          .map((p) => {
            const target = nearestPointOnCountry(p.lat, p.lng, revealIso);
            if (!target) return null;
            return {
              type: 'Feature' as const,
              properties: { color: p.color },
              geometry: {
                type: 'LineString' as const,
                coordinates: [[p.lng, p.lat], target],
              },
            };
          })
          .filter((f): f is NonNullable<typeof f> => f !== null);
        (map.getSource('miss-lines') as maplibregl.GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: lineFeatures,
        });

        for (const pin of revealPins) {
          const el = document.createElement('div');
          el.className = 'fa-guess';
          const tag = document.createElement('div');
          tag.className = 'fa-guess-tag';
          if (pin.km == null) {
            tag.textContent = pin.label;
          } else if (pin.km <= 0) {
            tag.textContent = `${pin.label} · Direct hit! 🎯`;
          } else {
            const where = pin.pinned ? `📍 ${pin.pinned}` : '🌊 open sea';
            tag.textContent = `${pin.label} · ${formatKm(pin.km)} · ${where}`;
          }
          const dot = document.createElement('div');
          dot.className = pin.token ? 'fa-guess-tok' : 'fa-guess-dot';
          dot.style.background = pin.color;
          if (pin.token) dot.textContent = pin.token;
          el.append(dot, tag);
          revealMarkersRef.current.push(
            new maplibregl.Marker({ element: el, anchor: 'center' })
              .setLngLat([pin.lng, pin.lat])
              .addTo(map),
          );
        }

        const feature = countries.byIso.get(revealIso);
        if (feature) {
          const [minX, minY, maxX, maxY] = bbox(feature);
          let w = minX, s = minY, e = maxX, n = maxY;
          for (const pin of revealPins) {
            w = Math.min(w, pin.lng); e = Math.max(e, pin.lng);
            s = Math.min(s, pin.lat); n = Math.max(n, pin.lat);
          }
          map.fitBounds([[w, s], [e, n]], { padding: 90, maxZoom: 5.5, duration: 1200 });
        }
      } else {
        map.setFilter('hl-fill', ['==', ['get', 'iso'], '__none__']);
        map.setFilter('hl-line', ['==', ['get', 'iso'], '__none__']);
        (map.getSource('miss-lines') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY_FC as never);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [revealIso, revealPins, countries]);

  // new round → reset view
  useEffect(() => {
    const map = mapRef.current;
    if (!map || resetKey === 0) return;
    map.flyTo({ center: [15, 22], zoom: 1.3, duration: 900 });
  }, [resetKey]);

  // Inline style: maplibre-gl.css sets `.maplibregl-map { position: relative }`
  // which loads after Tailwind and would override an `absolute` utility class,
  // collapsing the container to height 0.
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
