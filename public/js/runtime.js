// Detecta se a própria página está sendo exibida dentro da janela do app
// desktop (Electron) ou num navegador normal — mesmo quando os dois acessam
// o mesmo servidor local (ex.: o usuário abre o link de tradução gerado pelo
// app num Chrome à parte, enquanto o app continua aberto). Por isso a
// checagem é pelo user agent da própria aba (o Chromium do Electron inclui
// "Electron/" nele por padrão), e não uma pergunta ao servidor — o servidor
// não sabe em qual janela/aba a resposta vai ser exibida.
export function isElectron() {
  return /Electron\//.test(navigator.userAgent);
}
