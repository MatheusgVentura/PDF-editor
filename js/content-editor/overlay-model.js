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
