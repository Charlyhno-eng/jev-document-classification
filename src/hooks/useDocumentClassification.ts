import { useEffect, useMemo, useState } from 'react';
import {
  classifyExtractedDocument, classifyServerDocument, loadConfig, loadGatewayCredits, revealApiKey, selectServerFolder,
  updateApiKey, updateCategories,
} from '../lib/api';
import { readDocumentText } from '../lib/documents';
import { listRootFiles, moveToCategory } from '../lib/file-system';
import { buildLanguageBreakdown } from '../lib/run-metrics';
import type { Classification, RunSummary } from '../types';
import { isSupportedDocument, NOT_PROCESSABLE_FOLDER, unsupportedDocumentMessage } from '../../shared/document-policy';

export type SourceFolder =
  | { kind: 'browser'; handle: FileSystemDirectoryHandle; name: string }
  | { kind: 'server'; folderId: string; name: string; files: string[] };

export function useDocumentClassification() {
  const [sourceFolder, setSourceFolder] = useState<SourceFolder | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [gatewayCredits, setGatewayCredits] = useState<number | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [results, setResults] = useState<Classification[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [activeFile, setActiveFile] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalCost = useMemo(() => results.reduce((sum, item) => sum + item.cost, 0), [results]);
  const totalTokens = useMemo(() => results.reduce((sum, item) => sum + item.inputTokens, 0), [results]);
  const classified = results.filter((item) => item.moved && !item.unprocessable).length;
  const languageBreakdown = useMemo(() => buildLanguageBreakdown(results), [results]);
  const categoryBreakdown = useMemo(() => countBy(results, (item) => item.category), [results]);

  useEffect(() => {
    void loadConfig().then((config) => {
      setCategories(config.categories);
      setApiKeyConfigured(config.apiKeyConfigured);
      if (config.apiKeyConfigured) void refreshGatewayCredits();
    }).catch((reason) => setError(toMessage(reason))).finally(() => setConfigLoaded(true));
  }, []);

  async function selectFolder() {
    setError(null);
    setNotice(null);
    try {
      const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      let folder: SourceFolder;
      let count: number;
      if (picker) {
        const handle = await picker();
        const files = await listRootFiles(handle);
        folder = { kind: 'browser', handle, name: handle.name };
        count = files.length;
      } else {
        const selected = await selectServerFolder();
        if (!selected) return;
        folder = { kind: 'server', ...selected };
        count = selected.files.length;
      }
      setSourceFolder(folder);
      setFileCount(count);
      setResults([]);
      setSummary(null);
      setNotice(`${count} root-level file${count === 1 ? '' : 's'} ready to classify.`);
    } catch (reason) {
      if ((reason as DOMException)?.name !== 'AbortError') setError(toMessage(reason));
    }
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((category) => category.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError('That category already exists.');
      return;
    }
    if (name.toLocaleLowerCase() === NOT_PROCESSABLE_FOLDER.toLocaleLowerCase()) {
      setError(`“${NOT_PROCESSABLE_FOLDER}” is reserved for files that cannot be classified.`);
      return;
    }
    await persistCategories([...categories, name], () => setNewCategory(''));
  }

  async function removeCategory(category: string) {
    if (categories.length === 1) {
      setError('At least one category is required.');
      return;
    }
    await persistCategories(categories.filter((item) => item !== category));
  }

  async function persistCategories(nextCategories: string[], afterSave?: () => void) {
    setIsSavingCategories(true);
    try {
      const saved = await updateCategories(nextCategories);
      setCategories(saved.categories);
      afterSave?.();
      setError(null);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setIsSavingCategories(false);
    }
  }

  async function saveApiKey() {
    if (!apiKey.trim()) {
      setError('Enter a Vercel AI Gateway API key before saving.');
      return false;
    }
    setIsSavingApiKey(true);
    try {
      await updateApiKey(apiKey.trim());
      setApiKey('');
      setShowApiKey(false);
      setApiKeyConfigured(true);
      void refreshGatewayCredits();
      setError(null);
      setNotice('Vercel AI Gateway API key saved in config/config.toml.');
      return true;
    } catch (reason) {
      setError(toMessage(reason));
      return false;
    } finally {
      setIsSavingApiKey(false);
    }
  }

  async function runClassification() {
    if (!sourceFolder || !categories.length || !apiKeyConfigured || isRunning) return;
    const folder = sourceFolder;
    setIsRunning(true);
    setError(null);
    setNotice(null);
    setResults([]);
    const startedAt = performance.now();
    let processed: Classification[] = [];
    try {
      const files: Array<{ name: string; handle?: FileSystemFileHandle }> = folder.kind === 'browser'
        ? (await listRootFiles(folder.handle)).map((handle) => ({ name: handle.name, handle }))
        : folder.files.map((name) => ({ name }));
      setFileCount(files.length);
      if (!files.length) throw new Error('This folder has no root-level files to classify.');
      for (const item of files) {
        setActiveFile(item.name);
        let record: Classification;
        try {
          let data;
          if (folder.kind === 'browser') {
            if (!item.handle) throw new Error('The browser lost access to this file. Select the folder again.');
            if (!isSupportedDocument(item.name)) {
              data = await moveBrowserFileToNotProcessable(folder.handle, item.handle, unsupportedDocumentMessage(item.name));
            } else {
              const file = await item.handle.getFile();
              let extractedText = '';
              try {
                extractedText = (await readDocumentText(file)).trim();
              } catch (reason) {
                data = await moveBrowserFileToNotProcessable(folder.handle, item.handle, `Text extraction failed: ${toMessage(reason)}`);
              }
              if (!data && !extractedText) {
                data = await moveBrowserFileToNotProcessable(folder.handle, item.handle, 'No selectable text was found. The document may require OCR.');
              }
              if (!data) {
                data = await classifyExtractedDocument(file.name, extractedText);
                await moveToCategory(folder.handle, item.handle, data.category);
              }
            }
          } else {
            data = await classifyServerDocument(folder.folderId, item.name);
          }
          record = { id: crypto.randomUUID(), fileName: item.name, category: data.category, language: data.language, subject: data.subject, confidence: data.categoryConfidence, inputTokens: data.usage.inputTokens ?? 0, cost: data.cost, moved: true, unprocessable: data.unprocessable, note: data.note };
        } catch (reason) {
          record = { id: crypto.randomUUID(), fileName: item.name, category: 'Not moved', language: '—', subject: '—', confidence: null, inputTokens: 0, cost: 0, moved: false, error: toMessage(reason) };
        }
        processed = [...processed, record];
        setResults(processed);
      }
      const durationMs = performance.now() - startedAt;
      setSummary({ durationMs, totalCost: processed.reduce((sum, item) => sum + item.cost, 0), totalInputTokens: processed.reduce((sum, item) => sum + item.inputTokens, 0), completedAt: new Date() });
      const unprocessableCount = processed.filter((item) => item.unprocessable).length;
      const classifiedCount = processed.filter((item) => item.moved && !item.unprocessable).length;
      setNotice(`${classifiedCount} file${classifiedCount === 1 ? '' : 's'} classified${unprocessableCount ? `; ${unprocessableCount} moved to ${NOT_PROCESSABLE_FOLDER}` : ''}.`);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setActiveFile('');
      setIsRunning(false);
      void refreshGatewayCredits();
    }
  }

  async function refreshGatewayCredits() {
    try {
      const result = await loadGatewayCredits();
      setGatewayCredits(result.balance);
    } catch {
      setGatewayCredits(null);
    }
  }

  async function loadSavedApiKey() {
    if (!apiKeyConfigured) return;
    try {
      const result = await revealApiKey();
      setApiKey(result.apiKey);
      setError(null);
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  function clearApiKeyInput() {
    setApiKey('');
    setShowApiKey(false);
  }

  return {
    sourceFolder, categories, newCategory, setNewCategory, apiKey, setApiKey, apiKeyConfigured, gatewayCredits, configLoaded,
    showApiKey, setShowApiKey, isSavingApiKey, isSavingCategories, results, summary, fileCount,
    isRunning, activeFile, notice, error, totalCost, totalTokens, classified, languageBreakdown,
    categoryBreakdown, selectFolder, addCategory, removeCategory, saveApiKey, runClassification, refreshGatewayCredits,
    loadSavedApiKey, clearApiKeyInput,
  };
}

function countBy<T>(items: T[], key: (item: T) => string) { return items.reduce<Record<string, number>>((counts, item) => { const value = key(item); counts[value] = (counts[value] ?? 0) + 1; return counts; }, {}); }
function toMessage(reason: unknown) { return reason instanceof Error ? reason.message : 'An unexpected error occurred.'; }

async function moveBrowserFileToNotProcessable(
  root: FileSystemDirectoryHandle,
  source: FileSystemFileHandle,
  note: string,
) {
  await moveToCategory(root, source, NOT_PROCESSABLE_FOLDER);
  return {
    category: NOT_PROCESSABLE_FOLDER,
    categoryConfidence: null,
    language: '—',
    subject: '—',
    usage: { inputTokens: 0 },
    cost: 0,
    unprocessable: true,
    note,
  };
}
