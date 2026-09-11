import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const DEFAULT_CITY = 'Sherman, TX';
const CITY_KEY = 'golfolio_home_city';

export function useGolfLocation() {
  const [city, setCity] = useState(() => {
    try { return localStorage.getItem(CITY_KEY) || DEFAULT_CITY; } catch { return DEFAULT_CITY; }
  });
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => {
      if (u && u.home_city) {
        setCity(u.home_city);
        try { localStorage.setItem(CITY_KEY, u.home_city); } catch {}
      }
    }).catch(() => {});
  }, []);

  const useGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setSheetOpen(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const saveCity = useCallback(async (newCity) => {
    const c = newCity || DEFAULT_CITY;
    setCity(c);
    setCoords(null);
    try { localStorage.setItem(CITY_KEY, c); } catch {}
    try { await base44.auth.updateMe({ home_city: c }); } catch {}
    setSheetOpen(false);
  }, []);

  const label = coords ? 'Current location' : city;
  const subtitle = coords ? 'Near you' : 'Within 30 miles';

  return { city, coords, locating, sheetOpen, setSheetOpen, useGps, saveCity, label, subtitle };
}