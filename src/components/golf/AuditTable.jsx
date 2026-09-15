import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_STYLES = {
  'Reject': 'text-destructive bg-destructive/10 border-destructive/30',
  'Keep hidden': 'text-muted-foreground bg-secondary border-border',
  'Re-verify': 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
  'Suppress photo / re-verify photo': 'text-orange-500 bg-orange-500/10 border-orange-500/30',
  'Duplicate review': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  'Flag for human review': 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  'Expire/archive': 'text-muted-foreground bg-secondary border-border',
  'Keep approved': 'text-primary bg-primary/10 border-primary/30',
};

export default function AuditTable({ table, summary }) {
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const actions = useMemo(() => {
    const counts = {};
    for (const row of table) {
      counts[row.recommended_action] = (counts[row.recommended_action] || 0) + 1;
    }
    return counts;
  }, [table]);

  const filtered = useMemo(() => {
    return table.filter((row) => {
      if (actionFilter !== 'all' && row.recommended_action !== actionFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (row.name || '').toLowerCase().includes(q) || (row.city || '').toLowerCase().includes(q) || (row.id || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [table, query, actionFilter]);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {summary.total} listings audited · {table.length} rows in table
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, city, or ID…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-card border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <FilterChip active={actionFilter === 'all'} onClick={() => setActionFilter('all')} label={`All (${table.length})`} />
        {Object.entries(actions).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
          <FilterChip key={action} active={actionFilter === action} onClick={() => setActionFilter(action)} label={`${action} (${count})`} />
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-2 py-2 font-medium"></th>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">City</th>
                <th className="px-2 py-2 font-medium text-right">Dist</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Tier</th>
                <th className="px-2 py-2 font-medium text-right">Photos</th>
                <th className="px-2 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <>
                  <tr
                    key={row.id}
                    className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer"
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <td className="px-2 py-2">
                      {expanded === row.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </td>
                    <td className="px-2 py-2 font-medium truncate max-w-[140px]">{row.name}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.type}</td>
                    <td className="px-2 py-2 text-muted-foreground truncate max-w-[80px]">{row.city}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{row.distance != null ? `${row.distance}` : '—'}</td>
                    <td className="px-2 py-2">
                      <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-secondary">{row.status}</span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{row.verification_tier ?? '—'}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {row.photo_count}{!row.photo_verified && row.photo_count > 0 ? '⚠' : ''}
                    </td>
                    <td className="px-2 py-2">
                      <span className={cn('text-[10px] rounded-full px-1.5 py-0.5 border whitespace-nowrap', ACTION_STYLES[row.recommended_action] || 'bg-secondary border-border')}>
                        {row.recommended_action}
                      </span>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr className="bg-secondary/20">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="space-y-1.5">
                          <div><span className="text-muted-foreground">ID:</span> <code className="text-[10px]">{row.id}</code></div>
                          <div><span className="text-muted-foreground">Claim status:</span> {row.claim_status}</div>
                          <div><span className="text-muted-foreground">Source/website:</span> {row.source_url || '—'}</div>
                          <div>
                            <span className="text-muted-foreground">Audit reasons:</span>
                            {row.audit_reasons.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {row.audit_reasons.map((r) => (
                                  <span key={r} className="text-[10px] rounded-full px-2 py-0.5 bg-destructive/10 text-destructive border border-destructive/20">{r}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-primary ml-1">None — clean record</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">No records match this filter.</div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 px-3 rounded-full text-[11px] font-medium whitespace-nowrap border shrink-0 transition',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
      )}
    >
      {label}
    </button>
  );
}