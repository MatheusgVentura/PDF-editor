import { editorState } from '../../core/state.js';
import { createOverlay, removeOverlaysBySource } from '../overlay-model.js';

const SOURCE = 'page-number';
const MARGIN = 24;
// Estimativa da largura média de um caractere em Helvetica, só para a caixa
// do overlay não ficar estreita demais e o texto quebrar linha no preview.
const CHAR_WIDTH_RATIO = 0.55;

function formatPageNumberText(format, n, total) {
  switch (format) {
    case 'n':
      return `${n}`;
    case 'n-of-total':
      return `${n} / ${total}`;
    case 'page-n':
      return `Página ${n}`;
    case 'page-n-of-total':
    default:
      return `Página ${n} de ${total}`;
  }
}

function boxPosition(position, pageWidth, pageHeight, boxWidth, boxHeight) {
  const x = position.endsWith('left')
    ? MARGIN
    : position.endsWith('right')
      ? pageWidth - MARGIN - boxWidth
      : (pageWidth - boxWidth) / 2;
  const y = position.startsWith('top') ? pageHeight - MARGIN : MARGIN + boxHeight;
  return { x, y };
}

export function applyPageNumbers({ format, position, startAt, fontSize, color, pageIndices }) {
  removeOverlaysBySource(SOURCE);
  const total = editorState.pageCount;
  pageIndices.forEach((pageIndex, i) => {
    const page = editorState.pdfLibDoc.getPage(pageIndex);
    const { width, height } = page.getSize();
    const text = formatPageNumberText(format, startAt + i, total);
    const boxWidth = Math.max(30, text.length * fontSize * CHAR_WIDTH_RATIO);
    const boxHeight = fontSize * 1.15;
    const { x, y } = boxPosition(position, width, height, boxWidth, boxHeight);
    createOverlay(pageIndex, {
      type: 'text',
      source: SOURCE,
      x,
      y,
      width: boxWidth,
      height: boxHeight,
      text,
      fontSize,
      color
    });
  });
}

export function removePageNumbers() {
  removeOverlaysBySource(SOURCE);
}
