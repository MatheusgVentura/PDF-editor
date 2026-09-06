import { editorState } from './core/state.js';
import {
  loadDocument,
  renderPageToCanvas,
  resyncPdfjsFromPdfLib,
  EncryptedPdfNotSupportedError
} from './core/pdf-engine.js';
import { pickFile, setupDropzone, fileToBytes, downloadBlob, suggestName } from './core/file-io.js';
import { showError, showSuccess } from './ui/toast.js';
import { confirmDialog } from './ui/modal.js';
import { icons } from './ui/icons.js';
import './ui/thumbnail-strip.js';
import { renderOverlays, clearSelection } from './content-editor/overlay-renderer.js';
import { createExportCopyWithOverlays } from './content-editor/bake.js';
import { renderOrganizePanel } from './organize/organize-panel.js';
import { renderFormsPanel } from './forms/form-render.js';
import { addTextOverlay } from './content-editor/tools/text-tool.js';
import { addImageOverlay } from './content-editor/tools/image-tool.js';
import { openSignaturePad } from './content-editor/tools/signature-tool.js';
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
      showError('Nao foi possivel abrir esse arquivo. Verifique se e um PDF valido.');
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

// ---------- Renderizacao da pagina ativa ----------

let renderPageToken = 0;

async function renderActivePage() {
  if (!editorState.pdfjsDoc) return;
  clearSelection();
  const token = ++renderPageToken;
  try {
    const viewport = await renderPageToCanvas(editorState.pdfjsDoc, editorState.activePageIndex, els.pageCanvas, {
      scale: 1.5
    });
    if (token !== renderPageToken) return; // uma chamada mais recente ja assumiu o canvas
    editorState.currentViewport = viewport;
    renderOverlays();
  } catch (err) {
    console.error(err);
    showError('Nao foi possivel renderizar a pagina.');
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

// ---------- Painel: Adicionar Conteudo ----------

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
      <p class="panel-note">
        Clique num item para adiciona-lo ao centro da pagina, depois arraste para posicionar
        e use a alca no canto para redimensionar. De um duplo clique num texto para edita-lo.
        Isso adiciona conteudo novo por cima do PDF — nao edita o texto ja existente no documento.
      </p>
    </div>
  `;

  document.getElementById('tool-text').addEventListener('click', addTextOverlay);
  document.getElementById('tool-image').addEventListener('click', () => addImageOverlay(els.fileInputImage));
  document.getElementById('tool-signature').addEventListener('click', openSignaturePad);
}

// ---------- Painel: Preencher Formulario ----------

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
        <option value="1">Padrao</option>
        <option value="2" selected>Alta</option>
        <option value="3">Maxima</option>
      </select>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-export-page-png">Pagina atual (PNG)</button>
      </div>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-export-all-png">Todas as paginas (PNG)</button>
      </div>
      <p class="panel-note">As paginas sao baixadas uma por uma. Se o navegador perguntar, permita multiplos downloads.</p>
    </div>
    <div class="panel-section">
      <h4>Texto</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-export-text">Extrair texto (.txt)</button>
      </div>
    </div>
    <div class="panel-section">
      <h4>Compressao</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-compress-safe">Compressao segura</button>
      </div>
      <p class="panel-note">Reducao leve e sem perdas. Funciona melhor em PDFs com muitas paginas ou formularios.</p>
      <div class="panel-row">
        <button class="btn btn-danger" id="btn-compress-aggressive">Compressao agressiva</button>
      </div>
      <p class="panel-note">
        Reconstroi o PDF a partir de imagens das paginas: reduz bastante o tamanho, mas o texto deixa
        de ser selecionavel e paginas com texto pequeno podem ficar borradas. Ideal para PDFs escaneados.
        Nao pode ser desfeito depois de exportado.
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
    showSuccess('Exportando paginas — se o navegador perguntar, permita multiplos downloads.');
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
      title: 'Compressao agressiva',
      message:
        'Isso transforma cada pagina numa imagem: o texto deixa de ser selecionavel/pesquisavel e paginas com texto pequeno podem ficar borradas. Deseja continuar?',
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

// ---------- Salvar alteracoes ----------

els.btnSave.addEventListener('click', async () => {
  try {
    const exportDoc = await createExportCopyWithOverlays(editorState.pdfLibDoc, editorState.pages);
    if (editorState.flattenOnExport) {
      try {
        exportDoc.getForm().flatten();
      } catch (err) {
        console.warn('Nao foi possivel achatar o formulario:', err);
      }
    }
    const bytes = await exportDoc.save();
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), suggestName(editorState.fileName, 'editado'));
    showSuccess('PDF salvo.');
  } catch (err) {
    console.error(err);
    showError('Nao foi possivel salvar o PDF.');
  }
});
