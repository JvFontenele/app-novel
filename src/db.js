import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
const TMP_FILE = `${DB_FILE}.tmp`;

async function readDb() {
  try {
    const raw = await readFile(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return { novels: [] };
    throw err;
  }
}

// Serializa todas as escritas no processo (evita duas operações concorrentes
// pisando uma na outra) e grava em arquivo temporário + rename atômico, para
// nunca deixar o db.json num estado truncado/inválido mesmo se o processo for
// interrompido no meio da escrita.
let writeQueue = Promise.resolve();

function writeDb(data) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const json = JSON.stringify(data, null, 2);
      await writeFile(TMP_FILE, json, 'utf-8');
      await rename(TMP_FILE, DB_FILE);
    });
  return writeQueue;
}

function toSummary(novel) {
  const { id, title, url, description, coverImage, createdAt, chapters } = novel;
  return { id, title, url, description, coverImage, createdAt, chapterCount: chapters.length };
}

function toChapterSummary(chapter) {
  const { id, title, url, fetchedAt, translatedAt } = chapter;
  return { id, title, url, fetchedAt, hasTranslation: Boolean(translatedAt) };
}

// Resumo de cada novel, sem a lista de capítulos (usado na tela de listagem).
export async function listNovels() {
  const db = await readDb();
  return db.novels.map(toSummary);
}

// Dados da própria novel, sem a lista de capítulos (usado na tela de detalhe,
// que busca os capítulos separadamente via listChapters).
export async function getNovel(id) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === id);
  return novel ? toSummary(novel) : null;
}

// Lista de capítulos de uma novel, sem o campo `content` (que pode ser grande
// e só é necessário quando um capítulo específico é aberto no leitor).
export async function listChapters(novelId) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  return novel ? novel.chapters.map(toChapterSummary) : null;
}

export async function getChapter(novelId, chapterId) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return null;
  return novel.chapters.find((c) => c.id === chapterId) ?? null;
}

// Capítulos já buscados (com conteúdo salvo), na ordem em que foram
// adicionados — usado pela tela de leitura contínua ("ler tudo").
export async function listFetchedChapters(novelId) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return null;
  return novel.chapters
    .filter((c) => c.content)
    .map(({ id, title, content, fetchedAt, translatedContent, translatedAt }) => ({
      id,
      title,
      content,
      fetchedAt,
      translatedContent,
      translatedAt,
    }));
}

// Capítulos que ainda não têm conteúdo buscado, com a posição de cada um na
// lista completa da novel (1-based) — usado para saber o que falta processar
// na busca em massa e mostrar "capítulo X de N" durante o progresso.
export async function listPendingChapters(novelId) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return null;
  return novel.chapters
    .map((c, index) => ({ id: c.id, content: c.content, position: index + 1 }))
    .filter((c) => !c.content)
    .map(({ id, position }) => ({ id, position }));
}

export async function addNovel({ title, url, description, coverImage }) {
  const db = await readDb();
  const novel = {
    id: randomUUID(),
    title,
    url,
    description: description ?? '',
    coverImage: coverImage ?? null,
    chapters: [],
    createdAt: new Date().toISOString(),
  };
  db.novels.push(novel);
  await writeDb(db);
  return toSummary(novel);
}

export async function updateNovel(id, patch) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === id);
  if (!novel) return null;
  Object.assign(novel, patch);
  await writeDb(db);
  return toSummary(novel);
}

export async function deleteNovel(id) {
  const db = await readDb();
  const before = db.novels.length;
  db.novels = db.novels.filter((n) => n.id !== id);
  await writeDb(db);
  return db.novels.length < before;
}

export async function addChapter(novelId, { title, url }) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return null;
  const chapter = {
    id: randomUUID(),
    title: title ?? url,
    url,
    content: null,
    fetchedAt: null,
    translatedContent: null,
    translatedAt: null,
  };
  novel.chapters.push(chapter);
  await writeDb(db);
  return chapter;
}

export async function addChapters(novelId, chapters) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return null;
  const existingUrls = new Set(novel.chapters.map((c) => c.url));
  const added = [];
  for (const { title, url } of chapters) {
    if (existingUrls.has(url)) continue;
    const chapter = {
      id: randomUUID(),
      title: title ?? url,
      url,
      content: null,
      fetchedAt: null,
      translatedContent: null,
      translatedAt: null,
    };
    novel.chapters.push(chapter);
    existingUrls.add(url);
    added.push(chapter);
  }
  await writeDb(db);
  return added;
}

export async function saveChapterContent(novelId, chapterId, content, title) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return null;
  const chapter = novel.chapters.find((c) => c.id === chapterId);
  if (!chapter) return null;
  chapter.content = content;
  chapter.fetchedAt = new Date().toISOString();
  if (title && (!chapter.title || chapter.title === chapter.url)) {
    chapter.title = title;
  }
  await writeDb(db);
  return chapter;
}

export async function saveChapterTranslation(novelId, chapterId, translatedContent) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return null;
  const chapter = novel.chapters.find((c) => c.id === chapterId);
  if (!chapter) return null;
  chapter.translatedContent = translatedContent;
  chapter.translatedAt = new Date().toISOString();
  await writeDb(db);
  return chapter;
}

export async function deleteChapter(novelId, chapterId) {
  const db = await readDb();
  const novel = db.novels.find((n) => n.id === novelId);
  if (!novel) return false;
  const before = novel.chapters.length;
  novel.chapters = novel.chapters.filter((c) => c.id !== chapterId);
  await writeDb(db);
  return novel.chapters.length < before;
}
