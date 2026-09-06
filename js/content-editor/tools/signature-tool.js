import { openModal } from '../../ui/modal.js';
import { placeImageBytes } from './image-tool.js';
import { showError } from '../../ui/toast.js';

export function openSignaturePad() {
  openModal((box, close) => {
    box.innerHTML = `
      <h3>Desenhar assinatura</h3>
      <div class="signature-pad-wrap">
        <canvas id="signature-canvas"></canvas>
      </div>
      <div class="modal-actions" style="justify-content: space-between;">
        <button class="btn btn-ghost" data-action="clear">Limpar</button>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" data-action="cancel">Cancelar</button>
          <button class="btn btn-primary" data-action="use">Usar assinatura</button>
        </div>
      </div>
    `;

    const canvas = box.querySelector('#signature-canvas');
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    let drawing = false;
    let hasDrawn = false;

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener('pointerdown', (e) => {
      drawing = true;
      hasDrawn = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    ['pointerup', 'pointercancel'].forEach((evt) => {
      canvas.addEventListener(evt, () => {
        drawing = false;
      });
    });

    box.querySelector('[data-action="clear"]').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
    });
    box.querySelector('[data-action="cancel"]').addEventListener('click', close);
    box.querySelector('[data-action="use"]').addEventListener('click', async () => {
      if (!hasDrawn) {
        showError('Desenhe sua assinatura antes de continuar.');
        return;
      }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      close();
      await placeImageBytes(bytes, 'image/png');
    });
  });
}
