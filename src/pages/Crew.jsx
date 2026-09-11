import { useEffect, useState, useCallback } from 'react';
import { Search, UserPlus, Ban, Check, X, Users, Shield } from 'lucide-react';
import { getCrew, getRequests, searchUser, sendRequest, respondRequest, blockUser } from '@/lib/golfData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
    <div className="safe-top px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-heading">Crew</h1>
        <p className="text-sm text-muted-foreground">Connect with golfers by exact username</p>
      </header>

      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter exact username" className="h-11" />
        <Button type="submit" className="h-11 px-4" disabled={searching || !query.trim()}>
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {searching && <div className="text-center text-sm text-muted-foreground py-3">Searching…</div>}
      {result === null && !searching && (
        <div className="text-center text-sm text-muted-foreground py-3">No golfer found with that username.</div>
      )}
      {result && (
        <div className="rounded-xl bg-card border border-border p-3 mb-4 flex items-center gap-3">
          <Avatar><AvatarFallback className="bg-primary text-primary-foreground">{result.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{result.name}</div>
            <div className="text-xs text-muted-foreground">@{result.username}</div>
          </div>
          <Button size="sm" onClick={() => handleSend(result)} className="h-9"><UserPlus className="h-4 w-4 mr-1" />Add</Button>
          <Button size="sm" variant="secondary" onClick={() => handleBlock(result.id)} className="h-9"><Ban className="h-4 w-4" /></Button>
        </div>
      )}

      {incoming.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Requests</h2>
          <div className="space-y-2 mb-5">
            {incoming.map((r) => (
              <div key={r.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
                <Avatar><AvatarFallback className="bg-secondary">{r.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">@{r.username}</div>
                </div>
                <Button size="sm" onClick={() => handleRespond(r.id, 'accept')} className="h-9"><Check className="h-4 w-4" /></Button>
                <Button size="sm" variant="secondary" onClick={() => handleRespond(r.id, 'decline')} className="h-9"><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Connections</h2>
      {loading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-card animate-pulse" />)}</div>
      ) : connections.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No connections yet.</p>
          <p className="text-xs mt-1">Find golfers by their exact username.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <div key={c.id} className="rounded-xl bg-card border border-border p-3 flex items-center gap-3">
              <Avatar><AvatarFallback className="bg-secondary">{c.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">@{c.username}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => handleBlock(c.id)} className="h-9"><Ban className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-xl bg-secondary/50 border border-border p-3 flex gap-2">
        <Shield className="h-4 w-4 text-accent shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Crew is invite-only. Your rounds, location, and contact info stay private. Block or report anyone from their profile.
        </p>
      </div>
    </div>
  );
}