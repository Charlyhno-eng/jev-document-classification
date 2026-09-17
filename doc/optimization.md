# Classification optimization

## Goals

The classifier minimizes Vercel AI Gateway input tokens and end-to-end run time while preserving a single, typed JEV decision for category, primary language, and precise subject.

## Request design

One JEV `experimental_evaluate` request contains all three choice questions. This is the existing question batch: it avoids three separate model requests for the same document and gives one input-token measurement per document.

The model receives a local structured profile instead of the former 24,000-character document prefix when the document is long. The profile is capped at 4,500 characters and contains:

- Up to six likely headings from the document opening.
- Up to eight locally extracted subject candidates.
- Three excerpts from the beginning, middle, and end of the readable text.

Short documents keep their full text when it already fits below the cap. Subject candidates are extracted locally from up to 24,000 characters, then the ten strongest candidates are sent as bounded choices. JEV never needs to generate an unbounded subject label.

Choice instructions and criteria are intentionally concise. The category, language, and subject questions remain separate typed decisions inside the same evaluation request.

## Parallel processing

The browser processes up to 16 documents at once. Each task extracts text, calls the local API, then moves only its own file after a successful JEV response. Results are placed back into audit order as requests complete. Gateway failures still leave the source file untouched.

The concurrency limit is intentionally fixed at 16: it stays inside the requested 15–20 request window while limiting local memory pressure from PDF and DOCX extraction. Adjusting it upward should only follow a benchmark against the active Gateway account because provider rate limits and document size affect the best value.

## Session cache

The local API keeps up to 500 successful decisions in memory for its current process. A cache key is a SHA-256 hash of the document name and readable text, configured category order, the fixed JEV model identifier, and the cache schema version. The API key and document contents are not stored in the cache value or written to disk.

An identical retry or re-run reuses the decision without contacting Gateway. The audit labels it as a local cache result and records zero input tokens and zero cost for that run. Changing the document text, file name, categories, model identifier, or cache schema produces a cache miss. Failed Gateway calls are never cached. Restarting the local server clears the cache.

The dashboard reports avoided input tokens, estimated cache savings, cache hits, files per minute, and average category confidence. Cache savings reflect the original successful request that the current run did not need to send.

## A/B comparison

Use the benchmark on a copy of representative documents:

```bash
npm run benchmark:classification -- /absolute/path/to/folder
```

For up to ten readable root-level documents, it runs two non-moving evaluations:

1. `structured`: the current 4,500-character local profile.
2. `full`: the previous 24,000-character text context.

The report includes actual JEV input tokens and estimated cost for both contexts, aggregate reduction, and category, language, and subject agreement. Agreement shows whether the optimized context reaches the same decision as the prior context. It is not a substitute for accuracy: verify a labelled representative set when categories have known expected outcomes.

## Validation rules

Do not lower the profile cap or the subject-choice limit based on token savings alone. Keep the change only when the benchmark shows acceptable category and language agreement, and manual review confirms that precise subject choices remain useful. Confidence below 0.75 continues to route the document to `Need review`, which provides a safety path for uncertain classifications.
