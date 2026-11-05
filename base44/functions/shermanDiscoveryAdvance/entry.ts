import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// ============================================================
// shermanDiscoveryAdvance — admin-only driver for the stepwise
// discovery run.
//
// The run function intentionally processes one query per request so
// a run is short and resumable. This driver walks it forward, one
// step at a time, strictly sequentially (concurrent steps would both
// read the same checkpoint and lose an update).
//
// It stops on: terminal status, the spend cap, or max_steps. It owns
// no verification logic — every gate stays in the run function.
// ============================================================

const RUN_FUNCTION = 'shermanDiscoveryRun';
const MAX_STEPS_CEILING = 12;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth
      .me()
      .catch((e) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id || '').trim();
    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const requested = Math.floor(Number(body.max_steps) || 6);
    const maxSteps = Math.min(Math.max(requested, 1), MAX_STEPS_CEILING);

    const history: any[] = [];
    let terminal = false;
    let progress: any = null;

    for (let i = 0; i < maxSteps; i++) {
      const res = await base44.functions.invoke(RUN_FUNCTION, {
        action: 'step',
        job_id: jobId,
        terse: true,
      });
      const data = res?.data || {};

      if (data.error) {
        return Response.json({ error: data.error, history, progress }, { status: 400 });
      }

      progress = data.progress || progress;
      terminal = data.terminal === true;
      history.push({
        query: data.step?.query || '',
        category: data.step?.category || '',
        leads: data.step?.leads_returned ?? null,
        accepted: data.step?.accepted ?? null,
        rejected: data.step?.rejected ?? null,
        duplicate: data.step?.duplicate ?? null,
        errors: data.step?.errors?.length || 0,
        terminal,
      });

      if (terminal) break;
    }

    return Response.json({ terminal, steps_run: history.length, progress, history });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}