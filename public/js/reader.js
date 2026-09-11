import { api } from './api.js';
import { escapeHtml, setButtonContent } from './dom.js';
import { showOnly, readerSection } from './sections.js';
import { state } from './state.js';
import { openNovel } from './novelDetail.js';
import { createFontSizeControl } from './readerPrefs.js';

const readerTitle = document.getElementById('reader-title');
const readerContent = document.getElementById('reader-content');
const readerStatus = document.getElementById('reader-status');
const btnFetchContent = document.getElementById('btn-fetch-content');
const languageSelect = document.getElementById('reader-language');
const fontSizeSlot = document.getElementById('reader-font-size-slot');

fontSizeSlot.appendChild(
  createFontSizeControl((size) => {
    readerContent.style.fontSize = `${size}px`;
  }),
);

// Guarda o capítulo carregado para poder alternar original/tradução sem
// precisar buscar de novo no servidor.
let loadedChapter = null;

function renderTitle(title) {
  readerTitle.textContent = state.currentChapterPosition ? `${state.currentChapterPosition}. ${title}` : title;
}

function paragraphsToHtml(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function renderContent() {
  if (!loadedChapter) return;
  const showingTranslation = languageSelect.value === 'translated';
  const text = showingTranslation && loadedChapter.translatedContent ? loadedChapter.translatedContent : loadedChapter.content;
  readerContent.innerHTML = text ? paragraphsToHtml(text) : '';
  languageSelect.hidden = !loadedChapter.translatedContent;
}

export async function openReader(chapterSummary, position) {
  state.currentChapterId = chapterSummary.id;
  state.currentChapterPosition = position ?? null;
  loadedChapter = null;
  renderTitle(chapterSummary.title);
  readerContent.innerHTML = '';
  readerStatus.textContent = 'Carregando...';
  languageSelect.hidden = true;
  showOnly(readerSection);

  const chapter = await api(`/novels/${state.currentNovelId}/chapters/${chapterSummary.id}`);
  loadedChapter = chapter;
  languageSelect.value = chapter.translatedContent ? 'translated' : 'original';
  renderTitle(chapter.title);
  renderContent();
  readerStatus.textContent = chapter.content
    ? `Conteúdo carregado (salvo em ${new Date(chapter.fetchedAt).toLocaleString('pt-BR')}).${
        chapter.translatedContent ? ' Tradução salva disponível.' : ''
      }`
    : 'Conteúdo ainda não buscado. Clique em "Buscar/atualizar conteúdo".';
}

document.getElementById('btn-close-reader').addEventListener('click', () => openNovel(state.currentNovelId));

languageSelect.addEventListener('change', renderContent);

btnFetchContent.addEventListener('click', async () => {
  btnFetchContent.disabled = true;
  setButtonContent(btnFetchContent, 'download', 'Buscando conteúdo...');
  readerStatus.textContent = 'Abrindo o link e extraindo o conteúdo, isso pode levar alguns segundos...';
  try {
    const chapter = await api(`/novels/${state.currentNovelId}/chapters/${state.currentChapterId}/fetch`, {
      method: 'POST',
    });
    loadedChapter = { ...loadedChapter, ...chapter };
    languageSelect.value = 'original';
    renderTitle(chapter.title);
    renderContent();
    readerStatus.textContent = `Conteúdo atualizado (${new Date(chapter.fetchedAt).toLocaleString('pt-BR')}).`;
  } catch (err) {
    readerStatus.textContent = `Erro: ${err.message}`;
  } finally {
    btnFetchContent.disabled = false;
    setButtonContent(btnFetchContent, 'download', 'Buscar/atualizar conteúdo');
  }
});
