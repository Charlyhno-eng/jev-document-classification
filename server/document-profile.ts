import { extractSubjectCandidates } from './subject.js';

export const MAX_DOCUMENT_PROFILE_CHARACTERS = 6_000;

export type DocumentProfile = {
  content: string;
  sourceCharacters: number;
  profileCharacters: number;
  condensed: boolean;
};

export function buildDocumentProfile(fileName: string, text: string): DocumentProfile {
  const source = text.trim().slice(0, 24_000);
  const directContent = `Document filename: ${fileName}\n\nDocument text:\n${source}`;
  if (directContent.length <= MAX_DOCUMENT_PROFILE_CHARACTERS) {
    return { content: directContent, sourceCharacters: source.length, profileCharacters: directContent.length, condensed: false };
  }

  const lines = source.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const headings = lines.filter((line) => line.length <= 140 && wordCount(line) >= 2 && wordCount(line) <= 14).slice(0, 8);
  const subjects = extractSubjectCandidates(fileName, source, 10);
  const excerpts = selectExcerpts(source);
  const content = limitProfile([
    `Document filename: ${fileName}`,
    `Document length: ${source.length.toLocaleString()} characters`,
    headings.length ? `Likely headings:\n${headings.map((heading) => `- ${heading}`).join('\n')}` : '',
    `Subject candidates:\n${subjects.map((subject) => `- ${subject}`).join('\n')}`,
    `Representative excerpts:\n${excerpts.map((excerpt, index) => `[${index + 1}] ${excerpt}`).join('\n\n')}`,
  ].filter(Boolean).join('\n\n'));
  return { content, sourceCharacters: source.length, profileCharacters: content.length, condensed: true };
}

function selectExcerpts(source: string) {
  const excerptLength = 1_250;
  const positions = [0, Math.floor(source.length * 0.42), Math.floor(source.length * 0.8)];
  return positions.map((position) => cleanExcerpt(source.slice(position, position + excerptLength))).filter((excerpt, index, all) => excerpt && all.indexOf(excerpt) === index);
}

function cleanExcerpt(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function limitProfile(value: string) {
  return value.length <= MAX_DOCUMENT_PROFILE_CHARACTERS ? value : `${value.slice(0, MAX_DOCUMENT_PROFILE_CHARACTERS - 1).trimEnd()}…`;
}

function wordCount(value: string) {
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}
