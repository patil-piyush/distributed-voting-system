// clock.js

// Compare two vector clocks. Returns:
//   'equal'      — identical
//   'before'     — a happened-before b
//   'after'      — a happened-after b
//   'concurrent' — neither happened-before the other
export function compareVectors(a, b) {
  let aBeforeB = false; // at least one component where a < b
  let bBeforeA = false; // at least one component where b < a
  
  if (!a || !b) return 'unknown';

  // Collect all keys from both vectors.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    if (va < vb) aBeforeB = true;
    if (va > vb) bBeforeA = true;
  }
  if (!aBeforeB && !bBeforeA) return 'equal';
  if (aBeforeB && !bBeforeA) return 'before';
  if (!aBeforeB && bBeforeA) return 'after';
  return 'concurrent';
}

export function formatVector(v) {
  if (!v) return '';
  return '{ ' + Object.entries(v)
    .filter(([_, val]) => val > 0)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([k, val]) => `${k.replace('node', 'n')}:${val}`)
    .join(', ') + ' }';
}
