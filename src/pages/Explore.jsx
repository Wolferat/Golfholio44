import { useEffect, useState, useCallback } from 'react';
import { Search, MapPin, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import ListingCard from '@/components/golf/ListingCard';
import ListingDetail from '@/components/golf/ListingDetail';
import GlassHeader from '@/components/golf/GlassHeader';
import PullToRefresh from '@/components/golf/PullToRefresh';
import { ListingCardSkeleton } from '@/components/golf/Shimmer';
import { getListings, searchListings, toggleFavorite, getSavedIds } from '@/lib/golfData';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

const HERO_IMG = 'https://media.base44.com/images/public/6aa36b30315f233cc3d6a9b6/42aa12ea6_generated_image.png';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'course', label: 'Courses' },
  { key: 'simulator', label: 'Simulators' },
  { key: 'charity', label: 'Tournaments' },
  { key: 'training', label: 'Lessons' },
];

export default function Explore() {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const { user } = useAuth();
  const initials = (user?.full_name || user?.email || '?').slice(0, 2).toUpperCase();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = query ? await searchListings(query, category) : await getListings(category);
      setItems(data);
    } catch (e) {
      setItems([]);
    }
    setLoading(false);
  }, [category, query]);

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
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <span className="text-lg font-extrabold tracking-tight">Golfolio</span>
          <div className="h-9 w-9 rounded-full bg-primary/15 border border-border grid place-items-center text-sm font-bold text-primary">
            {initials}
          </div>
        </div>
      </GlassHeader>

      <PullToRefresh onRefresh={load}>
        <div className="relative h-[220px] overflow-hidden">
          <Image src={HERO_IMG} fittingType="fill" className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-background/30 to-background" />
          <div className="absolute bottom-4 left-4 right-4">
            <span className="inline-flex items-center gap-1.5 rounded-full glass-card border border-border/50 px-3 py-1 text-xs font-semibold">
              <Compass className="h-3.5 w-3.5 text-accent" /> Explore Top Courses
            </span>
            <h1 className="text-[28px] font-extrabold mt-2.5 leading-none">Sherman, TX</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1.5">
              <MapPin className="h-3.5 w-3.5" /> Within 30 miles
            </p>
          </div>
        </div>

        <div className="px-4 -mt-6 relative z-10">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses, events…"
              className="h-12 pl-10 glass-card border-border rounded-2xl"
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

        {loading ? (
          <div>{[...Array(4)].map((_, i) => <ListingCardSkeleton key={i} />)}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground px-4">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No listings found</p>
            <p className="text-xs mt-1">Try a different search or category.</p>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <ListingCard
                key={item.id}
                item={item}
                saved={saved.has(item.id)}
                onToggleSave={() => handleToggleSave(item.id)}
                onOpen={() => setSelected(item)}
              />
            ))}
          </div>
        )}
      </PullToRefresh>

      <ListingDetail
        item={selected}
        saved={selected ? saved.has(selected.id) : false}
        onToggleSave={() => selected && handleToggleSave(selected.id)}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}