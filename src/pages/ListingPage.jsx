import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Star, Calendar, Globe, Navigation, Phone, DollarSign, Flag, Heart } from 'lucide-react';
import GlassHeader from '@/components/golf/GlassHeader';
import CategoryPlaceholder from '@/components/golf/CategoryPlaceholder';
import ReviewSection from '@/components/golf/ReviewSection';
import { getListingById, toggleFavorite } from '@/lib/golfData';
import { useGolfLocation } from '@/hooks/useGolfLocation';
import { useAuth } from '@/lib/AuthContext';
import { useGate } from '@/components/golf/GateProvider';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const TYPE_LABEL = {
  course: 'Course',
  simulator: 'Simulator',
  training: 'Training',
  tournament: 'Tournament',
  charity_event: 'Charity Event',
  corporate_event: 'Corporate Event',
  league: 'League',
  golf_related_venue: 'Golf Venue',
};

export default function ListingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { gate, isAuthed } = useGate();
  const { toast } = useToast();
  const loc = useGolfLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [flagging, setFlagging] = useState(false);

  const locParam = loc.coords
    ? { lat: loc.coords.lat, lng: loc.coords.lng }
    : loc.city
    ? { near: loc.city }
    : null;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!locParam) {
        setLoading(false);
        return;
      }
      try {
        const it = await getListingById(id, locParam);
        if (active) setItem(it);
      } catch {}
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id, loc.coords, loc.city]);

  const handleSave = async () => {
    if (!isAuthed) {
      gate();
      return;
    }
    const isSaved = await toggleFavorite(id);
    setSaved(isSaved);
  };

  const handleFlag = async () => {
    if (!isAuthed) {
      gate();
      return;
    }
    setFlagging(true);
    try {
      await base44.entities.Report.create({
        target_type: 'listing',
        target_id: id,
        reason: 'Inaccurate listing reported by player',
        details: '',
      });
      toast({ title: 'Report submitted', description: 'Thanks — our team will review this listing.' });
    } catch {
      toast({ title: 'Could not submit report' });
    }
    setFlagging(false);
  };

  const directionsUrl = item
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.location || item.name)}`
    : '#';

  if (loading) {
    return (
      <div>
        <GlassHeader>
          <div className="h-[60px] px-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-card border border-border grid place-items-center">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-lg font-extrabold tracking-tight">Listing</span>
          </div>
        </GlassHeader>
        <div className="p-4">
          <div className="rounded-2xl h-64 shimmer" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div>
        <GlassHeader>
          <div className="h-[60px] px-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-card border border-border grid place-items-center">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-lg font-extrabold tracking-tight">Listing</span>
          </div>
        </GlassHeader>
        <div className="text-center py-20 text-muted-foreground px-6">
          <p className="font-semibold text-foreground">Listing unavailable</p>
          <p className="text-sm mt-1">
            {locParam ? 'This listing is not available in your area or has not been verified.' : 'Choose a location to view listing details.'}
          </p>
          <button onClick={() => navigate('/')} className="mt-4 text-sm font-semibold text-primary">
            Back to Explore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-card border border-border grid place-items-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-lg font-extrabold tracking-tight truncate">{item.name}</span>
        </div>
      </GlassHeader>

      <div className="relative h-[280px] overflow-hidden">
        {item.photo ? (
          <img src={item.photo} alt={item.name} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <CategoryPlaceholder className="absolute inset-0 h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <span className="absolute top-3 left-3 rounded-full glass border border-border/40 px-3 py-1 text-xs font-semibold">
          {TYPE_LABEL[item.type] || item.type}
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight">{item.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1.5 flex-wrap">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" /> {item.location}
            </span>
            {item.rating != null && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 text-accent" /> {item.rating}
              </span>
            )}
            {item.distance != null && (
              <span className="text-primary font-semibold">{item.distance} mi away</span>
            )}
          </div>
        </div>

        {item.date && (
          <div className="flex items-center gap-2 text-accent text-sm font-medium">
            <Calendar className="h-4 w-4" /> {format(parseISO(item.date), 'EEEE, MMMM d, yyyy')}
          </div>
        )}

        {item.blurb && <p className="text-sm text-muted-foreground leading-relaxed">{item.blurb}</p>}

        <div className="grid grid-cols-1 gap-2">
          {item.price && (
            <div className="flex items-start gap-2.5 rounded-xl bg-secondary/50 p-3">
              <DollarSign className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{item.price}</span>
            </div>
          )}
          {item.phone && (
            <a href={`tel:${item.phone}`} className="flex items-center gap-2.5 rounded-xl bg-secondary/50 p-3">
              <Phone className="h-4 w-4 text-accent shrink-0" />
              <span className="text-sm text-foreground">{item.phone}</span>
            </a>
          )}
          {item.address && (
            <div className="flex items-start gap-2.5 rounded-xl bg-secondary/50 p-3">
              <MapPin className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{item.address}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a href={directionsUrl} target="_blank" rel="noreferrer">
            <Button variant="secondary" className="h-12 w-full">
              <Navigation className="h-4 w-4" /> Directions
            </Button>
          </a>
          {item.website ? (
            <a href={item.website} target="_blank" rel="noreferrer">
              <Button variant="secondary" className="h-12 w-full">
                <Globe className="h-4 w-4" /> Website
              </Button>
            </a>
          ) : (
            <Button variant="secondary" className="h-12 w-full" disabled>
              <Globe className="h-4 w-4" /> Website
            </Button>
          )}
          <Button className="h-12" onClick={handleSave}>
            <Heart className={cn('h-4 w-4', saved && 'fill-current')} /> {saved ? 'Saved' : 'Save'}
          </Button>
          <Button variant="ghost" className="h-12" onClick={handleFlag} disabled={flagging}>
            <Flag className="h-4 w-4" /> {flagging ? 'Sending…' : 'Report'}
          </Button>
        </div>

        <div className="pt-2">
          <ReviewSection listingId={id} listingName={item.name} />
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          Tee times and reservations will appear here as venues connect. No availability is shown until verified.
        </p>
      </div>
    </div>
  );
}