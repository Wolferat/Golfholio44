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
import CoverageStatusBanner from '@/components/golf/CoverageStatusBanner';
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
  const refreshedFor = useRef('');
  const loc = useGolfLocation();
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

  // Hide the mobile bottom nav while any location sheet is open so the
  // ZIP field, Save, error text, and Cancel control are never covered.
  useEffect(() => {
    setHidden(loc.sheetOpen);
    return () => setHidden(false);
  }, [loc.sheetOpen, setHidden]);

  // Location is required before any player-facing query runs.
  // Pass the radius so the server can validate (15 default, 30 max).
  const locParam = loc.coords
    ? { lat: loc.coords.lat, lng: loc.coords.lng, radius: loc.radius }
    : (loc.city ? { near: loc.city, radius: loc.radius } : null);

  const load = useCallback(async () => {
    if (!locParam) {
      setItems([]);
      setTournaments([]);
      setCoverage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (category === 'tournament') {
        // Tournament search mode — dedicated server endpoint with
        // tournament-specific policy (dates, expiration, source-backed)
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
    // Request coverage for this area (creates or joins deduped request)
    requestCoverage(locParam).then(setCoverage).catch(() => {});
  }, [category, query, loc.coords, loc.city, loc.radius]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAuthed) getSavedIds().then(setSaved).catch(() => {}); }, [isAuthed]);

  // Poll coverage status while discovery is in progress
  useEffect(() => {
    if (!coverage || (coverage.status !== 'queued' && coverage.status !== 'checking')) return;
    if (!locParam) return;
    const interval = setInterval(async () => {
      try {
        const status = await getCoverageStatus(locParam);
        setCoverage(status);
        if (status.status === 'complete' || status.status === 'empty' || status.status === 'failed') {
          load();
        }
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [coverage?.status, locParam]);

  const handleToggleSave = async (id) => {
    if (!isAuthed) { gate(); return; }
    const isSaved = await toggleFavorite(id);
    setSaved((prev) => {
      const next = new Set(prev);
      isSaved ? next.add(id) : next.delete(id);
      return next;
    });
  };

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

      <PullToRefresh onRefresh={load}>
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
                  {coverage && (coverage.status === 'queued' || coverage.status === 'checking' || coverage.status === 'failed') && (
                    <CoverageStatusBanner
                      status={coverage.status}
                      areaLabel={loc.label}
                      hasResults={false}
                    />
                  )}
                  {(!coverage || (coverage.status !== 'queued' && coverage.status !== 'checking')) && (
                    category === 'tournament' ? (
                      <TournamentEmptyState onChangeLocation={() => loc.setSheetOpen(true)} />
                    ) : (
                      <ExploreEmptyState onChangeLocation={() => loc.setSheetOpen(true)} />
                    )
                  )}
                </>
              ) : (
                <>
                  {coverage && (coverage.status === 'queued' || coverage.status === 'checking') && (
                    <CoverageStatusBanner
                      status={coverage.status}
                      areaLabel={loc.label}
                      hasResults={true}
                    />
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