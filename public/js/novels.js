import { api } from './api.js';
import { escapeHtml, truncate, setButtonContent } from './dom.js';
import { showListSections } from './sections.js';
import { openNovel } from './novelDetail.js';
import { icon } from './icons.js';

const DESCRIPTION_LIMIT = 100;

const novelsListEl = document.getElementById('novels-list');
const novelForm = document.getElementById('novel-form');
const btnPreview = document.getElementById('btn-preview');
const btnToggleAddNovel = document.getElementById('btn-toggle-add-novel');
const btnCancelAddNovel = document.getElementById('btn-cancel-add-novel');

export function showListView() {
  showListSections();
  hideAddNovelForm();
  loadNovels();
}

export async function loadNovels() {
  const novels = await api('/novels');
  novelsListEl.innerHTML = '';
  if (novels.length === 0) {
    novelsListEl.innerHTML = '<p class="empty-hint">Nenhuma novel salva ainda.</p>';
    return;
  }
  for (const novel of novels) {
    const card = document.createElement('div');
    card.className = 'novel-card';
    const description = truncate(novel.description || novel.url, DESCRIPTION_LIMIT);
    const coverHtml = novel.coverImage
      ? `<img class="cover" src="${escapeHtml(novel.coverImage)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : `<div class="cover-placeholder">${icon('book-open', { size: 32 })}</div>`;
    card.innerHTML = `
      ${coverHtml}
      <div class="info">
        <h3>${escapeHtml(novel.title)}</h3>
        <p>${escapeHtml(description)}</p>
        <div class="card-actions">
          <button class="danger" data-action="delete" title="Excluir novel">${icon('trash-2')}</button>
        </div>
      </div>
    `;
    const coverImg = card.querySelector('img.cover');
    if (coverImg) {
      coverImg.addEventListener('error', () => {
        coverImg.outerHTML = `<div class="cover-placeholder">${icon('book-open', { size: 32 })}</div>`;
      });
    }
    card.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'delete') return;
      openNovel(novel.id);
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Excluir "${novel.title}"?`)) return;
      await api(`/novels/${novel.id}`, { method: 'DELETE' });
      loadNovels();
    });
    novelsListEl.appendChild(card);
  }
}

function showAddNovelForm() {
  novelForm.hidden = false;
  btnToggleAddNovel.hidden = true;
  document.getElementById('novel-url').focus();
}

function hideAddNovelForm() {
  novelForm.hidden = true;
  btnToggleAddNovel.hidden = false;
  novelForm.reset();
}

btnToggleAddNovel.addEventListener('click', showAddNovelForm);
btnCancelAddNovel.addEventListener('click', hideAddNovelForm);

novelForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('novel-url').value.trim();
  const title = document.getElementById('novel-title').value.trim();
  const description = document.getElementById('novel-description').value.trim();
  const coverImage = document.getElementById('novel-cover').value.trim();
  await api('/novels', { method: 'POST', body: JSON.stringify({ url, title, description, coverImage }) });
  hideAddNovelForm();
  loadNovels();
});

btnPreview.addEventListener('click', async () => {
  const url = document.getElementById('novel-url').value.trim();
  if (!url) {
    alert('Informe o link da novel primeiro.');
    return;
  }
  btnPreview.disabled = true;
  setButtonContent(btnPreview, 'search', 'Buscando...');
  try {
    const preview = await api('/fetch-preview', { method: 'POST', body: JSON.stringify({ url }) });
    if (preview.title) document.getElementById('novel-title').value = preview.title;
    if (preview.excerpt && !document.getElementById('novel-description').value) {
      document.getElementById('novel-description').value = preview.excerpt;
    }
    if (preview.coverImage && !document.getElementById('novel-cover').value) {
      document.getElementById('novel-cover').value = preview.coverImage;
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btnPreview.disabled = false;
    setButtonContent(btnPreview, 'search', 'Buscar título e capa automaticamente');
  }
});

document.getElementById('btn-back').addEventListener('click', showListView);
