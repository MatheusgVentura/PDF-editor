import { editorState } from '../../core/state.js';
import { createOverlay } from '../overlay-model.js';
import { selectOverlay, cancelFreehandMode } from '../overlay-renderer.js';

// Retângulo e elipse são criados prontos, com posição/tamanho padrão (depois
// arrastáveis/redimensionáveis). Linha, seta e desenho livre precisam do
// próprio traço do usuário para fazer sentido - ver startLineTool/
// startFreehandTool em overlay-renderer.js.
export function addShapeOverlay(type) {
  if (!editorState.hasDocument) return;
  cancelFreehandMode();
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
    lineWidth: 2,
    opacity: 1
  });
  selectOverlay(overlay.id);
}
