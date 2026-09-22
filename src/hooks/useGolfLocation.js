import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const CITY_KEY = 'golfolio_home_city';
const STATE_KEY = 'golfolio_home_state';
const COORDS_KEY = 'golfolio_home_coords';

// ============================================================
// useGolfLocation — player location management.
//
// Supports:
//   - GPS (reverse-geocoded to confirmed city/state)
//   - City/ZIP search (forward-geocoded to city/state + coords)
//   - Ambiguous city selection (player chooses)
//
// The Explore header shows the confirmed city and state — not
// "Current location," "Near you," a raw ZIP, or an unverified guess.
//
// Radius: 15 default, 30 max. The expanded 30-mile radius is
// temporary for one session and resets on location change or reload.
// ============================================================

export function useGolfLocation() {
  const [city, setCity] = useState(() => {
    try { return localStorage.getItem(CITY_KEY) || null; } catch { return null; }
  });
  const [state, setState] = useState(() => {
    try { return localStorage.getItem(STATE_KEY) || null; } catch { return null; }
  });
  const [coords, setCoords] = useState(() => {
    try { const raw = localStorage.getItem(COORDS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [radius, setRadius] = useState(15);
  const [radiusExpanded, setRadiusExpanded] = useState(false);

  // Deep-link support: if a `near` URL param is present (e.g. from a
  // coverage notification tap), parse "City,State" and resolve coords
  // so the Explore feed loads the correct policy-gated area.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const near = urlParams.get('near');
    if (near) {
      const parts = near.split(',');
      if (parts.length >= 2) {
        const c = parts[0].trim();
        const s = parts[1].trim();
        setCity(c);
        setState(s);
        try { localStorage.setItem(CITY_KEY, c); localStorage.setItem(STATE_KEY, s); } catch {}
        base44.functions.invoke('resolveLocation', { query: near })
          .then((res) => {
            const data = res?.data || res;
            if (data?.results?.length > 0) {
              const r = data.results[0];
              if (r.lat && r.lng) {
                const cc = { lat: r.lat, lng: r.lng };
                setCoords(cc);
                try { localStorage.setItem(COORDS_KEY, JSON.stringify(cc)); } catch {}
              }
            }
          })
          .catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull saved home_city from user profile only if nothing is stored locally.
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

  // GPS: request location only after player taps, reverse-geocode
  // to confirmed city/state, show resolved name.
  const useGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setCity(null);
        setState(null);
        try { localStorage.setItem(COORDS_KEY, JSON.stringify(c)); localStorage.removeItem(CITY_KEY); localStorage.removeItem(STATE_KEY); } catch {}
        try { await base44.auth.updateMe({ home_city: null }); } catch {}

        // Reverse-geocode to get confirmed city/state
        try {
          const res = await base44.functions.invoke('resolveLocation', c);
          const data = res?.data || res;
          if (data?.results?.length > 0) {
            const r = data.results[0];
            setCity(r.city);
            setState(r.state);
            try { localStorage.setItem(CITY_KEY, r.city); localStorage.setItem(STATE_KEY, r.state); } catch {}
            try { await base44.auth.updateMe({ home_city: r.city, home_state: r.state }); } catch {}
          }
        } catch {}

        setLocationError(null);
        setLocating(false);
        setSheetOpen(false);
        setRadius(15);
        setRadiusExpanded(false);
      },
      () => {
        setLocating(false);
        setLocationError("Couldn't get your location. Enter a city or ZIP code to continue.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // City/ZIP search: resolve to confirmed city/state + coordinates.
  // Returns results for ambiguous city selection.
  const searchLocation = useCallback(async (query) => {
    const q = (query || '').trim();
    if (!q) return { results: [], error: 'Enter a city or ZIP code' };
    try {
      const res = await base44.functions.invoke('resolveLocation', { query: q });
      const data = res?.data || res;
      if (data?.results?.length > 0) {
        return { results: data.results, error: null };
      }
      return { results: [], error: 'No matches found. Try a different city or ZIP.' };
    } catch {
      return { results: [], error: 'Could not search location. Try again.' };
    }
  }, []);

  // Confirm a selected location (from search results or GPS).
  const confirmLocation = useCallback(async (selected) => {
    if (!selected || !selected.city || !selected.state) return;
    setCity(selected.city);
    setState(selected.state);
    setCoords(selected.lat && selected.lng ? { lat: selected.lat, lng: selected.lng } : null);
    try {
      localStorage.setItem(CITY_KEY, selected.city);
      localStorage.setItem(STATE_KEY, selected.state);
      if (selected.lat && selected.lng) {
        localStorage.setItem(COORDS_KEY, JSON.stringify({ lat: selected.lat, lng: selected.lng }));
      } else {
        localStorage.removeItem(COORDS_KEY);
      }
    } catch {}
    try { await base44.auth.updateMe({ home_city: selected.city, home_state: selected.state }); } catch {}
    setLocationError(null);
    setSheetOpen(false);
    setRadius(15);
    setRadiusExpanded(false);
  }, []);

  const clearLocation = useCallback(() => {
    setCity(null);
    setState(null);
    setCoords(null);
    try { localStorage.removeItem(CITY_KEY); localStorage.removeItem(STATE_KEY); localStorage.removeItem(COORDS_KEY); } catch {}
    setRadius(15);
    setRadiusExpanded(false);
  }, []);

  // One-time 30-mile expansion — temporary for this session only.
  const expandRadius = useCallback(() => {
    if (!radiusExpanded) {
      setRadius(30);
      setRadiusExpanded(true);
    }
  }, [radiusExpanded]);

  const resetRadius = useCallback(() => {
    setRadius(15);
    setRadiusExpanded(false);
  }, []);

  // Display the confirmed city and state — not "Current location" or a raw ZIP.
  const label = city && state ? `${city}, ${state}` : (city || null);
  const subtitle = radiusExpanded ? 'Within 30 miles' : 'Within 15 miles';

  return {
    city, state, coords, locating, locationError, sheetOpen, setSheetOpen,
    useGps, searchLocation, confirmLocation, clearLocation, hasLocation,
    label, subtitle, radius, radiusExpanded, expandRadius, resetRadius,
  };
}