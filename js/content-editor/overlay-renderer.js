import { editorState } from '../core/state.js';
import { screenBoxFromPdf, pdfBoxFromScreen } from '../core/coords.js';
import {
  updateOverlay,
  removeOverlay,
  copyOverlayToClipboard,
  hasClipboardOverlay,
  pasteOverlayFromClipboard,
  duplicateOverlay
} from './overlay-model.js';
import { icons } from '../ui/icons.js';

const layer = document.getElementById('overlay-layer');
let selectedId = null;
let finishTextEdit = null;
let committingText = false;

function colorToCss(c) {
  if (!c) return 'transparent';
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

export function selectOverlay(id) {
  finishTextEdit?.();
  selectedId = id;
  // Preserve os elementos entre cliques, inclusive ao selecionar pela primeira vez.
  layer.querySelectorAll('.overlay-item').forEach((el) => {
    el.classList.toggle('selected', el.dataset.id === id);
    el.querySelectorAll('.overlay-delete, .overlay-handle').forEach((control) => control.remove());
  });
  layer.querySelector('.text-toolbar')?.remove();
  const overlay = editorState.getActiveOverlays().find((item) => item.id === id);
  const el = layer.querySelector(`[data-id="${id}"]`);
  if (overlay && el && editorState.currentViewport) {
    addSelectionControls(el, overlay, editorState.currentViewport);
  }
}

export function clearSelection() {
  selectOverlay(null);
}

export function getSelectedOverlayId() {
  return selectedId;
}

export function renderOverlays() {
  if (committingText) return;
  finishTextEdit?.();
  const viewport = editorState.currentViewport;
  const active = editorState.mode === 'content' && !!viewport;
  layer.classList.toggle('active', active);
  layer.innerHTML = '';
  if (!active) return;

  const overlays = editorState.getActiveOverlays();
  overlays.forEach((overlay) => {
    layer.appendChild(buildElement(overlay, viewport));
  });
  const selected = overlays.find((overlay) => overlay.id === selectedId);
  if (selected?.type === 'text') addTextToolbar(selected, viewport);
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
    if (overlay.type !== 'text') {
      addDeleteButton(el, overlay);
      addDuplicateButton(el, overlay);
    }
    addResizeHandle(el, overlay, viewport);
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay-handle') || e.target.closest('.overlay-delete')) return;
    if (e.target.isContentEditable) return;
    // Se o item ja esta selecionado, evita reconstruir o layer: manter o
    // mesmo no DOM entre os dois cliques e o que permite o navegador
    // reconhecer um duplo clique (dblclick exige o mesmo elemento-alvo).
    if (overlay.id === selectedId) {
      startDrag(e, overlay, viewport, el);
      return;
    }
    selectOverlay(overlay.id);
    startDrag(e, overlay, viewport, el);
  });

  return el;
}

function renderContent(el, overlay, viewport) {
  if (overlay.type === 'text') {
    const content = document.createElement('div');
    content.className = 'overlay-text-content';
    content.textContent = overlay.text || '';
    el.appendChild(content);
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Caixa de texto. Pressione Enter para editar.');
    el.style.fontSize = `${overlay.fontSize * viewport.scale}px`;
    el.style.color = colorToCss(overlay.color);
    el.style.lineHeight = '1.15';
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      enterTextEditMode(el, overlay);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.isContentEditable) {
        e.preventDefault();
        selectOverlay(overlay.id);
        enterTextEditMode(el, overlay);
      }
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
  const content = el.querySelector('.overlay-text-content');
  if (!content || content.isContentEditable) return;
  finishTextEdit?.();
  const pageIndex = editorState.activePageIndex;
  const viewport = editorState.currentViewport;
  const originalText = overlay.text;
  const originalHeight = el.style.height;
  el.classList.add('editing');
  content.contentEditable = 'plaintext-only';
  content.setAttribute('role', 'textbox');
  content.setAttribute('aria-label', 'Texto no PDF');
  content.setAttribute('aria-multiline', 'true');
  content.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(content);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const resizeToContent = () => {
    el.style.height = `${Math.max(parseFloat(originalHeight), content.scrollHeight)}px`;
  };
  const commit = (cancel = false) => {
    finishTextEdit = null;
    content.removeEventListener('blur', onBlur);
    content.removeEventListener('keydown', onKeyDown);
    content.removeEventListener('input', resizeToContent);
    const text = content.innerText.replace(/\r\n/g, '\n');
    content.contentEditable = 'false';
    content.removeAttribute('role');
    el.classList.remove('editing');
    if (cancel) {
      content.textContent = originalText;
      el.style.height = originalHeight;
      return;
    }
    content.textContent = text;
    if (text === originalText) return;
    const box = pdfBoxFromScreen(viewport, {
      left: parseFloat(el.style.left), top: parseFloat(el.style.top),
      width: parseFloat(el.style.width), height: parseFloat(el.style.height)
    });
    // O blur pode vir de um clique na barra: nao remova seu alvo antes do click.
    committingText = true;
    try { updateOverlay(pageIndex, overlay.id, { text, ...box }); }
    finally { committingText = false; }
  };
  const onBlur = () => commit();
  const onKeyDown = (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      e.stopPropagation();
      commit(e.key === 'Escape');
      el.focus({ preventScroll: true });
    }
  };
  finishTextEdit = () => commit();
  content.addEventListener('blur', onBlur);
  content.addEventListener('keydown', onKeyDown);
  content.addEventListener('input', resizeToContent);
}

export function editSelectedText() {
  const overlay = editorState.getActiveOverlays().find((item) => item.id === selectedId);
  const el = layer.querySelector(`[data-id="${selectedId}"]`);
  if (overlay?.type === 'text' && el) enterTextEditMode(el, overlay);
}

function addSelectionControls(el, overlay, viewport) {
  if (overlay.type === 'text') {
    addTextToolbar(overlay, viewport);
  } else {
    addDeleteButton(el, overlay);
    addDuplicateButton(el, overlay);
  }
  addResizeHandle(el, overlay, viewport);
}

function duplicateSelected(pageIndex, id) {
  const copy = duplicateOverlay(pageIndex, id);
  if (copy) selectOverlay(copy.id);
}

function positionTextToolbar(box) {
  const toolbar = layer.querySelector('.text-toolbar');
  if (!toolbar) return;
  toolbar.style.left = `${Math.max(8, Math.min(box.left - 6, layer.clientWidth - toolbar.offsetWidth - 8))}px`;
  toolbar.style.top = `${box.top >= 60 ? box.top - 56 : box.top + box.height + 16}px`;
}

function addTextToolbar(overlay, viewport) {
  const toolbar = document.createElement('div');
  toolbar.className = 'text-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Propriedades do texto');
  toolbar.innerHTML = `
    <span class="text-toolbar-label">${icons.text}<span>Texto</span></span>
    <label class="text-size-control"><input type="number" min="6" max="144" step="1" aria-label="Tamanho do texto" /><span>pt</span></label>
    <input class="text-color-control" type="color" aria-label="Cor do texto" title="Cor do texto" />
    <span class="text-toolbar-divider" aria-hidden="true"></span>
    <button type="button" class="text-edit-button" title="Editar texto">Editar</button>
    <button type="button" class="icon-btn" aria-label="Duplicar texto" title="Duplicar (Ctrl+D)">${icons.duplicate}</button>
    <button type="button" class="icon-btn danger" aria-label="Excluir texto" title="Excluir texto">${icons.trash}</button>
  `;
  const size = toolbar.querySelector('input[type="number"]');
  size.value = overlay.fontSize;
  size.addEventListener('change', () => {
    const fontSize = Number(size.value);
    if (!Number.isFinite(fontSize) || fontSize < 6 || fontSize > 144) {
      size.value = overlay.fontSize;
      return;
    }
    updateOverlay(editorState.activePageIndex, overlay.id, {
      fontSize, height: Math.max(overlay.height, fontSize * 1.15 * (overlay.text.split('\n').length))
    });
  });
  const color = toolbar.querySelector('input[type="color"]');
  color.value = '#' + ['r', 'g', 'b'].map((key) => Math.round(overlay.color[key] * 255).toString(16).padStart(2, '0')).join('');
  color.addEventListener('change', () => {
    const value = color.value;
    updateOverlay(editorState.activePageIndex, overlay.id, {
      color: { r: parseInt(value.slice(1, 3), 16) / 255, g: parseInt(value.slice(3, 5), 16) / 255, b: parseInt(value.slice(5, 7), 16) / 255 }
    });
  });
  toolbar.querySelector('.text-edit-button').addEventListener('click', editSelectedText);
  toolbar.querySelector('[aria-label="Duplicar texto"]').addEventListener('click', () => {
    duplicateSelected(editorState.activePageIndex, overlay.id);
  });
  toolbar.querySelector('.danger').addEventListener('click', () => {
    selectedId = null;
    removeOverlay(editorState.activePageIndex, overlay.id);
  });
  layer.appendChild(toolbar);
  positionTextToolbar(screenBoxFromPdf(viewport, overlay));
}

function addDeleteButton(el, overlay) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Excluir elemento');
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

function addDuplicateButton(el, overlay) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Duplicar elemento');
  btn.title = 'Duplicar (Ctrl+D)';
  btn.className = 'overlay-duplicate';
  btn.innerHTML = icons.duplicate;
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    duplicateSelected(editorState.activePageIndex, overlay.id);
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
      positionTextToolbar({ ...startBox, width: newWidth, height: newHeight });
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
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
    moved = true;
    el.style.left = `${startLeft + (ev.clientX - startX)}px`;
    el.style.top = `${startTop + (ev.clientY - startY)}px`;
    positionTextToolbar({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), height: parseFloat(el.style.height) });
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

// Copiar/colar/duplicar entre paginas. So atua fora de campos editaveis
// (input da barra, texto em edicao) para nao atropelar o clipboard nativo.
document.addEventListener('keydown', (e) => {
  if (editorState.mode !== 'content') return;
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.target.closest?.('input, textarea, [contenteditable="plaintext-only"]')) return;

  const key = e.key.toLowerCase();
  if (key === 'c' && selectedId) {
    const overlay = editorState.getActiveOverlays().find((o) => o.id === selectedId);
    if (overlay) {
      e.preventDefault();
      copyOverlayToClipboard(overlay);
    }
  } else if (key === 'v' && hasClipboardOverlay()) {
    e.preventDefault();
    const pasted = pasteOverlayFromClipboard(editorState.activePageIndex);
    if (pasted) selectOverlay(pasted.id);
  } else if (key === 'd' && selectedId) {
    e.preventDefault();
    duplicateSelected(editorState.activePageIndex, selectedId);
  }
});

editorState.addEventListener('overlays-changed', renderOverlays);
editorState.addEventListener('mode-changed', renderOverlays);
