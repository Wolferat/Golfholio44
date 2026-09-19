import { motion } from 'framer-motion';
import { Trophy, MapPin, Calendar, Users, DollarSign, ExternalLink, Bookmark, Clock } from 'lucide-react';
import { Image as ImageIcon } from '@/components/ui/image';
import { cn } from '@/lib/utils';

// ============================================================
// TournamentCard — displays a verified tournament with
// source-backed details only. Never shows inferred or invented
// information. Unknown fields are omitted or labeled honestly.
// ============================================================

const TYPE_LABELS = {
  tournament: 'Tournament',
  charity_event: 'Charity Event',
  corporate_event: 'Corporate Event',
  league: 'League',
};

const FEE_STATUS_LABELS = {
  known: 'Entry fee',
  free: 'Free entry',
  variable: 'Variable pricing',
  unknown: 'Fee unavailable',
};

function formatDate(dt) {
  if (!dt) return null;
  try {
    return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return String(dt).slice(0, 10); }
}

function formatTime(dt) {
  if (!dt) return null;
  try {
    return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return null; }
}

function formatFee(item) {
  if (item.fee_status === 'free') return 'Free';
  if (item.fee_status === 'variable') return 'Varies';
  if (item.fee_status === 'unknown' || item.individual_entry_fee == null) return null;
  const amt = item.individual_entry_fee;
  const cur = item.currency === 'USD' ? '$' : (item.currency || '$');
  return `${cur}${amt}${item.team_entry_fee != null ? ` / team ${cur}${item.team_entry_fee}` : ''}`;
}

export default function TournamentCard({ item, index = 0, saved = false, onToggleSave, onOpen }) {
  const dateLabel = formatDate(item.startsAt);
  const timeLabel = formatTime(item.startsAt);
  const feeLabel = formatFee(item);
  const typeLabel = TYPE_LABELS[item.type] || 'Event';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      className="rounded-2xl overflow-hidden glass-card border border-border cursor-pointer group"
    >
      {/* Hero image or gradient header */}
      <div className="relative h-32 overflow-hidden">
        {item.photo ? (
          <ImageIcon src={item.photo} alt={item.name} fittingType="fill" className="h-full w-full" />
        ) : (
          <div className="h-full w-full fairway-gradient" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Live badge */}
        {item.live && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 text-white text-xs font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
          </div>
        )}

        {/* Category badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-primary-foreground text-xs font-semibold">
          <Trophy className="h-3 w-3" /> {typeLabel}
        </div>

        {/* Save button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave?.(); }}
          className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-black/50 backdrop-blur grid place-items-center"
        >
          <Bookmark className={cn('h-4 w-4', saved ? 'fill-primary text-primary' : 'text-white')} />
        </button>

        {/* Title */}
        <div className="absolute bottom-3 left-3 right-14">
          <h3 className="text-base font-bold text-white leading-tight line-clamp-2">{item.name}</h3>
        </div>
      </div>

      {/* Body */}
      <div className="p-3.5 space-y-2.5">
        {/* Venue + location */}
        {item.venue && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-muted-foreground line-clamp-1">{item.location || item.venue}</span>
          </div>
        )}

        {/* Date + time */}
        {dateLabel && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium">{dateLabel}</span>
            {timeLabel && <span className="text-muted-foreground">· {timeLabel}</span>}
          </div>
        )}

        {/* Details row: format, team size, fee */}
        <div className="flex flex-wrap gap-2 pt-0.5">
          {item.event_format && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{item.event_format}</span>
          )}
          {item.team_size != null && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> {item.team_size}-some
            </span>
          )}
          {feeLabel && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> {feeLabel}
            </span>
          )}
          {item.fee_status === 'unknown' && !feeLabel && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">Fee unavailable</span>
          )}
        </div>

        {/* Registration deadline + URL */}
        <div className="flex items-center justify-between pt-1">
          {item.registration_deadline ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Reg by {formatDate(item.registration_deadline)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{item.distance != null ? `${item.distance} mi away` : ''}</span>
          )}
          {item.official_registration_url && (
            <a
              href={item.official_registration_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
            >
              Register <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}