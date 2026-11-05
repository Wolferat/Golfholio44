// ============================================================
// Usage budget — a hard spend ceiling for the discovery pipeline.
//
// The cap is enforced BEFORE a step spends anything, from the
// counters already persisted on the job, so a resumed run can never
// creep past it. Estimates deliberately round up: the point of a
// ceiling is to be wrong in the safe direction.
//
// Unit prices (USD, list rates, conservative):
//   OpenAI gpt-4.1-mini   input $0.40 / 1M tokens
//                         output $1.60 / 1M tokens
//   OpenAI web-search tool $25 / 1000 calls
//   Google Geocoding      $5 / 1000 calls
//   Official page fetches free
// ============================================================

export const COST_CAP_USD = 3.75;

const OPENAI_INPUT_PER_TOKEN = 0.4 / 1_000_000;
const OPENAI_OUTPUT_PER_TOKEN = 1.6 / 1_000_000;
const OPENAI_SEARCH_PER_CALL = 0.025;
const GEOCODE_PER_CALL = 0.005;

// Upper bound on what a job has spent so far, from persisted counters.
// Geocodes are not counted individually, so every candidate is charged
// one geocode — an over-estimate, which is what a ceiling needs.
export function estimateJobCost(job: any): number {
  const calls = Number(job?.openai_calls_used) || 0;
  const inputTokens = Number(job?.openai_input_tokens) || 0;
  const outputTokens = Number(job?.openai_output_tokens) || 0;
  const candidates = Number(job?.candidates_found) || 0;

  const cost =
    calls * OPENAI_SEARCH_PER_CALL +
    inputTokens * OPENAI_INPUT_PER_TOKEN +
    outputTokens * OPENAI_OUTPUT_PER_TOKEN +
    candidates * GEOCODE_PER_CALL;

  return Math.round(cost * 10000) / 10000;
}

// Headroom reserved for the step about to run (one search call, one
// geocode per lead, plus token growth).
export function nextStepReserve(maxLeads: number): number {
  return OPENAI_SEARCH_PER_CALL + Math.max(1, maxLeads) * GEOCODE_PER_CALL + 0.01;
}

export function isOverBudget(job: any): boolean {
  return estimateJobCost(job) >= COST_CAP_USD;
}

export function remainingBudget(job: any): number {
  return Math.max(0, Math.round((COST_CAP_USD - estimateJobCost(job)) * 10000) / 10000);
}