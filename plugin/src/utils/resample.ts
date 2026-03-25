import { Point } from './pathParser';

export function pathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.hypot(dx, dy);
  }
  return length;
}

export function resample(points: Point[], m: number): Point[] {
  if (points.length === 0 || m <= 0) return [];
  if (points.length === 1) return Array(m).fill(points[0]);

  const segments: { length: number; start: Point; end: Point }[] = [];
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const len = Math.hypot(end.x - start.x, end.y - start.y);
    if (len > 0) {
      segments.push({ length: len, start, end });
      total += len;
    }
  }

  if (total === 0) {
    return Array(m).fill(points[0]);
  }

  const out: Point[] = [];

  for (let k = 0; k < m; k++) {
    const target = (k / (m - 1)) * total;
    let acc = 0;
    for (const seg of segments) {
      if (acc + seg.length >= target || seg === segments[segments.length - 1]) {
        const local = Math.max(0, Math.min(1, (target - acc) / seg.length));
        out.push({
          x: seg.start.x + (seg.end.x - seg.start.x) * local,
          y: seg.start.y + (seg.end.y - seg.start.y) * local,
        });
        break;
      }
      acc += seg.length;
    }
  }

  return out;
}
