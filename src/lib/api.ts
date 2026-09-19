export type ClassificationApiResult = {
  category: string;
  categoryConfidence: number | null;
  destinationCategory: string;
  needsReview: boolean;
  confidentiality: string;
  promptInjectionScore: number;
  promptInjectionRisk: boolean;
  subject: string;
  usage: { inputTokens?: number };
  cost: number;
  cacheHit?: boolean;
  savedInputTokens?: number;
  savedCost?: number;
  unprocessable?: boolean;
  note?: string;
  movedFileName?: string;
};

type ErrorPayload = { error?: string };

export async function loadConfig() {
  return request<{ categories: string[]; apiKeyConfigured: boolean; sourceFolderPath: string }>('/api/config');
}

export async function loadGatewayCredits() {
  return request<{ balance: number }>('/api/gateway/credits');
}

export async function updateCategories(categories: string[]) {
  return request<{ categories: string[] }>('/api/config/categories', { method: 'PUT', body: JSON.stringify({ categories }) });
}

export async function updateApiKey(apiKey: string) {
  return request<{ configured: boolean }>('/api/config/api-key', { method: 'PUT', body: JSON.stringify({ apiKey }) });
}

export async function updateSourceFolderPath(sourceFolderPath: string) {
  return request<{ sourceFolderPath: string }>('/api/config/source-folder', { method: 'PUT', body: JSON.stringify({ sourceFolderPath }) });
}

export async function revealApiKey() {
  return request<{ apiKey: string }>('/api/config/api-key/reveal', { method: 'POST' });
}

export async function selectServerFolder() {
  const response = await fetch('/api/folders/select', { method: 'POST', headers: clientHeaders() });
  if (response.status === 204) return null;
  return parseResponse<{ folderId: string; name: string; files: string[] }>(response);
}

export async function selectConfiguredServerFolder() {
  const response = await fetch('/api/folders/configured', { method: 'POST', headers: clientHeaders() });
  if (response.status === 204) return null;
  return parseResponse<{ folderId: string; name: string; files: string[] }>(response);
}

export function classifyExtractedDocument(fileName: string, text: string) {
  return request<ClassificationApiResult>('/api/classify', { method: 'POST', body: JSON.stringify({ fileName, text }) });
}

export function classifyServerDocument(folderId: string, fileName: string) {
  return request<ClassificationApiResult>(`/api/folders/${encodeURIComponent(folderId)}/classify`, { method: 'POST', body: JSON.stringify({ fileName }) });
}

export function undoServerMove(folderId: string, category: string, fileName: string) {
  return request<{ fileName: string }>(`/api/folders/${encodeURIComponent(folderId)}/undo`, { method: 'POST', body: JSON.stringify({ category, fileName }) });
}

export function listServerFolderFiles(folderId: string) {
  return request<{ files: string[] }>(`/api/folders/${encodeURIComponent(folderId)}/files`);
}

export async function loadServerPreview(folderId: string, category: string, fileName: string) {
  const response = await fetch(`/api/folders/${encodeURIComponent(folderId)}/preview/${encodeURIComponent(category)}/${encodeURIComponent(fileName)}`, { headers: clientHeaders() });
  if (!response.ok) {
    const data = await response.json() as ErrorPayload;
    throw new Error(data.error ?? 'The document preview could not be loaded.');
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  return { blob: await response.blob(), isPdf: contentType.includes('application/pdf'), isImage: contentType.startsWith('image/') };
}

async function request<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { ...clientHeaders(), ...init.headers } });
  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & ErrorPayload;
  if (!response.ok) throw new Error(data.error ?? 'The local API request failed.');
  return data;
}

function clientHeaders() {
  return { 'Content-Type': 'application/json', 'X-JEV-Client': 'browser' };
}
