# Buscar Novel Individual

Sistema simples para salvar links de novels (com descrição), organizar capítulos e ler o conteúdo extraído automaticamente via Playwright — sem depender de uma extensão ou serviço externo de tradução (usa a tradução nativa do navegador).

## Rodar

```bash
npm install
npm start
```

Acesse http://localhost:3000

## Como funciona

- **Salvar novel**: link + título + descrição, guardados em `data/db.json`.
- **Capítulos**: adicione o link de cada capítulo dentro da novel, ou use "Buscar capítulos automaticamente" para descobrir todos a partir da página de catálogo do site.
- **Buscar conteúdo**: abre o link do capítulo com um Chromium headless (Playwright) e extrai o texto, salvando em `data/db.json` para não precisar buscar de novo.
- **Traduzir**: o texto extraído fica marcado como `translate="yes"` e `lang="en"`; use o recurso nativo de tradução do navegador (ícone na barra de endereço ou botão direito → "Traduzir para..."). O texto traduzido não é salvo — só a versão original fica no banco.

## Estrutura

```
server.js                    # ponto de entrada: sobe o Express e trata shutdown
src/
  app.js                     # monta o Express (middlewares + rotas)
  db.js                      # persistência simples em data/db.json
  routes/
    novels.js                # rotas de novels (CRUD + preview)
    chapters.js               # rotas de capítulos (CRUD + discover + fetch)
  scraper/
    browser.js               # gerenciamento do Chromium (launch, stealth, Cloudflare)
    content.js                # extração do texto de um capítulo
    chapterList.js             # descoberta da lista de capítulos no catálogo
    index.js                  # ponto único de import do scraper
public/
  index.html
  style.css
  js/
    main.js                  # ponto de entrada do front, liga os módulos
    api.js                    # wrapper de fetch para a API
    state.js                  # estado atual (novel/capítulo aberto)
    sections.js                # troca de telas (lista/detalhe/leitor)
    novels.js                  # tela de listagem/cadastro de novels
    novelDetail.js             # tela de detalhe da novel + lista de capítulos
    reader.js                  # tela de leitura de um capítulo
    dom.js                    # helpers de DOM (escape de HTML)
data/
  db.json                    # dados salvos (gerado automaticamente)
```

## Observação sobre extração

Os seletores de conteúdo em `src/scraper/content.js` cobrem os formatos mais comuns de sites de novel. Se um site novo não for reconhecido, há um fallback automático (pega o maior bloco de texto da página), mas pode ser necessário adicionar o seletor específico do site em `CONTENT_SELECTORS` (ou em `NOISE_SELECTORS`, se o problema for texto de UI misturado ao conteúdo).
