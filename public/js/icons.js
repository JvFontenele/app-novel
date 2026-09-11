// Ícones SVG do conjunto Lucide (https://lucide.dev, licença ISC), embutidos
// localmente para não depender de rede em runtime. Usam stroke="currentColor",
// então herdam a cor do texto/botão onde forem inseridos.

const PATHS = {
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  'book-open':
    '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'trash-2':
    '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  languages:
    '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
};

// Retorna o markup SVG de um ícone como string, pronto para innerHTML.
export function icon(name, { size = 18 } = {}) {
  const paths = PATHS[name];
  if (!paths) throw new Error(`Ícone desconhecido: "${name}"`);
  return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// Substitui todo <span data-icon="nome"> encontrado (dentro de `root`, ou na
// página inteira) pelo SVG correspondente. Chamar de novo após qualquer
// innerHTML que insira novos placeholders de ícone.
export function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    el.outerHTML = icon(name);
  });
}
