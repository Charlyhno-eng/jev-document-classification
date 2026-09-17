import { randomUUID } from 'node:crypto';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { classifyDocument } from './classification.js';
import { readAppConfig, toPublicConfig, writeApiKey, writeCategories } from './config.js';
import { categoryDocumentPath, chooseDirectory, listRootFileNames, readDocumentText, restoreFileFromCategory } from './documents.js';
import { processLocalDocument } from './local-classification.js';
import { fetchGatewayCredits } from './gateway-credits.js';
import { isTrustedApiRequest, resolveRootFile } from './security.js';
import { extensionOf, isPreviewableImage } from '../shared/document-policy.js';

const port = Number(process.env.PORT ?? 8787);
const folderSessions = new Map<string, string>();
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
export const app = express();

app.use((request, response, next) => {
  const origin = request.get('origin');
  if (!isTrustedApiRequest(request.method, origin, request.get('x-jev-client'))) {
    response.status(403).json({ error: 'This local API does not accept requests from that origin.' });
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb', strict: true }));

app.get('/api/health', async (_request, response) => {
  try {
    response.json({ configured: Boolean((await readAppConfig()).apiKey) });
  } catch (error) {
    response.status(500).json({ error: messageOf(error) });
  }
});

app.get('/api/config', async (_request, response) => {
  try {
    response.json(toPublicConfig(await readAppConfig()));
  } catch (error) {
    response.status(500).json({ error: messageOf(error) });
  }
});

app.put('/api/config/categories', async (request, response) => {
  try {
    response.json({ categories: await writeCategories(request.body?.categories) });
  } catch (error) {
    response.status(400).json({ error: messageOf(error) });
  }
});

app.put('/api/config/api-key', async (request, response) => {
  try {
    await writeApiKey(request.body?.apiKey);
    response.json({ configured: true });
  } catch (error) {
    response.status(400).json({ error: messageOf(error) });
  }
});

app.post('/api/config/api-key/reveal', async (_request, response) => {
  try {
    const config = await readAppConfig();
    if (!config.apiKey) throw new Error('Configure a Vercel AI Gateway API key first.');
    response.json({ apiKey: config.apiKey });
  } catch (error) {
    response.status(404).json({ error: messageOf(error) });
  }
});

app.get('/api/gateway/credits', async (_request, response) => {
  try {
    const config = await readAppConfig();
    if (!config.apiKey) throw new Error('Configure a Vercel AI Gateway API key first.');
    response.json({ balance: await fetchGatewayCredits(config.apiKey) });
  } catch (error) {
    response.status(503).json({ error: messageOf(error) });
  }
});

app.post('/api/folders/select', async (_request, response) => {
  try {
    const directoryPath = await chooseDirectory();
    if (!directoryPath) {
      response.status(204).end();
      return;
    }
    const folderId = randomUUID();
    folderSessions.clear();
    folderSessions.set(folderId, directoryPath);
    response.json({ folderId, name: path.basename(directoryPath), files: await listRootFileNames(directoryPath) });
  } catch (error) {
    response.status(500).json({ error: `The system folder picker could not be opened: ${messageOf(error)}` });
  }
});

app.post('/api/classify', async (request, response) => {
  const { fileName, text } = request.body as { fileName?: unknown; text?: unknown };
  try {
    if (typeof fileName !== 'string' || typeof text !== 'string' || !text.trim()) throw new Error('A file name and extracted text are required.');
    resolveRootFile('/virtual-root', fileName);
    const config = await readAppConfig();
    if (!config.apiKey) throw new Error('Configure a Vercel AI Gateway API key before starting a run.');
    response.json(await classifyDocument({ fileName, text: text.trim(), categories: config.categories, apiKey: config.apiKey }));
  } catch (error) {
    response.status(422).json({ error: messageOf(error) });
  }
});

app.post('/api/folders/:folderId/classify', async (request, response) => {
  const directoryPath = folderSessions.get(request.params.folderId);
  const { fileName } = request.body as { fileName?: unknown };
  if (!directoryPath) {
    response.status(404).json({ error: 'This folder session has expired. Select the folder again.' });
    return;
  }
  try {
    if (typeof fileName !== 'string') throw new Error('A file name is required.');
    const config = await readAppConfig();
    if (!config.apiKey) throw new Error('Configure a Vercel AI Gateway API key before starting a run.');
    response.json(await processLocalDocument(directoryPath, fileName, config));
  } catch (error) {
    response.status(422).json({ error: messageOf(error) });
  }
});

app.get('/api/folders/:folderId/files', async (request, response) => {
  const directoryPath = folderSessions.get(request.params.folderId);
  if (!directoryPath) {
    response.status(404).json({ error: 'This folder session has expired. Select the folder again.' });
    return;
  }
  try {
    response.json({ files: await listRootFileNames(directoryPath) });
  } catch (error) {
    response.status(422).json({ error: messageOf(error) });
  }
});

app.post('/api/folders/:folderId/undo', async (request, response) => {
  const directoryPath = folderSessions.get(request.params.folderId);
  if (!directoryPath) {
    response.status(404).json({ error: 'This folder session has expired. Select the folder again.' });
    return;
  }
  try {
    const { category, fileName } = request.body as { category?: unknown; fileName?: unknown };
    if (typeof category !== 'string' || typeof fileName !== 'string') throw new Error('A category and file name are required.');
    response.json({ fileName: await restoreFileFromCategory(directoryPath, category, fileName) });
  } catch (error) {
    response.status(422).json({ error: messageOf(error) });
  }
});

app.get('/api/folders/:folderId/preview/:category/:fileName', async (request, response) => {
  const directoryPath = folderSessions.get(request.params.folderId);
  if (!directoryPath) {
    response.status(404).json({ error: 'This folder session has expired. Select the folder again.' });
    return;
  }
  try {
    const documentPath = await categoryDocumentPath(directoryPath, request.params.category, request.params.fileName);
    const extension = extensionOf(request.params.fileName);
    if (extension === 'pdf' || isPreviewableImage(request.params.fileName)) {
      response.type(previewMimeType(extension)).send(await readFile(documentPath));
      return;
    }
    response.type('text/plain').send(await readDocumentText(documentPath));
  } catch (error) {
    response.status(422).json({ error: messageOf(error) });
  }
});

function previewMimeType(extension: string) {
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return `image/${extension}`;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

app.listen(port, '127.0.0.1', () => console.log(`JEV API server listening on http://localhost:${port}`));
