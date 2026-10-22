#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = '/workspace/website-manager';
const QUIZ_DIR = path.join(ROOT, 'data/quizzes');
const BROKEN_DIR = path.join(ROOT, 'data/broken');
fs.mkdirSync(QUIZ_DIR, { recursive: true });
fs.mkdirSync(BROKEN_DIR, { recursive: true });

const chunkRows = JSON.parse(fs.readFileSync('/tmp/chunk-quizzes-raw.json', 'utf8'));
const sentenceRows = JSON.parse(fs.readFileSync('/tmp/sentence-quizzes-raw.json', 'utf8'));

function stripPrefix(s) {
  return s
    .replace(/^QUIZ(?:\\_)?[ _]?JSON<br\s*\/?>/i, '')
    .replace(/^QUIZ_JSON<br\s*\/?>/i, '')
    .trim();
}

function unescapeNotion(s) {
  return s
    .replace(/\\_/g, '_')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']');
}

function fixMarkdownCorruption(s) {
  // Always unwrap clean [url](url) → url (inside JSON string values)
  // Notion MCP view-mode wraps JSON URL strings as markdown links; unwrap mechanically.
  s = s.replace(/"\[https:\/\//g, '"https://');
  s = s.replace(/\]\(https?:\/\/[^"]*\)"/g, '"');

  let out = s.replace(/\[(https?:\/\/[^\]\s]+)\]\(\1\)/g, '$1');
  out = out.replace(/https\[:\]\/\//g, 'https://');
  out = out.replace(/"(https?:\/\/)\[(raw\.githubusercontent\.com)/g, '"$1$2');
  out = out.replace(
    /"\[(https?:\/\/[^"]+)","([\s\S]*?)\]\((https?:\/\/[^"]+)","\2\)"/g,
    (match, url1, content, url2) => {
      const path1 = url1.replace(/^https?:\/\//, '');
      const path2 = url2.replace(/^https?:\/\//, '');
      if (path1 !== path2) return match;
      const url = url1.startsWith('https') ? url1 : (url2.startsWith('https') ? url2 : url1);
      return `"${url}","${content}"`;
    }
  );
  out = out.replace(
    /"(https:\/\/raw\.githubusercontent\.com\/[^"]+)","([\s\S]*?)\]\((https?:\/\/raw\.githubusercontent\.com\/[^"]+)","\2\)"/g,
    (match, url1, content, url2) => {
      const path1 = url1.replace(/^https?:\/\//, '');
      const path2 = url2.replace(/^https?:\/\//, '');
      if (path1 !== path2) return match;
      return `"${url1}","${content}"`;
    }
  );
  return out;
}

function tryParse(raw) {
  let s = stripPrefix(raw);
  s = unescapeNotion(s);
  // Always apply mechanical markdown URL unwrap / duplicate repair
  const beforeFix = s;
  s = fixMarkdownCorruption(s);
  // Notion sometimes appends trailing <br /> after the JSON object
  s = s.replace(/(<br\s*\/?>)+\s*$/i, '').trim();
  const fixed = s !== beforeFix;
  try {
    return { ok: true, data: JSON.parse(s), text: s, fixed };
  } catch (e) {
    // try without fix if fix broke something
    try {
      const alt = beforeFix.replace(/(<br\s*\/?>)+\s*$/i, '').trim();
      return { ok: true, data: JSON.parse(alt), text: alt, fixed: false };
    } catch (_) {
      return { ok: false, error: String(e.message || e), text: s, raw };
    }
  }
}

function slugFile(quizId) {
  return quizId.replace(/[^a-zA-Z0-9._-]+/g, '-') + '.json';
}

const playable = [];
const broken = [];

function processRow(row, kind) {
  const name = row.Name;
  const objective = row.Objective;
  const level = row.Level ?? null;
  const raw = row['Quiz JSON'] || '';
  const notionUrl = row.url;
  const result = tryParse(raw);
  if (!result.ok) {
    const base = (objective || name || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const rawPath = path.join(BROKEN_DIR, `${base}.raw.txt`);
    fs.writeFileSync(rawPath, raw);
    fs.writeFileSync(path.join(BROKEN_DIR, `${base}.attempt.txt`), result.text || '');
    broken.push({
      name, objective, level, kind, notion_url: notionUrl,
      reason: result.error, raw_file: `data/broken/${path.basename(rawPath)}`,
    });
    return;
  }
  const quiz = result.data;
  if (level != null && quiz.level == null) quiz.level = level;
  if (objective && !quiz.objective) quiz.objective = objective;
  const file = slugFile(quiz.quiz_id);
  fs.writeFileSync(path.join(QUIZ_DIR, file), JSON.stringify(quiz, null, 2) + '\n');
  playable.push({
    quiz_id: quiz.quiz_id,
    file: `data/quizzes/${file}`,
    objective: quiz.objective,
    level: quiz.level ?? null,
    kind,
    chunk_id: quiz.chunk?.id ?? null,
    sentence: quiz.sentence,
    markdown_fixed: result.fixed,
    notion_url: notionUrl,
  });
}

for (const row of chunkRows) processRow(row, 'chunk');
for (const row of sentenceRows) processRow(row, 'sentence');

playable.sort((a, b) => {
  const ka = a.kind === 'sentence' ? 1 : 0;
  const kb = b.kind === 'sentence' ? 1 : 0;
  if (ka !== kb) return ka - kb;
  const la = a.level ?? 99;
  const lb = b.level ?? 99;
  if (la !== lb) return la - lb;
  const ca = a.chunk_id ?? 0;
  const cb = b.chunk_id ?? 0;
  if (ca !== cb) return ca - cb;
  return (a.objective || '').localeCompare(b.objective || '') || a.quiz_id.localeCompare(b.quiz_id);
});

fs.writeFileSync(
  path.join(ROOT, 'data/manifest.json'),
  JSON.stringify({ generated_at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Hong_Kong' }).replace(' ', 'T') + '+08:00', quizzes: playable }, null, 2) + '\n'
);
fs.writeFileSync('/tmp/export-meta.json', JSON.stringify({ playable, broken }, null, 2));
console.log(JSON.stringify({
  playable: playable.length,
  broken: broken.length,
  playable_ids: playable.map(p => p.quiz_id),
  broken_names: broken.map(b => b.name),
}, null, 2));

// verify URLs
for (const p of playable) {
  const q = JSON.parse(fs.readFileSync(path.join(ROOT, p.file), 'utf8'));
  for (const s of q.slides || []) {
    for (const k of ['audio', 'image', 'correct']) {
      const v = s[k];
      if (typeof v === 'string' && (v.includes('[http') || v.startsWith('['))) {
        console.log('BAD URL', p.quiz_id, k, v.slice(0, 80));
      }
    }
  }
}
