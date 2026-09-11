import { renderIcons } from './icons.js';

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function truncate(str, maxLength) {
  const text = str ?? '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

// Substitui o conteúdo de um botão por ícone + texto, preservando o padrão
// visual usado no HTML estático (span[data-icon] + texto).
export function setButtonContent(button, iconName, text) {
  button.innerHTML = `<span data-icon="${iconName}"></span> ${text}`;
  renderIcons(button);
}
