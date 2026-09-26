// Copy and save helpers that work both in a normal browser tab and inside the claude.ai artifact viewer.

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Some embedded views refuse the async clipboard: fall back to a selected textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

let downloadsPromise;
function downloadsCapability() {
  if (!downloadsPromise) {
    downloadsPromise = typeof window !== 'undefined' && window.claude?.use
      ? window.claude.use('downloads').catch(() => null)
      : Promise.resolve(null);
  }
  return downloadsPromise;
}

/**
 * Saves a file for the viewer. Returns 'saved', 'declined', 'blocked' (format not allowed by the host)
 * or 'failed'. Inside the artifact viewer the host asks the viewer to confirm.
 */
export async function saveFile(filename, blob) {
  const downloads = await downloadsCapability();
  if (downloads) {
    try {
      await downloads.save({ filename, data: blob });
      return 'saved';
    } catch (e) {
      if (e?.code === 'declined') return 'declined';
      if (e?.code === 'rejected_extension' || e?.code === 'extension_not_enabled') return 'blocked';
      if (e?.code !== 'unavailable' && e?.code !== 'not_granted') return 'failed';
    }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export const SAVE_MESSAGE = {
  saved: null,
  declined: 'Збереження скасовано',
  blocked: 'Цей формат не можна зберегти тут. Відкрийте Core у браузері.',
  failed: 'Не вдалося зберегти файл',
};
