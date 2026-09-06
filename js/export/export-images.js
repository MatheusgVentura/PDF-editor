import { renderPageToCanvas } from '../core/pdf-engine.js';
import { downloadBlob, suggestName, delay } from '../core/file-io.js';

async function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function exportPageAsPng(pdfjsDoc, pageIndex, fileName, scale) {
  const canvas = document.createElement('canvas');
  await renderPageToCanvas(pdfjsDoc, pageIndex, canvas, { scale });
  const blob = await canvasToPngBlob(canvas);
  downloadBlob(blob, suggestName(fileName, `pagina-${pageIndex + 1}`, 'png'));
}

export async function exportAllPagesAsPng(pdfjsDoc, fileName, scale) {
  const count = pdfjsDoc.numPages;
  for (let i = 0; i < count; i++) {
    await exportPageAsPng(pdfjsDoc, i, fileName, scale);
    if (i < count - 1) await delay(250);
  }
}
