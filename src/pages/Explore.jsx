import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import NightHero from '@/components/golf/NightHero';
import VenueCard from '@/components/golf/VenueCard';
import TournamentCard from '@/components/golf/TournamentCard';
import TournamentEmptyState from '@/components/golf/TournamentEmptyState';
import VenueDeckSkeleton from '@/components/golf/VenueDeckSkeleton';
import LiveTicker from '@/components/golf/LiveTicker';
import LocationSheet from '@/components/golf/LocationSheet';
import LocationChoicePrompt from '@/components/golf/LocationChoicePrompt';
import ExploreEmptyState from '@/components/golf/ExploreEmptyState';
import CoverageNotice from '@/components/golf/CoverageNotice';
import CoverageFooterCard from '@/components/golf/CoverageFooterCard';
import AccountMenu from '@/components/golf/AccountMenu';
import GlassHeader from '@/components/golf/GlassHeader';
import PullToRefresh from '@/components/golf/PullToRefresh';
import { getListings, searchListings, getTournaments, searchTournaments, toggleFavorite, getSavedIds, getLiveTournaments, requestCoverage, getCoverageStatus } from '@/lib/golfData';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { useGate } from '@/components/golf/GateProvider';
import { useGolfLocation } from '@/hooks/useGolfLocation';
import { useNavVisibility } from '@/components/golf/NavVisibilityContext';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'course', label: 'Courses' },
  { key: 'simulator', label: 'Simulators' },
  { key: 'training', label: 'Training' },
  { key: 'tournament', label: 'Tournaments' },
];

export default function Explore() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { gate, isAuthed } = useGate();
  const { setHidden } = useNavVisibility();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(new Set());
  const [tournaments, setTournaments] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [dismissedAreaKey, setDismissedAreaKey] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const loc = useGolfLocation();
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

  // Hide the mobile bottom nav while any location sheet is open so the
  // ZIP field, Save, error text, and Cancel control are never covered.
  useEffect(() => {
    setHidden(loc.sheetOpen);
    return () => setHidden(false);
  }, [loc.sheetOpen, setHidden]);

  // Location is required before any player-facing query runs.
  const locParam = loc.coords
    ? { lat: loc.coords.lat, lng: loc.coords.lng, radius: loc.radius }
    : (loc.city ? { near: loc.city, radius: loc.radius } : null);

  // Stable key for the selected location + radius. Used to separate
  // coverage requests (which should only fire on location change) from
  // listing loads (which fire on every query/category/location change).
  const locKey = loc.coords
    ? `${loc.coords.lat.toFixed(4)},${loc.coords.lng.toFixed(4)},${loc.radius}`
    : (loc.city ? `${loc.city},${loc.radius}` : '');

  // Listings load — does NOT block on coverage. Existing verified
  // listings render immediately while coverage work happens separately.
  const load = useCallback(async () => {
    if (!locParam) {
      setItems([]);
      setTournaments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (category === 'tournament') {
        const [data, tour] = await Promise.all([
          query ? searchTournaments(query, locParam) : getTournaments(locParam),
          getLiveTournaments(locParam),
        ]);
        setItems(data);
        setTournaments(tour);
      } else {
        const [data, tour] = await Promise.all([
          query ? searchListings(query, category, locParam) : getListings(category, locParam),
          getLiveTournaments(locParam),
        ]);
        setItems(data);
        setTournaments(tour);
      }
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [category, query, loc.coords, loc.city, loc.radius]);

  // Ref so the polling effect can call load without depending on it
  // (avoids resetting the poll schedule on every query/category change).
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAuthed) getSavedIds().then(setSaved).catch(() => {}); }, [isAuthed]);

  // Coverage request — fires only when the location changes, not on
  // every query/category change. This ensures many player searches for
  // the same area join one deduped server-side coverage job and never
  // start duplicates or repeat paid discovery.
  useEffect(() => {
    if (!locParam) { setCoverage(null); setDismissedAreaKey(null); return; }
    let cancelled = false;
    setDismissedAreaKey(null);
    requestCoverage(locParam)
      .then((res) => { if (!cancelled) setCoverage(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey]);

  // Bounded, visibility-aware polling with backoff.
  // Stops when: complete, empty, failed, dismissed, or location changes.
  // Does NOT poll every 15s indefinitely — starts at 5s, backs off by
  // 1.5x up to 30s, caps at 12 polls (~2.5 min), pauses when tab hidden.
  const shouldPoll = coverage &&
    (coverage.status === 'queued' || coverage.status === 'checking') &&
    coverage.areaKey !== dismissedAreaKey;
  const pollKey = shouldPoll ? coverage.areaKey : null;

  useEffect(() => {
    if (!pollKey || !locParam) return;
    let cancelled = false;
    let timeoutId = null;
    let pollCount = 0;
    const INITIAL_POLL_MS = 5000;
    const MAX_POLL_MS = 30000;
    const MAX_POLLS = 12;

    const poll = async () => {
      if (cancelled) return;
      if (document.hidden) {
        timeoutId = setTimeout(poll, 3000);
        return;
      }
      try {
        const status = await getCoverageStatus(locParam);
        if (cancelled) return;
        setCoverage(status);
        if (status.status === 'complete' || status.status === 'empty' || status.status === 'failed') {
          loadRef.current();
          return; // stop polling
        }
      } catch {}
      pollCount++;
      if (pollCount >= MAX_POLLS) return;
      const delay = Math.min(INITIAL_POLL_MS * Math.pow(1.5, pollCount), MAX_POLL_MS);
      timeoutId = setTimeout(poll, delay);
    };

    timeoutId = setTimeout(poll, INITIAL_POLL_MS);
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollKey, locKey]);

  const handleDismissNotice = useCallback(() => {
    if (coverage?.areaKey) setDismissedAreaKey(coverage.areaKey);
  }, [coverage?.areaKey]);

  const handleRetry = useCallback(async () => {
    if (!locParam) return;
    setRetrying(true);
    try {
      const res = await requestCoverage(locParam);
      setCoverage(res);
      setDismissedAreaKey(null);
    } catch {}
    setRetrying(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey]);

  const handleToggleSave = async (id) => {
    if (!isAuthed) { gate(); return; }
    const wasSaved = saved.has(id);
    // Optimistic: toggle heart instantly before the API call finishes
    setSaved((prev) => {
      const next = new Set(prev);
      wasSaved ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      await toggleFavorite(id);
    } catch {
      // Revert on failure
      setSaved((prev) => {
        const next = new Set(prev);
        wasSaved ? next.add(id) : next.delete(id);
        return next;
      });
    }
  };

  // Compact notice: only for queued/checking, dismissed per areaKey.
  const showNotice = coverage &&
    (coverage.status === 'queued' || coverage.status === 'checking') &&
    coverage.areaKey !== dismissedAreaKey;

  // Quiet footer card: queued/checking/failed. Never resembles a listing.
  const showFooter = coverage &&
    (coverage.status === 'queued' || coverage.status === 'checking' || coverage.status === 'failed');

  return (
    <div className="night-glow">
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight">Golfholio</span>
          {isAuthed ? (
            <AccountMenu initials={initials} />
          ) : (
            <Link to="/register" className="text-sm font-semibold text-primary/90 hover:text-primary transition">
              Sign up
            </Link>
          )}
        </div>
      </GlassHeader>

      <PullToRefresh onRefresh={async () => {
        await load();
        if (locParam) getCoverageStatus(locParam).then(setCoverage).catch(() => {});
      }}>
        <NightHero
          locationLabel={loc.label}
          subtitle={loc.subtitle}
          onOpenLocation={() => loc.setSheetOpen(true)}
          onUseLocation={loc.useGps}
          locating={loc.locating}
        />

        {/* 30-mile expansion — temporary for this session only */}
        {loc.hasLocation && !loc.radiusExpanded && (
          <div className="px-4 mt-2">
            <button
              onClick={loc.expandRadius}
              className="w-full h-10 rounded-xl glass-card border border-border text-sm font-medium text-primary flex items-center justify-center gap-2"
            >
              Search up to 30 miles
            </button>
          </div>
        )}
        {loc.radiusExpanded && (
          <div className="px-4 mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Showing results within 30 miles</span>
            <button
              onClick={loc.resetRadius}
              className="text-xs font-semibold text-primary"
            >
              Reset to 15 mi
            </button>
          </div>
        )}

        {loc.hasLocation ? (
          <>
            <div className="px-4 mt-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search courses, events…"
                  className="h-12 pl-10 glass-card border-primary/20 rounded-2xl w-full"
                />
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
              {CATEGORIES.map((c) => (
                <motion.button
                  key={c.key}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    'h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border shrink-0 transition',
                    category === c.key
                      ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30'
                      : 'glass-card text-foreground border-border'
                  )}
                >
                  {c.label}
                </motion.button>
              ))}
            </div>

            {tournaments.length > 0 && (
              <div className="px-4 mb-2">
                <LiveTicker tournaments={tournaments} onTap={() => gate(() => navigate(`/tournament/${tournaments[0].id}`))} />
              </div>
            )}

            <section className="px-4 mt-5">
              <div className="flex items-end justify-between mb-1">
                <h2 className="text-xl font-extrabold tracking-tight">{category === 'tournament' ? 'Tournaments near you' : 'Near you now'}</h2>
                <span className="text-xs text-muted-foreground">
                  {loc.coords ? 'Near you' : 'Within 15 miles'}
                </span>
              </div>
              <motion.div initial={{ width: 0 }} animate={{ width: 56 }} transition={{ duration: 1, ease: 'easeOut' }} className="h-0.5 bg-primary rounded-full mb-3" />
              {loading ? (
                <VenueDeckSkeleton />
              ) : items.length === 0 ? (
                <>
                  {category === 'tournament' ? (
                    <TournamentEmptyState onChangeLocation={() => loc.setSheetOpen(true)} />
                  ) : (
                    <ExploreEmptyState onChangeLocation={() => loc.setSheetOpen(true)} />
                  )}
                  {showFooter && (
                    <CoverageFooterCard
                      status={coverage.status}
                      areaLabel={loc.label}
                      onRetry={handleRetry}
                      retrying={retrying}
                    />
                  )}
                </>
              ) : (
                <>
                  {showNotice && (
                    <div className="mb-3">
                      <CoverageNotice
                        areaLabel={loc.label}
                        onDismiss={handleDismissNotice}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3.5">
                    {items.map((item, i) => (
                      category === 'tournament' ? (
                        <TournamentCard
                          key={item.id}
                          item={item}
                          index={i}
                          saved={saved.has(item.id)}
                          onToggleSave={() => handleToggleSave(item.id)}
                          onOpen={() => navigate('/listing/' + item.id)}
                        />
                      ) : (
                        <VenueCard
                          key={item.id}
                          item={item}
                          index={i}
                          saved={saved.has(item.id)}
                          onToggleSave={() => handleToggleSave(item.id)}
                          onOpen={() => navigate('/listing/' + item.id)}
                        />
                      )
                    ))}
                  </div>
                  {showFooter && (
                    <CoverageFooterCard
                      status={coverage.status}
                      areaLabel={loc.label}
                      onRetry={handleRetry}
                      retrying={retrying}
                    />
                  )}
                </>
              )}
            </section>
          </>
        ) : (
          <LocationChoicePrompt
            onUseLocation={loc.useGps}
            onEnterZip={() => loc.setSheetOpen(true)}
            locating={loc.locating}
            locationError={loc.locationError}
          />
        )}

        <div className="h-8" />
      </PullToRefresh>

      <LocationSheet
        open={loc.sheetOpen}
        onClose={() => loc.setSheetOpen(false)}
        city={loc.city}
        state={loc.state}
        onUseGps={loc.useGps}
        onSearch={loc.searchLocation}
        onConfirm={loc.confirmLocation}
        locating={loc.locating}
        hasCoords={!!loc.coords}
        locationError={loc.locationError}
      />
    </div>
  );
}