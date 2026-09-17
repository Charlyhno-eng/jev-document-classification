import { useState } from 'react';
import {
  CheckCircle2, ChevronRight, CircleHelp, DollarSign, FileText, FolderOpen, FolderPlus,
  KeyRound, Languages, LoaderCircle, LockKeyhole, Play, Settings, ShieldCheck,
  Trash2, TriangleAlert, XCircle, Zap,
} from 'lucide-react';
import { GatewaySettings } from './components/GatewaySettings';
import { useDocumentClassification } from './hooks/useDocumentClassification';
import appLogo from '../assets/jev-document-classification-logo.png';

const formatMoney = (value: number) => `$${value < 0.01 ? value.toFixed(5) : value.toFixed(2)}`;
const formatDuration = (milliseconds: number) => {
  const seconds = milliseconds / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} sec` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`;
};

export function App() {
  const model = useDocumentClassification();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="app-shell min-h-screen text-white">
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />

      <header className="relative z-10 border-b border-white/10 bg-[#08090d]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img className="brand-logo" src={appLogo} alt="JEV Document Classification logo" />
            <span className="text-base font-bold tracking-tight sm:text-lg">JEV Document Classification</span>
            <span className="hidden rounded-full border border-[#9945ff]/30 bg-[#9945ff]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#c99cff] sm:inline">Local first</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-sm text-slate-400 lg:flex"><ShieldCheck size={16} className="text-[#14f195]" />Files stay on your device</div>
            <button type="button" className="settings-button" onClick={() => setSettingsOpen(true)}>
              <span className={`status-dot ${model.apiKeyConfigured ? 'status-dot-on' : ''}`} />
              <span className="hidden sm:inline">Gateway settings</span>
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-6 pb-16 pt-14 sm:pt-20">
        <section className="mx-auto mb-14 max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold uppercase tracking-[.18em] text-[#14f195]"><Zap size={14} />JEV-powered intelligence</div>
          <h1 className="hero-title text-5xl font-bold tracking-[-.055em] sm:text-7xl lg:text-8xl">Next-generation<br /><span>document classification.</span></h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">Turn an unsorted folder into a clean document system at remarkable speed and exceptionally low cost. Local extraction, typed JEV decisions, and a complete audit trail.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-slate-300">
            <HeroFact icon={<Zap size={15} />} text="Fast, sequential processing" />
            <HeroFact icon={<DollarSign size={15} />} text="$0.04 / 1M input tokens" />
            <HeroFact icon={<LockKeyhole size={15} />} text="No document storage" />
          </div>
        </section>

        {(model.notice || model.error) && <div className={`notice mb-6 ${model.error ? 'notice-error' : 'notice-success'}`}><span>{model.error ? <XCircle size={18} /> : <CheckCircle2 size={18} />}</span><p>{model.error ?? model.notice}</p></div>}

        {!model.configLoaded ? <div className="gateway-required"><LoaderCircle className="animate-spin" size={28} /><p>Loading local configuration…</p></div> : !model.apiKeyConfigured ? (
          <section className="gateway-required gateway-required-alert">
            <div className="gateway-required-icon"><TriangleAlert size={30} /></div>
            <p className="eyebrow">Action required</p>
            <h2>Connect Vercel AI Gateway first</h2>
            <p>Classification is hidden until an API key is saved locally in <code>config/config.toml</code>. The key remains on this machine and is never returned to the browser.</p>
            <button type="button" className="button-primary" onClick={() => setSettingsOpen(true)}><KeyRound size={17} />Configure API key<ChevronRight size={17} /></button>
          </section>
        ) : <>
        <div className="grid gap-5 lg:grid-cols-2">
          <SetupCard number="01" title="Select source folder" icon={<FolderOpen size={19} />}>
            <div className={`folder-drop mt-5 ${model.sourceFolder ? 'folder-drop-active' : ''}`}>
              <div><p className="font-semibold text-white">{model.sourceFolder?.name ?? 'No folder selected'}</p><p className="mt-1 text-sm text-slate-500">{model.sourceFolder ? `${model.fileCount} root-level file${model.fileCount === 1 ? '' : 's'} found` : 'Choose a flat folder from your computer'}</p></div>
              <button type="button" className="button-secondary mt-5 w-full" onClick={model.selectFolder}><FolderOpen size={16} />{model.sourceFolder ? 'Change folder' : 'Browse folders'}</button>
            </div>
            <p className="helper-text"><CircleHelp size={15} />Subfolders are ignored. Unreadable files move to Not processable.</p>
          </SetupCard>

          <SetupCard number="02" title="Define categories" icon={<FolderPlus size={19} />}>
            <p className="mt-4 text-sm leading-6 text-slate-500">JEV chooses exactly one destination for every readable document.</p>
            <div className="mt-5 flex gap-2">
              <input className="input" value={model.newCategory} onChange={(event) => model.setNewCategory(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void model.addCategory(); }} placeholder="e.g. Client projects" />
              <button type="button" className="button-icon" title="Add category" disabled={model.isSavingCategories} onClick={model.addCategory}>{model.isSavingCategories ? <LoaderCircle className="animate-spin" size={18} /> : <FolderPlus size={18} />}</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{model.categories.map((category) => <span key={category} className="tag">{category}<button type="button" title={`Remove ${category}`} disabled={model.isSavingCategories} onClick={() => model.removeCategory(category)}><Trash2 size={13} /></button></span>)}</div>
            <p className="mt-4 text-xs text-slate-600">Saved locally in config/config.toml.</p>
          </SetupCard>
        </div>

        <section className="run-panel mt-5">
          <div><p className="font-semibold text-white">Ready for a next-generation filing run</p><p className="mt-1 text-sm text-slate-400">Extract locally, identify a precise subject, classify with JEV, and move each document into place.</p></div>
          <button type="button" className="button-primary" disabled={!model.sourceFolder || model.categories.length === 0 || !model.apiKeyConfigured || model.isRunning} onClick={model.runClassification}>{model.isRunning ? <LoaderCircle className="animate-spin" size={17} /> : <Play size={17} fill="currentColor" />}{model.isRunning ? `Classifying ${Math.min(model.results.length + 1, model.fileCount)}/${model.fileCount}` : 'Classify and organize'}<ChevronRight size={17} /></button>
        </section>
        {model.isRunning && model.activeFile && <p className="mt-3 text-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline animate-spin text-[#14f195]" size={15} />Working on <span className="font-medium text-slate-300">{model.activeFile}</span></p>}

        {(model.results.length > 0 || model.summary) && <section className="mt-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Run dashboard</p><h2 className="mt-2 text-3xl font-bold tracking-tight">Classification report</h2></div>{model.summary && <p className="text-sm text-slate-500">Completed {model.summary.completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<FileText size={18} />} label="Files classified" value={`${model.classified} / ${model.results.length}`} /><Metric icon={<Languages size={18} />} label="Languages found" value={`${Object.keys(model.languageBreakdown).length}`} /><Metric icon={<Zap size={18} />} label="Total time" value={model.summary ? formatDuration(model.summary.durationMs) : 'In progress'} /><Metric icon={<DollarSign size={18} />} label="JEV API cost" value={formatMoney(model.summary?.totalCost ?? model.totalCost)} detail={`${(model.summary?.totalInputTokens ?? model.totalTokens).toLocaleString()} input tokens`} /></div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
            <section className="glass-card p-6"><h3 className="font-bold">Destination overview</h3><div className="mt-5 space-y-4">{Object.entries(model.categoryBreakdown).map(([category, count]) => <Breakdown key={category} label={category} value={count} total={model.results.length} />)}{Object.entries(model.languageBreakdown).map(([language, count]) => <Breakdown key={language} label={language} value={count} total={model.results.length} subtle />)}</div></section>
            <section className="glass-card overflow-hidden"><div className="border-b border-white/8 px-6 py-5"><h3 className="font-bold">Document audit</h3><p className="mt-1 text-sm text-slate-500">Every classification and move from this run.</p></div><div className="overflow-x-auto"><table><thead><tr><th>Document</th><th>Category</th><th>Language</th><th>Precise subject</th><th>Status</th></tr></thead><tbody>{model.results.map((item) => <tr key={item.id}><td><div className="flex items-center gap-2 font-medium text-slate-300"><FileText size={15} className="text-slate-600" />{item.fileName}</div>{item.error && <p className="mt-1 max-w-xs text-xs text-rose-400">{item.error}</p>}{item.note && <p className="mt-1 max-w-xs text-xs text-amber-300/80">{item.note}</p>}</td><td>{item.category}</td><td>{item.language}</td><td className="max-w-sm whitespace-normal capitalize">{item.subject}</td><td>{item.unprocessable ? <span className="status status-warning">Not processable</span> : item.moved ? <span className="status status-ok">Moved</span> : <span className="status status-error">Skipped</span>}</td></tr>)}</tbody></table></div></section>
          </div>
        </section>}
        </>}
      </div>

      <GatewaySettings
        open={settingsOpen}
        configured={model.apiKeyConfigured}
        apiKey={model.apiKey}
        showApiKey={model.showApiKey}
        saving={model.isSavingApiKey}
        onApiKeyChange={model.setApiKey}
        onToggleVisibility={() => model.setShowApiKey((current) => !current)}
        onClose={() => setSettingsOpen(false)}
        onSave={async () => { if (await model.saveApiKey()) setSettingsOpen(false); }}
      />
    </main>
  );
}

function HeroFact({ icon, text }: { icon: React.ReactNode; text: string }) { return <span className="hero-fact">{icon}{text}</span>; }
function SetupCard({ number, title, icon, children }: { number: string; title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="glass-card p-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="step-number">{number}</span><h2 className="font-bold">{title}</h2></div><span className="text-[#14f195]">{icon}</span></div>{children}</section>; }
function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) { return <div className="metric-card"><div className="metric-icon">{icon}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>{detail && <p className="mt-1 text-xs text-slate-600">{detail}</p>}</div>; }
function Breakdown({ label, value, total, subtle }: { label: string; value: number; total: number; subtle?: boolean }) { const width = total ? (value / total) * 100 : 0; return <div><div className="mb-2 flex justify-between text-sm"><span className={subtle ? 'text-slate-500' : 'font-medium text-slate-300'}>{label}</span><span className="text-slate-500">{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className={subtle ? 'h-full rounded-full bg-slate-600' : 'progress-gradient h-full rounded-full'} style={{ width: `${width}%` }} /></div></div>; }
