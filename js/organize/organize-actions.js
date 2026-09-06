import { PDFDocument, degrees } from '../../vendor/pdf-lib/pdf-lib.esm.min.js';
import { editorState } from '../core/state.js';
import { resyncPdfjsFromPdfLib } from '../core/pdf-engine.js';
import { showError, showSuccess } from '../ui/toast.js';

async function afterMutation() {
  editorState.pdfjsDoc = await resyncPdfjsFromPdfLib(editorState.pdfLibDoc);
  editorState.markDirty();
  editorState.emit('pages-changed');
}

export async function rotatePage(index, deltaDegrees) {
  const page = editorState.pdfLibDoc.getPage(index);
  const current = page.getRotation().angle;
  page.setRotation(degrees((current + deltaDegrees + 360) % 360));
  await afterMutation();
}

export async function deletePage(index) {
  editorState.pdfLibDoc.removePage(index);
  editorState.pages.splice(index, 1);
  editorState.selectedPageIndices = new Set(
    Array.from(editorState.selectedPageIndices)
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i))
  );
  if (editorState.activePageIndex >= editorState.pageCount) {
    editorState.activePageIndex = Math.max(0, editorState.pageCount - 1);
  }
  await afterMutation();
}

export async function reorderPages(fromIndex, toIndex) {
  const order = editorState.pdfLibDoc.getPageIndices();
  const newOrder = order.slice();
  const [moved] = newOrder.splice(fromIndex, 1);
  newOrder.splice(toIndex, 0, moved);

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(editorState.pdfLibDoc, newOrder);
  copiedPages.forEach((p) => newDoc.addPage(p));

  const newPagesMeta = newOrder.map((i) => editorState.pages[i]);
  const newActiveIndex = newOrder.indexOf(editorState.activePageIndex);

  editorState.pdfLibDoc = newDoc;
  editorState.pages = newPagesMeta;
  editorState.activePageIndex = newActiveIndex >= 0 ? newActiveIndex : 0;
  editorState.selectedPageIndices = new Set();

  await afterMutation();
}

export async function mergeDocument(bytes) {
  try {
    const otherDoc = await PDFDocument.load(bytes);
    const indices = otherDoc.getPageIndices();
    const copiedPages = await editorState.pdfLibDoc.copyPages(otherDoc, indices);
    copiedPages.forEach((p) => {
      editorState.pdfLibDoc.addPage(p);
      editorState.pages.push({ overlays: [] });
    });
    await afterMutation();
    showSuccess(`${indices.length} pagina(s) adicionada(s) ao documento.`);
  } catch (err) {
    showError('Nao foi possivel mesclar esse PDF (pode estar protegido por senha ou corrompido).');
  }
}

export async function extractPages(indices) {
  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(editorState.pdfLibDoc, indices);
  copiedPages.forEach((p) => newDoc.addPage(p));
  return newDoc.save();
}

export function parsePageRanges(rangeString, pageCount) {
  const groups = [];
  const parts = rangeString.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Intervalo invalido: "${part}"`);
    let start = parseInt(m[1], 10);
    let end = m[2] ? parseInt(m[2], 10) : start;
    if (start > end) [start, end] = [end, start];
    if (start < 1 || end > pageCount) {
      throw new Error(`Intervalo fora do alcance: "${part}" (documento tem ${pageCount} paginas)`);
    }
    const indices = [];
    for (let p = start; p <= end; p++) indices.push(p - 1);
    groups.push(indices);
  }
  if (!groups.length) throw new Error('Informe pelo menos um intervalo de paginas.');
  return groups;
}

export async function splitPages(ranges) {
  const results = [];
  for (const indices of ranges) {
    const bytes = await extractPages(indices);
    const label =
      indices.length === 1
        ? `pagina-${indices[0] + 1}`
        : `paginas-${indices[0] + 1}-${indices[indices.length - 1] + 1}`;
    results.push({ bytes, label });
  }
  return results;
}
