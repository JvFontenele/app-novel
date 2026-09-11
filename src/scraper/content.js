import { newStealthPage } from './browser.js';

const CONTENT_SELECTORS = [
  '#chapter-content',
  '.chapter-content',
  '#chr-content',
  '.chr-content',
  '#reading-content',
  '.reading-content',
  '.cha-content',
  '.cha-words',
  '.j_readContent',
  '.para',
  'article',
  'main',
];

// Elementos de UI (comentários, votação, presentes, propaganda de app etc.) que
// às vezes ficam dentro do próprio container de conteúdo do capítulo.
const NOISE_SELECTORS = [
  '.user-links-wrap',
  '.user-link',
  '[class*="comment" i]',
  '[class*="j_bottom" i]',
  '[class*="vote" i]',
  '[class*="gift" i]',
  '[class*="ad-" i]',
  '[class*="advert" i]',
  'nav',
  'header',
  'footer',
  'script',
  'style',
  // Título do capítulo repetido dentro do próprio container de conteúdo
  // (ex.: novelarrow.com coloca um <h2> com o título logo no início).
  'h1, h2, h3',
];

// Linhas de texto que são ruído (propaganda de Patreon/Ko-fi, separadores
// decorativos) e não fazem parte do conteúdo do capítulo — removidas linha a
// linha após a limpeza de elementos, pois costumam ser texto solto sem uma
// classe própria para selecionar.
// Fontes de regex como string (RegExp não sobrevive à serialização do
// page.evaluate) — reconstruídas com `new RegExp()` dentro do browser.
const NOISE_LINE_PATTERN_SOURCES = [
  'patreon\\.com',
  'ko-fi\\.com',
  '^\\*{5,}$',
  'advance chapters? on',
];

function extractContent({ selectors, noiseSelectors, noiseLinePatternSources }) {
  const noiseLinePatterns = noiseLinePatternSources.map((src) => new RegExp(src, 'i'));
  // Em sites como novelarrow.com, o <title> segue o formato
  // "Novel / Chapter X: Nome | Read on Site" — extrai só a parte do capítulo.
  // Cai para <h1> (mais comum em outros sites) ou o <title> inteiro.
  function extractTitle() {
    const rawTitle = document.title?.trim() || '';
    const afterSlash = rawTitle.split(' / ')[1];
    if (afterSlash) return afterSlash.split(/\s*\|\s*/)[0].trim();
    return document.querySelector('h1')?.textContent?.trim() || rawTitle;
  }
  const title = extractTitle();

  function extractCoverImage() {
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImage) return ogImage;

    const twitterImage = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
    if (twitterImage) return twitterImage;

    return null;
  }
  const coverImage = extractCoverImage();

  function cleanText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(noiseSelectors.join(',')).forEach((n) => n.remove());

    // Alguns sites (ex.: novelarrow.com) usam um <div> por parágrafo sem
    // <br>, então textContent puro concatenaria tudo numa linha só — insere
    // uma quebra de linha entre esses blocos antes de extrair o texto.
    clone.querySelectorAll('p, div').forEach((block) => {
      block.after(document.createTextNode('\n'));
    });

    return clone.textContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !noiseLinePatterns.some((pattern) => pattern.test(line)))
      .join('\n')
      .trim();
  }

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 50) {
      const text = cleanText(el);
      if (text.length > 50) return { title, text, coverImage };
    }
  }

  // Fallback: nenhum seletor conhecido bateu — pega o elemento com mais
  // texto direto em parágrafos, que costuma ser o corpo do capítulo.
  let best = null;
  let bestLength = 0;
  document.querySelectorAll('div, section, article, main').forEach((el) => {
    if (el.querySelector('nav, header, footer')) return;
    const len = el.textContent?.trim().length ?? 0;
    if (len > bestLength) {
      bestLength = len;
      best = el;
    }
  });
  if (best && bestLength > 200) {
    return { title, text: cleanText(best), coverImage };
  }

  return { title, text: '', coverImage };
}

// Abre a URL de um capítulo e extrai título + texto principal, removendo ruído
// de UI (comentários, votação, presentes) que alguns sites embutem no mesmo
// container do texto.
export async function fetchPageContent(url) {
  const { context, page } = await newStealthPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await Promise.race(
      CONTENT_SELECTORS.map((s) => page.waitForSelector(s, { timeout: 15_000 }).catch(() => null)),
    );

    const result = await page.evaluate(extractContent, {
      selectors: CONTENT_SELECTORS,
      noiseSelectors: NOISE_SELECTORS,
      noiseLinePatternSources: NOISE_LINE_PATTERN_SOURCES,
    });

    if (!result.text) {
      throw new Error('Não foi possível localizar o conteúdo da página (seletores conhecidos não encontraram texto).');
    }

    return result;
  } finally {
    await context.close();
  }
}
