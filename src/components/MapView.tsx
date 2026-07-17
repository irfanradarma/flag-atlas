import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import bbox from '@turf/bbox';
import type { CountryData } from '../lib/countries';
import { formatKm } from '../lib/scoring';

const OCEAN = '#0b1526';
const LAND = '#2e4160';
const LAND_LINE = '#0b1526';
const HIGHLIGHT = '#34d399';

export interface RevealPin {
  id: string;
  label: string;
  lat: number;
  lng: number;
  color: string;
  km: number | null;
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
}

function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export default function MapView({
  countries, interactive, myPin, onPlacePin, revealIso, revealPins, resetKey,
}: Props) {
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
    const map = new maplibregl.Map({
      container: containerRef.current,
      attributionControl: { compact: true, customAttribution: 'Natural Earth' },
      style: {
        version: 8,
        sources: {
          countries: { type: 'geojson', data: countries.fc as never, tolerance: 0 },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': OCEAN } },
          {
            id: 'land', type: 'fill', source: 'countries',
            paint: { 'fill-color': LAND, 'fill-opacity': 1 },
          },
          {
            id: 'borders', type: 'line', source: 'countries',
            paint: { 'line-color': LAND_LINE, 'line-width': 0.8 },
          },
          {
            id: 'hl-fill', type: 'fill', source: 'countries',
            filter: ['==', ['get', 'iso'], '__none__'],
            paint: { 'fill-color': HIGHLIGHT, 'fill-opacity': 0.45 },
          },
          {
            id: 'hl-line', type: 'line', source: 'countries',
            filter: ['==', ['get', 'iso'], '__none__'],
            paint: { 'line-color': HIGHLIGHT, 'line-width': 2 },
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

  // my pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (myPin) {
      if (!myMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'fa-pin';
        el.innerHTML = '<div class="fa-pin-dot"></div><div class="fa-pin-pulse"></div>';
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
  }, [myPin]);

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

        for (const pin of revealPins) {
          const el = document.createElement('div');
          el.className = 'fa-guess';
          const tag = document.createElement('div');
          tag.className = 'fa-guess-tag';
          tag.textContent = pin.km != null ? `${pin.label} · ${formatKm(pin.km)}` : pin.label;
          const dot = document.createElement('div');
          dot.className = 'fa-guess-dot';
          dot.style.background = pin.color;
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
