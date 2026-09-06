import { editorState } from '../core/state.js';
import { screenBoxFromPdf, pdfBoxFromScreen } from '../core/coords.js';
import { updateOverlay, removeOverlay } from './overlay-model.js';

const layer = document.getElementById('overlay-layer');
let selectedId = null;
let dragState = null;

function colorToCss(c) {
  if (!c) return 'transparent';
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

export function selectOverlay(id) {
  selectedId = id;
  renderOverlays();
}

export function clearSelection() {
  selectedId = null;
}

export function getSelectedOverlayId() {
  return selectedId;
}

export function renderOverlays() {
  const viewport = editorState.currentViewport;
  const active = editorState.mode === 'content' && !!viewport;
  layer.classList.toggle('active', active);
  layer.innerHTML = '';
  if (!active) return;

  const overlays = editorState.getActiveOverlays();
  overlays.forEach((overlay) => {
    layer.appendChild(buildElement(overlay, viewport));
  });
}

function buildElement(overlay, viewport) {
  const box = screenBoxFromPdf(viewport, overlay);
  const el = document.createElement('div');
  el.className = `overlay-item overlay-${overlay.type}`;
  el.dataset.id = overlay.id;
  Object.assign(el.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`
  });

  if (overlay.id === selectedId) el.classList.add('selected');

  renderContent(el, overlay, viewport);

  if (overlay.id === selectedId) {
    addDeleteButton(el, overlay);
    addResizeHandle(el, overlay, viewport);
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay-handle') || e.target.closest('.overlay-delete')) return;
    if (el.isContentEditable && document.activeElement === el) return;
    // Se o item ja esta selecionado, evita reconstruir o layer: manter o
    // mesmo no DOM entre os dois cliques e o que permite o navegador
    // reconhecer um duplo clique (dblclick exige o mesmo elemento-alvo).
    if (overlay.id === selectedId) {
      startDrag(e, overlay, viewport, el);
      return;
    }
    selectOverlay(overlay.id);
    // selectOverlay() reconstroi o layer inteiro (innerHTML = ''), entao `el`
    // ja esta desconectado do DOM neste ponto — precisamos do elemento novo
    // para poder usar setPointerCapture nele.
    const freshEl = layer.querySelector(`[data-id="${overlay.id}"]`);
    if (freshEl) startDrag(e, overlay, viewport, freshEl);
  });

  return el;
}

function renderContent(el, overlay, viewport) {
  if (overlay.type === 'text') {
    el.textContent = overlay.text || '';
    el.style.fontSize = `${overlay.fontSize * viewport.scale}px`;
    el.style.color = colorToCss(overlay.color);
    el.style.lineHeight = '1.15';
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      enterTextEditMode(el, overlay);
    });
  } else if (overlay.type === 'image') {
    const img = document.createElement('img');
    img.src = overlay.previewUrl;
    img.draggable = false;
    el.appendChild(img);
  } else if (overlay.type === 'rect' || overlay.type === 'ellipse') {
    el.style.border = `${Math.max(1, overlay.lineWidth * viewport.scale)}px solid ${colorToCss(overlay.strokeColor)}`;
    el.style.background = overlay.fillColor ? colorToCss(overlay.fillColor) : 'transparent';
  }
}

function enterTextEditMode(el, overlay) {
  // O botao de excluir e a alca de redimensionar sao filhos do proprio
  // elemento (para posicionamento absoluto relativo a ele). Se ficarem
  // no DOM durante a edicao, contentEditable os trata como texto e o
  // "x" do botao acaba sendo salvo junto do conteudo digitado.
  el.querySelectorAll('.overlay-delete, .overlay-handle').forEach((n) => n.remove());
  el.contentEditable = 'true';
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const commit = () => {
    el.contentEditable = 'false';
    updateOverlay(editorState.activePageIndex, overlay.id, { text: el.textContent });
    el.removeEventListener('blur', commit);
  };
  el.addEventListener('blur', commit);
}

function addDeleteButton(el, overlay) {
  const btn = document.createElement('div');
  btn.className = 'overlay-delete';
  btn.textContent = '×';
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectedId === overlay.id) selectedId = null;
    removeOverlay(editorState.activePageIndex, overlay.id);
  });
  el.appendChild(btn);
}

function addResizeHandle(el, overlay, viewport) {
  const handle = document.createElement('div');
  handle.className = 'overlay-handle';
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = screenBoxFromPdf(viewport, overlay);

    const onMove = (ev) => {
      const newWidth = Math.max(10, startBox.width + (ev.clientX - startX));
      const newHeight = Math.max(10, startBox.height + (ev.clientY - startY));
      el.style.width = `${newWidth}px`;
      el.style.height = `${newHeight}px`;
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      const finalBox = {
        left: startBox.left,
        top: startBox.top,
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height)
      };
      const pdfBox = pdfBoxFromScreen(viewport, finalBox);
      updateOverlay(editorState.activePageIndex, overlay.id, pdfBox);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
  el.appendChild(handle);
}

function startDrag(e, overlay, viewport, el) {
  if (e.target.isContentEditable) return;
  el.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startY = e.clientY;
  const startLeft = parseFloat(el.style.left);
  const startTop = parseFloat(el.style.top);
  let moved = false;

  const onMove = (ev) => {
    moved = true;
    el.style.left = `${startLeft + (ev.clientX - startX)}px`;
    el.style.top = `${startTop + (ev.clientY - startY)}px`;
  };
  const onUp = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    if (!moved) return;
    const box = {
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height)
    };
    const pdfBox = pdfBoxFromScreen(viewport, box);
    updateOverlay(editorState.activePageIndex, overlay.id, pdfBox);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
}

layer.addEventListener('pointerdown', (e) => {
  if (e.target === layer) {
    selectOverlay(null);
  }
});

editorState.addEventListener('overlays-changed', renderOverlays);
editorState.addEventListener('mode-changed', renderOverlays);
