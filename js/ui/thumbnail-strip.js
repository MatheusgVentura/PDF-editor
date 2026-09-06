import { editorState } from '../core/state.js';
import { renderThumbnail } from '../core/pdf-engine.js';
import { icons } from './icons.js';
import { confirmDialog } from './modal.js';
import { rotatePage, deletePage, reorderPages, duplicatePage, insertBlankPage } from '../organize/organize-actions.js';
import { showError } from './toast.js';

const stripEl = document.getElementById('thumbnail-strip');

let renderToken = 0;
let dragSourceIndex = null;

export async function renderThumbnailStrip() {
  const token = ++renderToken;

  if (!editorState.pdfjsDoc) {
    stripEl.innerHTML = '';
    return;
  }

  const count = editorState.pageCount;
  let canvases;
  try {
    canvases = await Promise.all(
      Array.from({ length: count }, (_, i) => renderThumbnail(editorState.pdfjsDoc, i, 140))
    );
  } catch (err) {
    showError('Nao foi possivel gerar as miniaturas das paginas.');
    return;
  }

  if (token !== renderToken) return;

  stripEl.innerHTML = '';
  canvases.forEach((canvas, i) => {
    stripEl.appendChild(buildTile(i, canvas));
  });
}

export function updateActiveHighlight() {
  stripEl.querySelectorAll('.thumb-tile').forEach((tile) => {
    const idx = Number(tile.dataset.index);
    tile.classList.toggle('active', idx === editorState.activePageIndex);
  });
}

function buildTile(index, canvas) {
  const isOrganize = editorState.mode === 'organize';

  const tile = document.createElement('div');
  tile.className = 'thumb-tile';
  tile.dataset.index = String(index);
  if (index === editorState.activePageIndex) tile.classList.add('active');
  tile.draggable = isOrganize;

  if (isOrganize) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'thumb-select';
    checkbox.checked = editorState.selectedPageIndices.has(index);
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) editorState.selectedPageIndices.add(index);
      else editorState.selectedPageIndices.delete(index);
      editorState.emit('selection-changed');
    });
    tile.appendChild(checkbox);
  }

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'thumb-canvas-wrap';
  canvasWrap.appendChild(canvas);
  tile.appendChild(canvasWrap);

  const footer = document.createElement('div');
  footer.className = 'thumb-footer';

  const label = document.createElement('span');
  label.className = 'thumb-index';
  label.textContent = String(index + 1);
  footer.appendChild(label);

  if (isOrganize) {
    const actions = document.createElement('div');
    actions.className = 'thumb-actions';
    actions.innerHTML = `
      <button class="icon-btn" data-action="duplicate" title="Duplicar pagina">${icons.duplicate}</button>
      <button class="icon-btn" data-action="insert-blank" title="Inserir pagina em branco depois">${icons.filePlus}</button>
      <button class="icon-btn" data-action="rotate-left" title="Girar para esquerda">${icons.rotateLeft}</button>
      <button class="icon-btn" data-action="rotate-right" title="Girar para direita">${icons.rotateRight}</button>
      <button class="icon-btn danger" data-action="delete" title="Excluir pagina">${icons.trash}</button>
    `;
    actions.querySelector('[data-action="duplicate"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await duplicatePage(index);
    });
    actions.querySelector('[data-action="insert-blank"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await insertBlankPage(index);
    });
    actions.querySelector('[data-action="rotate-left"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await rotatePage(index, -90);
    });
    actions.querySelector('[data-action="rotate-right"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await rotatePage(index, 90);
    });
    actions.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (editorState.pageCount <= 1) {
        showError('O documento precisa ter pelo menos uma pagina.');
        return;
      }
      const ok = await confirmDialog({
        title: 'Excluir pagina',
        message: `Excluir a pagina ${index + 1}? Essa acao nao pode ser desfeita depois de salvar.`,
        confirmLabel: 'Excluir',
        danger: true
      });
      if (ok) await deletePage(index);
    });
    footer.appendChild(actions);
  }

  tile.appendChild(footer);

  tile.addEventListener('click', () => {
    editorState.setActivePage(index);
  });

  if (isOrganize) {
    tile.addEventListener('dragstart', (e) => {
      dragSourceIndex = index;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
    });
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      tile.classList.add('drop-target');
    });
    tile.addEventListener('dragleave', () => {
      tile.classList.remove('drop-target');
    });
    tile.addEventListener('drop', async (e) => {
      e.preventDefault();
      tile.classList.remove('drop-target');
      if (dragSourceIndex === null || dragSourceIndex === index) return;
      await reorderPages(dragSourceIndex, index);
      dragSourceIndex = null;
    });
  }

  return tile;
}

editorState.addEventListener('pages-changed', renderThumbnailStrip);
editorState.addEventListener('mode-changed', renderThumbnailStrip);
editorState.addEventListener('active-page-changed', updateActiveHighlight);
