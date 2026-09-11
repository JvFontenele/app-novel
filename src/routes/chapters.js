import { Router } from 'express';
import * as db from '../db.js';
import { fetchPageContent, fetchChapterList } from '../scraper/index.js';

export const chaptersRouter = Router();

// Lista os capítulos de uma novel, sem o campo `content` (que pode ser grande
// e só é necessário quando um capítulo específico é aberto no leitor).
chaptersRouter.get('/novels/:id/chapters', async (req, res) => {
  const chapters = await db.listChapters(req.params.id);
  if (!chapters) return res.status(404).json({ error: 'Novel não encontrada.' });
  res.json(chapters);
});

// Lista, em sequência, apenas os capítulos que já têm conteúdo salvo — usado
// pela tela de leitura contínua ("ler tudo"), que não dispara novas buscas.
chaptersRouter.get('/novels/:id/chapters-content', async (req, res) => {
  const chapters = await db.listFetchedChapters(req.params.id);
  if (!chapters) return res.status(404).json({ error: 'Novel não encontrada.' });
  res.json(chapters);
});

const DELAY_BETWEEN_FETCHES_MS = 1500;
const activeBulkFetches = new Set();

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Busca sequencialmente o conteúdo de todos os capítulos que ainda não têm
// (evita paralelismo para não sobrecarregar o site nem levar bloqueio
// anti-bot), reportando o progresso via Server-Sent Events. Precisa vir antes
// da rota genérica /chapters/:chapterId para não ser interpretada como um id.
chaptersRouter.get('/novels/:id/chapters/fetch-all', async (req, res) => {
  const novelId = req.params.id;
  const pending = await db.listPendingChapters(novelId);
  if (!pending) return res.status(404).json({ error: 'Novel não encontrada.' });

  if (activeBulkFetches.has(novelId)) {
    return res.status(409).json({ error: 'Já existe uma busca em massa em andamento para esta novel.' });
  }
  activeBulkFetches.add(novelId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let stopped = false;
  req.on('close', () => {
    stopped = true;
  });

  const allChapters = await db.listChapters(novelId);
  const total = pending.length;
  const totalChapters = allChapters.length;
  sendEvent(res, 'start', { total, totalChapters });

  let done = 0;
  let failed = 0;
  try {
    for (const { id: chapterId, position } of pending) {
      if (stopped) break;
      const chapter = await db.getChapter(novelId, chapterId);
      if (!chapter) continue;

      try {
        const { title, text } = await fetchPageContent(chapter.url);
        await db.saveChapterContent(novelId, chapterId, text, title);
        done++;
        sendEvent(res, 'progress', { done, failed, total, position, totalChapters, lastTitle: title || chapter.title });
      } catch (err) {
        failed++;
        sendEvent(res, 'progress', {
          done,
          failed,
          total,
          position,
          totalChapters,
          lastError: err.message,
          lastTitle: chapter.title,
        });
      }

      if (!stopped) await new Promise((r) => setTimeout(r, DELAY_BETWEEN_FETCHES_MS));
    }
  } finally {
    activeBulkFetches.delete(novelId);
  }

  sendEvent(res, 'end', { done, failed, total, stopped });
  res.end();
});

chaptersRouter.get('/novels/:id/chapters/:chapterId', async (req, res) => {
  const chapter = await db.getChapter(req.params.id, req.params.chapterId);
  if (!chapter) return res.status(404).json({ error: 'Capítulo não encontrado.' });
  res.json(chapter);
});

chaptersRouter.post('/novels/:id/chapters', async (req, res) => {
  const { title, url } = req.body ?? {};
  if (!url) return res.status(400).json({ error: 'url é obrigatória.' });
  const chapter = await db.addChapter(req.params.id, { title, url });
  if (!chapter) return res.status(404).json({ error: 'Novel não encontrada.' });
  res.status(201).json(chapter);
});

// Busca a lista de capítulos direto do catálogo do site (ex.: <novelUrl>/catalog)
// e adiciona os que ainda não existem.
chaptersRouter.post('/novels/:id/chapters/discover', async (req, res) => {
  const novel = await db.getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: 'Novel não encontrada.' });

  try {
    const found = await fetchChapterList(novel.url);
    const added = await db.addChapters(novel.id, found);
    res.json({ found: found.length, added: added.length, chapters: added });
  } catch (err) {
    console.error('Erro ao descobrir capítulos:', err);
    res.status(502).json({ error: `Falha ao buscar lista de capítulos: ${err.message}` });
  }
});

chaptersRouter.delete('/novels/:id/chapters/:chapterId', async (req, res) => {
  const ok = await db.deleteChapter(req.params.id, req.params.chapterId);
  if (!ok) return res.status(404).json({ error: 'Capítulo não encontrado.' });
  res.status(204).end();
});

// Busca (ou re-busca) o conteúdo de um capítulo abrindo o link com Playwright.
chaptersRouter.post('/novels/:id/chapters/:chapterId/fetch', async (req, res) => {
  const chapter = await db.getChapter(req.params.id, req.params.chapterId);
  if (!chapter) return res.status(404).json({ error: 'Capítulo não encontrado.' });

  try {
    const { title, text } = await fetchPageContent(chapter.url);
    const updated = await db.saveChapterContent(req.params.id, chapter.id, text, title);
    res.json(updated);
  } catch (err) {
    console.error('Erro ao buscar capítulo:', err);
    res.status(502).json({ error: `Falha ao extrair conteúdo: ${err.message}` });
  }
});

// Salva o texto traduzido capturado no navegador do usuário (via tradução
// nativa do Chrome/Edge) — o servidor não traduz nada, só persiste.
chaptersRouter.put('/novels/:id/chapters/:chapterId/translation', async (req, res) => {
  const { translatedContent } = req.body ?? {};
  if (!translatedContent) return res.status(400).json({ error: 'translatedContent é obrigatório.' });

  const updated = await db.saveChapterTranslation(req.params.id, req.params.chapterId, translatedContent);
  if (!updated) return res.status(404).json({ error: 'Capítulo não encontrado.' });
  res.json(updated);
});
