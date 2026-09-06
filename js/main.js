import { editorState } from './core/state.js';
import {
  loadDocument,
  renderPageToCanvas,
  resyncPdfjsFromPdfLib,
  EncryptedPdfNotSupportedError
} from './core/pdf-engine.js';
import { pickFile, setupDropzone, fileToBytes, downloadBlob, suggestName } from './core/file-io.js';
import { showError, showSuccess } from './ui/toast.js';
import { confirmDialog, openModal } from './ui/modal.js';
import { icons } from './ui/icons.js';
import './ui/thumbnail-strip.js';
import { renderOverlays, clearSelection } from './content-editor/overlay-renderer.js';
import { createExportCopyWithOverlays } from './content-editor/bake.js';
import { renderOrganizePanel } from './organize/organize-panel.js';
import { parsePageRanges } from './organize/organize-actions.js';
import { renderFormsPanel } from './forms/form-render.js';
import { addTextOverlay } from './content-editor/tools/text-tool.js';
import { addImageOverlay } from './content-editor/tools/image-tool.js';
import { openSignaturePad } from './content-editor/tools/signature-tool.js';
import { applyPageNumbers, removePageNumbers } from './content-editor/tools/page-number-tool.js';
import { applyWatermark, removeWatermark } from './content-editor/tools/watermark-tool.js';
import { exportPageAsPng, exportAllPagesAsPng } from './export/export-images.js';
import { extractAllText } from './export/export-text.js';
import { compressSafe, compressAggressive } from './export/export-compress.js';

const els = {
  emptyState: document.getElementById('empty-state'),
  dropzone: document.getElementById('dropzone'),
  workspace: document.getElementById('workspace'),
  modeTabs: document.getElementById('mode-tabs'),
  fileNameLabel: document.getElementById('file-name'),
  btnOpen: document.getElementById('btn-open'),
  btnSave: document.getElementById('btn-save'),
  btnChooseFile: document.getElementById('btn-choose-file'),
  fileInput: document.getElementById('file-input'),
  fileInputImage: document.getElementById('file-input-image'),
  pageCanvas: document.getElementById('page-canvas'),
  sidePanel: document.getElementById('side-panel')
};

// ---------- Abrir arquivo ----------

async function openFile(file) {
  try {
    const bytes = await fileToBytes(file);
    const { pdfLibDoc, pdfjsDoc } = await loadDocument(bytes);
    editorState.setDocument(pdfLibDoc, pdfjsDoc, file.name);
    showWorkspace();
    editorState.setMode('organize');
  } catch (err) {
    if (err instanceof EncryptedPdfNotSupportedError) {
      showError(err.message);
    } else {
      console.error(err);
      showError('Não foi possível abrir esse arquivo. Verifique se é um PDF válido.');
    }
  }
}

function showWorkspace() {
  els.emptyState.hidden = true;
  els.workspace.hidden = false;
  els.modeTabs.hidden = false;
  els.btnSave.hidden = false;
  els.fileNameLabel.textContent = editorState.fileName;
}

els.btnChooseFile.addEventListener('click', async () => {
  const file = await pickFile(els.fileInput);
  if (file) await openFile(file);
});
els.btnOpen.addEventListener('click', async () => {
  const file = await pickFile(els.fileInput);
  if (file) await openFile(file);
});
setupDropzone(els.dropzone, (files) => {
  const file = files[0];
  if (file) openFile(file);
});

// ---------- Renderização da página ativa ----------

let renderPageToken = 0;

async function renderActivePage() {
  if (!editorState.pdfjsDoc) return;
  clearSelection();
  const token = ++renderPageToken;
  try {
    const viewport = await renderPageToCanvas(editorState.pdfjsDoc, editorState.activePageIndex, els.pageCanvas, {
      scale: 1.5
    });
    if (token !== renderPageToken) return; // uma chamada mais recente já assumiu o canvas
    editorState.currentViewport = viewport;
    renderOverlays();
  } catch (err) {
    console.error(err);
    showError('Não foi possível renderizar a página.');
  }
}

editorState.addEventListener('document-loaded', renderActivePage);
editorState.addEventListener('active-page-changed', renderActivePage);
editorState.addEventListener('pages-changed', renderActivePage);

// ---------- Abas de modo ----------

document.querySelectorAll('.mode-tab').forEach((tab) => {
  tab.addEventListener('click', () => editorState.setMode(tab.dataset.mode));
});

editorState.addEventListener('mode-changed', () => {
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === editorState.mode);
  });
  renderSidePanel();
});

function renderSidePanel() {
  const panel = els.sidePanel;
  if (!editorState.hasDocument) {
    panel.innerHTML = '';
    return;
  }
  if (editorState.mode === 'organize') renderOrganizePanel(panel);
  else if (editorState.mode === 'content') renderContentPanel(panel);
  else if (editorState.mode === 'forms') renderFormsPanelWrapper(panel);
  else if (editorState.mode === 'export') renderExportPanel(panel);
}

// ---------- Painel: Adicionar Conteúdo ----------

function renderContentPanel(container) {
  container.innerHTML = `
    <div class="panel-section">
      <h4>Adicionar</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="tool-text">${icons.text} Texto</button>
        <button class="btn btn-ghost" id="tool-image">${icons.image} Imagem</button>
      </div>
      <div class="panel-row">
        <button class="btn btn-ghost" id="tool-signature">${icons.signature} Assinatura</button>
      </div>
    </div>
    <div class="panel-section">
      <h4>Numeração e marca-d'água</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="tool-page-numbers">${icons.hash} Numeração de páginas</button>
      </div>
      <div class="panel-row">
        <button class="btn btn-ghost" id="tool-watermark">${icons.droplet} Marca-d'água</button>
      </div>
      <p class="panel-note">
        Aplica a todas as páginas ou a um intervalo. Cada número/marca vira um texto
        normal sobre a página — pode ser movido, editado ou excluído como qualquer outro.
      </p>
    </div>
    <div class="panel-section">
      <p class="panel-note">
        Adicione um texto e comece a digitar. Use a barra sobre a seleção para ajustar tamanho e cor.
        Clique fora para concluir ou dê um duplo clique para editar novamente.
      </p>
      <p class="panel-note">
        Arraste para posicionar e use a alça no canto para redimensionar.
        Ctrl+Enter conclui a digitação; Esc cancela a edição atual.
        O conteúdo é adicionado sobre o PDF, sem alterar o texto original.
      </p>
      <p class="panel-note">
        Com um elemento selecionado: Ctrl+D duplica na mesma página,
        Ctrl+C copia e Ctrl+V cola — inclusive em outra página do documento.
      </p>
    </div>
  `;

  document.getElementById('tool-text').addEventListener('click', addTextOverlay);
  document.getElementById('tool-image').addEventListener('click', () => addImageOverlay(els.fileInputImage));
  document.getElementById('tool-signature').addEventListener('click', openSignaturePad);
  document.getElementById('tool-page-numbers').addEventListener('click', openPageNumberModal);
  document.getElementById('tool-watermark').addEventListener('click', openWatermarkModal);
}

// ---------- Numeração de páginas / marca-d'água: helpers compartilhados ----------

function hexToColor(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255
  };
}

// Reaproveita o parser de intervalos do modo Organizar (que agrupa por vírgula
// para gerar arquivos separados) juntando tudo num único conjunto ordenado.
function resolvePageIndices(scope, rangeInput) {
  if (scope === 'all') return Array.from({ length: editorState.pageCount }, (_, i) => i);
  const groups = parsePageRanges(rangeInput, editorState.pageCount);
  return Array.from(new Set(groups.flat())).sort((a, b) => a - b);
}

function setupScopeToggle(box, scopeSelectId, rangeInputId) {
  const scopeSelect = box.querySelector(`#${scopeSelectId}`);
  const rangeInput = box.querySelector(`#${rangeInputId}`);
  scopeSelect.addEventListener('change', () => {
    rangeInput.hidden = scopeSelect.value !== 'range';
  });
}

function openPageNumberModal() {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Numeração de páginas</h3>
      <label class="field-label">Formato</label>
      <select class="select-input" id="pn-format">
        <option value="page-n-of-total" selected>Página 1 de 10</option>
        <option value="n-of-total">1 / 10</option>
        <option value="page-n">Página 1</option>
        <option value="n">1</option>
      </select>
      <label class="field-label">Posição</label>
      <select class="select-input" id="pn-position">
        <option value="bottom-center" selected>Inferior centro</option>
        <option value="bottom-right">Inferior direita</option>
        <option value="bottom-left">Inferior esquerda</option>
        <option value="top-center">Superior centro</option>
        <option value="top-right">Superior direita</option>
        <option value="top-left">Superior esquerda</option>
      </select>
      <label class="field-label">Começar em</label>
      <input type="number" class="text-input" id="pn-start" min="1" value="1" />
      <label class="field-label">Tamanho da fonte</label>
      <input type="number" class="text-input" id="pn-size" min="6" max="72" value="10" />
      <label class="field-label">Aplicar a</label>
      <select class="select-input" id="pn-scope">
        <option value="all" selected>Todas as páginas</option>
        <option value="range">Intervalo de páginas</option>
      </select>
      <input type="text" class="text-input" id="pn-range" placeholder="1-3, 5" hidden />
      <p class="hint">Documento tem ${editorState.pageCount} página(s).</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="remove">Remover numeração</button>
        <button class="btn btn-ghost" data-action="cancel">Cancelar</button>
        <button class="btn btn-primary" data-action="confirm">Aplicar</button>
      </div>
    `;
    setupScopeToggle(box, 'pn-scope', 'pn-range');
    box.querySelector('[data-action="cancel"]').addEventListener('click', close);
    box.querySelector('[data-action="remove"]').addEventListener('click', () => {
      close();
      removePageNumbers();
      showSuccess('Numeração removida.');
    });
    box.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      const scope = box.querySelector('#pn-scope').value;
      let pageIndices;
      try {
        pageIndices = resolvePageIndices(scope, box.querySelector('#pn-range').value);
      } catch (err) {
        showError(err.message);
        return;
      }
      close();
      applyPageNumbers({
        format: box.querySelector('#pn-format').value,
        position: box.querySelector('#pn-position').value,
        startAt: Math.max(1, Number(box.querySelector('#pn-start').value) || 1),
        fontSize: Number(box.querySelector('#pn-size').value) || 10,
        color: { r: 0.1, g: 0.1, b: 0.1 },
        pageIndices
      });
      showSuccess(`Numeração aplicada a ${pageIndices.length} página(s).`);
    });
  });
}

function openWatermarkModal() {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Marca-d'água</h3>
      <label class="field-label">Texto</label>
      <input type="text" class="text-input" id="wm-text" value="CONFIDENCIAL" />
      <label class="field-label">Tamanho da fonte</label>
      <input type="number" class="text-input" id="wm-size" min="10" max="200" value="60" />
      <label class="field-label">Cor</label>
      <input type="color" class="text-input" id="wm-color" value="#999999" />
      <label class="field-label">Opacidade (<span id="wm-opacity-label">30</span>%)</label>
      <input type="range" id="wm-opacity" min="5" max="100" value="30" style="width:100%; margin-bottom: var(--space-3);" />
      <label class="field-label">Rotação (graus)</label>
      <input type="number" class="text-input" id="wm-rotation" min="-90" max="90" value="45" />
      <label class="field-label">Aplicar a</label>
      <select class="select-input" id="wm-scope">
        <option value="all" selected>Todas as páginas</option>
        <option value="range">Intervalo de páginas</option>
      </select>
      <input type="text" class="text-input" id="wm-range" placeholder="1-3, 5" hidden />
      <p class="hint">Documento tem ${editorState.pageCount} página(s).</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="remove">Remover marca-d'água</button>
        <button class="btn btn-ghost" data-action="cancel">Cancelar</button>
        <button class="btn btn-primary" data-action="confirm">Aplicar</button>
      </div>
    `;
    setupScopeToggle(box, 'wm-scope', 'wm-range');
    const opacitySlider = box.querySelector('#wm-opacity');
    const opacityLabel = box.querySelector('#wm-opacity-label');
    opacitySlider.addEventListener('input', () => {
      opacityLabel.textContent = opacitySlider.value;
    });
    box.querySelector('[data-action="cancel"]').addEventListener('click', close);
    box.querySelector('[data-action="remove"]').addEventListener('click', () => {
      close();
      removeWatermark();
      showSuccess('Marca-d\'água removida.');
    });
    box.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      const scope = box.querySelector('#wm-scope').value;
      let pageIndices;
      try {
        pageIndices = resolvePageIndices(scope, box.querySelector('#wm-range').value);
      } catch (err) {
        showError(err.message);
        return;
      }
      const text = box.querySelector('#wm-text').value.trim();
      if (!text) {
        showError('Informe o texto da marca-d\'água.');
        return;
      }
      close();
      applyWatermark({
        text,
        fontSize: Number(box.querySelector('#wm-size').value) || 60,
        color: hexToColor(box.querySelector('#wm-color').value),
        opacity: Number(opacitySlider.value) / 100,
        rotation: Number(box.querySelector('#wm-rotation').value) || 0,
        pageIndices
      });
      showSuccess(`Marca-d'água aplicada a ${pageIndices.length} página(s).`);
    });
  });
}

// ---------- Painel: Preencher Formulário ----------

function renderFormsPanelWrapper(container) {
  container.innerHTML = '<div id="forms-container"></div>';
  const formsContainer = document.getElementById('forms-container');
  renderFormsPanel(formsContainer, editorState.pdfLibDoc);

  const fields = editorState.pdfLibDoc.getForm().getFields();
  if (fields.length) {
    const row = document.createElement('div');
    row.className = 'checkbox-row';
    row.style.marginTop = 'var(--space-4)';
    row.style.paddingTop = 'var(--space-4)';
    row.style.borderTop = '1px solid var(--border)';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'flatten-checkbox';
    checkbox.checked = editorState.flattenOnExport;
    checkbox.addEventListener('change', () => {
      editorState.flattenOnExport = checkbox.checked;
    });

    const label = document.createElement('label');
    label.htmlFor = 'flatten-checkbox';
    label.textContent = 'Achatar campos ao salvar (torna os valores permanentes)';

    row.appendChild(checkbox);
    row.appendChild(label);
    container.appendChild(row);
  }
}

// ---------- Painel: Exportar ----------

function renderExportPanel(container) {
  container.innerHTML = `
    <div class="panel-section">
      <h4>Imagens</h4>
      <label class="field-label">Qualidade</label>
      <select class="select-input" id="export-scale">
        <option value="1">Padrão</option>
        <option value="2" selected>Alta</option>
        <option value="3">Máxima</option>
      </select>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-export-page-png">Página atual (PNG)</button>
      </div>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-export-all-png">Todas as páginas (PNG)</button>
      </div>
      <p class="panel-note">As páginas são baixadas uma por uma. Se o navegador perguntar, permita múltiplos downloads.</p>
    </div>
    <div class="panel-section">
      <h4>Texto</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-export-text">Extrair texto (.txt)</button>
      </div>
    </div>
    <div class="panel-section">
      <h4>Compressão</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-compress-safe">Compressão segura</button>
      </div>
      <p class="panel-note">Redução leve e sem perdas. Funciona melhor em PDFs com muitas páginas ou formulários.</p>
      <div class="panel-row">
        <button class="btn btn-danger" id="btn-compress-aggressive">Compressão agressiva</button>
      </div>
      <p class="panel-note">
        Reconstrói o PDF a partir de imagens das páginas: reduz bastante o tamanho, mas o texto deixa
        de ser selecionável e páginas com texto pequeno podem ficar borradas. Ideal para PDFs escaneados.
        Não pode ser desfeito depois de exportado.
      </p>
    </div>
  `;

  document.getElementById('btn-export-page-png').addEventListener('click', async () => {
    const scale = Number(document.getElementById('export-scale').value);
    const { exportPdfjsDoc } = await getExportContext();
    await exportPageAsPng(exportPdfjsDoc, editorState.activePageIndex, editorState.fileName, scale);
  });

  document.getElementById('btn-export-all-png').addEventListener('click', async () => {
    const scale = Number(document.getElementById('export-scale').value);
    const { exportPdfjsDoc } = await getExportContext();
    showSuccess('Exportando páginas — se o navegador perguntar, permita múltiplos downloads.');
    await exportAllPagesAsPng(exportPdfjsDoc, editorState.fileName, scale);
  });

  document.getElementById('btn-export-text').addEventListener('click', async () => {
    const { exportPdfjsDoc } = await getExportContext();
    await extractAllText(exportPdfjsDoc, editorState.fileName);
  });

  document.getElementById('btn-compress-safe').addEventListener('click', async () => {
    const { exportDoc } = await getExportContext();
    const { before, after } = await compressSafe(exportDoc, editorState.fileName);
    showSuccess(`Reduzido de ${formatBytes(before)} para ${formatBytes(after)}.`);
  });

  document.getElementById('btn-compress-aggressive').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Compressão agressiva',
      message:
        'Isso transforma cada página numa imagem: o texto deixa de ser selecionável/pesquisável e páginas com texto pequeno podem ficar borradas. Deseja continuar?',
      confirmLabel: 'Continuar',
      danger: true
    });
    if (!ok) return;
    const { exportPdfjsDoc } = await getExportContext();
    showSuccess('Comprimindo, isso pode levar alguns segundos...');
    const size = await compressAggressive(exportPdfjsDoc, editorState.fileName);
    showSuccess(`Arquivo comprimido gerado (${formatBytes(size)}).`);
  });
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function getExportContext() {
  const exportDoc = await createExportCopyWithOverlays(editorState.pdfLibDoc, editorState.pages);
  const exportPdfjsDoc = await resyncPdfjsFromPdfLib(exportDoc);
  return { exportDoc, exportPdfjsDoc };
}

// ---------- Salvar alterações ----------

els.btnSave.addEventListener('click', async () => {
  try {
    const exportDoc = await createExportCopyWithOverlays(editorState.pdfLibDoc, editorState.pages);
    if (editorState.flattenOnExport) {
      try {
        exportDoc.getForm().flatten();
      } catch (err) {
        console.warn('Não foi possível achatar o formulário:', err);
      }
    }
    const bytes = await exportDoc.save();
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), suggestName(editorState.fileName, 'editado'));
    showSuccess('PDF salvo.');
  } catch (err) {
    console.error(err);
    showError('Não foi possível salvar o PDF.');
  }
});
