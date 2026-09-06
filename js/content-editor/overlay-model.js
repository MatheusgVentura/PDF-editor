import { editorState } from '../core/state.js';

let nextId = 1;

export function createOverlay(pageIndex, data) {
  const overlay = { id: `ov-${nextId++}`, rotation: 0, ...data };
  editorState.pages[pageIndex].overlays.push(overlay);
  editorState.markDirty();
  editorState.emit('overlays-changed');
  return overlay;
}

export function updateOverlay(pageIndex, id, patch) {
  const overlay = editorState.pages[pageIndex].overlays.find((o) => o.id === id);
  if (!overlay) return;
  Object.assign(overlay, patch);
  editorState.markDirty();
  editorState.emit('overlays-changed');
}

export function removeOverlay(pageIndex, id) {
  const list = editorState.pages[pageIndex].overlays;
  const idx = list.findIndex((o) => o.id === id);
  if (idx === -1) return;
  list.splice(idx, 1);
  editorState.markDirty();
  editorState.emit('overlays-changed');
}

export function getOverlaysForPage(pageIndex) {
  const page = editorState.pages[pageIndex];
  return page ? page.overlays : [];
}

export function cloneOverlay(overlay) {
  return { ...overlay, id: `ov-${nextId++}` };
}

function cloneColor(c) {
  return c ? { ...c } : c;
}

// Dados de um overlay prontos para virar um novo overlay independente: sem
// id (createOverlay gera um novo) e com os objetos de cor copiados por
// valor, para dois overlays nunca compartilharem a mesma referencia.
function overlayDataWithoutId(overlay) {
  const { id, ...rest } = overlay;
  return {
    ...rest,
    color: cloneColor(rest.color),
    strokeColor: cloneColor(rest.strokeColor),
    fillColor: cloneColor(rest.fillColor)
  };
}

const PASTE_OFFSET = 16; // pontos PDF

let clipboardOverlay = null;

export function copyOverlayToClipboard(overlay) {
  clipboardOverlay = overlayDataWithoutId(overlay);
}

export function hasClipboardOverlay() {
  return clipboardOverlay !== null;
}

export function pasteOverlayFromClipboard(pageIndex) {
  if (!clipboardOverlay) return null;
  const data = overlayDataWithoutId(clipboardOverlay);
  data.x += PASTE_OFFSET;
  data.y -= PASTE_OFFSET;
  return createOverlay(pageIndex, data);
}

export function duplicateOverlay(pageIndex, id) {
  const overlay = editorState.pages[pageIndex]?.overlays.find((o) => o.id === id);
  if (!overlay) return null;
  const data = overlayDataWithoutId(overlay);
  data.x += PASTE_OFFSET;
  data.y -= PASTE_OFFSET;
  return createOverlay(pageIndex, data);
}
