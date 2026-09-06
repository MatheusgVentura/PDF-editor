import { PDFDocument, rgb, degrees, StandardFonts, LineCapStyle } from '../../vendor/pdf-lib/pdf-lib.esm.min.js';

const FONT_ASCENT_RATIO = 0.8;

async function embedOverlayImage(pdfDoc, overlay, imageCache) {
  if (imageCache.has(overlay.id)) return imageCache.get(overlay.id);
  const isPng = overlay.mimeType === 'image/png';
  const embedded = isPng
    ? await pdfDoc.embedPng(overlay.imageBytes)
    : await pdfDoc.embedJpg(overlay.imageBytes);
  imageCache.set(overlay.id, embedded);
  return embedded;
}

function toRgbColor(c) {
  return rgb(c.r, c.g, c.b);
}

// Linha/seta/desenho livre guardam pontos normalizados (0..1) dentro da caixa
// do overlay - converte para o ponto absoluto em espaco PDF antes de desenhar.
function absolutePoint(overlay, p) {
  return { x: overlay.x + p.x * overlay.width, y: overlay.y - p.y * overlay.height };
}

// Ponta da seta como um "V" (mesma matemática do preview em overlay-renderer.js,
// só que em espaço PDF), para o resultado exportado bater com o que se vê na tela.
function drawArrowHead(page, a, b, options) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const headLength = Math.max(6, options.thickness * 3.5);
  const spread = Math.PI / 7;
  const left = { x: b.x - headLength * Math.cos(angle - spread), y: b.y - headLength * Math.sin(angle - spread) };
  const right = { x: b.x - headLength * Math.cos(angle + spread), y: b.y - headLength * Math.sin(angle + spread) };
  page.drawLine({ start: b, end: left, ...options });
  page.drawLine({ start: b, end: right, ...options });
}

export async function bakeOverlaysIntoDoc(pdfDoc, pagesData) {
  const hasAnyOverlay = pagesData.some((p) => p.overlays.length > 0);
  if (!hasAnyOverlay) return;

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const imageCache = new Map();

  for (let i = 0; i < pagesData.length; i++) {
    const overlays = pagesData[i].overlays;
    if (!overlays.length) continue;
    const page = pdfDoc.getPage(i);

    for (const overlay of overlays) {
      switch (overlay.type) {
        case 'text': {
          const baselineY = overlay.y - overlay.fontSize * FONT_ASCENT_RATIO;
          page.drawText(overlay.text || '', {
            x: overlay.x,
            y: baselineY,
            size: overlay.fontSize,
            font: helvetica,
            color: toRgbColor(overlay.color),
            lineHeight: overlay.fontSize * 1.15,
            maxWidth: overlay.width
          });
          break;
        }
        case 'image': {
          const embedded = await embedOverlayImage(pdfDoc, overlay, imageCache);
          page.drawImage(embedded, {
            x: overlay.x,
            y: overlay.y - overlay.height,
            width: overlay.width,
            height: overlay.height
          });
          break;
        }
        case 'rect': {
          const opacity = overlay.opacity ?? 1;
          page.drawRectangle({
            x: overlay.x,
            y: overlay.y - overlay.height,
            width: overlay.width,
            height: overlay.height,
            borderColor: toRgbColor(overlay.strokeColor),
            borderWidth: overlay.lineWidth,
            borderOpacity: opacity,
            ...(overlay.fillColor ? { color: toRgbColor(overlay.fillColor), opacity } : {})
          });
          break;
        }
        case 'ellipse': {
          const opacity = overlay.opacity ?? 1;
          page.drawEllipse({
            x: overlay.x + overlay.width / 2,
            y: overlay.y - overlay.height / 2,
            xScale: overlay.width / 2,
            yScale: overlay.height / 2,
            borderColor: toRgbColor(overlay.strokeColor),
            borderWidth: overlay.lineWidth,
            borderOpacity: opacity,
            ...(overlay.fillColor ? { color: toRgbColor(overlay.fillColor), opacity } : {})
          });
          break;
        }
        case 'line':
        case 'arrow': {
          const [p0, p1] = overlay.points;
          const a = absolutePoint(overlay, p0);
          const b = absolutePoint(overlay, p1);
          const lineOptions = {
            thickness: overlay.lineWidth,
            color: toRgbColor(overlay.strokeColor),
            opacity: overlay.opacity ?? 1,
            lineCap: LineCapStyle.Round
          };
          page.drawLine({ start: a, end: b, ...lineOptions });
          if (overlay.type === 'arrow') drawArrowHead(page, a, b, lineOptions);
          break;
        }
        case 'freehand': {
          const points = (overlay.points || []).map((p) => absolutePoint(overlay, p));
          const lineOptions = {
            thickness: overlay.lineWidth,
            color: toRgbColor(overlay.strokeColor),
            opacity: overlay.opacity ?? 1,
            lineCap: LineCapStyle.Round
          };
          for (let p = 0; p < points.length - 1; p++) {
            page.drawLine({ start: points[p], end: points[p + 1], ...lineOptions });
          }
          break;
        }
        case 'watermark': {
          // pdf-lib gira o texto em torno do ponto (x, y) da base do texto, não
          // do centro da caixa. Para o texto ficar centralizado na página após
          // girar (igual ao preview), calculamos o ponto de ancoragem a partir
          // do centro da caixa e do ângulo, usando a largura real da fonte.
          const angleDeg = overlay.rotation || 0;
          const angleRad = (angleDeg * Math.PI) / 180;
          const textWidth = helvetica.widthOfTextAtSize(overlay.text || '', overlay.fontSize);
          const halfAscent = (overlay.fontSize * FONT_ASCENT_RATIO) / 2;
          const centerX = overlay.x + overlay.width / 2;
          const centerY = overlay.y - overlay.height / 2;
          const cos = Math.cos(angleRad);
          const sin = Math.sin(angleRad);
          const localOffsetX = textWidth / 2;
          const anchorX = centerX - (localOffsetX * cos - halfAscent * sin);
          const anchorY = centerY - (localOffsetX * sin + halfAscent * cos);
          page.drawText(overlay.text || '', {
            x: anchorX,
            y: anchorY,
            size: overlay.fontSize,
            font: helvetica,
            color: toRgbColor(overlay.color),
            opacity: overlay.opacity,
            rotate: degrees(angleDeg)
          });
          break;
        }
        default:
          break;
      }
    }
  }
}

export async function createExportCopyWithOverlays(pdfLibDoc, pagesData) {
  const bytes = await pdfLibDoc.save();
  const exportDoc = await PDFDocument.load(bytes);
  await bakeOverlaysIntoDoc(exportDoc, pagesData);
  return exportDoc;
}
