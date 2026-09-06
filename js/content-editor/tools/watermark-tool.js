import { editorState } from '../../core/state.js';
import { createOverlay, removeOverlaysBySource } from '../overlay-model.js';

const SOURCE = 'watermark';
// Estimativa da largura média de um caractere em Helvetica em negrito, só
// para a caixa do overlay acompanhar o tamanho do texto no preview.
const CHAR_WIDTH_RATIO = 0.6;

export function applyWatermark({ text, fontSize, color, opacity, rotation, pageIndices }) {
  removeOverlaysBySource(SOURCE);
  pageIndices.forEach((pageIndex) => {
    const page = editorState.pdfLibDoc.getPage(pageIndex);
    const { width, height } = page.getSize();
    const boxWidth = Math.max(60, text.length * fontSize * CHAR_WIDTH_RATIO);
    const boxHeight = fontSize * 1.3;
    createOverlay(pageIndex, {
      type: 'watermark',
      source: SOURCE,
      x: (width - boxWidth) / 2,
      y: (height + boxHeight) / 2,
      width: boxWidth,
      height: boxHeight,
      text,
      fontSize,
      color,
      opacity,
      rotation
    });
  });
}

export function removeWatermark() {
  removeOverlaysBySource(SOURCE);
}
