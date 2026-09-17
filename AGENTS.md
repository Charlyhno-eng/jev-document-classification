# Project guide: JEV Document Classification

## Purpose

JEV Document Classification is a local-first, next-generation document organization application focused on fast classification at very low cost. A user selects a flat local folder, configures the allowed destination categories and a Vercel AI Gateway API key, then starts a classification run. For each supported document, the application extracts readable text, derives document-specific subject candidates locally, asks JEV for a typed category, primary language, and precise subject, then moves the file into the selected category folder. The interface provides an audit table and a run dashboard with document count, classification results, execution duration, input tokens, and estimated API cost.

All user-facing copy, source code, documentation, and comments must be written in English.

## Technology

- React with TypeScript and React Router for the client application.
- Vite and Tailwind CSS v4 for the build system and styling.
- A local Express + TypeScript API server to prevent the AI Gateway key from reaching the browser.
- Vercel AI SDK's `experimental_evaluate` API with the `typesafe-ai/jev` model.
- Browser File System Access API for user-authorized folder selection and file moves, with a server-side native folder picker fallback for Firefox.
- `pdfjs-dist` and `mammoth` for PDF and DOCX text extraction.

## Current implementation

- The app is bootstrapped with `npm run dev`, which starts Vite on `5173` and the API server on `8787`.
- `config/config.toml` stores categories and the AI Gateway API key. It is tracked at the user's request, created automatically when missing, and must never be exposed through API responses or logs.
- `config/config.example.toml` documents the safe configuration shape without containing a credential.
- The interface can replace the API key but never reads the saved value back into the browser; it receives only a configured/not-configured status.
- The server exposes `POST /api/classify`. It reads categories and the API key exclusively from `config/config.toml`, then sends document text to JEV as three typed choice questions in one evaluation request.
- JEV's listed input pricing is currently represented in `server/classification.ts` as `$0.04` per one million input tokens. Keep this value in sync with the provider's official pricing when updating the project.
- The API key must never be read from `.env` or any environment variable. `config/config.toml` is the sole credential source.
- JEV cannot generate free-form text. Precise subject labels must come from bounded candidates extracted locally from each document and selected through a typed choice question.
- The application only lists root-level files, never recurses into subdirectories, and uses category names as destination folder names.
- The dashboard is intentionally in-memory for the current browser session. No file content or document metadata is persisted. The API key is persisted only in the local server configuration requested by the user.

## Working conventions

- Keep the API key server-side. Never create a `VITE_` environment variable for it, return it to the client, or log it.
- Preserve the dark, high-performance visual identity: near-black surfaces, restrained green/purple gradients, large typography, and subtle motion that respects `prefers-reduced-motion`.
- Preserve the local-first flow: the user must explicitly choose the directory, and the browser must retain the permission needed to move files.
- Move a supported document into its chosen category only after text extraction and the JEV request both succeed. Move unsupported, unreadable, or empty documents into the reserved `Not processable` folder without sending them to JEV. Gateway failures must leave the source file untouched. Do not overwrite an existing destination file; create a numbered filename instead.
- JEV is an evaluation model, not a generative text model. Use typed choices or other supported evaluation primitives rather than attempting to parse free-form model output.
- Keep visual components in `src/components`, client orchestration in `src/hooks`, browser integrations in `src/lib`, and server business rules in focused modules under `server`.
- Run `npm run test`, `npm run check`, and `npm run build` after implementation changes.
