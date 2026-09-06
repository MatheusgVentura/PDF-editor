const container = document.getElementById('toast-container');

export function showToast(message, type = 'default', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast${type !== 'default' ? ` ${type}` : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, duration);
}

export function showError(message) {
  showToast(message, 'error', 6000);
}

export function showSuccess(message) {
  showToast(message, 'success');
}
