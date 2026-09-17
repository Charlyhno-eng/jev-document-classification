export function createPdf(text: string) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  const objects = ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n', '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`];
  const parts = ['%PDF-1.4\n'];
  const offsets: number[] = [];
  for (const object of objects) { offsets.push(Buffer.byteLength(parts.join(''))); parts.push(object); }
  const xref = Buffer.byteLength(parts.join(''));
  parts.push(`xref\n0 6\n0000000000 65535 f \n${offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(parts.join(''));
}
