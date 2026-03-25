export type Distribution = 'uniform' | 'fibonacci';

export function computeTArray(distribution: Distribution, steps: number, reverse: boolean): number[] {
  if (steps <= 0) return [];
  let t: number[] = [];

  if (distribution === 'uniform') {
    for (let k = 1; k <= steps; k++) t.push(k / (steps + 1));
  } else {
    const fib = [1, 1];
    while (fib.length < steps + 1) fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
    const slice = fib.slice(0, steps + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    let cum = 0;
    for (let k = 1; k <= steps; k++) {
      cum += slice[k - 1];
      t.push(cum / sum);
    }
  }

  if (reverse) {
    return t.map((v) => 1 - v).reverse();
  }
  return t;
}

export function pickLimitedSteps(tArray: number[], maxObjects = 16): number[] {
  if (tArray.length <= maxObjects) return [...tArray];

  const result: number[] = [];
  const remaining = [...tArray];

  for (let k = 0; k < maxObjects; k++) {
    const a = k / maxObjects;
    const b = (k + 1) / maxObjects;
    const center = (a + b) / 2;
    const bucket = remaining.filter((t) => t >= a && t < b);

    if (bucket.length > 0) {
      const nearest = bucket.reduce((best, curr) => (Math.abs(curr - center) < Math.abs(best - center) ? curr : best), bucket[0]);
      result.push(nearest);
      const idx = remaining.indexOf(nearest);
      if (idx >= 0) remaining.splice(idx, 1);
      continue;
    }

    const nearestAll = remaining.reduce((best, curr) => (Math.abs(curr - center) < Math.abs(best - center) ? curr : best), remaining[0]);
    result.push(nearestAll);
    const idx = remaining.indexOf(nearestAll);
    if (idx >= 0) remaining.splice(idx, 1);
  }

  return Array.from(new Set(result)).sort((a, b) => a - b).slice(0, maxObjects);
}
