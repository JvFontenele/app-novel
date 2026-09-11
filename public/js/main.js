import './novelDetail.js';
import './reader.js';
import './readAll.js';
import { openTranslate } from './translate.js';
import { showListView } from './novels.js';
import { renderIcons } from './icons.js';

renderIcons();

// Link gerado pelo app desktop (Electron) para abrir a tela de tradução
// direto num navegador comum, já que o Chromium embutido do Electron não
// tem o recurso nativo de tradução: #translate/<novelId>.
const translateMatch = window.location.hash.match(/^#translate\/(.+)$/);
if (translateMatch) {
  openTranslate(translateMatch[1]);
} else {
  showListView();
}
