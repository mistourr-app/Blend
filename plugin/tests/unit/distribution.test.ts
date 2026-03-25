import { describe, expect, test } from 'vitest';
import { computeTArray, pickLimitedSteps } from '../../src/utils/distribution';

describe('distribution', () => {
  test('computeTArray uniform', () => {
    expect(computeTArray('uniform', 4, false)).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  test('computeTArray fibonacci', () => {
    const t = computeTArray('fibonacci', 4, false);
    expect(t.length).toBe(4);
    expect(t[0]).toBeCloseTo(1 / 12);
    expect(t[3]).toBeCloseTo(7 / 12);
  });

  test('computeTArray reverse', () => {
    expect(computeTArray('uniform', 3, true)).toEqual([0.25, 0.5, 0.75]);
  });

  test('pickLimitedSteps below limit returns same', () => {
    const t = [0.1, 0.3, 0.6, 0.9];
    expect(pickLimitedSteps(t, 16)).toEqual(t);
  });

  test('pickLimitedSteps above limit returns 16', () => {
    const t = Array.from({ length: 40 }, (_, i) => (i + 1) / 41);
    expect(pickLimitedSteps(t, 16).length).toBe(16);
    expect(pickLimitedSteps(t, 16)[0]).toBeGreaterThan(0);
    expect(pickLimitedSteps(t, 16).slice(-1)[0]).toBeLessThan(1);
  });
});
