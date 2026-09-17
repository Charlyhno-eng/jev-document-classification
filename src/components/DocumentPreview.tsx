import { FileText, X } from 'lucide-react';
import type { DocumentPreview } from '../hooks/useDocumentClassification';

type Props = { preview: DocumentPreview | null; onClose: () => void };

export function DocumentPreview({ preview, onClose }: Props) {
  if (!preview) return null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${preview.title}`} onMouseDown={onClose}>
    <section className="document-preview" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">Document preview</p><h2 title={preview.title}>{preview.title}</h2></div><button type="button" className="modal-close" onClick={onClose} aria-label="Close preview"><X size={18} /></button></header>
      {preview.kind === 'pdf' && preview.url ? <iframe className="preview-pdf" title={`Preview of ${preview.title}`} src={preview.url} /> : preview.kind === 'image' && preview.url ? <div className="preview-image"><img src={preview.url} alt={`Preview of ${preview.title}`} /></div> : <div className="preview-text"><FileText size={18} /><pre>{preview.text}</pre></div>}
    </section>
  </div>;
}
