// Conversao entre pixels de tela (espaco do canvas/viewport do pdf.js) e
// pontos PDF (espaco nao rotacionado da pagina, usado pelo pdf-lib para desenhar).
//
// Overlays sao guardados como uma caixa em espaco PDF: {x, y, width, height},
// onde (x, y) e o canto com MENOR x e MAIOR y em espaco PDF (ou seja, o canto
// "superior esquerdo" antes de qualquer rotacao de exibicao). Como a rotacao
// de pagina do PDF so pode ser 0/90/180/270 graus, converter os dois cantos
// diagonais da caixa (em vez de tentar transformar so um vetor de tamanho)
// da sempre a caixa retangular alinhada aos eixos correta na tela, em
// qualquer rotacao.

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
