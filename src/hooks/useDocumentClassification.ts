import { useEffect, useMemo, useState } from 'react';
import {
  classifyExtractedDocument, classifyShortExtractedDocuments, classifyServerDocument, loadConfig, loadGatewayCredits, revealApiKey, selectConfiguredServerFolder, selectServerFolder,
  listServerFolderFiles, loadServerPreview, undoServerMove, updateApiKey, updateCategories, updateSourceFolderPath,
} from '../lib/api';
import { readDocumentText } from '../lib/documents';
import { listRootFiles, moveToCategory, restoreFromCategory } from '../lib/file-system';
import { mapWithConcurrency } from '../lib/concurrency';
import { buildRunPerformance } from '../lib/run-metrics';
import type { Classification, RunSummary } from '../types';
import { extensionOf, isPreviewableImage, isSupportedDocument, NEED_REVIEW_FOLDER, NOT_PROCESSABLE_FOLDER, SUSPECTED_PROMPT_INJECTION_FOLDER, unsupportedDocumentMessage } from '../../shared/document-policy';

export type SourceFolder =
  | { kind: 'browser'; handle: FileSystemDirectoryHandle; name: string }
  | { kind: 'server'; folderId: string; name: string; files: string[] };

export type DocumentPreview = { title: string; kind: 'pdf' | 'image' | 'text'; url?: string; text?: string };
const CLASSIFICATION_CONCURRENCY = 16;
const SHORT_DOCUMENT_BATCH_MAX_DOCUMENTS = 8;
const SHORT_DOCUMENT_BATCH_MAX_CHARACTERS = 4_500;
const SHORT_DOCUMENT_MAX_CHARACTERS = 800;

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
  const [sourceFolderPath, setSourceFolderPath] = useState('');
  const [isSavingSourceFolderPath, setIsSavingSourceFolderPath] = useState(false);
  const [results, setResults] = useState<Classification[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [activeFile, setActiveFile] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalCost = useMemo(() => results.reduce((sum, item) => sum + item.cost, 0), [results]);
  const totalTokens = useMemo(() => results.reduce((sum, item) => sum + item.inputTokens, 0), [results]);
  const classified = results.filter((item) => item.moved && !item.unprocessable).length;
  const categoryBreakdown = useMemo(() => countBy(results, (item) => item.category), [results]);
  const runPerformance = useMemo(() => buildRunPerformance(results, summary?.durationMs ?? null), [results, summary]);

  useEffect(() => {
    void loadConfig().then((config) => {
      setCategories(config.categories);
      setApiKeyConfigured(config.apiKeyConfigured);
      setSourceFolderPath(config.sourceFolderPath);
      if (config.sourceFolderPath) void openConfiguredFolder();
      if (config.apiKeyConfigured) void refreshGatewayCredits();
    }).catch((reason) => setError(toMessage(reason))).finally(() => setConfigLoaded(true));
  }, []);

  async function openConfiguredFolder() {
    try {
      const selected = await selectConfiguredServerFolder();
      if (!selected) return;
      setSourceFolder({ kind: 'server', ...selected });
      setFileCount(selected.files.length);
      setNotice(`${selected.files.length} root-level file${selected.files.length === 1 ? '' : 's'} ready from the default source folder.`);
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

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
      closePreview();
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
    if ([NOT_PROCESSABLE_FOLDER, NEED_REVIEW_FOLDER, SUSPECTED_PROMPT_INJECTION_FOLDER].some((folder) => name.toLocaleLowerCase() === folder.toLocaleLowerCase())) {
      setError(`“${NOT_PROCESSABLE_FOLDER}”, “${NEED_REVIEW_FOLDER}”, and “${SUSPECTED_PROMPT_INJECTION_FOLDER}” are reserved folders.`);
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

  async function saveSourceFolderPath() {
    setIsSavingSourceFolderPath(true);
    try {
      const saved = await updateSourceFolderPath(sourceFolderPath);
      setSourceFolderPath(saved.sourceFolderPath);
      setError(null);
      setNotice(saved.sourceFolderPath ? 'Default source folder saved.' : 'Default source folder cleared.');
      if (saved.sourceFolderPath) await openConfiguredFolder();
      return true;
    } catch (reason) {
      setError(toMessage(reason));
      return false;
    } finally {
      setIsSavingSourceFolderPath(false);
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
        : (await listServerFolderFiles(folder.folderId)).files.map((name) => ({ name }));
      setFileCount(files.length);
      if (!files.length) throw new Error('This folder has no root-level files to classify.');
      const preparedTexts = new Map<string, string>();
      const batchedResults = new Map<string, Awaited<ReturnType<typeof classifyExtractedDocument>>>();
      if (folder.kind === 'browser') {
        await mapWithConcurrency(files, CLASSIFICATION_CONCURRENCY, async (item) => {
          if (!item.handle || !isSupportedDocument(item.name)) return;
          try {
            const text = (await readDocumentText(await item.handle.getFile())).trim();
            if (text) preparedTexts.set(item.name, text);
          } catch {
            // The normal per-file path records the extraction error and moves only that file.
          }
        });
        const batches = groupShortDocuments([...preparedTexts].map(([fileName, text]) => ({ fileName, text })));
        for (const batch of batches) {
          try {
            const { results } = await classifyShortExtractedDocuments(batch);
            results.forEach((result, index) => batchedResults.set(batch[index].fileName, result));
          } catch {
            // A failed batch is retried as individual requests, keeping its files untouched until then.
          }
        }
      }
      const completed: Array<Classification | undefined> = Array(files.length);
      await mapWithConcurrency(files, CLASSIFICATION_CONCURRENCY, async (item, index) => {
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
              let extractedText = preparedTexts.get(item.name) ?? '';
              if (!extractedText) {
                try {
                  extractedText = (await readDocumentText(file)).trim();
                } catch (reason) {
                  data = await moveBrowserFileToNotProcessable(folder.handle, item.handle, `Text extraction failed: ${toMessage(reason)}`);
                }
              }
              if (!data && !extractedText) {
                data = await moveBrowserFileToNotProcessable(folder.handle, item.handle, 'No selectable text was found. The document may require OCR.');
              }
              if (!data) {
                data = batchedResults.get(item.name) ?? await classifyExtractedDocument(file.name, extractedText);
                data.movedFileName = await moveToCategory(folder.handle, item.handle, data.destinationCategory);
              }
            }
          } else {
            data = await classifyServerDocument(folder.folderId, item.name);
          }
          record = {
            id: crypto.randomUUID(), fileName: item.name, category: data.destinationCategory, suggestedCategory: data.needsReview || data.promptInjectionRisk ? data.category : undefined,
            destinationFileName: data.movedFileName ?? item.name, needsReview: data.needsReview, confidentiality: data.confidentiality, promptInjectionScore: data.promptInjectionScore, promptInjectionRisk: data.promptInjectionRisk, subject: data.subject,
            confidence: data.categoryConfidence, cacheHit: data.cacheHit, savedInputTokens: data.savedInputTokens, savedCost: data.savedCost,
            inputTokens: data.usage.inputTokens ?? 0, cost: data.cost, moved: true,
            unprocessable: data.unprocessable, note: data.note,
          };
        } catch (reason) {
          record = { id: crypto.randomUUID(), fileName: item.name, category: 'Not moved', confidentiality: '—', promptInjectionScore: 0, promptInjectionRisk: false, subject: '—', confidence: null, inputTokens: 0, cost: 0, moved: false, error: toMessage(reason) };
        }
        completed[index] = record;
        processed = completed.filter((result): result is Classification => result !== undefined);
        setResults([...processed]);
      });
      const durationMs = performance.now() - startedAt;
      setSummary({ durationMs, totalCost: processed.reduce((sum, item) => sum + item.cost, 0), totalInputTokens: processed.reduce((sum, item) => sum + item.inputTokens, 0), completedAt: new Date() });
      const unprocessableCount = processed.filter((item) => item.unprocessable).length;
      const reviewCount = processed.filter((item) => item.needsReview).length;
      const promptInjectionCount = processed.filter((item) => item.promptInjectionRisk).length;
      const classifiedCount = processed.filter((item) => item.moved && !item.unprocessable).length;
      setNotice(`${classifiedCount} file${classifiedCount === 1 ? '' : 's'} classified${reviewCount ? `; ${reviewCount} moved to ${NEED_REVIEW_FOLDER}` : ''}${promptInjectionCount ? `; ${promptInjectionCount} moved to ${SUSPECTED_PROMPT_INJECTION_FOLDER}` : ''}${unprocessableCount ? `; ${unprocessableCount} moved to ${NOT_PROCESSABLE_FOLDER}` : ''}.`);
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

  async function undoMove(item: Classification) {
    if (!sourceFolder || !item.moved || !item.destinationFileName || undoingId) return;
    setUndoingId(item.id);
    setError(null);
    try {
      const restoredName = sourceFolder.kind === 'browser'
        ? await restoreFromCategory(sourceFolder.handle, item.category, item.destinationFileName)
        : (await undoServerMove(sourceFolder.folderId, item.category, item.destinationFileName)).fileName;
      setResults((current) => current.map((result) => result.id === item.id ? { ...result, moved: false, undone: true, destinationFileName: undefined, note: restoredName === item.fileName ? result.note : `${result.note ? `${result.note} ` : ''}Restored as ${restoredName}.` } : result));
      setNotice(`${item.fileName} was restored to the selected folder.`);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setUndoingId(null);
    }
  }

  async function previewDocument(item: Classification) {
    if (!sourceFolder || !item.moved || !item.destinationFileName) return;
    closePreview();
    setError(null);
    try {
      if (sourceFolder.kind === 'browser') {
        const directory = await sourceFolder.handle.getDirectoryHandle(item.category);
        const file = await (await directory.getFileHandle(item.destinationFileName)).getFile();
        if (extensionOf(file.name) === 'pdf') {
          setPreview({ title: item.fileName, kind: 'pdf', url: URL.createObjectURL(file) });
        } else if (isPreviewableImage(file.name)) {
          setPreview({ title: item.fileName, kind: 'image', url: URL.createObjectURL(file) });
        } else {
          setPreview({ title: item.fileName, kind: 'text', text: await readDocumentText(file) });
        }
      } else {
        const loaded = await loadServerPreview(sourceFolder.folderId, item.category, item.destinationFileName);
        if (loaded.isPdf) setPreview({ title: item.fileName, kind: 'pdf', url: URL.createObjectURL(loaded.blob) });
        else if (loaded.isImage) setPreview({ title: item.fileName, kind: 'image', url: URL.createObjectURL(loaded.blob) });
        else setPreview({ title: item.fileName, kind: 'text', text: await loaded.blob.text() });
      }
    } catch (reason) {
      setError(toMessage(reason));
    }
  }

  function closePreview() {
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  return {
    sourceFolder, categories, newCategory, setNewCategory, apiKey, setApiKey, apiKeyConfigured, gatewayCredits, configLoaded,
    showApiKey, setShowApiKey, isSavingApiKey, isSavingCategories, results, summary, fileCount,
    isRunning, activeFile, notice, error, totalCost, totalTokens, classified, performance: runPerformance,
    categoryBreakdown, undoingId, preview, selectFolder, addCategory, removeCategory,
    saveApiKey, runClassification, undoMove, previewDocument, closePreview, refreshGatewayCredits,
    loadSavedApiKey, clearApiKeyInput, sourceFolderPath, setSourceFolderPath, isSavingSourceFolderPath, saveSourceFolderPath,
  };
}

function countBy<T>(items: T[], key: (item: T) => string) { return items.reduce<Record<string, number>>((counts, item) => { const value = key(item); counts[value] = (counts[value] ?? 0) + 1; return counts; }, {}); }
function toMessage(reason: unknown) { return reason instanceof Error ? reason.message : 'An unexpected error occurred.'; }

function groupShortDocuments(documents: Array<{ fileName: string; text: string }>) {
  const batches: Array<Array<{ fileName: string; text: string }>> = [];
  let batch: Array<{ fileName: string; text: string }> = [];
  let characters = 0;
  for (const document of documents) {
    if (document.text.length > SHORT_DOCUMENT_MAX_CHARACTERS) continue;
    if (batch.length === SHORT_DOCUMENT_BATCH_MAX_DOCUMENTS || characters + document.text.length > SHORT_DOCUMENT_BATCH_MAX_CHARACTERS) {
      if (batch.length) batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(document);
    characters += document.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

async function moveBrowserFileToNotProcessable(
  root: FileSystemDirectoryHandle,
  source: FileSystemFileHandle,
  note: string,
) {
  const movedFileName = await moveToCategory(root, source, NOT_PROCESSABLE_FOLDER);
  return {
    category: NOT_PROCESSABLE_FOLDER,
    categoryConfidence: null,
    destinationCategory: NOT_PROCESSABLE_FOLDER,
    needsReview: false,
    confidentiality: '—',
    promptInjectionScore: 0,
    promptInjectionRisk: false,
    subject: '—',
    usage: { inputTokens: 0 },
    cost: 0,
    cacheHit: false,
    savedInputTokens: 0,
    savedCost: 0,
    unprocessable: true,
    note,
    movedFileName,
  };
}
