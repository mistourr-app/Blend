import { describe, expect, test } from 'vitest';
import { resample } from '../../src/utils/resample';
import { parsePathData } from '../../src/utils/pathParser';

describe('resample', () => {
  test('resample simple line', () => {
    const points = parsePathData('M 0 0 L 10 0');
    const sampled = resample(points, 5);
    expect(sampled).toHaveLength(5);
    expect(sampled[0]).toEqual({ x: 0, y: 0 });
    expect(sampled[4]).toEqual({ x: 10, y: 0 });
    expect(sampled[2].x).toBeCloseTo(5);
  });

  test('resample closed path with repeated points', () => {
    const points = parsePathData('M 0 0 L 0 10 L 10 10 L 10 0 Z');
    const sampled = resample(points, 8);
    expect(sampled).toHaveLength(8);
  });
});
