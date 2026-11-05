import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Loader2,
  MapPin,
  Play,
  RefreshCw,
  ShieldQuestion,
  Square,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getShermanDiscoveryStatus,
  previewShermanDiscovery,
  startShermanDiscovery,
  stepShermanDiscovery,
  stopShermanDiscovery,
} from '@/lib/golfData';

const TERMINAL = new Set(['completed', 'completed_with_ceiling', 'failed', 'stopped']);

const STATUS_STYLE = {
  accepted: 'bg-primary/15 text-primary border-primary/30',
  pending: 'bg-rating/15 text-rating border-rating/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
  duplicate: 'bg-secondary text-muted-foreground border-border',
};

const STATUS_ICON = {
  accepted: CheckCircle2,
  pending: ShieldQuestion,
  rejected: XCircle,
  duplicate: Copy,
};

function errText(e) {
  return (
    e?.response?.data?.error ||
    e?.response?.data?.message ||
    e?.data?.error ||
    e?.message ||
    'Request failed'
  );
}

export default function AdminShermanImport() {
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState(30);
  const [maxCalls, setMaxCalls] = useState(24);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const p = await previewShermanDiscovery({ radius_miles: radius, max_openai_calls: maxCalls });
        if (!cancelled) {
          setPreview(p);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(errText(e));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [radius, maxCalls]);

  const summary = useMemo(() => {
    if (!job?.summary_json) return null;
    try {
      return JSON.parse(job.summary_json);
    } catch {
      return null;
    }
  }, [job]);

  const done = Number(job?.query_index) || 0;
  const total = Number(preview?.planned_query_count) || Number(job?.planned_queries?.length) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const running = busy || (job && !TERMINAL.has(job.status));
  const openaiReady = preview?.openai_configured === true;

  const runImport = async () => {
    setConfirmOpen(false);
    setBusy(true);
    setError('');
    stopRef.current = false;
    try {
      const started = await startShermanDiscovery({
        radius_miles: radius,
        max_openai_calls: maxCalls,
        confirm: 'RUN_SHERMAN_DISCOVERY',
      });
      let current = started?.job;
      if (!current) throw new Error(started?.message || started?.error || 'Could not start import');
      setJob(current);
      setCandidates(started.candidates || []);

      while (current && !TERMINAL.has(current.status) && !stopRef.current) {
        const stepped = await stepShermanDiscovery(current.id);
        current = stepped?.job || current;
        setJob(current);
        setCandidates(stepped?.candidates || []);
        if (stepped?.terminal) break;
        if (stepped?.error) {
          if (stepped.error !== 'openai_failed') setError(stepped.error);
          break;
        }
      }
    } catch (e) {
      const text = errText(e);
      setError(
        String(text).includes('missing_openai_key')
          ? 'OPENAI_API_KEY is not configured. Add it in Base44 Secrets first.'
          : text
      );
    }
    setBusy(false);
  };

  const handleStop = async () => {
    stopRef.current = true;
    if (!job?.id) return;
    try {
      const res = await stopShermanDiscovery(job.id);
      if (res?.job) setJob(res.job);
    } catch (e) {
      setError(errText(e));
    }
  };

  const refreshStatus = async () => {
    if (!job?.id) return;
    try {
      const res = await getShermanDiscoveryStatus(job.id);
      if (res?.job) setJob(res.job);
      setCandidates(res?.candidates || []);
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div className="space-y-4">
      {!openaiReady && !loading && (
        <div className="rounded-xl border border-rating/30 bg-rating/10 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-rating shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">OpenAI key not configured</p>
            <p className="mt-0.5">
              Add <span className="font-mono">OPENAI_API_KEY</span> on the Base44 Secrets page. This
              preview made no API calls and wrote nothing.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-card border border-border p-3">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">
              {preview?.center?.label || 'Sherman, TX'}
            </div>
            <div className="text-[11px] text-muted-foreground">
              One-time import. No workflow, cron, or scheduled recurrence.
            </div>
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Import radius</span>
            <span className="text-xs font-bold text-primary">{radius} mi</span>
          </div>
          <input
            type="range"
            min="5"
            max="30"
            step="5"
            value={radius}
            disabled={running || loading}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full mt-2 accent-primary"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Discovery boundary only. Players still see 15 miles by default (30 max, manually expanded).
          </p>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">OpenAI call ceiling</span>
            <span className="text-xs font-bold">{maxCalls}</span>
          </div>
          <div className="flex gap-2 mt-2">
            {[12, 24, 36].map((n) => (
              <button
                key={n}
                disabled={running || loading}
                onClick={() => setMaxCalls(n)}
                className={cn(
                  'h-9 flex-1 rounded-lg border text-xs font-semibold transition',
                  maxCalls === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-foreground border-border'
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading dry-run plan…
        </div>
      ) : preview ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Planned queries" value={preview.planned_query_count} />
            <Stat label="Max OpenAI calls" value={preview.estimated_openai_calls_upper_bound} />
            <Stat label="Candidate ceiling" value={preview.max_candidates} />
            <Stat label="Existing listings" value={preview.existing_listings_considered} />
          </div>

          {preview.queries_not_run_under_ceiling?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Ban className="h-3.5 w-3.5 text-rating" />
                {preview.queries_not_run_under_ceiling.length} queries will not run at this ceiling
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                They are listed in the run summary, never silently dropped.
              </div>
            </div>
          )}

          {preview.tiles_skipped?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="text-xs font-semibold mb-1">Tiles outside {preview.radius_miles} mi</div>
              <div className="text-[11px] text-muted-foreground">
                {preview.tiles_skipped.map((t) => `${t.city} (${t.distance_miles} mi)`).join(' · ')}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="h-11 flex-1"
              disabled={loading || running}
              onClick={() => setRadius((r) => r)}
            >
              <RefreshCw className="h-4 w-4" /> Dry run
            </Button>
            <Button
              className="h-11 flex-1"
              disabled={!openaiReady || busy}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Execute
            </Button>
          </div>
        </>
      ) : null}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {job && (
        <div className="rounded-xl bg-card border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                Run status: <span className="text-primary">{job.status}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Query {Math.min(done, total)} of {total} · {job.openai_calls_used || 0} OpenAI calls
              </div>
            </div>
            {!TERMINAL.has(job.status) ? (
              <Button variant="secondary" className="h-9 px-3" onClick={handleStop}>
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            ) : (
              <Button variant="secondary" className="h-9 px-3" onClick={refreshStatus}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <MiniStat label="Accepted" value={job.accepted_count || 0} tone="accepted" />
            <MiniStat label="Pending" value={job.pending_count || 0} tone="pending" />
            <MiniStat label="Rejected" value={job.rejected_count || 0} tone="rejected" />
            <MiniStat label="Duplicate" value={job.duplicate_count || 0} tone="duplicate" />
          </div>

          {summary && (
            <div className="mt-3 rounded-lg bg-secondary/60 p-2.5 text-[11px] text-muted-foreground space-y-0.5">
              <div>Actual API usage: {summary.openai_calls_used} calls · {summary.openai_input_tokens} input / {summary.openai_output_tokens} output tokens</div>
              <div>Source fetches: {summary.source_fetches_used} · Truncated leads: {summary.truncated_leads}</div>
              {summary.queries_unrun?.length > 0 && (
                <div>Unrun queries: {summary.queries_unrun.length}</div>
              )}
              {summary.note && <div>{summary.note}</div>}
            </div>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">Candidates ({candidates.length})</div>
          <div className="space-y-1.5">
            {candidates.slice(0, 25).map((c) => {
              const Icon = STATUS_ICON[c.status] || ShieldQuestion;
              return (
                <div key={c.id} className="rounded-lg bg-card border border-border px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{c.name || '(unnamed lead)'}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[c.city, c.state].filter(Boolean).join(', ')}
                        {c.distance_miles != null ? ` · ${c.distance_miles} mi` : ''}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{c.private_reason}</div>
                    </div>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border shrink-0', STATUS_STYLE[c.status] || STATUS_STYLE.duplicate)}>
                      {c.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Execute the Sherman import?</AlertDialogTitle>
            <AlertDialogDescription>
              This runs up to {preview?.estimated_openai_calls_upper_bound || maxCalls} paid OpenAI
              web_search calls within {radius} miles of Sherman, TX, fetches official venue sites, and
              may create approved listings that pass the existing trust gate. It cannot be undone from
              here. No schedule or workflow is created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runImport}>Execute import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value ?? '—'}</div>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div className={cn('rounded-lg border px-2 py-1.5', STATUS_STYLE[tone] || STATUS_STYLE.duplicate)}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}