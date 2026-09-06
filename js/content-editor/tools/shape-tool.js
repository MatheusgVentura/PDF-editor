import { editorState } from '../../core/state.js';
import { createOverlay } from '../overlay-model.js';
import { selectOverlay } from '../overlay-renderer.js';

export function addShapeOverlay(type) {
  if (!editorState.hasDocument) return;
  const page = editorState.pdfLibDoc.getPage(editorState.activePageIndex);
  const { width, height } = page.getSize();
  const boxWidth = width * 0.3;
  const boxHeight = height * 0.15;

  const overlay = createOverlay(editorState.activePageIndex, {
    type,
    x: (width - boxWidth) / 2,
    y: height * 0.6,
    width: boxWidth,
    height: boxHeight,
    strokeColor: { r: 0.1, g: 0.1, b: 0.1 },
    fillColor: null,
    lineWidth: 2
  });
  selectOverlay(overlay.id);
}
