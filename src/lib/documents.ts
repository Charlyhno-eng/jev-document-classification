import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { extensionOf, isPlainTextDocument } from '../../shared/document-policy';

export async function readDocumentText(file: File): Promise<string> {
  const extension = extensionOf(file.name);
  if (isPlainTextDocument(file.name)) return file.text();
  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = await Promise.all(Array.from({ length: Math.min(pdf.numPages, 25) }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '')).join('');
    }));
    return pages.join('\n');
  }
  throw new Error(`.${extension || 'unknown'} files cannot be read. Supported formats: PDF, DOCX, TXT, MD, CSV, JSON, XML, HTML, and RTF.`);
}
