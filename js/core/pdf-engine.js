import * as pdfjsLib from '../../vendor/pdfjs/pdf.min.mjs';
import { PDFDocument, EncryptedPDFError } from '../../vendor/pdf-lib/pdf-lib.esm.min.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';

export { pdfjsLib };

export class EncryptedPdfNotSupportedError extends Error {
  constructor() {
    super('Este PDF esta protegido por senha. PDFs criptografados nao sao suportados nesta versao.');
    this.name = 'EncryptedPdfNotSupportedError';
  }
}

export async function loadDocument(bytes) {
  let pdfLibDoc;
  try {
    pdfLibDoc = await PDFDocument.load(bytes);
  } catch (err) {
    if (err instanceof EncryptedPDFError) {
      throw new EncryptedPdfNotSupportedError();
    }
    throw err;
  }
  const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  return { pdfLibDoc, pdfjsDoc };
}

export async function resyncPdfjsFromPdfLib(pdfLibDoc) {
  const bytes = await pdfLibDoc.save();
  return pdfjsLib.getDocument({ data: bytes }).promise;
}

// pdf.js nao permite duas render() concorrentes no mesmo canvas. Como o canvas
// principal e reaproveitado entre paginas/eventos, cada canvas guarda um token
// de sequencia (incrementado de forma sincrona, antes de qualquer await) para
// que so a chamada mais recente chegue a de fato desenhar — qualquer chamada
// mais antiga que ainda esteja "a caminho" desiste assim que percebe que foi
// superada, em vez de disputar o canvas com a mais nova.
const canvasRenderState = new WeakMap();

export async function renderPageToCanvas(pdfjsDoc, pageIndex, canvas, { scale = 1.5 } = {}) {
  const state = canvasRenderState.get(canvas) || { token: 0, task: null };
  const myToken = ++state.token;
  if (state.task) state.task.cancel();
  canvasRenderState.set(canvas, state);

  const page = await pdfjsDoc.getPage(pageIndex + 1); // pdf.js e 1-indexado
  const viewport = page.getViewport({ scale, rotation: page.rotate });

  if (state.token !== myToken) {
    // uma chamada mais recente ja assumiu o canvas antes desta continuar
    return viewport;
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');

  const renderTask = page.render({ canvasContext: ctx, viewport });
  state.task = renderTask;

  try {
    await renderTask.promise;
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') {
      return viewport;
    }
    throw err;
  } finally {
    if (state.task === renderTask) state.task = null;
  }
  return viewport;
}

export async function renderThumbnail(pdfjsDoc, pageIndex, maxWidth = 140) {
  const page = await pdfjsDoc.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1, rotation: page.rotate });
  const scale = maxWidth / baseViewport.width;
  const viewport = page.getViewport({ scale, rotation: page.rotate });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
