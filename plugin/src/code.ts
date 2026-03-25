/// <reference types="@figma/plugin-typings" />
/// <reference lib="dom" />

import { computeTArray, pickLimitedSteps, Distribution } from './utils/distribution';

// __html__ injected by Figma build pipeline
// (keep for editor type awareness if not already from @figma/plugin-typings)
// declare const __html__: string;

// Main controller for Blend plugin
// Handles selection, UI events, and worker communication.

figma.showUI(__html__, { width: 360, height: 560 });

const worker = new Worker('worker.js');
let previewNode: VectorNode | null = null;

function getVectorPath(node: SceneNode): string | null {
  if (node.type !== 'VECTOR') return null;
  const vectorNode = node as VectorNode;
  const path = vectorNode.vectorPaths?.[0]?.data;
  if (typeof path !== 'string') return null;
  return path;
}

function checkSelection(): {ok: boolean; message: string; paths?: [string, string]} {
  const selection = figma.currentPage.selection;
  if (selection.length !== 2) {
    return { ok: false, message: 'Select exactly 2 vector open paths.' };
  }

  const paths = selection.map((node) => getVectorPath(node));
  if (paths[0] == null || paths[1] == null) {
    return { ok: false, message: 'Both selected nodes must be Vector nodes with a path.' };
  }

  return { ok: true, message: 'Selection OK.', paths: [paths[0], paths[1]] as [string, string] };
}

function makePreviewNode(pathData: string) {
  if (!previewNode || !figma.currentPage.selection.includes(previewNode)) {
    if (previewNode) previewNode.remove();
    previewNode = figma.createVector();
    previewNode.name = 'Blend preview';
    previewNode.resize(1, 1); // keep minimal;
    figma.currentPage.appendChild(previewNode);
  }
  previewNode.vectorPaths = [{ data: pathData, windingRule: 'NONZERO' }];
  figma.currentPage.selection = [previewNode];
}

figma.ui.onmessage = (msg) => {
  if (msg.type === 'check-selection') {
    const result = checkSelection();
    figma.ui.postMessage({ type: 'selection-status', ...result });
  }

  if (msg.type === 'preview') {
    const result = checkSelection();
    if (!result.ok || !result.paths) {
      figma.ui.postMessage({ type: 'preview-result', ok: false, message: result.message });
      return;
    }

    worker.postMessage({
      type: 'morph-preview',
      payload: {
        pathA: result.paths[0],
        pathB: result.paths[1],
        t: msg.payload.t,
        options: msg.payload.options,
      },
    });
  }

  if (msg.type === 'apply') {
    const result = checkSelection();
    if (!result.ok || !result.paths) {
      figma.ui.postMessage({ type: 'apply-result', ok: false, message: result.message });
      return;
    }

    const { options } = msg.payload;
    const tArray = computeTArray(options.distribution as Distribution, options.steps ?? 8, options.reverse ?? false);
    const selectedT = pickLimitedSteps(tArray, 16);

    worker.postMessage({
      type: 'morph-final',
      payload: {
        pathA: result.paths[0],
        pathB: result.paths[1],
        tArray: selectedT,
        options,
      },
    });
  }
};

worker.onmessage = (event) => {
  const message = event.data;

  if (message?.type === 'morph-preview-result') {
    if (message.ok && typeof message.pathData === 'string') {
      makePreviewNode(message.pathData);
      figma.ui.postMessage({ type: 'preview-result', ok: true, t: message.t, pathData: message.pathData });
    } else {
      figma.ui.postMessage({ type: 'preview-result', ok: false, message: message.message || 'Preview failed' });
    }
    return;
  }

  if (message?.type === 'morph-final-result') {
    if (!message.ok) {
      figma.ui.postMessage({ type: 'apply-result', ok: false, message: message.message || 'Apply failed' });
      return;
    }

    const nodes: VectorNode[] = [];
    for (const item of message.results) {
      const node = figma.createVector();
      node.vectorPaths = [{ data: item.pathData, windingRule: 'NONZERO' }];
      nodes.push(node);
    }

    const group = figma.group(nodes, figma.currentPage);
    group.name = `Blend result (${new Date().toISOString().slice(0, 10)})`;
    figma.currentPage.selection = nodes;
    figma.viewport.scrollAndZoomIntoView(nodes);

    figma.ui.postMessage({ type: 'apply-result', ok: true, message: `Created ${nodes.length} morph objects` });
  }
};

