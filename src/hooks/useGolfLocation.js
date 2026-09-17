import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const CITY_KEY = 'golfolio_home_city';
const COORDS_KEY = 'golfolio_home_coords';

export function useGolfLocation() {
  const [city, setCity] = useState(() => {
    try { return localStorage.getItem(CITY_KEY) || null; } catch { return null; }
  });
  const [coords, setCoords] = useState(() => {
    try { const raw = localStorage.getItem(COORDS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [locating, setLocating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Pull a saved home_city from the user profile only if nothing is stored locally.
  // Never defaults to a fixed city — the player must choose.
  useEffect(() => {
    if (city || coords) return;
    base44.auth.me().then((u) => {
      if (u && u.home_city) {
        setCity(u.home_city);
        try { localStorage.setItem(CITY_KEY, u.home_city); } catch {}
      }
    }).catch(() => {});
  }, []);

  const hasLocation = !!(coords || city);

  const useGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setCity(null);
        try { localStorage.setItem(COORDS_KEY, JSON.stringify(c)); localStorage.removeItem(CITY_KEY); } catch {}
        try { base44.auth.updateMe({ home_city: null }); } catch {}
        setLocating(false);
        setSheetOpen(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const saveCity = useCallback(async (newCity) => {
    const c = (newCity || '').trim();
    if (!c) return;
    setCity(c);
    setCoords(null);
    try { localStorage.setItem(CITY_KEY, c); localStorage.removeItem(COORDS_KEY); } catch {}
    try { await base44.auth.updateMe({ home_city: c }); } catch {}
    setSheetOpen(false);
  }, []);

  const clearLocation = useCallback(() => {
    setCity(null);
    setCoords(null);
    try { localStorage.removeItem(CITY_KEY); localStorage.removeItem(COORDS_KEY); } catch {}
  }, []);

  const label = coords ? 'Current location' : (city || null);
  const subtitle = coords ? 'Near you' : (city ? 'Within 15 miles' : null);

  return { city, coords, locating, sheetOpen, setSheetOpen, useGps, saveCity, clearLocation, hasLocation, label, subtitle };
}