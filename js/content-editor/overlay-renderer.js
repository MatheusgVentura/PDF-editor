import { editorState } from '../core/state.js';
import { screenBoxFromPdf, pdfBoxFromScreen, toPdfPoint } from '../core/coords.js';
import {
  createOverlay,
  updateOverlay,
  removeOverlay,
  copyOverlayToClipboard,
  hasClipboardOverlay,
  pasteOverlayFromClipboard,
  duplicateOverlay
} from './overlay-model.js';
import { icons } from '../ui/icons.js';

const SHAPE_TYPES = ['rect', 'ellipse', 'line', 'arrow', 'freehand'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const layer = document.getElementById('overlay-layer');
let selectedId = null;
let finishTextEdit = null;
let committingText = false;

function isShapeType(type) {
  return SHAPE_TYPES.includes(type);
}

function colorToCss(c) {
  if (!c) return 'transparent';
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

function colorToHex(c) {
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function hexToColor(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255
  };
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
  else if (selected && isShapeType(selected.type)) addShapeToolbar(selected, viewport);
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
    if (overlay.type !== 'text' && !isShapeType(overlay.type)) {
      addDeleteButton(el, overlay);
      addDuplicateButton(el, overlay);
    }
    addResizeHandle(el, overlay, viewport);
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay-handle') || e.target.closest('.overlay-delete')) return;
    if (e.target.isContentEditable) return;
    // Se o item já está selecionado, evita reconstruir o layer: manter o
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
  } else if (isShapeType(overlay.type)) {
    renderShapeContent(el, overlay, viewport);
  } else if (overlay.type === 'watermark') {
    // A rotação fica no filho, não no `el`: assim a caixa de seleção e os
    // botoes de excluir/duplicar/redimensionar continuam alinhados aos eixos.
    const content = document.createElement('div');
    content.className = 'overlay-watermark-content';
    content.textContent = overlay.text || '';
    content.style.fontSize = `${overlay.fontSize * viewport.scale}px`;
    content.style.color = colorToCss(overlay.color);
    content.style.opacity = String(overlay.opacity);
    content.style.transform = `rotate(${-overlay.rotation}deg)`;
    el.appendChild(content);
  }
}

// Retângulo, elipse, linha, seta e desenho livre são todos desenhados como um
// <svg> filho ocupando a caixa inteira do overlay - assim mover/redimensionar
// a caixa (mesma lógica genérica de qualquer overlay) reescala o desenho
// automaticamente, sem lógica específica por tipo de forma.
function renderShapeContent(el, overlay, viewport) {
  const box = screenBoxFromPdf(viewport, overlay);
  const w = Math.max(1, box.width);
  const h = Math.max(1, box.height);
  const strokeWidth = Math.max(1, (overlay.lineWidth || 1) * viewport.scale);
  const stroke = colorToCss(overlay.strokeColor);
  const fill = overlay.fillColor ? colorToCss(overlay.fillColor) : 'none';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.display = 'block';
  svg.style.opacity = String(overlay.opacity ?? 1);

  if (overlay.type === 'rect') {
    const inset = strokeWidth / 2;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', inset);
    rect.setAttribute('y', inset);
    rect.setAttribute('width', Math.max(0, w - strokeWidth));
    rect.setAttribute('height', Math.max(0, h - strokeWidth));
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', strokeWidth);
    rect.setAttribute('fill', fill);
    svg.appendChild(rect);
  } else if (overlay.type === 'ellipse') {
    const ellipse = document.createElementNS(SVG_NS, 'ellipse');
    ellipse.setAttribute('cx', w / 2);
    ellipse.setAttribute('cy', h / 2);
    ellipse.setAttribute('rx', Math.max(0, w / 2 - strokeWidth / 2));
    ellipse.setAttribute('ry', Math.max(0, h / 2 - strokeWidth / 2));
    ellipse.setAttribute('stroke', stroke);
    ellipse.setAttribute('stroke-width', strokeWidth);
    ellipse.setAttribute('fill', fill);
    svg.appendChild(ellipse);
  } else if (overlay.type === 'line' || overlay.type === 'arrow') {
    const [p0, p1] = overlay.points;
    const a = { x: p0.x * w, y: p0.y * h };
    const b = { x: p1.x * w, y: p1.y * h };
    svg.appendChild(buildLine(a, b, stroke, strokeWidth));
    if (overlay.type === 'arrow') {
      buildArrowHead(a, b, stroke, strokeWidth).forEach((line) => svg.appendChild(line));
    }
  } else if (overlay.type === 'freehand') {
    const points = (overlay.points || []).map((p) => `${p.x * w},${p.y * h}`).join(' ');
    const poly = document.createElementNS(SVG_NS, 'polyline');
    poly.setAttribute('points', points);
    poly.setAttribute('stroke', stroke);
    poly.setAttribute('stroke-width', strokeWidth);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke-linecap', 'round');
    poly.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(poly);
  }

  el.appendChild(svg);
}

function buildLine(a, b, stroke, strokeWidth) {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', a.x);
  line.setAttribute('y1', a.y);
  line.setAttribute('x2', b.x);
  line.setAttribute('y2', b.y);
  line.setAttribute('stroke', stroke);
  line.setAttribute('stroke-width', strokeWidth);
  line.setAttribute('stroke-linecap', 'round');
  return line;
}

// Ponta da seta como um "V" (duas linhas curtas), no mesmo estilo/espessura
// do corpo - assim o preview e o bake.js (que usa a mesma matematica) batem.
function buildArrowHead(a, b, stroke, strokeWidth) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const headLength = Math.max(8, strokeWidth * 3.5);
  const spread = Math.PI / 7;
  const left = {
    x: b.x - headLength * Math.cos(angle - spread),
    y: b.y - headLength * Math.sin(angle - spread)
  };
  const right = {
    x: b.x - headLength * Math.cos(angle + spread),
    y: b.y - headLength * Math.sin(angle + spread)
  };
  return [buildLine(b, left, stroke, strokeWidth), buildLine(b, right, stroke, strokeWidth)];
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
    // O blur pode vir de um clique na barra: não remova seu alvo antes do click.
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
  } else if (isShapeType(overlay.type)) {
    addShapeToolbar(overlay, viewport);
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
  color.value = colorToHex(overlay.color);
  color.addEventListener('change', () => {
    updateOverlay(editorState.activePageIndex, overlay.id, { color: hexToColor(color.value) });
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

const SHAPE_LABELS = { rect: 'Retângulo', ellipse: 'Elipse', line: 'Linha', arrow: 'Seta', freehand: 'Desenho' };

function addShapeToolbar(overlay, viewport) {
  const hasFill = overlay.type === 'rect' || overlay.type === 'ellipse';
  const toolbar = document.createElement('div');
  toolbar.className = 'text-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Propriedades da forma');
  toolbar.innerHTML = `
    <span class="text-toolbar-label">${icons.square}<span>${SHAPE_LABELS[overlay.type] || 'Forma'}</span></span>
    <input class="text-color-control" type="color" id="shape-stroke-color" aria-label="Cor do traço" title="Cor do traço" />
    <label class="text-size-control" title="Espessura do traço"><input type="number" min="1" max="20" step="1" aria-label="Espessura do traço" /><span>pt</span></label>
    ${hasFill ? `
      <span class="text-toolbar-divider" aria-hidden="true"></span>
      <label class="checkbox-row" style="margin:0; gap:4px; white-space:nowrap;">
        <input type="checkbox" id="shape-fill-toggle" /><span>Preencher</span>
      </label>
      <input class="text-color-control" type="color" id="shape-fill-color" aria-label="Cor de preenchimento" title="Cor de preenchimento" />
    ` : ''}
    <span class="text-toolbar-divider" aria-hidden="true"></span>
    <label class="text-size-control" title="Transparência"><input type="number" min="10" max="100" step="10" aria-label="Opacidade" /><span>%</span></label>
    <span class="text-toolbar-divider" aria-hidden="true"></span>
    <button type="button" class="icon-btn" aria-label="Duplicar forma" title="Duplicar (Ctrl+D)">${icons.duplicate}</button>
    <button type="button" class="icon-btn danger" aria-label="Excluir forma" title="Excluir forma">${icons.trash}</button>
  `;

  const strokeInput = toolbar.querySelector('#shape-stroke-color');
  strokeInput.value = colorToHex(overlay.strokeColor);
  strokeInput.addEventListener('change', () => {
    updateOverlay(editorState.activePageIndex, overlay.id, { strokeColor: hexToColor(strokeInput.value) });
  });

  const widthInput = toolbar.querySelector('[aria-label="Espessura do traço"]');
  widthInput.value = overlay.lineWidth;
  widthInput.addEventListener('change', () => {
    const lineWidth = Number(widthInput.value);
    if (!Number.isFinite(lineWidth) || lineWidth < 1 || lineWidth > 20) {
      widthInput.value = overlay.lineWidth;
      return;
    }
    updateOverlay(editorState.activePageIndex, overlay.id, { lineWidth });
  });

  const opacityInput = toolbar.querySelector('[aria-label="Opacidade"]');
  opacityInput.value = Math.round((overlay.opacity ?? 1) * 100);
  opacityInput.addEventListener('change', () => {
    const pct = Number(opacityInput.value);
    if (!Number.isFinite(pct) || pct < 10 || pct > 100) {
      opacityInput.value = Math.round((overlay.opacity ?? 1) * 100);
      return;
    }
    updateOverlay(editorState.activePageIndex, overlay.id, { opacity: pct / 100 });
  });

  if (hasFill) {
    const fillToggle = toolbar.querySelector('#shape-fill-toggle');
    const fillColorInput = toolbar.querySelector('#shape-fill-color');
    fillToggle.checked = !!overlay.fillColor;
    fillColorInput.value = colorToHex(overlay.fillColor || { r: 1, g: 1, b: 1 });
    fillColorInput.disabled = !overlay.fillColor;
    fillToggle.addEventListener('change', () => {
      fillColorInput.disabled = !fillToggle.checked;
      updateOverlay(editorState.activePageIndex, overlay.id, {
        fillColor: fillToggle.checked ? hexToColor(fillColorInput.value) : null
      });
    });
    fillColorInput.addEventListener('change', () => {
      if (!fillToggle.checked) return;
      updateOverlay(editorState.activePageIndex, overlay.id, { fillColor: hexToColor(fillColorInput.value) });
    });
  }

  toolbar.querySelector('[aria-label="Duplicar forma"]').addEventListener('click', () => {
    duplicateSelected(editorState.activePageIndex, overlay.id);
  });
  toolbar.querySelector('[aria-label="Excluir forma"]').addEventListener('click', () => {
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

const MIN_RESIZE = 10; // px de tela
// Uma alça por canto/lado ('n','s','e','w' = quais bordas ela move). Cantos
// combinam duas bordas; bordas soltas (n/s/e/w) mexem só numa dimensão.
const RESIZE_HANDLES = [
  { cls: 'nw', edges: ['n', 'w'] },
  { cls: 'n', edges: ['n'] },
  { cls: 'ne', edges: ['n', 'e'] },
  { cls: 'e', edges: ['e'] },
  { cls: 'se', edges: ['s', 'e'] },
  { cls: 's', edges: ['s'] },
  { cls: 'sw', edges: ['s', 'w'] },
  { cls: 'w', edges: ['w'] }
];

// Redimensiona a partir de um conjunto de bordas, mantendo a borda oposta fixa
// (ex.: arrastar a borda esquerda mantém a direita no lugar e vice-versa).
function computeResizedBox(startBox, dx, dy, edges) {
  let { left, top, width, height } = startBox;
  if (edges.includes('w')) {
    const rightEdge = startBox.left + startBox.width;
    width = Math.max(MIN_RESIZE, startBox.width - dx);
    left = rightEdge - width;
  } else if (edges.includes('e')) {
    width = Math.max(MIN_RESIZE, startBox.width + dx);
  }
  if (edges.includes('n')) {
    const bottomEdge = startBox.top + startBox.height;
    height = Math.max(MIN_RESIZE, startBox.height - dy);
    top = bottomEdge - height;
  } else if (edges.includes('s')) {
    height = Math.max(MIN_RESIZE, startBox.height + dy);
  }
  return { left, top, width, height };
}

function addResizeHandle(el, overlay, viewport) {
  RESIZE_HANDLES.forEach(({ cls, edges }) => {
    const handle = document.createElement('div');
    handle.className = `overlay-handle overlay-handle-${cls}`;
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startBox = screenBoxFromPdf(viewport, overlay);

      const onMove = (ev) => {
        const box = computeResizedBox(startBox, ev.clientX - startX, ev.clientY - startY, edges);
        el.style.left = `${box.left}px`;
        el.style.top = `${box.top}px`;
        el.style.width = `${box.width}px`;
        el.style.height = `${box.height}px`;
        positionTextToolbar(box);
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        const finalBox = {
          left: parseFloat(el.style.left),
          top: parseFloat(el.style.top),
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
  });
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
  if (armedDrawMode === 'freehand') {
    beginFreehandDraw(e);
    return;
  }
  if (armedDrawMode === 'line' || armedDrawMode === 'arrow') {
    beginLineDraw(e, armedDrawMode);
    return;
  }
  if (e.target === layer) {
    selectOverlay(null);
  }
});

// ---------- Desenho por arraste (linha, seta, desenho livre) ----------
// Diferente de retângulo/elipse (criados prontos, depois arrastados/redimensionados),
// essas formas precisam capturar o próprio traço: arma um modo em que o próximo
// arraste sobre a página vira os pontos do overlay, normalizados (0..1) contra a
// caixa delimitadora do traço - assim mover/redimensionar a caixa depois funciona
// com a mesma lógica genérica de qualquer overlay.
const DRAW_MIN_SIZE = 3; // pontos PDF - evita criar overlay de um clique sem arrastar
let armedDrawMode = null; // null | 'freehand' | 'line' | 'arrow'

export function startFreehandTool() {
  armDrawMode('freehand');
}

export function startLineTool(type) {
  armDrawMode(type);
}

function armDrawMode(mode) {
  if (!editorState.hasDocument || editorState.mode !== 'content') return;
  armedDrawMode = mode;
  layer.classList.add('drawing-mode');
  layer.style.cursor = 'crosshair';
}

export function cancelFreehandMode() {
  if (!armedDrawMode) return;
  armedDrawMode = null;
  layer.classList.remove('drawing-mode');
  layer.style.cursor = '';
}

function beginFreehandDraw(e) {
  const viewport = editorState.currentViewport;
  if (!viewport) {
    cancelFreehandMode();
    return;
  }
  e.preventDefault();
  finishTextEdit?.();
  const layerRect = layer.getBoundingClientRect();

  const preview = document.createElementNS(SVG_NS, 'svg');
  preview.setAttribute('class', 'draw-preview');
  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', 'rgb(26, 26, 26)');
  poly.setAttribute('stroke-width', String(2 * viewport.scale));
  poly.setAttribute('stroke-linecap', 'round');
  poly.setAttribute('stroke-linejoin', 'round');
  preview.appendChild(poly);
  layer.appendChild(preview);

  const screenPoints = [];
  const addPoint = (ev) => {
    screenPoints.push({ x: ev.clientX - layerRect.left, y: ev.clientY - layerRect.top });
    poly.setAttribute('points', screenPoints.map((p) => `${p.x},${p.y}`).join(' '));
  };
  addPoint(e);
  layer.setPointerCapture(e.pointerId);

  const onMove = (ev) => addPoint(ev);
  const onUp = () => {
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onUp);
    preview.remove();
    cancelFreehandMode();
    finishFreehandDraw(screenPoints, viewport);
  };
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
}

function finishFreehandDraw(screenPoints, viewport) {
  if (screenPoints.length < 2) return;
  const pdfPoints = screenPoints.map((p) => toPdfPoint(viewport, p.x, p.y));
  const xs = pdfPoints.map((p) => p.x);
  const ys = pdfPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < DRAW_MIN_SIZE && height < DRAW_MIN_SIZE) return;

  const points = pdfPoints.map((p) => ({
    x: width > 0 ? (p.x - minX) / width : 0.5,
    y: height > 0 ? (maxY - p.y) / height : 0.5
  }));

  const overlay = createOverlay(editorState.activePageIndex, {
    type: 'freehand',
    x: minX,
    y: maxY,
    width: Math.max(width, DRAW_MIN_SIZE),
    height: Math.max(height, DRAW_MIN_SIZE),
    points,
    strokeColor: { r: 0.1, g: 0.1, b: 0.1 },
    fillColor: null,
    lineWidth: 2,
    opacity: 1
  });
  selectOverlay(overlay.id);
}

// Linha/seta usam só o ponto inicial e final do arraste (ao contrário do
// desenho livre, que guarda o traço inteiro) - o ângulo/direção fica livre,
// exatamente o que o usuário arrastar na tela.
function beginLineDraw(e, type) {
  const viewport = editorState.currentViewport;
  if (!viewport) {
    cancelFreehandMode();
    return;
  }
  e.preventDefault();
  finishTextEdit?.();
  const layerRect = layer.getBoundingClientRect();
  const start = { x: e.clientX - layerRect.left, y: e.clientY - layerRect.top };
  const strokeWidth = 2 * viewport.scale;
  const stroke = 'rgb(26, 26, 26)';

  const preview = document.createElementNS(SVG_NS, 'svg');
  preview.setAttribute('class', 'draw-preview');
  const line = buildLine(start, start, stroke, strokeWidth);
  preview.appendChild(line);
  layer.appendChild(preview);
  let headLines = [];

  layer.setPointerCapture(e.pointerId);
  let end = start;

  const onMove = (ev) => {
    end = { x: ev.clientX - layerRect.left, y: ev.clientY - layerRect.top };
    line.setAttribute('x2', end.x);
    line.setAttribute('y2', end.y);
    headLines.forEach((l) => l.remove());
    headLines = type === 'arrow' ? buildArrowHead(start, end, stroke, strokeWidth) : [];
    headLines.forEach((l) => preview.appendChild(l));
  };
  const onUp = () => {
    layer.removeEventListener('pointermove', onMove);
    layer.removeEventListener('pointerup', onUp);
    preview.remove();
    cancelFreehandMode();
    finishLineDraw(type, start, end, viewport);
  };
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
}

function finishLineDraw(type, startScreen, endScreen, viewport) {
  const p0 = toPdfPoint(viewport, startScreen.x, startScreen.y);
  const p1 = toPdfPoint(viewport, endScreen.x, endScreen.y);
  const minX = Math.min(p0.x, p1.x);
  const maxX = Math.max(p0.x, p1.x);
  const minY = Math.min(p0.y, p1.y);
  const maxY = Math.max(p0.y, p1.y);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < DRAW_MIN_SIZE && height < DRAW_MIN_SIZE) return;

  const normalize = (p) => ({
    x: width > 0 ? (p.x - minX) / width : 0.5,
    y: height > 0 ? (maxY - p.y) / height : 0.5
  });

  const overlay = createOverlay(editorState.activePageIndex, {
    type,
    x: minX,
    y: maxY,
    width: Math.max(width, DRAW_MIN_SIZE),
    height: Math.max(height, DRAW_MIN_SIZE),
    points: [normalize(p0), normalize(p1)],
    strokeColor: { r: 0.1, g: 0.1, b: 0.1 },
    fillColor: null,
    lineWidth: 2,
    opacity: 1
  });
  selectOverlay(overlay.id);
}

editorState.addEventListener('mode-changed', cancelFreehandMode);
editorState.addEventListener('active-page-changed', cancelFreehandMode);

// Copiar/colar/duplicar entre páginas. Só atua fora de campos editáveis
// (input da barra, texto em edição) para não atropelar o clipboard nativo.
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
