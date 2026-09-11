import { Router } from 'express';
import * as db from '../db.js';
import { fetchPageContent } from '../scraper/index.js';

export const novelsRouter = Router();

novelsRouter.get('/novels', async (req, res) => {
  const novels = await db.listNovels();
  res.json(novels);
});

novelsRouter.get('/novels/:id', async (req, res) => {
  const novel = await db.getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: 'Novel não encontrada.' });
  res.json(novel);
});

novelsRouter.post('/novels', async (req, res) => {
  const { title, url, description, coverImage } = req.body ?? {};
  if (!title || !url) {
    return res.status(400).json({ error: 'title e url são obrigatórios.' });
  }
  const novel = await db.addNovel({ title, url, description, coverImage });
  res.status(201).json(novel);
});

novelsRouter.patch('/novels/:id', async (req, res) => {
  const { title, description, coverImage } = req.body ?? {};
  const novel = await db.updateNovel(req.params.id, {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(coverImage !== undefined ? { coverImage } : {}),
  });
  if (!novel) return res.status(404).json({ error: 'Novel não encontrada.' });
  res.json(novel);
});

novelsRouter.delete('/novels/:id', async (req, res) => {
  const ok = await db.deleteNovel(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Novel não encontrada.' });
  res.status(204).end();
});

// Busca metadados (título) direto da URL da novel, para facilitar o cadastro.
novelsRouter.post('/fetch-preview', async (req, res) => {
  const { url } = req.body ?? {};
  if (!url) return res.status(400).json({ error: 'url é obrigatória.' });
  try {
    const { title, text, coverImage } = await fetchPageContent(url);
    res.json({ title, excerpt: text.slice(0, 500), coverImage });
  } catch (err) {
    res.status(502).json({ error: `Falha ao buscar prévia: ${err.message}` });
  }
});
