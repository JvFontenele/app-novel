import { api } from './api.js';
import { escapeHtml, setButtonContent } from './dom.js';
import { showOnly, translateSection } from './sections.js';
import { state } from './state.js';
import { openNovel } from './novelDetail.js';
import { createFontSizeControl } from './readerPrefs.js';
import { isElectron } from './runtime.js';

const electronModal = document.getElementById('electron-translate-modal');
const electronModalLink = document.getElementById('electron-translate-link');
const electronModalCopyStatus = document.getElementById('electron-translate-copy-status');

function showElectronTranslateModal(novelId) {
  const url = `${window.location.origin}/#translate/${novelId}`;
  electronModalLink.value = url;
  electronModalCopyStatus.textContent = '';
  electronModal.hidden = false;
}

document.getElementById('btn-close-translate-modal').addEventListener('click', () => {
  electronModal.hidden = true;
});

document.getElementById('btn-copy-translate-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(electronModalLink.value);
    electronModalCopyStatus.textContent = 'Link copiado.';
  } catch {
    electronModalLink.select();
    electronModalCopyStatus.textContent = 'Não foi possível copiar automaticamente — selecione e copie manualmente.';
  }
});

const translateTitle = document.getElementById('translate-title');
const translateStatus = document.getElementById('translate-status');
const translateContent = document.getElementById('translate-content');
const btnOpenTranslate = document.getElementById('btn-open-translate');
const btnTranslateAll = document.getElementById('btn-translate-all');
const filterSelect = document.getElementById('translate-filter');
const fontSizeSlot = document.getElementById('translate-font-size-slot');

fontSizeSlot.appendChild(
  createFontSizeControl((size) => {
    translateContent.style.fontSize = `${size}px`;
  }),
);

const TRANSLATE_WAIT_MS = 2500;

let allChapters = [];
let translating = false;

function paragraphsToHtml(text) {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function visibleChapters() {
  if (filterSelect.value === 'pending') return allChapters.filter((c) => !c.translatedContent);
  return allChapters;
}

function renderChapters() {
  const chapters = visibleChapters();
  if (chapters.length === 0) {
    translateContent.innerHTML = '';
    return;
  }
  translateContent.innerHTML = chapters
    .map(
      (chapter) => `
        <article class="chapter-block" data-chapter-id="${chapter.id}">
          <h3>${escapeHtml(chapter.title)}${chapter.translatedContent ? ' <span class="badge badge-translated">traduzido</span>' : ''}</h3>
          <div class="chapter-text">${paragraphsToHtml(chapter.content)}</div>
        </article>
      `,
    )
    .join('');
}

export async function openTranslate(novelId) {
  if (novelId) state.currentNovelId = novelId;

  translateTitle.textContent = 'Carregando...';
  translateStatus.textContent = '';
  translateContent.innerHTML = '';
  allChapters = [];
  filterSelect.value = 'pending';
  showOnly(translateSection);

  const [novel, chapters] = await Promise.all([
    api(`/novels/${state.currentNovelId}`),
    api(`/novels/${state.currentNovelId}/chapters-content`),
  ]);

  translateTitle.textContent = novel.title;
  allChapters = chapters;

  if (chapters.length === 0) {
    translateStatus.textContent = 'Nenhum capítulo com conteúdo salvo ainda. Busque o conteúdo dos capítulos primeiro.';
    return;
  }

  const pendingCount = chapters.filter((c) => !c.translatedContent).length;
  translateStatus.textContent = `${chapters.length} capítulo(s) com conteúdo salvo · ${pendingCount} sem tradução.`;
  renderChapters();
}

btnOpenTranslate.addEventListener('click', () => {
  if (isElectron()) {
    showElectronTranslateModal(state.currentNovelId);
    return;
  }
  openTranslate();
});
document.getElementById('btn-close-translate').addEventListener('click', () => openNovel(state.currentNovelId));
filterSelect.addEventListener('change', renderChapters);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Percorre cada bloco de capítulo já renderizado (texto sempre original —
// esta tela nunca mostra tradução salva no lugar do texto a traduzir), dá
// tempo para a tradução nativa do navegador (ativada manualmente pelo
// usuário) reescrever o texto, captura o resultado e salva. Não chama
// nenhuma API de tradução — só lê o que o próprio navegador já traduziu na
// tela.
btnTranslateAll.addEventListener('click', async () => {
  if (translating) return;

  const chapters = visibleChapters();
  if (chapters.length === 0) {
    translateStatus.textContent = 'Nada para traduzir: nenhum capítulo nesta lista.';
    return;
  }

  translating = true;
  btnTranslateAll.disabled = true;
  filterSelect.disabled = true;
  const novelId = state.currentNovelId;
  let saved = 0;
  let skipped = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const block = translateContent.querySelector(`[data-chapter-id="${chapter.id}"]`);
    if (!block) continue;

    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setButtonContent(btnTranslateAll, 'languages', `Traduzindo ${i + 1}/${chapters.length}...`);
    translateStatus.textContent = `Aguardando tradução do capítulo ${i + 1}/${chapters.length}: ${chapter.title}`;

    await sleep(TRANSLATE_WAIT_MS);

    const paragraphs = Array.from(block.querySelectorAll('.chapter-text p'))
      .map((p) => p.textContent.trim())
      .filter(Boolean);
    const translatedContent = paragraphs.join('\n');

    if (!translatedContent || translatedContent === chapter.content) {
      skipped++;
      continue;
    }

    try {
      await api(`/novels/${novelId}/chapters/${chapter.id}/translation`, {
        method: 'PUT',
        body: JSON.stringify({ translatedContent }),
      });
      chapter.translatedContent = translatedContent;
      saved++;
    } catch (err) {
      translateStatus.textContent = `Erro ao salvar capítulo "${chapter.title}": ${err.message}`;
    }
  }

  translating = false;
  btnTranslateAll.disabled = false;
  filterSelect.disabled = false;
  setButtonContent(btnTranslateAll, 'languages', 'Traduzir');
  translateStatus.textContent = `Tradução em lote concluída: ${saved} salvo(s), ${skipped} sem mudança (não traduzido ou igual ao original).`;
  renderChapters();
});
