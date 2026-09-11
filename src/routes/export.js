import { Router } from 'express';
import * as db from '../db.js';
import { buildEpub, buildPdf } from '../export.js';

export const exportRouter = Router();

function parseUseTranslation(req) {
  return req.query.lang === 'translated';
}

exportRouter.get('/novels/:id/export/epub', async (req, res) => {
  const novel = await db.getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: 'Novel não encontrada.' });

  const chapters = await db.listFetchedChapters(req.params.id);
  if (!chapters || chapters.length === 0) {
    return res.status(400).json({ error: 'Nenhum capítulo com conteúdo salvo para exportar.' });
  }

  let generated;
  try {
    generated = await buildEpub(novel, chapters, { useTranslation: parseUseTranslation(req) });
  } catch (err) {
    console.error('Erro ao gerar EPUB:', err);
    return res.status(500).json({ error: `Falha ao gerar EPUB: ${err.message}` });
  }

  res.download(generated.filePath, `${novel.title}.epub`, (err) => {
    generated.cleanup();
    if (err) console.error('Erro ao enviar EPUB:', err);
  });
});

exportRouter.get('/novels/:id/export/pdf', async (req, res) => {
  const novel = await db.getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: 'Novel não encontrada.' });

  const chapters = await db.listFetchedChapters(req.params.id);
  if (!chapters || chapters.length === 0) {
    return res.status(400).json({ error: 'Nenhum capítulo com conteúdo salvo para exportar.' });
  }

  let generated;
  try {
    generated = await buildPdf(novel, chapters, { useTranslation: parseUseTranslation(req) });
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    return res.status(500).json({ error: `Falha ao gerar PDF: ${err.message}` });
  }

  res.download(generated.filePath, `${novel.title}.pdf`, (err) => {
    generated.cleanup();
    if (err) console.error('Erro ao enviar PDF:', err);
  });
});
