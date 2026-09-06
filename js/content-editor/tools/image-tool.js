import { editorState } from '../../core/state.js';
import { createOverlay } from '../overlay-model.js';
import { selectOverlay } from '../overlay-renderer.js';
import { pickFile, fileToBytes } from '../../core/file-io.js';
import { showError } from '../../ui/toast.js';

export async function addImageOverlay(inputEl) {
  if (!editorState.hasDocument) return;
  const file = await pickFile(inputEl);
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    showError('Escolha uma imagem PNG ou JPG.');
    return;
  }
  const bytes = await fileToBytes(file);
  await placeImageBytes(bytes, file.type);
}

export async function placeImageBytes(bytes, mimeType) {
  let dims;
  try {
    dims = await getImageDimensions(bytes, mimeType);
  } catch {
    showError('Não foi possível ler essa imagem.');
    return;
  }

  const page = editorState.pdfLibDoc.getPage(editorState.activePageIndex);
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const maxWidth = pageWidth * 0.45;
  const scale = Math.min(1, maxWidth / dims.width);
  const boxWidth = dims.width * scale;
  const boxHeight = dims.height * scale;

  const overlay = createOverlay(editorState.activePageIndex, {
    type: 'image',
    x: (pageWidth - boxWidth) / 2,
    y: pageHeight * 0.75,
    width: boxWidth,
    height: boxHeight,
    imageBytes: bytes,
    mimeType,
    previewUrl: URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  });
  selectOverlay(overlay.id);
}

function getImageDimensions(bytes, mimeType) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('invalid image'));
    };
    img.src = url;
  });
}
