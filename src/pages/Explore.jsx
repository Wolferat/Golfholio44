import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import NightHero from '@/components/golf/NightHero';
import VenueCard from '@/components/golf/VenueCard';
import VenueDeckSkeleton from '@/components/golf/VenueDeckSkeleton';
import GolfersCircle from '@/components/golf/GolfersCircle';
import LiveTicker from '@/components/golf/LiveTicker';
import LocationSheet from '@/components/golf/LocationSheet';
import ListingDetail from '@/components/golf/ListingDetail';
import GlassHeader from '@/components/golf/GlassHeader';
import PullToRefresh from '@/components/golf/PullToRefresh';
import { getListings, searchListings, toggleFavorite, getSavedIds, getLiveTournaments } from '@/lib/golfData';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { useGolfLocation } from '@/hooks/useGolfLocation';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'course', label: 'Courses' },
  { key: 'simulator', label: 'Simulators' },
  { key: 'charity', label: 'Tournaments' },
  { key: 'training', label: 'Lessons' },
];

const CONSENT_KEY = 'golfolio_contacts_consent';

export default function Explore() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [golfers, setGolfers] = useState([]);
  const [consented, setConsented] = useState(() => {
    try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
  });
  const loc = useGolfLocation();
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

  const locParam = loc.coords ? { lat: loc.coords.lat, lng: loc.coords.lng } : { near: loc.city };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, tour] = await Promise.all([
        query ? searchListings(query, category, locParam) : getListings(category, locParam),
        getLiveTournaments(),
      ]);
      setItems(data);
      setTournaments(tour);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [category, query, loc.coords, loc.city]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getSavedIds().then(setSaved).catch(() => {}); }, []);

  const handleToggleSave = async (id) => {
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
          <span className="text-lg font-extrabold tracking-tight">Golfolio</span>
          <div className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 grid place-items-center text-sm font-bold text-primary">
            {initials}
          </div>
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

        <div className="px-4 -mt-6 relative z-10">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses, events…"
              className="h-12 pl-10 glass-card border-primary/20 rounded-2xl"
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-4">
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
            <LiveTicker tournaments={tournaments} onTap={() => navigate(`/tournament/${tournaments[0].id}`)} />
          </div>
        )}

        <div className="px-4 mt-4">
          <GolfersCircle golfers={golfers} onGolfers={setGolfers} consented={consented} onConsented={setConsented} />
        </div>

        <section className="px-4 mt-6">
          <div className="flex items-end justify-between mb-1">
            <h2 className="text-xl font-extrabold tracking-tight">Near you now</h2>
            <span className="text-xs text-muted-foreground">{loc.coords ? 'Near you' : 'Within 30 miles'}</span>
          </div>
          <motion.div initial={{ width: 0 }} animate={{ width: 56 }} transition={{ duration: 1, ease: 'easeOut' }} className="h-0.5 bg-primary rounded-full mb-3" />
          {loading ? (
            <VenueDeckSkeleton />
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-9 w-9 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-sm">No listings found</p>
              <p className="text-xs mt-1">Try a different search or category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {items.map((item, i) => (
                <VenueCard
                  key={item.id}
                  item={item}
                  index={i}
                  saved={saved.has(item.id)}
                  onToggleSave={() => handleToggleSave(item.id)}
                  onOpen={() => setSelected(item)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="h-8" />
      </PullToRefresh>

      <ListingDetail
        item={selected}
        saved={selected ? saved.has(selected.id) : false}
        onToggleSave={() => selected && handleToggleSave(selected.id)}
        onClose={() => setSelected(null)}
      />
      <LocationSheet
        open={loc.sheetOpen}
        onClose={() => loc.setSheetOpen(false)}
        city={loc.city}
        onSave={loc.saveCity}
        onUseGps={loc.useGps}
        locating={loc.locating}
        hasCoords={!!loc.coords}
      />
    </div>
  );
}