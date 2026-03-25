import { Point } from './pathParser';

export function morphPoints(a: Point[], b: Point[], t: number): Point[] {
  const r = Math.max(0, Math.min(1, t));
  const m = Math.min(a.length, b.length);
  const out: Point[] = [];
  for (let i = 0; i < m; i++) {
    out.push({
      x: a[i].x * (1 - r) + b[i].x * r,
      y: a[i].y * (1 - r) + b[i].y * r,
    });
  }
  return out;
}

export function catmullRom(points: Point[], segments = 16): Point[] {
  if (points.length < 4) return points;

  const out: Point[] = [];
  const p = points;

  for (let i = 0; i < p.length - 3; i++) {
    const p0 = p[i];
    const p1 = p[i + 1];
    const p2 = p[i + 2];
    const p3 = p[i + 3];

    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const tt = t * t;
      const ttt = tt * t;

      const q1 = -0.5 * ttt + tt - 0.5 * t;
      const q2 = 1.5 * ttt - 2.5 * tt + 1;
      const q3 = -1.5 * ttt + 2 * tt + 0.5 * t;
      const q4 = 0.5 * ttt - 0.5 * tt;

      out.push({
        x: p0.x * q1 + p1.x * q2 + p2.x * q3 + p3.x * q4,
        y: p0.y * q1 + p1.y * q2 + p2.y * q3 + p3.y * q4,
      });
    }
  }

  return out;
}

export function pointsToPathData(points: Point[]): string {
  if (!points.length) return '';
  const parts: string[] = [];
  parts.push(`M ${points[0].x} ${points[0].y}`);
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i].x} ${points[i].y}`);
  }
  return parts.join(' ');
}
