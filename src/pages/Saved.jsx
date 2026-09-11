import { useEffect, useState, useCallback } from 'react';
import { Bookmark } from 'lucide-react';
import ListingCard from '@/components/golf/ListingCard';
import ListingDetail from '@/components/golf/ListingDetail';
import { getFavorites, getSavedIds, toggleFavorite } from '@/lib/golfData';

export default function Saved() {
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [favs, ids] = await Promise.all([getFavorites(), getSavedIds()]);
      setItems(favs);
      setSaved(ids);
    } catch (e) {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleSave = async (id) => {
    const isSaved = await toggleFavorite(id);
    setSaved((prev) => {
      const next = new Set(prev);
      isSaved ? next.add(id) : next.delete(id);
      return next;
    });
    if (!isSaved) setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="safe-top px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-heading">Saved</h1>
        <p className="text-sm text-muted-foreground">Your favorite venues and events</p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-card border border-border overflow-hidden">
              <div className="h-36 fairway-gradient opacity-40 animate-pulse" />
              <div className="h-12" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bookmark className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Save a few spots for your next round.</p>
          <p className="text-xs mt-1">Tap the heart on any listing in Explore.</p>
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