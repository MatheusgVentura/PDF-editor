import { PDFDocument } from '../../vendor/pdf-lib/pdf-lib.esm.min.js';
import { downloadBlob, suggestName } from '../core/file-io.js';

export async function compressSafe(exportDoc, fileName) {
  const beforeBytes = await exportDoc.save();
  const doc = await PDFDocument.load(beforeBytes);
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  const afterBytes = await doc.save({ useObjectStreams: true });
  downloadBlob(new Blob([afterBytes], { type: 'application/pdf' }), suggestName(fileName, 'comprimido'));
  return { before: beforeBytes.length, after: afterBytes.length };
}

export async function compressAggressive(
  exportPdfjsDoc,
  fileName,
  { scale = 1.25, quality = 0.7, signal, onProgress } = {}
) {
  const newDoc = await PDFDocument.create();
  const count = exportPdfjsDoc.numPages;

  for (let i = 1; i <= count; i++) {
    if (signal?.aborted) return null;
    onProgress?.(i - 1, count);
    const page = await exportPdfjsDoc.getPage(i);
    const viewport = page.getViewport({ scale, rotation: page.rotate });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    const jpgBytes = new Uint8Array(await blob.arrayBuffer());
    const jpgImage = await newDoc.embedJpg(jpgBytes);

    const visualWidth = viewport.width / scale;
    const visualHeight = viewport.height / scale;
    const newPage = newDoc.addPage([visualWidth, visualHeight]);
    newPage.drawImage(jpgImage, { x: 0, y: 0, width: visualWidth, height: visualHeight });
  }
  onProgress?.(count, count);
  if (signal?.aborted) return null;

  const outBytes = await newDoc.save();
  downloadBlob(new Blob([outBytes], { type: 'application/pdf' }), suggestName(fileName, 'comprimido-agressivo'));
  return outBytes.length;
}
