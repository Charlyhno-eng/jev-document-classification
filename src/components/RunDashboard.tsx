import { DollarSign, Eye, FileText, Languages, RotateCcw, Zap } from 'lucide-react';
import type { Classification, RunSummary } from '../types';

type Props = {
  results: Classification[];
  summary: RunSummary | null;
  totalCost: number;
  totalTokens: number;
  classified: number;
  languageBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  onPreview: (item: Classification) => void;
  onUndo: (item: Classification) => void;
  undoingId: string | null;
};

export function RunDashboard({ results, summary, totalCost, totalTokens, classified, languageBreakdown, categoryBreakdown, onPreview, onUndo, undoingId }: Props) {
  return <section className="mt-14">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Run dashboard</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Classification report</h2></div>{summary && <p className="text-sm text-slate-500">Completed {summary.completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<FileText size={18} />} label="Files classified" value={`${classified} / ${results.length}`} /><Metric icon={<Languages size={18} />} label="Languages found" value={`${Object.keys(languageBreakdown).length}`} /><Metric icon={<Zap size={18} />} label="Total time" value={summary ? formatDuration(summary.durationMs) : 'In progress'} /><Metric icon={<DollarSign size={18} />} label="JEV API cost" value={formatMoney(summary?.totalCost ?? totalCost)} detail={`${(summary?.totalInputTokens ?? totalTokens).toLocaleString()} input tokens`} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <section className="glass-card p-6"><h3 className="font-bold">Destination overview</h3><div className="mt-5 space-y-4">{Object.entries(categoryBreakdown).map(([category, count]) => <Breakdown key={category} label={category} value={count} total={results.length} />)}{Object.entries(languageBreakdown).map(([language, count]) => <Breakdown key={language} label={language} value={count} total={classified} subtle />)}</div></section>
      <DocumentAudit results={results} onPreview={onPreview} onUndo={onUndo} undoingId={undoingId} />
    </div>
  </section>;
}

function DocumentAudit({ results, onPreview, onUndo, undoingId }: Pick<Props, 'results' | 'onPreview' | 'onUndo' | 'undoingId'>) {
  return <section className="glass-card overflow-hidden"><div className="border-b border-white/8 px-6 py-5"><h3 className="font-bold">Document audit</h3><p className="mt-1 text-sm text-slate-500">Every classification and move from this run.</p></div><div className="audit-list">{results.map((item) => <AuditCard key={item.id} item={item} onPreview={onPreview} onUndo={onUndo} undoing={undoingId === item.id} />)}</div></section>;
}

function AuditCard({ item, onPreview, onUndo, undoing }: { item: Classification; onPreview: (item: Classification) => void; onUndo: (item: Classification) => void; undoing: boolean }) {
  const status = item.unprocessable ? <span className="status status-warning">Not processable</span> : item.undone ? <span className="status status-neutral">Restored</span> : item.needsReview ? <span className="status status-warning">Needs review</span> : item.moved ? <span className="status status-ok">Moved</span> : <span className="status status-error">Skipped</span>;
  return <article className={`audit-card ${item.unprocessable ? 'unprocessable-row' : ''}`}>
    <div className="audit-card-header"><div className="min-w-0"><div className="flex items-center gap-2 font-medium text-slate-200"><FileText size={16} className="shrink-0 text-slate-600" /><span className="truncate">{item.fileName}</span></div>{item.error && <p className="mt-1 text-xs text-rose-400">{item.error}</p>}</div><div className="audit-card-actions">{status}{item.moved && <div className="audit-actions"><button type="button" className="audit-button" onClick={() => onPreview(item)}><Eye size={14} />View</button><button type="button" className="audit-button" disabled={undoing} onClick={() => onUndo(item)}><RotateCcw size={14} />{undoing ? 'Restoring' : 'Undo'}</button></div>}</div></div>
    <div className="audit-details">
      <AuditDetail label="Category"><span>{item.category}</span>{item.suggestedCategory && <small>Suggested: {item.suggestedCategory}</small>}</AuditDetail>
      <AuditDetail label="Confidence">{item.confidence === null ? 'Unavailable' : `${Math.round(item.confidence * 100)}%`}</AuditDetail>
      {item.unprocessable ? <AuditDetail label="Details" wide>{item.note ?? 'This file cannot be processed by JEV.'}</AuditDetail> : <><AuditDetail label="Language">{item.language}</AuditDetail><AuditDetail label="Precise subject" wide>{item.subject}</AuditDetail></>}
    </div>
  </article>;
}

function AuditDetail({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) { return <div className={wide ? 'audit-detail audit-detail-wide' : 'audit-detail'}><p>{label}</p><div>{children}</div></div>; }

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) { return <div className="metric-card"><div className="metric-icon">{icon}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>{detail && <p className="mt-1 text-xs text-slate-600">{detail}</p>}</div>; }
function Breakdown({ label, value, total, subtle }: { label: string; value: number; total: number; subtle?: boolean }) { const width = total ? (value / total) * 100 : 0; return <div><div className="mb-2 flex justify-between text-sm"><span className={subtle ? 'text-slate-500' : 'font-medium text-slate-300'}>{label}</span><span className="text-slate-500">{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className={subtle ? 'h-full rounded-full bg-slate-600' : 'progress-gradient h-full rounded-full'} style={{ width: `${width}%` }} /></div></div>; }
const formatMoney = (value: number) => `$${value < 0.01 ? value.toFixed(5) : value.toFixed(2)}`;
const formatDuration = (milliseconds: number) => { const seconds = milliseconds / 1000; return seconds < 60 ? `${seconds.toFixed(1)} sec` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`; };
