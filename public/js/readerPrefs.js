const FONT_SIZE_KEY = 'reader-font-size';
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;

export function getFontSize() {
  try {
    const stored = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (stored >= MIN_FONT_SIZE && stored <= MAX_FONT_SIZE) return stored;
  } catch {
    // localStorage indisponível (ex.: modo privado) — usa o padrão.
  }
  return DEFAULT_FONT_SIZE;
}

export function setFontSize(size) {
  const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(clamped));
  } catch {
    // ignora se localStorage não estiver disponível
  }
  return clamped;
}

export { MIN_FONT_SIZE, MAX_FONT_SIZE };

// Cria (ou reaproveita) um controle de tamanho de fonte: -, valor atual, +.
// `onChange(size)` é chamado sempre que o tamanho muda.
export function createFontSizeControl(onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'font-size-control';

  let size = getFontSize();

  const label = document.createElement('span');
  label.className = 'font-size-value';

  function render() {
    label.textContent = `${size}px`;
  }

  function apply(newSize) {
    size = setFontSize(newSize);
    render();
    onChange(size);
  }

  const btnDecrease = document.createElement('button');
  btnDecrease.type = 'button';
  btnDecrease.className = 'secondary font-size-btn';
  btnDecrease.textContent = 'A-';
  btnDecrease.title = 'Diminuir fonte';
  btnDecrease.addEventListener('click', () => apply(size - 1));

  const btnIncrease = document.createElement('button');
  btnIncrease.type = 'button';
  btnIncrease.className = 'secondary font-size-btn';
  btnIncrease.textContent = 'A+';
  btnIncrease.title = 'Aumentar fonte';
  btnIncrease.addEventListener('click', () => apply(size + 1));

  render();
  wrapper.append(btnDecrease, label, btnIncrease);

  // Aplica o tamanho salvo imediatamente ao criar o controle.
  onChange(size);

  return wrapper;
}
