import { openModal, closeModal } from './modal.js';

// Modal de progresso para operações longas (exportar muitas páginas,
// compressão agressiva). Não fecha ao clicar fora - só via cancelar ou
// quando a operação chamar close(). O cancelamento usa AbortController: a
// operação em si decide, entre uma página e outra, se para de verdade.
export function openProgressModal(title) {
  const controller = new AbortController();
  let fillEl;
  let labelEl;
  let cancelBtn;

  openModal((box) => {
    box.innerHTML = `
      <h3></h3>
      <div class="progress-track"><div class="progress-fill"></div></div>
      <p class="progress-label"></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-action="cancel">Cancelar</button>
      </div>
    `;
    box.querySelector('h3').textContent = title;
    fillEl = box.querySelector('.progress-fill');
    labelEl = box.querySelector('.progress-label');
    cancelBtn = box.querySelector('[data-action="cancel"]');
    cancelBtn.addEventListener('click', () => {
      controller.abort();
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelando...';
    });
  }, { dismissible: false });

  return {
    signal: controller.signal,
    update(current, total, label) {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      fillEl.style.width = `${pct}%`;
      labelEl.textContent = label ?? `${current} / ${total}`;
    },
    close: closeModal
  };
}
