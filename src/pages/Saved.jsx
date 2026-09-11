import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Compass } from 'lucide-react';
import { motion } from 'framer-motion';
import ListingCard from '@/components/golf/ListingCard';
import ListingDetail from '@/components/golf/ListingDetail';
import GlassHeader from '@/components/golf/GlassHeader';
import PullToRefresh from '@/components/golf/PullToRefresh';
import { ListingCardSkeleton } from '@/components/golf/Shimmer';
import SwipeRow from '@/components/golf/SwipeRow';
import { getFavorites, getSavedIds, toggleFavorite } from '@/lib/golfData';
import { Trash2 } from 'lucide-react';

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
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">Saved</h1>
            <p className="text-xs text-muted-foreground mt-1">{items.length} {items.length === 1 ? 'venue' : 'venues'}</p>
          </div>
          <Bookmark className="h-5 w-5 text-accent" />
        </div>
      </GlassHeader>

      <PullToRefresh onRefresh={load}>
        {loading ? (
          <div>{[...Array(3)].map((_, i) => <ListingCardSkeleton key={i} />)}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground px-6">
            <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
              <Bookmark className="h-7 w-7 opacity-50" />
            </div>
            <p className="font-semibold text-foreground">No saved spots yet</p>
            <p className="text-sm mt-1">Tap the heart on any listing to save it for later.</p>
            <Link to="/">
              <motion.button
                whileTap={{ scale: 0.96 }}
                className="mt-5 h-11 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2"
              >
                <Compass className="h-4 w-4" /> Explore courses
              </motion.button>
            </Link>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <SwipeRow
                key={item.id}
                actionLabel="Unsave"
                actionIcon={Trash2}
                onAction={() => handleToggleSave(item.id)}
              >
                <ListingCard
                  item={item}
                  saved={saved.has(item.id)}
                  onToggleSave={() => handleToggleSave(item.id)}
                  onOpen={() => setSelected(item)}
                />
              </SwipeRow>
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