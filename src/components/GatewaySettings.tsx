import { ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, X } from 'lucide-react';

type Props = {
  open: boolean;
  configured: boolean;
  apiKey: string;
  showApiKey: boolean;
  saving: boolean;
  onApiKeyChange: (value: string) => void;
  onToggleVisibility: () => void;
  onClose: () => void;
  onSave: () => Promise<void>;
};

export function GatewaySettings(props: Props) {
  if (!props.open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="gateway-settings-title">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Application settings</p><h2 id="gateway-settings-title" className="mt-2 text-2xl font-bold">Vercel AI Gateway</h2></div><button type="button" className="modal-close" title="Close settings" onClick={props.onClose}><X size={18} /></button></div>
      <p className="mt-4 text-sm leading-6 text-slate-400">JEV requests use a key from <a className="gateway-link" href="https://vercel.com/ai-gateway" target="_blank" rel="noreferrer">Vercel AI Gateway <ExternalLink size={13} /></a>. The key is managed exclusively through <code>config/config.toml</code>.</p>
      <div className="mt-5 flex items-center gap-2 text-sm"><span className={`status-dot ${props.configured ? 'status-dot-on' : ''}`} /><span className={props.configured ? 'text-[#14f195]' : 'text-amber-300'}>{props.configured ? 'Gateway configured' : 'A key is required before classification'}</span></div>
      <label className="mt-6 block text-xs font-bold uppercase tracking-[.12em] text-slate-500" htmlFor="gateway-api-key">AI Gateway API key</label>
      <div className="relative mt-2"><input id="gateway-api-key" className="input pr-11" type={props.showApiKey ? 'text' : 'password'} value={props.apiKey} onChange={(event) => props.onApiKeyChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void props.onSave(); }} placeholder={props.configured ? 'Enter a replacement key' : 'Enter your Vercel AI Gateway key'} autoComplete="off" spellCheck={false} autoFocus /><button type="button" className="input-action" title={props.showApiKey ? 'Hide API key' : 'Show API key'} onClick={props.onToggleVisibility}>{props.showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      <button type="button" className="button-primary mt-4 w-full" disabled={!props.apiKey.trim() || props.saving} onClick={() => void props.onSave()}>{props.saving ? <LoaderCircle className="animate-spin" size={16} /> : <KeyRound size={16} />}{props.configured ? 'Replace gateway key' : 'Save gateway key'}</button>
      <p className="helper-text"><ShieldCheck size={15} />The secret is stored only on this machine, never returned by the API, and never read from environment variables.</p>
    </section>
  </div>;
}
