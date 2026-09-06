const root = document.getElementById('modal-root');

function onBackdropClick(e) {
  if (e.target === root) closeModal();
}

export function openModal(buildFn, { dismissible = true } = {}) {
  root.innerHTML = '';
  root.hidden = false;
  const box = document.createElement('div');
  box.className = 'modal';
  root.appendChild(box);
  if (dismissible) root.addEventListener('click', onBackdropClick);
  buildFn(box, closeModal);
  return box;
}

export function closeModal() {
  root.hidden = true;
  root.innerHTML = '';
  root.removeEventListener('click', onBackdropClick);
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    openModal((box, close) => {
      box.innerHTML = `
        <h3></h3>
        <div class="modal-body"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-action="cancel">Cancelar</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm"></button>
        </div>
      `;
      box.querySelector('h3').textContent = title;
      box.querySelector('.modal-body').textContent = message;
      box.querySelector('[data-action="confirm"]').textContent = confirmLabel;
      box.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        close();
        resolve(false);
      });
      box.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        close();
        resolve(true);
      });
    });
  });
}
