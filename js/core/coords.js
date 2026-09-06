// Conversao entre pixels de tela (espaco do canvas/viewport do pdf.js) e
// pontos PDF (espaço não rotacionado da página, usado pelo pdf-lib para desenhar).
//
// Overlays são guardados como uma caixa em espaço PDF: {x, y, width, height},
// onde (x, y) é o canto com MENOR x e MAIOR y em espaço PDF (ou seja, o canto
// "superior esquerdo" antes de qualquer rotação de exibição). Como a rotação
// de página do PDF só pode ser 0/90/180/270 graus, converter os dois cantos
// diagonais da caixa (em vez de tentar transformar só um vetor de tamanho)
// dá sempre a caixa retangular alinhada aos eixos correta na tela, em
// qualquer rotação.

export function toPdfPoint(viewport, x, y) {
  const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);
  return { x: pdfX, y: pdfY };
}

export function toViewportPoint(viewport, x, y) {
  const [vx, vy] = viewport.convertToViewportPoint(x, y);
  return { x: vx, y: vy };
}

// Caixa de tela (left, top, width, height em px) -> caixa em espaco PDF.
export function pdfBoxFromScreen(viewport, box) {
  const p1 = toPdfPoint(viewport, box.left, box.top);
  const p2 = toPdfPoint(viewport, box.left + box.width, box.top + box.height);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.max(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y)
  };
}

// Caixa em espaco PDF ({x, y, width, height}, com y = topo) -> caixa de tela.
export function screenBoxFromPdf(viewport, box) {
  const p1 = toViewportPoint(viewport, box.x, box.y);
  const p2 = toViewportPoint(viewport, box.x + box.width, box.y - box.height);
  return {
    left: Math.min(p1.x, p2.x),
    top: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y)
  };
}
