import { DollarSign, Eye, FileText, LockKeyhole, RotateCcw, ShieldAlert, Zap } from 'lucide-react';
import { useState } from 'react';
import type { RunPerformance } from '../lib/run-metrics';
import type { Classification, RunSummary } from '../types';
import { SUSPECTED_PROMPT_INJECTION_FOLDER } from '../../shared/document-policy';

type Props = {
  results: Classification[];
  summary: RunSummary | null;
  totalCost: number;
  totalTokens: number;
  classified: number;
  categoryBreakdown: Record<string, number>;
  performance: RunPerformance;
  onPreview: (item: Classification) => void;
  onUndo: (item: Classification) => void;
  undoingId: string | null;
};

export function RunDashboard({ results, summary, totalCost, totalTokens, classified, categoryBreakdown, performance, onPreview, onUndo, undoingId }: Props) {
  return <section className="mt-14">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Run dashboard</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Classification report</h2></div>{summary && <p className="text-sm text-slate-500">Completed {summary.completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<FileText size={18} />} label="Files classified" value={`${classified} / ${results.length}`} />
      <Metric icon={<LockKeyhole size={18} />} label="Confidential documents" value={`${results.filter((item) => ['Confidential', 'Restricted'].includes(item.confidentiality)).length}`} />
      <Metric icon={<ShieldAlert size={18} />} label="Prompt injection alerts" value={`${results.filter((item) => item.promptInjectionRisk).length}`} />
      <Metric icon={<Zap size={18} />} label="Total time" value={summary ? formatDuration(summary.durationMs) : 'In progress'} />
      <Metric icon={<DollarSign size={18} />} label="JEV API cost" value={formatMoney(summary?.totalCost ?? totalCost)} detail={`${(summary?.totalInputTokens ?? totalTokens).toLocaleString()} input tokens`} />
      <Metric icon={<DollarSign size={18} />} label="Cache savings" value={formatMoney(performance.savedCost)} detail={`${performance.savedInputTokens.toLocaleString()} input tokens avoided${performance.cacheHits ? ` · ${performance.cacheHits} cache hit${performance.cacheHits === 1 ? '' : 's'}` : ''}`} />
      <Metric icon={<Zap size={18} />} label="Throughput" value={performance.documentsPerMinute === null ? 'In progress' : `${performance.documentsPerMinute.toFixed(1)} files/min`} />
      <Metric icon={<FileText size={18} />} label="Average confidence" value={performance.averageConfidence === null ? 'Unavailable' : `${Math.round(performance.averageConfidence * 100)}%`} detail={performance.confidenceCount ? `${performance.confidenceCount} JEV decision${performance.confidenceCount === 1 ? '' : 's'}` : undefined} />
    </div>
    <section className="glass-card mt-5 p-6"><h3 className="font-bold">Destination overview</h3><div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(categoryBreakdown).map(([category, count]) => <Breakdown key={category} label={category} value={count} total={results.length} />)}</div></section>
    <DocumentAudit results={results} onPreview={onPreview} onUndo={onUndo} undoingId={undoingId} />
  </section>;
}

function DocumentAudit({ results, onPreview, onUndo, undoingId }: Pick<Props, 'results' | 'onPreview' | 'onUndo' | 'undoingId'>) {
  const [isOpen, setIsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'none' | 'confidentiality' | 'promptInjection'>('none');
  const recentResults = results.slice(-12);
  const sortedResults = sortBy === 'none' ? results : [...results].sort((left, right) => sortBy === 'confidentiality' ? confidentialityScore(right.confidentiality) - confidentialityScore(left.confidentiality) : right.promptInjectionScore - left.promptInjectionScore);
  return <><section className="glass-card mt-5 overflow-hidden"><div className="border-b border-white/8 px-6 py-5"><h3 className="font-bold">Recent document activity</h3><p className="mt-1 text-sm text-slate-500">The latest 12 classifications from this run.</p></div><div className="audit-list audit-list-preview">{recentResults.map((item) => <AuditCard key={item.id} item={item} onPreview={onPreview} onUndo={onUndo} undoing={undoingId === item.id} />)}</div>{results.length > 12 && <div className="border-t border-white/8 px-6 py-5"><button type="button" className="button-secondary w-full" onClick={() => setIsOpen(true)}>View all {results.length} documents</button></div>}</section>{isOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}><section className="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title"><div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5"><div><p className="eyebrow">Full run audit</p><h2 id="audit-modal-title" className="mt-2 text-2xl font-bold">All documents</h2></div><div className="flex items-center gap-3"><label className="sr-only" htmlFor="audit-sort">Sort documents</label><select id="audit-sort" className="audit-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="none">Original order</option><option value="confidentiality">Confidentiality score</option><option value="promptInjection">Prompt injection score</option></select><button type="button" className="modal-close" title="Close audit" onClick={() => setIsOpen(false)}>×</button></div></div><div className="audit-list audit-list-modal">{sortedResults.map((item) => <AuditCard key={item.id} item={item} onPreview={onPreview} onUndo={onUndo} undoing={undoingId === item.id} />)}</div></section></div>}</>;
}

function AuditCard({ item, onPreview, onUndo, undoing }: { item: Classification; onPreview: (item: Classification) => void; onUndo: (item: Classification) => void; undoing: boolean }) {
  const status = item.unprocessable ? <span className="status status-warning">Not processable</span> : item.undone ? <span className="status status-neutral">Restored</span> : item.promptInjectionRisk ? <span className="status status-error">Prompt injection alert</span> : item.needsReview ? <span className="status status-warning">Needs review</span> : item.moved ? <span className="status status-ok">Moved</span> : <span className="status status-error">Skipped</span>;
  return <article className={`audit-card ${item.unprocessable ? 'unprocessable-row' : ''} ${item.promptInjectionRisk ? 'prompt-injection-row' : ''}`}>
    <div className="audit-card-header"><div className="min-w-0"><div className="flex items-center gap-2 font-medium text-slate-200"><FileText size={16} className="shrink-0 text-slate-600" /><span className="truncate">{item.fileName}</span></div>{item.error && <p className="mt-1 text-xs text-rose-400">{item.error}</p>}</div><div className="audit-card-actions">{status}{item.moved && <div className="audit-actions"><button type="button" className="audit-button" onClick={() => onPreview(item)}><Eye size={14} />View</button><button type="button" className="audit-button" disabled={undoing} onClick={() => onUndo(item)}><RotateCcw size={14} />{undoing ? 'Restoring' : 'Undo'}</button></div>}</div></div>
    <div className="audit-details">
      <AuditDetail label="Category"><span>{item.category}</span>{item.suggestedCategory && <small>Suggested: {item.suggestedCategory}</small>}</AuditDetail>
      <AuditDetail label="Confidence">{item.confidence === null ? 'Unavailable' : `${Math.round(item.confidence * 100)}%`}{item.cacheHit && <small>Reused from local cache</small>}</AuditDetail>
      {item.unprocessable ? <AuditDetail label="Details" wide>{item.note ?? 'This file cannot be processed by JEV.'}</AuditDetail> : <><AuditDetail label="Prompt injection score">{item.promptInjectionScore}/100{item.promptInjectionRisk && <small>Moved to Suspected prompt injection</small>}</AuditDetail><AuditDetail label="Confidentiality score">{confidentialityScore(item.confidentiality)}/100 · {item.confidentiality}</AuditDetail><AuditDetail label="Precise subject" wide>{item.subject}</AuditDetail></>}
    </div>
  </article>;
}

function AuditDetail({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) { return <div className={wide ? 'audit-detail audit-detail-wide' : 'audit-detail'}><p>{label}</p><div>{children}</div></div>; }

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) { return <div className="metric-card"><div className="metric-icon">{icon}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>{detail && <p className="mt-1 text-xs text-slate-600">{detail}</p>}</div>; }
function Breakdown({ label, value, total, subtle }: { label: string; value: number; total: number; subtle?: boolean }) { const width = total ? (value / total) * 100 : 0; const promptInjectionAlert = label === SUSPECTED_PROMPT_INJECTION_FOLDER; return <div><div className="mb-2 flex justify-between text-sm"><span className={promptInjectionAlert ? 'font-medium text-rose-300' : subtle ? 'text-slate-500' : 'font-medium text-slate-300'}>{label}</span><span className={promptInjectionAlert ? 'text-rose-300' : 'text-slate-500'}>{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className={promptInjectionAlert ? 'progress-danger h-full rounded-full' : subtle ? 'h-full rounded-full bg-slate-600' : 'progress-gradient h-full rounded-full'} style={{ width: `${width}%` }} /></div></div>; }
const formatMoney = (value: number) => `$${value < 0.01 ? value.toFixed(5) : value.toFixed(2)}`;
const formatDuration = (milliseconds: number) => { const seconds = milliseconds / 1000; return seconds < 60 ? `${seconds.toFixed(1)} sec` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`; };
const confidentialityScore = (level: string) => ({ Public: 0, Internal: 35, Confidential: 70, Restricted: 100 }[level] ?? 0);
