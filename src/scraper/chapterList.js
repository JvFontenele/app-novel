import { newStealthPage, waitForCloudflareChallenge } from './browser.js';

function catalogUrlFor(novelUrl) {
  const clean = novelUrl.replace(/\/+$/, '');
  return clean.endsWith('/catalog') ? clean : `${clean}/catalog`;
}

// Limpa ruído comum em textos de link de lista de capítulos: número de ordem
// solto no início, timestamps relativos no fim ("10 months ago"), espaços duplos.
function cleanChapterTitle(rawText) {
  return rawText
    .replace(/^\s*\d+\s+/, '')
    .replace(/\s*(há\s+)?\d+\s*(months?|meses?|days?|dias?|years?|anos?|hours?|horas?|minutes?|minutos?)\s+ago\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Deriva um título legível a partir do slug da própria URL do capítulo
// (ex.: ".../chapter-2-diagon-alley-shopping_123" -> "Chapter 2 Diagon Alley Shopping").
// Usado quando o texto do link vier vazio, curto demais ou visivelmente quebrado.
function titleFromUrl(chapterUrl) {
  const rawSlug = chapterUrl.split('/').pop() ?? '';
  // O slug pode vir percent-encoded (ex.: "%C3%A7o" para "ço" em sites com
  // acentos na URL, como webnovel.com) — decodifica antes de virar título,
  // senão os códigos aparecem literalmente no lugar da letra acentuada.
  const slug = decodeURIComponentSafe(rawSlug);
  const withoutId = slug.replace(/_\d+$/, '');
  const words = withoutId
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!words) return null;
  // Capitaliza a primeira letra de cada palavra. Usa "início da string ou
  // espaço" em vez de \b (word boundary), pois \b não reconhece letras
  // acentuadas (ç, ã, é...) como parte da palavra e capitaliza também a
  // letra seguinte a elas (ex.: "começo" viraria "ComeçO").
  return words.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function decodeURIComponentSafe(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    // "%" seguido de algo que não é um par hexadecimal válido — mantém o
    // texto original em vez de derrubar a descoberta inteira de capítulos.
    return str;
  }
}

function isSuspiciousTitle(title) {
  if (!title || title.length < 4) return true;
  const chapterMentions = (title.match(/chapter/gi) || []).length;
  if (chapterMentions >= 2) return true;
  return false;
}

function extractChapterLinks(base) {
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const seen = new Set();
  const items = [];

  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    if (!/chapter|capitulo|cap-|\/c\d+|ch\d+/i.test(href)) continue;

    const absolute = new URL(href, base).toString();
    if (seen.has(absolute)) continue;

    // Prioriza um elemento de título específico dentro do link (evita pegar
    // badges/ícones/timestamps que também ficam dentro do <a>).
    const titleEl = a.querySelector('[class*="tit" i], [class*="name" i], p, span:not([class*="time" i])');
    const rawText = (titleEl?.textContent || a.textContent || '').trim();
    if (!rawText) continue;

    seen.add(absolute);
    items.push({ title: rawText, url: absolute });
  }
  return items;
}

// Rola a página até a contagem de links de capítulo estabilizar (parar de
// crescer por algumas rodadas seguidas). Evita cortar listas grandes
// (1000+ capítulos) que ainda estão carregando em blocos.
async function scrollUntilStable(page) {
  const countChapterLinks = () =>
    page.evaluate(() => document.querySelectorAll('a[href*="chapter"], a[href*="capitulo"]').length);

  let previousCount = -1;
  let stableRounds = 0;
  for (let i = 0; i < 60 && stableRounds < 3; i++) {
    const count = await countChapterLinks();
    if (count === previousCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
    }
    previousCount = count;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
  }
}

// Alguns sites (ex.: novelarrow.com) não têm uma página de catálogo com todos
// os capítulos — a lista na página da novel é só uma prévia (ex.: os 30 mais
// recentes/antigos). Nesses casos a única forma confiável de descobrir todos
// os capítulos é navegar sequencialmente pelo link "próximo capítulo" a partir
// do primeiro, coletando título + URL de cada página.
const MAX_SEQUENTIAL_CHAPTERS = 5000;

function extractNextChapterHref() {
  const byAria = document.querySelector('a[aria-label="Next chapter" i], a[rel="next"]');
  if (byAria) return byAria.getAttribute('href');

  const byText = Array.from(document.querySelectorAll('a[href*="chapter" i]')).find((a) =>
    /^(next|próximo|proximo)\b/i.test(a.textContent.trim()),
  );
  return byText ? byText.getAttribute('href') : null;
}

// Extrai só o título do capítulo a partir do <title> da página, que em sites
// como novelarrow.com segue o formato "Novel / Chapter X: Nome | Read on Site".
// Cai para <h1> (ou o <title> inteiro) se esse formato não for reconhecido.
function extractChapterTitle() {
  const rawTitle = document.title?.trim() || '';
  const afterSlash = rawTitle.split(' / ')[1];
  if (afterSlash) {
    return afterSlash.split(/\s*\|\s*/)[0].trim();
  }
  return document.querySelector('h1')?.textContent?.trim() || rawTitle;
}

// Segue os links de "próximo capítulo" a partir da URL do primeiro capítulo
// conhecido, coletando título + URL de cada página visitada, até não haver
// mais próximo ou o limite de segurança ser atingido.
//
// Abre uma página (aba) nova a cada capítulo, em vez de reaproveitar a mesma
// para navegar — em sites como novelarrow.com (Next.js), reutilizar a mesma
// aba faz o link "próximo capítulo" ficar preso apontando para a própria
// página atual a partir da segunda navegação em diante (o roteador client-side
// não atualiza esse link corretamente), mesmo esperando vários segundos.
// Uma aba nova a cada capítulo sempre carrega o link "próximo" correto.
async function fetchChapterListBySequentialNavigation(firstChapterUrl) {
  const { context } = await newStealthPage();
  const chapters = [];

  try {
    let currentUrl = firstChapterUrl;
    let previousUrl = null;

    while (currentUrl && currentUrl !== previousUrl && chapters.length < MAX_SEQUENTIAL_CHAPTERS) {
      const page = await context.newPage();
      let title;
      let nextHref;
      try {
        await page.goto(currentUrl, { waitUntil: 'load', timeout: 30_000 });
        await waitForCloudflareChallenge(page);
        await page.waitForTimeout(300);
        title = await page.evaluate(extractChapterTitle);
        nextHref = await page.evaluate(extractNextChapterHref);
      } finally {
        await page.close();
      }

      chapters.push({ title: cleanChapterTitle(title) || titleFromUrl(currentUrl) || currentUrl, url: currentUrl });

      previousUrl = currentUrl;
      currentUrl = nextHref ? new URL(nextHref, currentUrl).toString() : null;
    }

    return chapters;
  } finally {
    await context.close();
  }
}

// Extrai a lista de capítulos (título + link) de uma novel. Tenta primeiro a
// página de catálogo (ex.: <novelUrl>/catalog, usado por sites como
// webnovel.com); se ela não existir ou não tiver capítulos suficientes, cai
// para navegação sequencial via "próximo capítulo" a partir do primeiro link
// de capítulo encontrado na própria página da novel (usado por sites como
// novelarrow.com, que só mostram uma prévia da lista completa).
export async function fetchChapterList(novelUrl) {
  const catalogChapters = await tryFetchFromCatalog(novelUrl);
  if (catalogChapters && catalogChapters.length > 0) return catalogChapters;

  const firstChapterUrl = await findFirstChapterUrl(novelUrl);
  if (!firstChapterUrl) {
    throw new Error('Nenhum capítulo encontrado (nem catálogo, nem link de capítulo na página da novel).');
  }

  const chapters = await fetchChapterListBySequentialNavigation(firstChapterUrl);
  if (chapters.length === 0) {
    throw new Error('Nenhum capítulo encontrado ao navegar sequencialmente a partir do primeiro capítulo.');
  }
  return chapters;
}

async function tryFetchFromCatalog(novelUrl) {
  const { context, page } = await newStealthPage();

  try {
    const url = catalogUrlFor(novelUrl);
    const response = await page.goto(url, { waitUntil: 'load', timeout: 30_000 }).catch(() => null);
    if (!response || !response.ok()) return null;

    await waitForCloudflareChallenge(page);
    await page.waitForTimeout(1500);

    await scrollUntilStable(page);
    await page.waitForTimeout(500);

    const rawChapters = await page.evaluate(extractChapterLinks, url);
    return rawChapters.map(({ title, url: chUrl }) => {
      const cleaned = cleanChapterTitle(title);
      const finalTitle = isSuspiciousTitle(cleaned) ? titleFromUrl(chUrl) ?? cleaned ?? chUrl : cleaned;
      return { title: finalTitle, url: chUrl };
    });
  } finally {
    await context.close();
  }
}

// Encontra a URL do primeiro capítulo a partir da própria página da novel —
// usado como ponto de partida para a navegação sequencial. Prioriza links com
// texto indicando "capítulo 1" e, na ausência, usa o primeiro link de
// capítulo encontrado no DOM.
async function findFirstChapterUrl(novelUrl) {
  const { context, page } = await newStealthPage();

  try {
    await page.goto(novelUrl, { waitUntil: 'load', timeout: 30_000 });
    await waitForCloudflareChallenge(page);
    await page.waitForTimeout(1000);

    return await page.evaluate((base) => {
      const anchors = Array.from(document.querySelectorAll('a[href*="chapter" i]'));
      const withText = anchors
        .map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim() }))
        .filter((a) => a.href);

      const first = withText.find((a) => /(^|\D)1[\s:.\-]/.test(a.text) || /chapter[-_]1\b/i.test(a.href));
      const chosen = first ?? withText[0];
      return chosen ? new URL(chosen.href, base).toString() : null;
    }, novelUrl);
  } finally {
    await context.close();
  }
}
