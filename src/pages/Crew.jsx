import { useEffect, useState, useCallback } from 'react';
import { Search, UserPlus, Ban, Check, X, Users, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import GlassHeader from '@/components/golf/GlassHeader';
import { CrewRowSkeleton } from '@/components/golf/Shimmer';
import { getCrew, getRequests, searchUser, sendRequest, respondRequest, blockUser } from '@/lib/golfData';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function Crew() {
  const [connections, setConnections] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(undefined);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r] = await Promise.all([getCrew(), getRequests()]);
    setConnections(c);
    setRequests(r);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = async () => {
    setSearching(true);
    setResult(undefined);
    const u = await searchUser(query);
    setResult(u);
    setSearching(false);
  };

  const handleSend = async (u) => { await sendRequest(u); setResult(undefined); setQuery(''); await load(); };
  const handleRespond = async (id, action) => { await respondRequest(id, action); await load(); };
  const handleBlock = async (id) => { await blockUser(id); setResult(undefined); await load(); };

  const incoming = requests.filter((r) => r.status === 'incoming');

  return (
    <div>
      <GlassHeader>
        <div className="h-[60px] px-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold leading-none">Crew</h1>
            <p className="text-xs text-muted-foreground mt-1">Connect with golfers by exact username</p>
          </div>
          <Users className="h-5 w-5 text-accent" />
        </div>
      </GlassHeader>

      <div className="sticky top-[calc(60px+env(safe-area-inset-top))] z-30 glass border-b border-border px-4 py-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter exact username" className="h-11 glass-card border-border rounded-2xl" />
          <motion.button whileTap={{ scale: 0.92 }} type="submit" disabled={searching || !query.trim()} className="h-11 w-11 rounded-2xl bg-primary text-primary-foreground grid place-items-center disabled:opacity-50">
            <Search className="h-4 w-4" />
          </motion.button>
        </form>
      </div>

      {searching && <div className="text-center text-sm text-muted-foreground py-4">Searching…</div>}
      {result === null && !searching && (
        <div className="text-center text-sm text-muted-foreground py-4">No golfer found with that username.</div>
      )}
      {result && (
        <div className="m-4 rounded-2xl bg-card border border-border p-3 flex items-center gap-3">
          <Avatar><AvatarFallback className="bg-primary text-primary-foreground">{result.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{result.name}</div>
            <div className="text-xs text-muted-foreground">@{result.username}</div>
          </div>
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => handleSend(result)} className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1">
            <UserPlus className="h-4 w-4" />Add
          </motion.button>
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => handleBlock(result.id)} className="h-9 w-9 rounded-full bg-secondary grid place-items-center">
            <Ban className="h-4 w-4" />
          </motion.button>
        </div>
      )}

      {incoming.length > 0 && (
        <>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4 mt-2">Requests</h2>
          <div className="mb-4">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
                <Avatar><AvatarFallback className="bg-secondary">{r.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">@{r.username}</div>
                </div>
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => handleRespond(r.id, 'accept')} className="h-9 w-9 rounded-full bg-accent text-accent-foreground grid place-items-center">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </motion.button>
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => handleRespond(r.id, 'decline')} className="h-9 w-9 rounded-full bg-secondary grid place-items-center">
                  <X className="h-4 w-4" strokeWidth={3} />
                </motion.button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-4">Connections</h2>
      {loading ? (
        <div>{[...Array(3)].map((_, i) => <CrewRowSkeleton key={i} />)}</div>
      ) : connections.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground px-6">
          <div className="h-16 w-16 rounded-full bg-secondary/60 grid place-items-center mx-auto mb-4">
            <Users className="h-7 w-7 opacity-50" />
          </div>
          <p className="font-semibold text-foreground">No connections yet</p>
          <p className="text-sm mt-1">Find golfers by their exact username above.</p>
        </div>
      ) : (
        <div>
          {connections.map((c) => (
            <motion.div key={c.id} whileTap={{ scale: 0.99 }} className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Avatar><AvatarFallback className="bg-secondary">{c.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">@{c.username}</div>
              </div>
              <motion.button whileTap={{ scale: 0.92 }} onClick={() => handleBlock(c.id)} className="h-9 w-9 rounded-full bg-secondary grid place-items-center">
                <Ban className="h-4 w-4" />
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}

      <div className="m-4 rounded-2xl bg-secondary/40 border border-border p-3.5 flex gap-2.5">
        <Shield className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Crew is invite-only. Your rounds, location, and contact info stay private. Block or report anyone from their profile.
        </p>
      </div>
    </div>
  );
}