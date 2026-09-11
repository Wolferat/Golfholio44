import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Users } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { matchContacts } from '@/lib/golfData';

const CONSENT_KEY = 'golfolio_contacts_consent';

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function GolfersCircle({ golfers, onGolfers, consented, onConsented }) {
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');

  const runMatch = async (phones) => {
    setLoading(true);
    try {
      const matches = await matchContacts(phones);
      onGolfers(matches);
      onConsented(true);
      try { localStorage.setItem(CONSENT_KEY, '1'); } catch {}
    } catch {}
    setLoading(false);
  };

  const handleMatch = async () => {
    setLoading(true);
    let phones = [];
    try {
      if (navigator.contacts && navigator.contacts.select) {
        const contacts = await navigator.contacts.select(['tel'], { multiple: true });
        phones = contacts.flatMap((c) => c.tel || []);
      }
    } catch {}
    setLoading(false);
    if (!phones.length) { setManualOpen(true); return; }
    runMatch(phones);
  };

  const handleManualSubmit = async () => {
    const phones = manual.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!phones.length) return;
    setManualOpen(false);
    runMatch(phones);
  };

  if (!consented) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-center gap-2 text-primary">
          <Users className="h-4 w-4" />
          <span className="text-sm font-semibold">Golfers you know</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Find golfers from your contacts. We only check phone numbers — we never store your address book.
        </p>
        {manualOpen ? (
          <div className="mt-3">
            <textarea
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Enter phone numbers, comma separated"
              className="w-full rounded-xl bg-background/60 border border-border p-3 text-sm h-20 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleManualSubmit} disabled={loading} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                {loading ? 'Matching…' : 'Match'}
              </button>
              <button onClick={() => setManualOpen(false)} className="h-10 px-4 rounded-xl border border-border text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleMatch}
            disabled={loading}
            className="mt-3 w-full h-11 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" /> {loading ? 'Matching…' : 'Match my contacts'}
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4 flex gap-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-12 w-12 rounded-full shimmer" />)}
      </div>
    );
  }

  if (!golfers.length) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-center gap-2 text-primary">
          <Users className="h-4 w-4" />
          <span className="text-sm font-semibold">Golfers you know</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">No contacts on Golfolio yet. Invite a friend to play!</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Golfers you know</span>
        <span className="text-xs text-muted-foreground">{golfers.length} nearby</span>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <div className="flex">
          {golfers.slice(0, 5).map((g, i) => (
            <Avatar key={g.id} className="h-11 w-11 border-2 border-card -ml-2 first:ml-0" style={{ zIndex: 5 - i }}>
              {g.avatar ? <AvatarImage src={g.avatar} /> : null}
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">{initials(g.name)}</AvatarFallback>
            </Avatar>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">In your circle</span>
      </div>
    </div>
  );
}