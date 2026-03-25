import { parsePathData } from './utils/pathParser';
import { resample } from './utils/resample';
import { morphPoints, pointsToPathData, catmullRom } from './utils/interpolation';
import { Distribution, computeTArray, pickLimitedSteps } from './utils/distribution';

type MorphOptions = {
  previewQuality?: 'low' | 'medium' | 'high';
  smooth?: boolean;
  distribution?: Distribution;
  steps?: number;
  reverse?: boolean;
};

onmessage = (event) => {
  const message = event.data;
  if (!message?.type) return;

  if (message.type === 'morph-preview') {
    const { pathA, pathB, t, options } = message.payload as { pathA: string; pathB: string; t: number; options: MorphOptions };
    const sampleCount = options?.previewQuality === 'high' ? 128 : options?.previewQuality === 'low' ? 32 : 64;

    const pa = resample(parsePathData(pathA), sampleCount);
    const pb = resample(parsePathData(pathB), sampleCount);

    if (pa.length === 0 || pb.length === 0) {
      postMessage({ type: 'morph-preview-result', ok: false, message: 'Failed to parse paths or path empty.' });
      return;
    }

    let p = morphPoints(pa, pb, Math.max(0, Math.min(1, t)));
    if (options?.smooth) {
      const smooth = catmullRom(p, 8);
      if (smooth.length > 0) p = smooth;
    }
    const pathData = pointsToPathData(p);

    postMessage({ type: 'morph-preview-result', ok: true, pathData, t });
    return;
  }

  if (message.type === 'morph-final') {
    const { pathA, pathB, tArray, options } = message.payload as { pathA: string; pathB: string; tArray: number[]; options: MorphOptions };

    const sampleCount = 256;
    const pa = resample(parsePathData(pathA), sampleCount);
    const pb = resample(parsePathData(pathB), sampleCount);

    if (pa.length === 0 || pb.length === 0) {
      postMessage({ type: 'morph-final-result', ok: false, message: 'Failed to parse paths or path empty.' });
      return;
    }

    const results = tArray.map((t) => {
      let p = morphPoints(pa, pb, Math.max(0, Math.min(1, t)));
      if (options?.smooth) {
        const smooth = catmullRom(p, 8);
        if (smooth.length > 0) p = smooth;
      }
      return { t, pathData: pointsToPathData(p) };
    });

    postMessage({ type: 'morph-final-result', ok: true, results });
    return;
  }

  if (message.type === 'compute-t') {
    const { distribution, steps, reverse } = message.payload as { distribution: Distribution; steps: number; reverse: boolean };
    const tArray = computeTArray(distribution, steps, reverse);
    const selected = pickLimitedSteps(tArray, 16);
    postMessage({ type: 'compute-t-result', ok: true, tArray, selected });
  }
};
