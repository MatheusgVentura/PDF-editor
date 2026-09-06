import { editorState } from '../../core/state.js';
import { createOverlay } from '../overlay-model.js';
import { selectOverlay } from '../overlay-renderer.js';

const DEFAULT_FONT_SIZE = 14;

export function addTextOverlay() {
  if (!editorState.hasDocument) return;
  const page = editorState.pdfLibDoc.getPage(editorState.activePageIndex);
  const { width, height } = page.getSize();
  const boxWidth = Math.min(220, width * 0.55);
  const boxHeight = DEFAULT_FONT_SIZE * 1.6;

  const overlay = createOverlay(editorState.activePageIndex, {
    type: 'text',
    x: (width - boxWidth) / 2,
    y: height * 0.7,
    width: boxWidth,
    height: boxHeight,
    text: 'Texto',
    fontSize: DEFAULT_FONT_SIZE,
    color: { r: 0.1, g: 0.1, b: 0.1 }
  });
  selectOverlay(overlay.id);
}
