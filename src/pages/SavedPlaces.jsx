import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import GlassHeader from '@/components/golf/GlassHeader';
import VenueCard from '@/components/golf/VenueCard';
import { getSavedIds, getListings, toggleFavorite } from '@/lib/golfData';
import { useGolfLocation } from '@/hooks/useGolfLocation';
import { useAuth } from '@/lib/AuthContext';
import { useGate } from '@/components/golf/GateProvider';

export default function SavedPlaces() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { gate, isAuthed } = useGate();
  const loc = useGolfLocation();
  const [items, setItems] = useState([]);
  const [saved, setSaved] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const locParam = loc.coords
    ? { lat: loc.coords.lat, lng: loc.coords.lng }
    : loc.city
    ? { near: loc.city }
    : null;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthed || !locParam) {
        setLoading(false);
        return;
      }
      try {
        const [all, ids] = await Promise.all([getListings('all', locParam), getSavedIds()]);
        if (active) {
          setSaved(ids);
          setItems(all.filter((i) => ids.has(i.id)));
        }
      } catch {}
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isAuthed, loc.coords, loc.city]);

  const handleToggleSave = async (id) => {
    const isSaved = await toggleFavorite(id);
    setSaved((prev) => {
      const n = new Set(prev);
      isSaved ? n.add(id) : n.delete(id);
      return n;
    });
    setItems((prev) => (isSaved ? prev : prev.filter((i) => i.id !== id)));
  };

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">Saved</h1>
            <p className="text-xs text-muted-foreground mt-1">Places you've saved</p>
          </div>
          <Bookmark className="h-5 w-5 text-accent" />
        </div>
      </GlassHeader>

      <div className="p-4">
        {!isAuthed ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
              <Bookmark className="h-7 w-7 opacity-50" />
            </div>
            <p className="font-semibold text-foreground">Sign in to save places</p>
            <p className="text-sm mt-1">Save courses and venues to find them quickly later.</p>
            <button onClick={() => gate()} className="mt-4 h-11 px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold">
              Sign up
            </button>
          </div>
        ) : !locParam ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">Choose a location to see your saved places nearby.</p>
            <button onClick={() => navigate('/')} className="mt-3 text-sm font-semibold text-primary">
              Go to Explore
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-40 rounded-2xl shimmer" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
              <Bookmark className="h-7 w-7 opacity-50" />
            </div>
            <p className="font-semibold text-foreground">No saved places yet</p>
            <p className="text-sm mt-1">Tap the heart on any venue to save it here.</p>
            <button onClick={() => navigate('/')} className="mt-4 h-11 px-5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold">
              Explore
            </button>
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
                onOpen={() => navigate(`/listing/${item.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}