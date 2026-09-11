import { useEffect, useState, useCallback } from 'react';
import { Search, MapPin } from 'lucide-react';
import ListingCard from '@/components/golf/ListingCard';
import ListingDetail from '@/components/golf/ListingDetail';
import { getListings, searchListings, toggleFavorite, getFavorites } from '@/lib/golfData';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'course', label: 'Courses' },
  { key: 'simulator', label: 'Simulators' },
  { key: 'event', label: 'Events' },
];

export default function Explore() {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(new Set());
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = query ? await searchListings(query, category) : await getListings(category);
    setItems(data);
    setLoading(false);
  }, [category, query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getFavorites().then((favs) => setSaved(new Set(favs.map((f) => f.id))));
  }, []);

  const handleToggleSave = async (id) => {
    const isSaved = await toggleFavorite(id);
    setSaved((prev) => {
      const next = new Set(prev);
      isSaved ? next.add(id) : next.delete(id);
      return next;
    });
  };

  return (
    <div className="safe-top px-4 pt-4">
      <header className="mb-3">
        <h1 className="text-2xl font-bold font-heading">Golfolio</h1>
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />Sherman, TX · 30 mi
        </p>
      </header>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses, events…"
          className="h-11 pl-9"
        />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              'h-9 px-4 rounded-full text-sm font-medium whitespace-nowrap border transition shrink-0',
              category === c.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-card border border-border overflow-hidden">
              <div className="h-36 fairway-gradient opacity-40 animate-pulse" />
              <div className="h-12" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No listings found.</p>
          <p className="text-xs mt-1">Try a different search or category.</p>
        </div>
      ) : (
        <div className="space-y-3">
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

      <ListingDetail
        item={selected}
        saved={selected ? saved.has(selected.id) : false}
        onToggleSave={() => selected && handleToggleSave(selected.id)}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}