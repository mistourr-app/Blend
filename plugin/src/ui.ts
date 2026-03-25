// UI script for Blend plugin.

const selectionStatusEl = document.getElementById('selection-status') as HTMLElement;
const logEl = document.getElementById('log') as HTMLElement;
const previewTEl = document.getElementById('preview-t') as HTMLInputElement;
const previewValueEl = document.getElementById('preview-value') as HTMLElement;

function log(message: string, type: 'info' | 'error' = 'info') {
  const el = document.createElement('div');
  el.textContent = message;
  el.className = type;
  logEl.prepend(el);
}

function sendCheckSelection() {
  parent.postMessage({ pluginMessage: { type: 'check-selection' } }, '*');
}

function sendPreview() {
  const t = Number(previewTEl.value);
  const options = {
    steps: Number((document.getElementById('steps') as HTMLInputElement).value),
    distribution: (document.getElementById('distribution') as HTMLSelectElement).value,
    reverse: (document.getElementById('reverse') as HTMLInputElement).checked,
    smooth: (document.getElementById('smooth') as HTMLInputElement).checked,
  };
  parent.postMessage({ pluginMessage: { type: 'preview', payload: { t, options } } }, '*');
}

function sendApply() {
  const options = {
    steps: Number((document.getElementById('steps') as HTMLInputElement).value),
    distribution: (document.getElementById('distribution') as HTMLSelectElement).value,
    reverse: (document.getElementById('reverse') as HTMLInputElement).checked,
    smooth: (document.getElementById('smooth') as HTMLInputElement).checked,
  };
  parent.postMessage({ pluginMessage: { type: 'apply', payload: { options } } }, '*');
}

document.getElementById('check-selection')?.addEventListener('click', sendCheckSelection);
document.getElementById('preview')?.addEventListener('click', sendPreview);
document.getElementById('apply')?.addEventListener('click', sendApply);

previewTEl.addEventListener('input', () => {
  previewValueEl.textContent = Number(previewTEl.value).toFixed(2);
});

window.onmessage = (event) => {
  const message = event.data.pluginMessage;
  if (!message) return;

  if (message.type === 'selection-status') {
    selectionStatusEl.textContent = message.ok ? 'OK' : 'Error';
    log(message.message, message.ok ? 'info' : 'error');
    return;
  }

  if (message.type === 'preview-result') {
    if (message.ok) {
      log(`Preview generated t=${message.t}`, 'info');
    } else {
      log(`Preview error: ${message.message}`, 'error');
    }
    return;
  }

  if (message.type === 'apply-result') {
    if (message.ok) {
      log(`Apply succeeded: ${message.message}`, 'info');
    } else {
      log(`Apply failed: ${message.message}`, 'error');
    }
    return;
  }
};

sendCheckSelection();
