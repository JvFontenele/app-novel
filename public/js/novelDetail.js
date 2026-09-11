import { api } from './api.js';
import { escapeHtml, setButtonContent } from './dom.js';
import { showOnly, detailSection } from './sections.js';
import { state } from './state.js';
import { openReader } from './reader.js';
import { icon } from './icons.js';

const detailTitle = document.getElementById('detail-title');
const detailDescription = document.getElementById('detail-description');
const detailStats = document.getElementById('detail-stats');
const detailCover = document.getElementById('detail-cover');
const chaptersList = document.getElementById('chapters-list');
const chapterForm = document.getElementById('chapter-form');
const btnDiscoverChapters = document.getElementById('btn-discover-chapters');
const discoverStatus = document.getElementById('discover-status');
const btnFetchAllContent = document.getElementById('btn-fetch-all-content');
const bulkFetchProgress = document.getElementById('bulk-fetch-progress');
const bulkFetchBar = document.getElementById('bulk-fetch-bar');
const bulkFetchStatus = document.getElementById('bulk-fetch-status');
const exportLanguageSelect = document.getElementById('export-language');
const btnExportEpub = document.getElementById('btn-export-epub');
const btnExportPdf = document.getElementById('btn-export-pdf');
const exportStatus = document.getElementById('export-status');

export async function openNovel(id) {
  state.currentNovelId = id;
  const [novel, chapters] = await Promise.all([api(`/novels/${id}`), api(`/novels/${id}/chapters`)]);

  detailTitle.textContent = novel.title;
  detailDescription.textContent = novel.description || '(sem descrição)';

  if (novel.coverImage) {
    detailCover.src = novel.coverImage;
    detailCover.hidden = false;
    detailCover.onerror = () => {
      detailCover.hidden = true;
    };
  } else {
    detailCover.hidden = true;
  }

  const fetchedCount = chapters.filter((c) => c.fetchedAt).length;
  const translatedCount = chapters.filter((c) => c.hasTranslation).length;
  detailStats.textContent = `${chapters.length} capítulo(s) · ${fetchedCount} com conteúdo · ${translatedCount} traduzido(s)`;

  renderChapters(chapters);
  showOnly(detailSection);
}

function renderChapters(chapters) {
  chaptersList.innerHTML = '';
  if (chapters.length === 0) {
    chaptersList.innerHTML = '<p class="empty-hint">Nenhum capítulo adicionado ainda.</p>';
    return;
  }
  chapters.forEach((chapter, index) => {
    const li = document.createElement('li');
    li.className = 'chapter-item';

    const badges = [
      chapter.fetchedAt
        ? '<span class="badge badge-fetched">conteúdo salvo</span>'
        : '<span class="badge badge-pending">pendente</span>',
      chapter.hasTranslation ? '<span class="badge badge-translated">traduzido</span>' : '',
    ].join('');

    li.innerHTML = `
      <div class="chapter-main">
        <span class="chapter-title">${index + 1}. ${escapeHtml(chapter.title)}</span>
        <div class="badges">${badges}</div>
      </div>
      <div class="card-actions">
        <button class="danger" data-action="delete" title="Excluir capítulo">${icon('trash-2')}</button>
      </div>
    `;
    li.querySelector('.chapter-main').addEventListener('click', () => openReader(chapter, index + 1));
    li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`Excluir capítulo "${chapter.title}"?`)) return;
      await api(`/novels/${state.currentNovelId}/chapters/${chapter.id}`, { method: 'DELETE' });
      openNovel(state.currentNovelId);
    });
    chaptersList.appendChild(li);
  });
}

chapterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('chapter-url').value.trim();
  const title = document.getElementById('chapter-title').value.trim();
  await api(`/novels/${state.currentNovelId}/chapters`, { method: 'POST', body: JSON.stringify({ url, title }) });
  chapterForm.reset();
  openNovel(state.currentNovelId);
});

btnDiscoverChapters.addEventListener('click', async () => {
  btnDiscoverChapters.disabled = true;
  setButtonContent(btnDiscoverChapters, 'search', 'Buscando capítulos...');
  discoverStatus.textContent = 'Abrindo a página de catálogo, isso pode levar alguns segundos...';
  try {
    const result = await api(`/novels/${state.currentNovelId}/chapters/discover`, { method: 'POST' });
    discoverStatus.textContent = `Encontrados ${result.found}, adicionados ${result.added} novo(s) capítulo(s).`;
    openNovel(state.currentNovelId);
  } catch (err) {
    discoverStatus.textContent = `Erro: ${err.message}`;
  } finally {
    btnDiscoverChapters.disabled = false;
    setButtonContent(btnDiscoverChapters, 'search', 'Buscar capítulos (catálogo)');
  }
});

btnFetchAllContent.addEventListener('click', () => {
  const novelId = state.currentNovelId;
  btnFetchAllContent.disabled = true;
  setButtonContent(btnFetchAllContent, 'download', 'Buscando...');
  bulkFetchProgress.hidden = false;
  bulkFetchBar.style.width = '0%';
  bulkFetchStatus.textContent = 'Iniciando busca em massa...';

  const source = new EventSource(`/api/novels/${novelId}/chapters/fetch-all`);

  const setProgress = (done, total) => {
    const pct = total > 0 ? Math.round(((done ?? 0) / total) * 100) : 0;
    bulkFetchBar.style.width = `${pct}%`;
  };

  source.addEventListener('start', (e) => {
    const { total } = JSON.parse(e.data);
    setProgress(0, total);
    bulkFetchStatus.textContent = total === 0 ? 'Todos os capítulos já têm conteúdo salvo.' : `0 / ${total} capítulos buscados...`;
  });

  source.addEventListener('progress', (e) => {
    const { done, failed, total, position, totalChapters, lastTitle } = JSON.parse(e.data);
    setProgress(done, total);
    bulkFetchStatus.textContent = `${done} / ${total} pendentes buscados — capítulo ${position} de ${totalChapters}: ${lastTitle}${
      failed > 0 ? ` (${failed} falha(s))` : ''
    }`;
  });

  source.addEventListener('end', (e) => {
    const { done, failed, total, stopped } = JSON.parse(e.data);
    setProgress(done, total);
    bulkFetchStatus.textContent = stopped
      ? `Interrompido: ${done} / ${total} buscados (${failed} falha(s)).`
      : `Concluído: ${done} / ${total} buscados (${failed} falha(s)).`;
    source.close();
    btnFetchAllContent.disabled = false;
    setButtonContent(btnFetchAllContent, 'download', 'Buscar todos os conteúdos');
    if (state.currentNovelId === novelId) openNovel(novelId);
  });

  source.onerror = () => {
    bulkFetchStatus.textContent = 'Conexão perdida ou erro ao buscar. Tente novamente.';
    source.close();
    btnFetchAllContent.disabled = false;
    setButtonContent(btnFetchAllContent, 'download', 'Buscar todos os conteúdos');
  };
});

// Baixa o arquivo exportado (EPUB/PDF) via fetch em vez de navegar direto para
// a URL — assim dá para detectar um erro (JSON de status != 2xx, ex.: nenhum
// capítulo com conteúdo salvo) e mostrar a mensagem, em vez de o navegador só
// abrir a resposta de erro como se fosse o arquivo.
async function downloadExport({ format, button, iconName, label }) {
  const novelId = state.currentNovelId;
  const lang = exportLanguageSelect.value;

  button.disabled = true;
  setButtonContent(button, iconName, 'Gerando...');
  exportStatus.textContent = `Gerando ${format.toUpperCase()}, isso pode levar um tempo dependendo do número de capítulos...`;

  try {
    const res = await fetch(`/api/novels/${novelId}/export/${format}?lang=${lang}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erro ${res.status}`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch ? filenameMatch[1] : `novel.${format}`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    exportStatus.textContent = `${format.toUpperCase()} gerado com sucesso.`;
  } catch (err) {
    exportStatus.textContent = `Erro ao gerar ${format.toUpperCase()}: ${err.message}`;
  } finally {
    button.disabled = false;
    setButtonContent(button, iconName, label);
  }
}

btnExportEpub.addEventListener('click', () =>
  downloadExport({ format: 'epub', button: btnExportEpub, iconName: 'book-open', label: 'Baixar EPUB' }),
);

btnExportPdf.addEventListener('click', () =>
  downloadExport({ format: 'pdf', button: btnExportPdf, iconName: 'download', label: 'Baixar PDF' }),
);
