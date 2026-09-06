// Estado central compartilhado por todos os modos do editor.
export class EditorState extends EventTarget {
  constructor() {
    super();
    this.fileName = '';
    this.pdfLibDoc = null;
    this.pdfjsDoc = null;
    this.pages = []; // { overlays: [] } — uma entrada por página, na ordem atual
    this.activePageIndex = 0;
    this.selectedPageIndices = new Set();
    this.mode = 'organize';
    this.isDirty = false;
    this.currentViewport = null;
    this.flattenOnExport = false;
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  get pageCount() {
    return this.pdfLibDoc ? this.pdfLibDoc.getPageCount() : 0;
  }

  get hasDocument() {
    return this.pdfLibDoc !== null;
  }

  setDocument(pdfLibDoc, pdfjsDoc, fileName) {
    this.pdfLibDoc = pdfLibDoc;
    this.pdfjsDoc = pdfjsDoc;
    this.fileName = fileName;
    this.pages = Array.from({ length: pdfLibDoc.getPageCount() }, () => ({ overlays: [] }));
    this.activePageIndex = 0;
    this.selectedPageIndices = new Set();
    this.isDirty = false;
    this.emit('document-loaded');
    this.emit('pages-changed');
  }

  async resyncPdfjs(pdfjsLib) {
    const bytes = await this.pdfLibDoc.save();
    this.pdfjsDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  }

  setActivePage(index) {
    if (index < 0 || index >= this.pageCount) return;
    this.activePageIndex = index;
    this.emit('active-page-changed');
  }

  setMode(mode) {
    this.mode = mode;
    this.emit('mode-changed');
  }

  markDirty() {
    this.isDirty = true;
    this.emit('dirty-changed');
  }

  getActiveOverlays() {
    const page = this.pages[this.activePageIndex];
    return page ? page.overlays : [];
  }

  reset() {
    this.fileName = '';
    this.pdfLibDoc = null;
    this.pdfjsDoc = null;
    this.pages = [];
    this.activePageIndex = 0;
    this.selectedPageIndices = new Set();
    this.isDirty = false;
    this.currentViewport = null;
    this.flattenOnExport = false;
    this.emit('document-cleared');
  }
}

export const editorState = new EditorState();
