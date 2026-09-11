import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { EPub } from '@lesjoursfr/html-to-epub';

const IMAGE_EXTENSION_BY_CONTENT_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Baixa a imagem de capa e salva num arquivo local com extensão reconhecível
// pelo Content-Type real da resposta — necessário porque @lesjoursfr/html-to-epub
// deduz o tipo da imagem pela extensão da URL/path (via pacote `mime`), e
// muitas URLs de capa (ex.: webnovel.com) não têm extensão no path (usam query
// string tipo "?imageMogr2/thumbnail/600x"), o que a lib rejeita antes mesmo
// de tentar baixar.
async function downloadCoverToTempFile(url, tmpDir) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar capa: ${res.status}`);

  const contentType = res.headers.get('content-type')?.split(';')[0].trim();
  const extension = IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType] ?? '.jpg';

  const buffer = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(tmpDir, `cover${extension}`);
  await writeFile(filePath, buffer);
  return filePath;
}

// Escolhe, por capítulo, o conteúdo traduzido salvo (se existir) ou o
// original, conforme o modo pedido. No modo "translated", capítulos sem
// tradução salva caem para o original — nunca ficam em branco no arquivo.
function contentFor(chapter, useTranslation) {
  if (useTranslation && chapter.translatedContent) return chapter.translatedContent;
  return chapter.content;
}

function paragraphsToHtml(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Gera um arquivo EPUB da novel num diretório temporário e retorna o path do
// arquivo gerado. Quem chama é responsável por apagar o diretório depois
// (ex.: via cleanup()) após enviar o arquivo ao cliente.
export async function buildEpub(novel, chapters, { useTranslation } = {}) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'novel-epub-'));
  const cleanup = () => rm(tmpDir, { recursive: true, force: true });

  try {
    const outputPath = path.join(tmpDir, `${slugify(novel.title)}.epub`);

    const content = chapters.map((chapter, index) => ({
      title: chapter.title || `Capítulo ${index + 1}`,
      data: paragraphsToHtml(contentFor(chapter, useTranslation) || ''),
    }));

    let coverPath;
    if (novel.coverImage) {
      try {
        coverPath = await downloadCoverToTempFile(novel.coverImage, tmpDir);
      } catch {
        // Capa indisponível (URL quebrada, bloqueio) — gera o EPUB sem capa em
        // vez de falhar a exportação inteira.
      }
    }

    const epub = new EPub(
      {
        title: novel.title,
        author: 'Desconhecido',
        cover: coverPath,
        content,
        appendChapterTitles: true,
        verbose: false,
      },
      outputPath,
    );

    await epub.render();

    return { filePath: outputPath, cleanup };
  } catch (err) {
    // Falhou no meio da geração (ex.: erro do próprio epub.render()) — o
    // diretório temporário não seria mais referenciado por ninguém, então
    // precisa ser limpo aqui mesmo, antes de propagar o erro.
    await cleanup();
    throw err;
  }
}

// Gera um arquivo PDF da novel (capa + capítulos) num diretório temporário e
// retorna o path do arquivo gerado, junto de uma função de limpeza.
export async function buildPdf(novel, chapters, { useTranslation } = {}) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'novel-pdf-'));
  const cleanup = () => rm(tmpDir, { recursive: true, force: true });

  try {
    const outputPath = path.join(tmpDir, `${slugify(novel.title)}.pdf`);

    const doc = new PDFDocument({ autoFirstPage: false, margin: 56 });
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);

    await addCoverPage(doc, novel);

    for (const chapter of chapters) {
      const text = contentFor(chapter, useTranslation) || '';
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(18).text(chapter.title || '', { align: 'left' });
      doc.moveDown();
      doc.font('Helvetica').fontSize(12);
      for (const paragraph of text.split('\n')) {
        if (!paragraph.trim()) continue;
        doc.text(paragraph, { align: 'left' });
        doc.moveDown(0.5);
      }
    }

    doc.end();
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return { filePath: outputPath, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

async function addCoverPage(doc, novel) {
  doc.addPage();

  if (novel.coverImage) {
    try {
      const imageBuffer = await fetchImageBuffer(novel.coverImage);
      const pageWidth = doc.page.width;
      const maxWidth = pageWidth - 112;
      const maxHeight = 420;
      doc.image(imageBuffer, (pageWidth - maxWidth) / 2, 60, { fit: [maxWidth, maxHeight], align: 'center' });
      doc.y = 60 + maxHeight + 40;
    } catch {
      // Capa indisponível (URL quebrada, bloqueio, formato não suportado por
      // pdfkit) — segue sem capa em vez de falhar a exportação inteira.
    }
  }

  doc.font('Helvetica-Bold').fontSize(24).text(novel.title, { align: 'center' });
  if (novel.description) {
    doc.moveDown();
    doc.font('Helvetica').fontSize(11).text(novel.description, { align: 'center' });
  }
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar capa: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function slugify(title) {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'novel'
  );
}
