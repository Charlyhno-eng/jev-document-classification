import { DollarSign, FileText, Languages, Zap } from 'lucide-react';
import type { Classification, RunSummary } from '../types';

type Props = {
  results: Classification[];
  summary: RunSummary | null;
  totalCost: number;
  totalTokens: number;
  classified: number;
  languageBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
};

export function RunDashboard({ results, summary, totalCost, totalTokens, classified, languageBreakdown, categoryBreakdown }: Props) {
  return <section className="mt-14">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Run dashboard</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Classification report</h2></div>{summary && <p className="text-sm text-slate-500">Completed {summary.completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<FileText size={18} />} label="Files classified" value={`${classified} / ${results.length}`} /><Metric icon={<Languages size={18} />} label="Languages found" value={`${Object.keys(languageBreakdown).length}`} /><Metric icon={<Zap size={18} />} label="Total time" value={summary ? formatDuration(summary.durationMs) : 'In progress'} /><Metric icon={<DollarSign size={18} />} label="JEV API cost" value={formatMoney(summary?.totalCost ?? totalCost)} detail={`${(summary?.totalInputTokens ?? totalTokens).toLocaleString()} input tokens`} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <section className="glass-card p-6"><h3 className="font-bold">Destination overview</h3><div className="mt-5 space-y-4">{Object.entries(categoryBreakdown).map(([category, count]) => <Breakdown key={category} label={category} value={count} total={results.length} />)}{Object.entries(languageBreakdown).map(([language, count]) => <Breakdown key={language} label={language} value={count} total={results.length} subtle />)}</div></section>
      <DocumentAudit results={results} />
    </div>
  </section>;
}

function DocumentAudit({ results }: { results: Classification[] }) {
  return <section className="glass-card overflow-hidden"><div className="border-b border-white/8 px-6 py-5"><h3 className="font-bold">Document audit</h3><p className="mt-1 text-sm text-slate-500">Every classification and move from this run.</p></div><div className="overflow-x-auto"><table><thead><tr><th>Document</th><th>Category</th><th>Language</th><th>Precise subject</th><th>Status</th></tr></thead><tbody>{results.map((item) => <AuditRow key={item.id} item={item} />)}</tbody></table></div></section>;
}

function AuditRow({ item }: { item: Classification }) {
  return <tr className={item.unprocessable ? 'unprocessable-row' : undefined}>
    <td><div className="flex items-center gap-2 font-medium text-slate-300"><FileText size={15} className="text-slate-600" />{item.fileName}</div>{item.error && <p className="mt-1 max-w-xs text-xs text-rose-400">{item.error}</p>}</td>
    {item.unprocessable ? <td colSpan={3} className="unprocessable-cell"><strong>Not classifiable</strong><span>{item.note ?? 'This file cannot be processed by JEV.'}</span></td> : <><td>{item.category}</td><td>{item.language}</td><td className="subject-cell" title={item.subject}>{item.subject}</td></>}
    <td>{item.unprocessable ? <span className="status status-warning">Not processable</span> : item.moved ? <span className="status status-ok">Moved</span> : <span className="status status-error">Skipped</span>}</td>
  </tr>;
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) { return <div className="metric-card"><div className="metric-icon">{icon}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>{detail && <p className="mt-1 text-xs text-slate-600">{detail}</p>}</div>; }
function Breakdown({ label, value, total, subtle }: { label: string; value: number; total: number; subtle?: boolean }) { const width = total ? (value / total) * 100 : 0; return <div><div className="mb-2 flex justify-between text-sm"><span className={subtle ? 'text-slate-500' : 'font-medium text-slate-300'}>{label}</span><span className="text-slate-500">{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className={subtle ? 'h-full rounded-full bg-slate-600' : 'progress-gradient h-full rounded-full'} style={{ width: `${width}%` }} /></div></div>; }
const formatMoney = (value: number) => `$${value < 0.01 ? value.toFixed(5) : value.toFixed(2)}`;
const formatDuration = (milliseconds: number) => { const seconds = milliseconds / 1000; return seconds < 60 ? `${seconds.toFixed(1)} sec` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`; };
