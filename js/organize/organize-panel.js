import { editorState } from '../core/state.js';
import { pickFile, fileToBytes, downloadBlob, suggestName, delay } from '../core/file-io.js';
import { mergeDocument, extractPages, splitPages, parsePageRanges } from './organize-actions.js';
import { showError, showSuccess } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { icons } from '../ui/icons.js';

export function renderOrganizePanel(container) {
  container.innerHTML = `
    <div class="panel-section">
      <h4>Paginas</h4>
      <p class="panel-note">Arraste as miniaturas para reordenar. Use os icones em cada miniatura para girar ou excluir.</p>
    </div>
    <div class="panel-section">
      <h4>Adicionar</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-merge">${icons.plus} Mesclar outro PDF</button>
      </div>
    </div>
    <div class="panel-section">
      <h4>Extrair / Dividir</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-extract-selected">Extrair selecionadas</button>
      </div>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-split">Dividir por intervalo</button>
      </div>
      <p class="panel-note">Marque as caixinhas nas miniaturas para escolher as paginas a extrair.</p>
    </div>
  `;

  const mergeInput = document.getElementById('file-input-merge');
  document.getElementById('btn-merge').addEventListener('click', async () => {
    const file = await pickFile(mergeInput);
    if (!file) return;
    const bytes = await fileToBytes(file);
    await mergeDocument(bytes);
  });

  document.getElementById('btn-extract-selected').addEventListener('click', async () => {
    const indices = Array.from(editorState.selectedPageIndices).sort((a, b) => a - b);
    if (!indices.length) {
      showError('Selecione ao menos uma pagina (use as caixinhas nas miniaturas).');
      return;
    }
    const bytes = await extractPages(indices);
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), suggestName(editorState.fileName, 'paginas-extraidas'));
    showSuccess(`${indices.length} pagina(s) extraida(s).`);
  });

  document.getElementById('btn-split').addEventListener('click', () => {
    openSplitModal();
  });
}

function openSplitModal() {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Dividir por intervalo</h3>
      <div class="modal-body">Informe os intervalos de pagina separados por virgula. Exemplo: 1-3, 4, 5-6</div>
      <label class="field-label">Intervalos</label>
      <input type="text" class="text-input" id="split-range-input" placeholder="1-3, 4-6" />
      <p class="hint">Documento tem ${editorState.pageCount} pagina(s). Cada intervalo vira um arquivo separado.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="cancel">Cancelar</button>
        <button class="btn btn-primary" data-action="confirm">Dividir</button>
      </div>
    `;
    box.querySelector('[data-action="cancel"]').addEventListener('click', close);
    box.querySelector('[data-action="confirm"]').addEventListener('click', async () => {
      const input = box.querySelector('#split-range-input').value;
      let ranges;
      try {
        ranges = parsePageRanges(input, editorState.pageCount);
      } catch (err) {
        showError(err.message);
        return;
      }
      close();
      const results = await splitPages(ranges);
      for (let i = 0; i < results.length; i++) {
        downloadBlob(
          new Blob([results[i].bytes], { type: 'application/pdf' }),
          suggestName(editorState.fileName, results[i].label)
        );
        if (i < results.length - 1) await delay(250);
      }
      showSuccess(`${results.length} arquivo(s) gerado(s).`);
    });
  });
}
