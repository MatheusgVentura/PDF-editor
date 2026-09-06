import { downloadBlob, suggestName } from '../core/file-io.js';

export async function extractAllText(pdfjsDoc, fileName) {
  const count = pdfjsDoc.numPages;
  const parts = [];
  for (let i = 1; i <= count; i++) {
    const page = await pdfjsDoc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    parts.push(`--- Página ${i} ---\n\n${text}`);
  }
  const blob = new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, suggestName(fileName, 'texto', 'txt'));
}
