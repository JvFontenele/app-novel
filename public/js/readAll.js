import { api } from './api.js';
import { escapeHtml } from './dom.js';
import { showOnly, readAllSection } from './sections.js';
import { state } from './state.js';
import { openNovel } from './novelDetail.js';
import { createFontSizeControl } from './readerPrefs.js';

const readAllTitle = document.getElementById('read-all-title');
const readAllStatus = document.getElementById('read-all-status');
const readAllContent = document.getElementById('read-all-content');
const btnReadAll = document.getElementById('btn-read-all');
const languageSelect = document.getElementById('read-all-language');
const fontSizeSlot = document.getElementById('read-all-font-size-slot');

fontSizeSlot.appendChild(
  createFontSizeControl((size) => {
    readAllContent.style.fontSize = `${size}px`;
  }),
);

let loadedChapters = [];

function paragraphsToHtml(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function contentFor(chapter) {
  const showingTranslation = languageSelect.value === 'translated';
  return showingTranslation && chapter.translatedContent ? chapter.translatedContent : chapter.content;
}

function renderChapters() {
  readAllContent.innerHTML = loadedChapters
    .map(
      (chapter) => `
        <article class="chapter-block" data-chapter-id="${chapter.id}">
          <h3>${escapeHtml(chapter.title)}</h3>
          <div class="chapter-text">${paragraphsToHtml(contentFor(chapter))}</div>
        </article>
      `,
    )
    .join('');
}

export async function openReadAll() {
  readAllTitle.textContent = 'Carregando...';
  readAllStatus.textContent = '';
  readAllContent.innerHTML = '';
  loadedChapters = [];
  languageSelect.value = 'original';
  showOnly(readAllSection);

  const [novel, chapters] = await Promise.all([
    api(`/novels/${state.currentNovelId}`),
    api(`/novels/${state.currentNovelId}/chapters-content`),
  ]);

  readAllTitle.textContent = novel.title;
  loadedChapters = chapters;

  if (chapters.length === 0) {
    readAllStatus.textContent = 'Nenhum capítulo com conteúdo salvo ainda. Abra um capítulo no leitor e clique em "Buscar/atualizar conteúdo" primeiro.';
    return;
  }

  const translatedCount = chapters.filter((c) => c.translatedContent).length;
  readAllStatus.textContent = `${chapters.length} de ${novel.chapterCount} capítulo(s) com conteúdo salvo · ${translatedCount} traduzido(s).`;
  renderChapters();
}

btnReadAll.addEventListener('click', openReadAll);
document.getElementById('btn-close-read-all').addEventListener('click', () => openNovel(state.currentNovelId));
languageSelect.addEventListener('change', renderChapters);
