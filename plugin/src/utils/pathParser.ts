export type Point = { x: number; y: number };

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: p0.x * uuu + 3 * p1.x * uu * t + 3 * p2.x * u * tt + p3.x * ttt,
    y: p0.y * uuu + 3 * p1.y * uu * t + 3 * p2.y * u * tt + p3.y * ttt,
  };
}

function quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return {
    x: p0.x * uu + 2 * p1.x * u * t + p2.x * tt,
    y: p0.y * uu + 2 * p1.y * u * t + p2.y * tt,
  };
}

function arcToPoints(from: Point, to: Point, segments = 16): Point[] {
  // basic approximation: straight line path for now
  const out: Point[] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    out.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return out;
}

function supportCubicSample(points: Point[], current: Point, ctrl1: Point, ctrl2: Point, to: Point): Point {
  const samples = 8;
  for (let j = 1; j <= samples; j++) {
    const p = cubicBezier(current, ctrl1, ctrl2, to, j / samples);
    points.push(p);
  }
  return to;
}

function supportQuadraticSample(points: Point[], current: Point, ctrl: Point, to: Point): Point {
  const samples = 8;
  for (let j = 1; j <= samples; j++) {
    const p = quadraticBezier(current, ctrl, to, j / samples);
    points.push(p);
  }
  return to;
}

export function parsePathData(path: string): Point[] {
  const tokens = path.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return [];

  const points: Point[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let prevCmd = '';
  let lastCtrlX = 0;
  let lastCtrlY = 0;

  const pushPoint = (px: number, py: number) => {
    points.push({ x: px, y: py });
    x = px;
    y = py;
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (!cmd) break;
    switch (cmd) {
      case 'M': {
        const nx = parseFloat(tokens[i++] ?? '0');
        const ny = parseFloat(tokens[i++] ?? '0');
        x = nx;
        y = ny;
        startX = x;
        startY = y;
        points.push({ x, y });
        prevCmd = 'M';
        break;
      }
      case 'm': {
        const dx = parseFloat(tokens[i++] ?? '0');
        const dy = parseFloat(tokens[i++] ?? '0');
        x += dx;
        y += dy;
        startX = x;
        startY = y;
        points.push({ x, y });
        prevCmd = 'm';
        break;
      }
      case 'L':
      case 'l': {
        const isRel = cmd === 'l';
        const nx = parseFloat(tokens[i++] ?? '0');
        const ny = parseFloat(tokens[i++] ?? '0');
        const px = isRel ? x + nx : nx;
        const py = isRel ? y + ny : ny;
        pushPoint(px, py);
        prevCmd = cmd;
        break;
      }
      case 'H':
      case 'h': {
        const isRel = cmd === 'h';
        const value = parseFloat(tokens[i++] ?? '0');
        const px = isRel ? x + value : value;
        pushPoint(px, y);
        prevCmd = cmd;
        break;
      }
      case 'V':
      case 'v': {
        const isRel = cmd === 'v';
        const value = parseFloat(tokens[i++] ?? '0');
        const py = isRel ? y + value : value;
        pushPoint(x, py);
        prevCmd = cmd;
        break;
      }
      case 'C':
      case 'c': {
        const isRel = cmd === 'c';
        const x1 = parseFloat(tokens[i++] ?? '0');
        const y1 = parseFloat(tokens[i++] ?? '0');
        const x2 = parseFloat(tokens[i++] ?? '0');
        const y2 = parseFloat(tokens[i++] ?? '0');
        const x3 = parseFloat(tokens[i++] ?? '0');
        const y3 = parseFloat(tokens[i++] ?? '0');
        const ctrl1 = { x: isRel ? x + x1 : x1, y: isRel ? y + y1 : y1 };
        const ctrl2 = { x: isRel ? x + x2 : x2, y: isRel ? y + y2 : y2 };
        const to = { x: isRel ? x + x3 : x3, y: isRel ? y + y3 : y3 };
        const currentPoint = { x, y };
        supportCubicSample(points, currentPoint, ctrl1, ctrl2, to);
        lastCtrlX = ctrl2.x;
        lastCtrlY = ctrl2.y;
        prevCmd = cmd;
        x = to.x;
        y = to.y;
        break;
      }
      case 'S':
      case 's': {
        const isRel = cmd === 's';
        const x2 = parseFloat(tokens[i++] ?? '0');
        const y2 = parseFloat(tokens[i++] ?? '0');
        const x3 = parseFloat(tokens[i++] ?? '0');
        const y3 = parseFloat(tokens[i++] ?? '0');

        let ctrl1: Point;
        if (prevCmd === 'C' || prevCmd === 'c' || prevCmd === 'S' || prevCmd === 's') {
          ctrl1 = { x: x + (x - lastCtrlX), y: y + (y - lastCtrlY) };
        } else {
          ctrl1 = { x, y };
        }
        const ctrl2 = { x: isRel ? x + x2 : x2, y: isRel ? y + y2 : y2 };
        const to = { x: isRel ? x + x3 : x3, y: isRel ? y + y3 : y3 };
        supportCubicSample(points, { x, y }, ctrl1, ctrl2, to);
        lastCtrlX = ctrl2.x;
        lastCtrlY = ctrl2.y;
        prevCmd = cmd;
        x = to.x;
        y = to.y;
        break;
      }
      case 'Q':
      case 'q': {
        const isRel = cmd === 'q';
        const x1 = parseFloat(tokens[i++] ?? '0');
        const y1 = parseFloat(tokens[i++] ?? '0');
        const x2 = parseFloat(tokens[i++] ?? '0');
        const y2 = parseFloat(tokens[i++] ?? '0');
        const ctrl = { x: isRel ? x + x1 : x1, y: isRel ? y + y1 : y1 };
        const to = { x: isRel ? x + x2 : x2, y: isRel ? y + y2 : y2 };
        supportQuadraticSample(points, { x, y }, ctrl, to);
        lastCtrlX = ctrl.x;
        lastCtrlY = ctrl.y;
        prevCmd = cmd;
        x = to.x;
        y = to.y;
        break;
      }
      case 'T':
      case 't': {
        const isRel = cmd === 't';
        const x2 = parseFloat(tokens[i++] ?? '0');
        const y2 = parseFloat(tokens[i++] ?? '0');
        const to = { x: isRel ? x + x2 : x2, y: isRel ? y + y2 : y2 };
        let ctrl: Point;
        if (prevCmd === 'Q' || prevCmd === 'q' || prevCmd === 'T' || prevCmd === 't') {
          ctrl = { x: x + (x - lastCtrlX), y: y + (y - lastCtrlY) };
        } else {
          ctrl = { x, y };
        }
        supportQuadraticSample(points, { x, y }, ctrl, to);
        lastCtrlX = ctrl.x;
        lastCtrlY = ctrl.y;
        prevCmd = cmd;
        x = to.x;
        y = to.y;
        break;
      }
      case 'A':
      case 'a': {
        const isRel = cmd === 'a';
        const rx = parseFloat(tokens[i++] ?? '0');
        const ry = parseFloat(tokens[i++] ?? '0');
        const xAxisRotation = parseFloat(tokens[i++] ?? '0');
        const largeArcFlag = parseInt(tokens[i++] ?? '0', 10);
        const sweepFlag = parseInt(tokens[i++] ?? '0', 10);
        const x2 = parseFloat(tokens[i++] ?? '0');
        const y2 = parseFloat(tokens[i++] ?? '0');
        const to = { x: isRel ? x + x2 : x2, y: isRel ? y + y2 : y2 };
        arcToPoints({ x, y }, to, 12).forEach((pt) => points.push(pt));
        x = to.x;
        y = to.y;
        prevCmd = cmd;
        break;
      }
      case 'Z':
      case 'z':
        x = startX;
        y = startY;
        points.push({ x, y });
        prevCmd = cmd;
        break;
      default:
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) i++;
        break;
    }
  }

  return points.filter((p, idx) => idx === 0 || p.x !== points[idx - 1].x || p.y !== points[idx - 1].y);
}
