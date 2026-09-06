<div align="center">

<img src="design/logo/Logo%20Editor%20PDF.jpg" alt="Logo Editor de PDF" width="160">

# 📄 Editor de PDF

**Um editor de PDF gratuito e privado que roda inteiramente no seu navegador.**
Sem paywall, sem conta, sem upload — seus arquivos nunca saem do seu computador.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![No Backend](https://img.shields.io/badge/backend-nenhum-brightgreen.svg)
![Vanilla JS](https://img.shields.io/badge/JS-vanilla%2C%20sem%20build%20step-yellow.svg)

</div>

---

## Por que este projeto existe

A maioria dos editores de PDF "grátis" na internet trava as funções básicas atrás de assinatura, ou pior, exige que você faça upload do seu documento para um servidor de terceiros. Este projeto é a resposta a isso: um editor completo que processa tudo **localmente, no seu navegador**, usando duas bibliotecas open source ([pdf.js](https://github.com/mozilla/pdf.js) e [pdf-lib](https://github.com/Hopding/pdf-lib)) — sem backend, sem conta, sem limite de uso.

## Funcionalidades

### 🗂️ Organizar páginas
Mesclar PDFs, arrastar para reordenar, girar ou excluir páginas, extrair uma seleção ou dividir o documento por intervalo de páginas.

![Organizar páginas](docs/screenshots/organizar.png)

### ✏️ Adicionar conteúdo
Insira texto, imagens, formas (retângulo/elipse) e uma assinatura desenhada à mão diretamente sobre as páginas — arraste, redimensione e edite antes de salvar.

![Adicionar conteúdo](docs/screenshots/adicionar-conteudo.png)

### 📝 Preencher formulários
Detecta automaticamente campos de formulário (texto, caixas de seleção, botões de opção, listas suspensas) já existentes no PDF e permite preenchê-los, com opção de achatar os campos ao salvar.

![Preencher formulários](docs/screenshots/formularios.png)

### 📤 Converter e exportar
Exporte páginas como imagem PNG, extraia todo o texto do documento, ou comprima o arquivo (modo seguro, sem perdas, ou modo agressivo para PDFs escaneados).

![Exportar](docs/screenshots/exportar.png)

## Como usar

**Pré-requisito:** ter o [Node.js](https://nodejs.org) instalado (usado apenas para servir os arquivos localmente — nenhum pacote precisa ser instalado para rodar o app).

```bash
git clone git@github.com:MatheusgVentura/PDF-editor.git
cd PDF-editor
```

- **Windows:** dê duplo-clique em `start.bat`
- **macOS/Linux:** rode `./start.sh` (ou `npm start`)

O navegador abre automaticamente em `http://localhost:8420`. Nenhum dado do seu PDF é enviado para fora da sua máquina em nenhum momento.

## Stack

- **JavaScript puro** (sem framework, sem bundler, sem passo de build) — todo o app é ES modules nativos carregados direto pelo navegador.
- **[pdf.js](https://github.com/mozilla/pdf.js)** (Mozilla, Apache 2.0) — renderização de páginas e extração de texto.
- **[pdf-lib](https://github.com/Hopding/pdf-lib)** (MIT) — criação, edição e escrita de PDFs.
- Um servidor Node estático de ~80 linhas, zero dependências, só para contornar a restrição de módulos ES via `file://` no Chromium.

## Limitações conhecidas (v1)

- PDFs protegidos por senha não são suportados (erro claro, sem crash).
- Sem OCR.
- Adiciona conteúdo novo por cima da página — não edita texto que já existe no PDF original.
- Exportação de várias páginas como imagem baixa os arquivos um por um (sem empacotamento em ZIP).
- Reordenar/extrair/dividir páginas de PDFs com formulários complexos pode não preservar 100% da fidelidade dos campos.

## Contribuindo

Pull requests são bem-vindos! O projeto não tem build step — edite os arquivos em `js/`, `css/` ou `index.html` diretamente e rode `start.bat`/`start.sh` para testar na hora. Estrutura geral:

```
js/
├─ core/            # estado, motor de renderização (pdf.js), conversão de coordenadas
├─ ui/               # componentes compartilhados (miniaturas, modal, toast)
├─ organize/         # organizar páginas
├─ content-editor/   # adicionar texto/imagem/forma/assinatura
├─ forms/            # preencher formulários
└─ export/           # exportar imagens/texto/compressão
```

## Licença

[MIT](LICENSE) — use, copie e modifique à vontade.
