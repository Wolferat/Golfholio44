import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useGate } from '@/components/golf/GateProvider';
import { useToast } from '@/components/ui/use-toast';
import { Flag, Plus, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import RoundLogForm from './RoundLogForm';

// Player's own venue-specific rounds and statistics. Only shows
// the signed-in player's own RoundLog records (RLS enforced). Never
// shows another player's rounds, notes, score, or activity.
export default function VenueRounds({ listingId, listingName }) {
  const { gate, isAuthed } = useGate();
  const { toast } = useToast();
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await base44.entities.RoundLog.filter({ listing_id: listingId }, '-date', 50);
      setRounds(list);
    } catch {
      setRounds([]);
    }
    setLoading(false);
  }, [listingId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try {
      await base44.entities.RoundLog.delete(id);
      toast({ title: 'Round deleted' });
      load();
    } catch {
      toast({ title: 'Could not delete' });
    }
  };

  const onDone = () => {
    setShowForm(false);
    setEditing(null);
    load();
  };

  // 9-hole and 18-hole stats computed separately
  const statFor = (holeCount) => {
    const filtered = rounds.filter((r) => r.holes === holeCount);
    if (!filtered.length) return null;
    return {
      rounds: filtered.length,
      avg: Math.round(filtered.reduce((s, r) => s + r.score, 0) / filtered.length),
      best: Math.min(...filtered.map((r) => r.score)),
    };
  };
  const stats18 = statFor(18);
  const stats9 = statFor(9);

  if (!isAuthed) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-extrabold">My Rounds Here</h2>
        <button
          onClick={() => gate()}
          className="w-full h-12 rounded-2xl glass-card border border-border font-semibold flex items-center justify-center gap-2"
        >
          <Flag className="h-4 w-4 text-primary" /> Sign in to log rounds
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">My Rounds Here</h2>
        {!showForm && !editing && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-semibold text-primary flex items-center gap-1"
          >
            <Plus className="h-4 w-4" /> Log a round
          </button>
        )}
      </div>

      {showForm || editing ? (
        <div className="glass-card rounded-2xl border border-border p-4">
          <RoundLogForm
            listingId={listingId}
            listingName={listingName}
            round={editing}
            onDone={onDone}
          />
          <button
            onClick={() => { setShowForm(false); setEditing(null); }}
            className="text-sm text-muted-foreground mt-3"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {rounds.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '18-hole', stat: stats18 },
                { label: '9-hole', stat: stats9 },
              ].map(({ label, stat }) => (
                <div key={label} className="glass-card rounded-2xl border border-border p-3">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-lg font-extrabold text-primary">{stat ? stat.rounds : '—'}</div>
                      <div className="text-[10px] text-muted-foreground">Rounds</div>
                    </div>
                    <div>
                      <div className="text-lg font-extrabold">{stat ? stat.avg : '—'}</div>
                      <div className="text-[10px] text-muted-foreground">Avg</div>
                    </div>
                    <div>
                      <div className="text-lg font-extrabold">{stat ? stat.best : '—'}</div>
                      <div className="text-[10px] text-muted-foreground">Best</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No rounds logged at this venue yet.
            </p>
          ) : (
            <div className="space-y-2">
              {rounds.slice(0, 5).map((r) => (
                <div key={r.id} className="glass-card rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{r.score}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{r.holes} holes</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{format(parseISO(r.date), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(r)} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1.5">{r.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}