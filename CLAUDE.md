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
importa desses caminhos relativos (`../../vendor/...`). As dependências `pdf-lib`/`pdfjs-dist` em
`package.json`/`node_modules` não são usadas pelo runtime do app.

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

**Tipos de overlay**: `text`, `image`, `signature` (assinatura é só uma imagem PNG gerada a partir de um canvas
de desenho) estão expostos na aba "Adicionar Conteúdo" (`main.js` → `renderContentPanel`). `rect`/`ellipse`
existem no model, no renderer e no bake, mas **não têm botão na UI hoje** — foram removidos de propósito (ver
"Estado atual" abaixo), não é código morto para limpar.

## Estado atual / contexto do projeto

- **Identidade visual**: a logo (`design/logo/Logo Editor PDF.jpg`) foi adicionada e o esquema de cores do app
  foi atualizado para usar as duas cores da logo — `--navy: #33464d` (topbar) e `--accent: #fe6400` (laranja,
  botão primário/abas ativas/seleção) — extraídas por amostragem de pixel da própria logo. `--bg: #e9ebf0` é o
  cinza-claro por trás da página do PDF, para ela se destacar dos painéis brancos ao redor. README.md também
  referencia a logo no cabeçalho.
- **Retângulo/Elipse removidos da UI de propósito**: o usuário pediu para tirar esses botões porque "não
  servem para nada por enquanto" — só voltam quando existir uma aba dedicada de "Formas Geométricas" com opção
  de cor. Não remover `shape-tool.js` nem o suporte a `rect`/`ellipse` em `overlay-renderer.js`/`bake.js`, eles
  ficam prontos para quando essa aba for construída.
- **Bug corrigido — duplo clique não editava texto**: em `overlay-renderer.js`, o `pointerdown` de um overlay
  chamava `selectOverlay()` mesmo quando o item já estava selecionado, o que reconstruía `#overlay-layer`
  inteiro (`innerHTML = ''`) a cada clique. Isso trocava o nó DOM entre os dois cliques de um duplo clique, e o
  navegador só dispara `dblclick` quando os dois cliques acontecem no mesmo elemento — então o evento nunca
  disparava. A correção pula a reconstrução quando `overlay.id === selectedId`. De brinde, o botão de excluir
  (que é filho do próprio `<div>` de texto, para posicionamento absoluto) agora é removido do DOM antes de
  ativar `contentEditable`, evitando que o "×" dele interfira na edição.
- **Screenshots do README removidos temporariamente**: existiam em `docs/screenshots/` referenciados no
  README, mas foram tirados das seções de funcionalidades a pedido do usuário até a UI passar por uma
  "polida" visual — os arquivos continuam no repo para serem reaproveitados depois.
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
