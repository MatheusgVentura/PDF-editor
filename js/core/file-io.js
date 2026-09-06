export function pickFile(inputEl) {
  return new Promise((resolve) => {
    const handler = () => {
      const file = inputEl.files[0] || null;
      inputEl.removeEventListener('change', handler);
      inputEl.value = '';
      resolve(file);
    };
    inputEl.addEventListener('change', handler);
    inputEl.click();
  });
}

export function setupDropzone(el, onFiles) {
  ['dragenter', 'dragover'].forEach((evt) => {
    el.addEventListener(evt, (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    el.addEventListener(evt, (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
    });
  });
  el.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type === 'application/pdf'
    );
    if (files.length) onFiles(files);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function suggestName(originalName, suffix, ext = 'pdf') {
  const base = originalName ? originalName.replace(/\.pdf$/i, '') : 'documento';
  return `${base}-${suffix}.${ext}`;
}

export async function fileToBytes(file) {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
