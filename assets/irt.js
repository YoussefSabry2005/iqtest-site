// Rasch (1PL) item response model. Shared by the browser (local scoring) and
// the pipeline (calibration). Pure functions, no dependencies.
export const p = (theta, b) => 1 / (1 + Math.exp(-(theta - b)));

const GRID = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05);

// Expected-a-posteriori ability with a standard-normal prior.
// responses: [{ b, correct }]  →  { theta, se }
export function estimateAbility(responses) {
  let wsum = 0; let mean = 0; let sq = 0;
  for (const t of GRID) {
    let lp = -0.5 * t * t;
    for (const r of responses) lp += Math.log(r.correct ? p(t, r.b) : 1 - p(t, r.b));
    const w = Math.exp(lp);
    wsum += w; mean += w * t; sq += w * t * t;
  }
  const m = mean / wsum;
  return { theta: m, se: Math.sqrt(Math.max(sq / wsum - m * m, 1e-9)) };
}

// Norms: { n, mean, sd, cdf: [{ theta, pct }] } built from completed tests on this site.
export const MIN_NORM_SAMPLE = 500;

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - q : q;
}

// Converts ability to the report the user sees. Honest by construction:
// without enough real completions the index is flagged provisional.
export function report(theta, se, norms) {
  const established = norms && norms.n >= MIN_NORM_SAMPLE;
  const mu = established ? norms.mean : 0;
  const sd = established ? norms.sd : 1;
  const z = (theta - mu) / sd;
  const index = Math.round(100 + 15 * z);
  const band = [Math.round(100 + 15 * ((theta - 1.96 * se - mu) / sd)), Math.round(100 + 15 * ((theta + 1.96 * se - mu) / sd))];
  let percentile;
  if (established && norms.cdf?.length) {
    const below = norms.cdf.filter((c) => c.theta <= theta);
    percentile = below.length ? below.at(-1).pct : 1;
  } else percentile = Math.round(normalCdf(z) * 100);
  return { index, band, percentile: Math.min(99, Math.max(1, percentile)), provisional: !established, sample: norms?.n || 0 };
}

// PROX calibration from aggregated item p-values (no person-level data needed).
// Shrinks toward the design prior when there are few attempts.
export function calibrate({ prior, attempts, correct, personMean = 0, personSd = 1 }) {
  if (!attempts) return prior;
  const pv = Math.min(0.98, Math.max(0.02, (correct + 0.5) / (attempts + 1)));
  const x = Math.sqrt(1 + (personSd * personSd) / 2.89);
  const est = personMean + x * Math.log((1 - pv) / pv);
  const w = attempts / (attempts + 50);
  return Math.round((w * est + (1 - w) * prior) * 100) / 100;
}

// Which skills to practise: biggest shortfall of actual vs. expected correct.
export function recommend(responses, theta) {
  const by = {};
  for (const r of responses) {
    by[r.skill] ??= { expected: 0, actual: 0, n: 0 };
    by[r.skill].expected += p(theta, r.b);
    by[r.skill].actual += r.correct ? 1 : 0;
    by[r.skill].n++;
  }
  return Object.entries(by).map(([skill, s]) => ({ skill, gap: s.expected - s.actual, accuracy: s.actual / s.n, n: s.n }))
    .sort((a, b) => b.gap - a.gap || a.accuracy - b.accuracy);
}
