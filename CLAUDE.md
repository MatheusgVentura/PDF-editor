# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Editor de PDF local, gratuito e privado, que roda inteiramente no navegador (organizar páginas, adicionar
conteúdo, preencher formulários, exportar). Sem backend, sem conta, sem upload — tudo processado no cliente
com pdf.js (renderização/leitura) e pdf-lib (escrita/edição). Ver README.md para a descrição voltada ao usuário
final e a lista de funcionalidades/limitações conhecidas.

## Rodando o projeto

Não há build step, bundler, linter ou suíte de testes configurados — é só abrir e editar.

```bash
npm start        # roda node server.js
# ou: ./start.sh / start.bat (mesma coisa, com atalho de duplo-clique no Windows)
```

`server.js` é um servidor estático de ~80 linhas, zero dependências, cuja única razão de existir é servir os
arquivos por `http://` (a página abre sozinha em `http://localhost:8420`, ou a próxima porta livre até +10
tentativas) — módulos ES não funcionam corretamente sob `file://` no Chromium. Ele também abre o navegador
padrão automaticamente ao iniciar (`start`/`open`/`xdg-open` conforme o SO).

Não existe comando de teste/lint. Para verificar uma mudança manualmente, suba o servidor e interaja pelo
navegador (ou veja a seção abaixo sobre automação via CDP).

## Arquitetura

Tudo é JavaScript puro carregado como ES modules nativos direto pelo navegador — sem bundler, sem transpilação,
sem passo de build. `index.html` carrega `js/main.js` com `type="module"`.

**Vendoring**: `vendor/pdfjs/` e `vendor/pdf-lib/` contêm bundles de browser pré-compilados, commitados
diretamente no repo (não gerados a partir de `node_modules` — não existe script de cópia). Todo código do app
importa desses caminhos relativos (`../../vendor/...`). `pdf-lib`/`pdfjs-dist` em `package.json` ficam em
`devDependencies` só de apoio para scripts locais (ex.: gerar um PDF de teste rápido em Node) — não são usadas
pelo runtime do app, que depende só de `vendor/`.

**Estado central** (`js/core/state.js`): uma única instância `editorState` (EventTarget) compartilhada por todos
os módulos. Guarda `pdfLibDoc` (documento pdf-lib, fonte da verdade para mutações estruturais — girar, excluir,
reordenar, mesclar páginas) e `pdfjsDoc` (usado só para renderização/preview). Toda mutação estrutural via
pdf-lib é seguida de `resyncPdfjsFromPdfLib`/`resyncPdfjs` para o preview acompanhar. `editorState.pages[i].overlays`
guarda o conteúdo adicionado (texto/imagem/forma/assinatura) por página, independente do PDF original. Mudanças
de estado disparam eventos (`document-loaded`, `pages-changed`, `active-page-changed`, `mode-changed`,
`overlays-changed`, `dirty-changed`) que os módulos de UI escutam para re-renderizar — não há um framework
reativo, é pub/sub manual.

**Os 4 modos** (`editorState.mode`, abas em `main.js`): `organize`, `content`, `forms`, `export`. Cada modo tem
seu painel lateral renderizado em `renderSidePanel()` (main.js) e seu(s) módulo(s) próprio(s):
- `js/organize/` — mesclar/reordenar/girar/excluir/extrair/dividir páginas (mutações diretas em `pdfLibDoc`).
- `js/content-editor/` — overlays de texto/imagem/forma/assinatura desenhados por cima da página.
- `js/forms/` — detecta e preenche campos de formulário AcroForm já existentes no PDF.
- `js/export/` — exporta PNG/texto/PDF comprimido; não afeta `editorState`.

**Overlays de conteúdo** (`js/content-editor/`): cada overlay é um objeto simples `{id, type, x, y, width,
height, ...}` guardado em espaço PDF (pontos, origem inferior-esquerda), nunca em pixels de tela. `overlay-model.js`
é o CRUD sobre `editorState.pages[i].overlays`. `overlay-renderer.js` desenha uma `<div>` absoluta por overlay
em `#overlay-layer` (que fica sobreposto ao `<canvas>` da página) e cuida de seleção/arraste/redimensionamento/
edição inline; a conversão de coordenadas tela↔PDF fica isolada em `js/core/coords.js` (necessária porque a
página pode estar rotacionada 0/90/180/270°). Overlays só viram desenho real no PDF na hora de salvar/exportar:
`bake.js` clona o documento (`pdfLibDoc.save()` + reload) e usa `pdfDoc.drawText/drawImage/drawRectangle/
drawEllipse` sobre a cópia — o documento em edição em memória nunca é "queimado" diretamente, então overlays
continuam editáveis/removíveis a qualquer momento antes de salvar.

**Conteúdo disponível** (`main.js` → `renderContentPanel`): textos, imagens, assinaturas (imagens PNG),
retângulos, elipses, linhas, setas e desenho livre. Há também numeração de páginas e marca-d'água.
Os controles de estilo ficam na barra flutuante do elemento selecionado.

## Estado atual / contexto do projeto

- **Identidade visual**: a logo (`design/logo/Logo Editor PDF.jpg`) foi adicionada e o esquema de cores do app
  foi atualizado para usar as duas cores da logo — `--navy: #33464d` (topbar) e `--accent: #fe6400` (laranja,
  botão primário/abas ativas/seleção) — extraídas por amostragem de pixel da própria logo. `--bg: #e9ebf0` é o
  cinza-claro por trás da página do PDF, para ela se destacar dos painéis brancos ao redor. README.md também
  referencia a logo no cabeçalho.
- **Interface**: a tela inicial tem área ampla para abrir/arrastar PDFs; o editor tem abas com ícones,
  miniaturas em `#pages-panel`, visualização em `#document-stage` e ferramentas em `#side-panel`.
  `#thumbnail-strip` mantém o mesmo ID e fica dentro do painel de páginas. Os painéis recebem título
  e descrição via `renderSidePanel()`. Instruções detalhadas de conteúdo ficam em "Dicas e atalhos".
  Em telas de até 900 px, o painel de ferramentas vai para baixo da visualização em todos os modos.
  A paleta principal continua a mesma; `--accent-ink` é a variação escura para texto laranja legível.
- **Navegação e zoom**: anterior/próxima e contadores acompanham eventos de páginas. O zoom usa a escala
  real do pdf.js (75–200% ou "Ajustar à largura", padrão), não um transform CSS. Um ResizeObserver
  recalcula o ajuste de largura; as coordenadas dos overlays continuam em pontos PDF.
- **Formas reintroduzidas pelo usuário**: retângulo/elipse, linha/seta e desenho livre agora estão
  disponíveis em "Formas e desenho", com cor, espessura, preenchimento e transparência na seleção.
  Preservar essas ferramentas, a duplicação de páginas/elementos, numeração, marca-d'água e o progresso
  com cancelamento nas operações demoradas.
- **Edição de texto**: inserir texto já inicia a digitação com o conteúdo selecionado. A seleção tem
  contorno discreto e uma barra flutuante com tamanho (6–144 pt), cor, editar e excluir. O texto usa
  Helvetica/Arial no preview para se aproximar da Helvetica exportada. Ctrl+Enter conclui, Esc restaura
  a edição atual e clicar fora confirma. Em telas estreitas, o painel de conteúdo fica abaixo da página.
- **Preservar o duplo clique**: `selectOverlay()` atualiza seleção e controles sem substituir os elementos
  dos overlays; reconstruir o DOM entre cliques impede o `dblclick` real do navegador. A digitação usa
  `.overlay-text-content` com `contenteditable="plaintext-only"`; a barra é irmã do overlay, portanto
  controles nunca entram no texto salvo. O commit no blur atualiza o model sem reconstruir o DOM,
  preservando o botão da barra que está recebendo o clique. Quebras de linha são lidas com `innerText`.
- Limitações conhecidas do produto (PDFs com senha, sem OCR, overlay não edita texto pré-existente, export de
  imagens sem zip, fidelidade de formulários em reorder/extract/split) estão documentadas no README e ainda
  valem.

## Testando mudanças de UI manualmente via CDP

Não há Playwright/chromium-cli instalados neste ambiente. Para validar uma mudança de UI sem depender do
usuário abrir o navegador manualmente, uma abordagem que funcionou nesta sessão: subir um servidor estático
próprio em Node (não usar `server.js` diretamente em automação — ele chama `openBrowser()` e abre o navegador
real do usuário), abrir `chrome.exe --headless=new --remote-debugging-port=<porta>` e falar CDP puro via
`WebSocket` global do Node (disponível nativamente a partir do Node 22+, sem instalar nada). Pontos que
renderam esse caminho não-óbvio:
- Cliques disparados via `Runtime.evaluate` + `.click()` **não** contam como gesto real do usuário — abrir um
  `<input type="file">` (ex.: botão "Escolher arquivo") exige `Input.dispatchMouseEvent` (mousePressed/Released)
  nas coordenadas reais do botão, combinado com `Page.setInterceptFileChooserDialog` + `Page.fileChooserOpened`
  + `DOM.setFileInputFiles`.
- Duplo clique real (para reproduzir o bug acima) também precisa de `Input.dispatchMouseEvent` com
  `clickCount: 1` e depois `clickCount: 2` — simular via `dispatchEvent(new MouseEvent('dblclick'))` não
  reproduz a lógica de contagem de cliques do navegador (que depende do alvo do DOM ser o mesmo nas duas
  vezes), logo não teria pego o bug real.
