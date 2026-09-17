import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Calendar, Trophy } from 'lucide-react';
import GlassHeader from '@/components/golf/GlassHeader';
import { getTournament } from '@/lib/golfData';
import { useGolfLocation } from '@/hooks/useGolfLocation';
import { base44 } from '@/api/base44Client';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

function aggregate(cards) {
  const rows = [];
  cards.forEach((c) => {
    const scores = c.scores || {};
    Object.entries(scores).forEach(([player, holes]) => {
      if (!Array.isArray(holes)) return;
      const valid = holes.filter((h) => typeof h === 'number');
      if (!valid.length) return;
      rows.push({ player, total: valid.reduce((s, h) => s + h, 0), holes: valid.length, course: c.course_name });
    });
  });
  return rows.sort((a, b) => a.total - b.total);
}

export default function TournamentLive() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const loc = useGolfLocation();
  const locParam = loc.coords
    ? { lat: loc.coords.lat, lng: loc.coords.lng }
    : (loc.city ? { near: loc.city } : null);

  useEffect(() => {
    let unsub = null;
    let active = true;
    (async () => {
      try {
        const t = await getTournament(id, locParam || {});
        if (active) setTournament(t);
      } catch {}
      try {
        const cards = await base44.entities.Scorecard.filter({ tournament_id: id, status: 'active' });
        if (active) setLeaders(aggregate(cards));
        unsub = base44.entities.Scorecard.subscribe(() => {
          base44.entities.Scorecard.filter({ tournament_id: id, status: 'active' }).then((c) => {
            if (active) setLeaders(aggregate(c));
          });
        });
      } catch {}
      if (active) setLoading(false);
    })();
    return () => { active = false; if (unsub) unsub(); };
  }, [id]);

  return (
    <div className="night-glow min-h-dvh">
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full glass-card border border-border grid place-items-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-lg font-extrabold tracking-tight">Tournament</span>
        </div>
      </GlassHeader>

      <div className="p-4">
        {loading ? (
          <div className="rounded-2xl h-40 shimmer" />
        ) : tournament ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-primary text-xs font-bold tracking-wider">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> {tournament.live ? 'LIVE NOW' : 'UPCOMING'}
              </div>
              <h1 className="text-2xl font-extrabold mt-2 leading-tight">{tournament.name}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-2">
                {tournament.venue && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{tournament.venue}</span>}
                {tournament.date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(parseISO(tournament.date), 'EEE, MMM d')}</span>}
              </div>
              {tournament.blurb && <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{tournament.blurb}</p>}
            </div>
          </motion.div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">{locParam ? 'Tournament unavailable in your area.' : 'Choose a location to view tournament details.'}</p>
            {locParam && (
              <button onClick={() => navigate('/')} className="text-xs mt-2 text-primary font-semibold">Back to Explore</button>
            )}
          </div>
        )}

        <div className="flex items-end justify-between mt-6 mb-1">
          <h2 className="text-lg font-extrabold tracking-tight">Live leaderboard</h2>
          <span className="text-xs text-muted-foreground">{leaders.length} players</span>
        </div>
        <motion.div initial={{ width: 0 }} animate={{ width: 56 }} transition={{ duration: 1, ease: 'easeOut' }} className="h-0.5 bg-primary rounded-full mb-3" />

        {leaders.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card/60 p-8 text-center">
            <Trophy className="h-8 w-8 mx-auto text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mt-3">No live scores yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Scores appear here as players report them.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaders.map((row, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <span className="w-6 text-center font-extrabold text-primary">{i + 1}</span>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{row.player}</div>
                  <div className="text-xs text-muted-foreground">{row.holes} holes{row.course ? ` · ${row.course}` : ''}</div>
                </div>
                <span className="font-extrabold text-lg">{row.total}</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}