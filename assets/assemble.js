// Balanced, stratified test assembly (pure; shared by browser and tests).
const BLUEPRINT = { 'number-series': 3, 'letter-series': 2, relations: 2, matrix: 4, rotation: 3, syllogism: 3, ordering: 3, verbal: 0 };

export function assembleTest(bank, seen = new Set(), random = Math.random, length = 20) {
  const items = [];
  for (const [type, n] of Object.entries(BLUEPRINT)) {
    const pool = bank.filter((x) => x.type === type).sort((a, b) => a.difficulty - b.difficulty);
    const fresh = pool.filter((x) => !seen.has(x.id));
    const src = fresh.length >= n ? fresh : pool;
    // Stratify: one item from each difficulty slice.
    for (let k = 0; k < n && src.length; k++) {
      const lo = Math.floor((k * src.length) / n);
      const hi = Math.max(lo + 1, Math.floor(((k + 1) * src.length) / n));
      items.push(src[lo + Math.floor(random() * (hi - lo))]);
    }
  }
  // Easy-to-hard overall, as in standard reasoning tests.
  return items.slice(0, length).sort((a, b) => a.difficulty - b.difficulty);
}

