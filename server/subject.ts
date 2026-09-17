const stopWords = new Set(`
a about after again against all also an and any are as at avec be because been before being between both but by can ce ces dans de des do does doing donc du during each en et for from further had has have having how i if in into is it its itself la le les mais me more most my no nor not of on once only or other our out over own pour que qui same she should so some such sur than that the their them then there these they this those through to too under until up very was we were what when where which while who why will with you your un une au aux
`.trim().split(/\s+/));

type Candidate = { phrase: string; score: number; index: number };

export function extractSubjectCandidates(fileName: string, text: string, limit = 16) {
  const candidates = new Map<string, Candidate>();
  const source = text.slice(0, 24_000);
  const lines = source.split(/\r?\n/).map((line) => cleanPhrase(line)).filter(Boolean);

  for (const [index, line] of lines.slice(0, 30).entries()) {
    const words = meaningfulWords(line);
    if (words.length >= 2 && words.length <= 14 && line.length <= 140) {
      addCandidate(candidates, line, 40 - Math.min(index, 12), index);
    }
  }

  const words = tokenize(source);
  for (let size = 2; size <= 5; size += 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const slice = words.slice(index, index + size);
      if (slice.some((word) => stopWords.has(word)) || slice.every((word) => /^\d+$/.test(word))) continue;
      const phrase = slice.join(' ');
      const current = candidates.get(phrase);
      const positionBonus = Math.max(0, 4 - index / 250);
      const score = (current?.score ?? 0) + size * size + positionBonus;
      candidates.set(phrase, { phrase, score, index: current?.index ?? index });
    }
  }

  const fileStem = cleanPhrase(fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  if (meaningfulWords(fileStem).length >= 2) addCandidate(candidates, fileStem, 12, -1);

  const ranked = [...candidates.values()]
    .filter(({ phrase }) => phrase.length >= 6 && phrase.length <= 100)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .filter((candidate, index, all) => !all.slice(0, index).some((previous) => containsSamePhrase(previous.phrase, candidate.phrase)))
    .slice(0, Math.max(2, Math.min(limit, 20)))
    .map(({ phrase }) => phrase);

  if (ranked.length === 0) return ['Document content'];
  return ranked;
}

function addCandidate(candidates: Map<string, Candidate>, value: string, score: number, index: number) {
  const phrase = cleanPhrase(value);
  const key = phrase.toLocaleLowerCase();
  const current = candidates.get(key);
  candidates.set(key, { phrase, score: Math.max(score, current?.score ?? 0), index: Math.min(index, current?.index ?? index) });
}

function cleanPhrase(value: string) {
  return value.replace(/^[\s\d.()\[\]:;,-]+|[\s.()\[\]:;,-]+$/g, '').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string) {
  return (value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).filter((word) => word.length > 1);
}

function meaningfulWords(value: string) {
  return tokenize(value).filter((word) => !stopWords.has(word));
}

function containsSamePhrase(left: string, right: string) {
  const normalizedLeft = left.toLocaleLowerCase();
  const normalizedRight = right.toLocaleLowerCase();
  return normalizedLeft.includes(normalizedRight);
}
