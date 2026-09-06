import { editorState } from '../core/state.js';
import { pickFile, fileToBytes, downloadBlob, suggestName, delay } from '../core/file-io.js';
import { mergeDocument, extractPages, splitPages, parsePageRanges } from './organize-actions.js';
import { showError, showSuccess } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { icons } from '../ui/icons.js';

export function renderOrganizePanel(container) {
  container.innerHTML = `
    <div class="panel-section">
      <h4>Adicionar ao documento</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-merge">${icons.plus}<span class="action-copy">Mesclar outro PDF<small>Reúna arquivos em um documento</small></span></button>
      </div>
    </div>
    <div class="panel-section">
      <h4>Separar páginas</h4>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-extract-selected">${icons.duplicate} Extrair selecionadas</button>
      </div>
      <div class="panel-row">
        <button class="btn btn-ghost" id="btn-split">${icons.filePlus} Dividir por intervalo</button>
      </div>
      <p id="selection-info" class="selection-info" aria-live="polite"></p>
      <p class="panel-note">Marque as páginas nas miniaturas para criar um novo PDF com a seleção.</p>
    </div>
    <details class="panel-help" open>
      <summary>Como organizar</summary>
      <p>Arraste as miniaturas para mudar a ordem das páginas.</p>
      <p>Os ícones abaixo de cada página permitem duplicar, inserir uma página em branco, girar e excluir.</p>
    </details>
  `;
  updateSelectionInfo();

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
      showError('Selecione ao menos uma página (use as caixinhas nas miniaturas).');
      return;
    }
    const bytes = await extractPages(indices);
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), suggestName(editorState.fileName, 'paginas-extraidas'));
    showSuccess(`${indices.length} página(s) extraída(s).`);
  });

  document.getElementById('btn-split').addEventListener('click', () => {
    openSplitModal();
  });
}

function updateSelectionInfo() {
  const count = editorState.selectedPageIndices.size;
  const info = document.getElementById('selection-info');
  if (info) info.textContent = count ? `${count} página${count === 1 ? '' : 's'} selecionada${count === 1 ? '' : 's'}` : 'Nenhuma página selecionada';
  const extract = document.getElementById('btn-extract-selected');
  if (extract) extract.disabled = count === 0;
}
editorState.addEventListener('selection-changed', updateSelectionInfo);
editorState.addEventListener('pages-changed', updateSelectionInfo);

function openSplitModal() {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Dividir por intervalo</h3>
      <div class="modal-body">Informe os intervalos de página separados por vírgula. Exemplo: 1-3, 4, 5-6</div>
      <label class="field-label">Intervalos</label>
      <input type="text" class="text-input" id="split-range-input" placeholder="1-3, 4-6" />
      <p class="hint">Documento tem ${editorState.pageCount} página(s). Cada intervalo vira um arquivo separado.</p>
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
