import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClassificationContext } from '../../server/classification.js';
import { buildDocumentProfile, MAX_DOCUMENT_PROFILE_CHARACTERS } from '../../server/document-profile.js';

const longDocument = `Annual Security Review\n\n${'This security review covers access control, incident response, and supplier risk.\n'.repeat(600)}\nConclusion: strengthen recovery procedures.`;

test('builds a bounded structured profile for long documents', () => {
  const profile = buildDocumentProfile('security-review.txt', longDocument);
  assert.equal(profile.condensed, true);
  assert.ok(profile.content.length <= MAX_DOCUMENT_PROFILE_CHARACTERS);
  assert.ok(profile.content.includes('Likely headings:'));
  assert.ok(profile.content.includes('Subject candidates:'));
  assert.ok(profile.profileCharacters < profile.sourceCharacters);
});

test('builds a bounded structured classification context', () => {
  const structured = buildClassificationContext('security-review.txt', longDocument);
  assert.ok(structured.length <= MAX_DOCUMENT_PROFILE_CHARACTERS);
  assert.match(structured, /Likely headings:/);
});
