import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/home/joao/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

const LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
];

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      executablePath,
      args: LAUNCH_ARGS,
    });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

// Cria uma aba nova com configurações anti-detecção básicas (stealth) e user-agent
// consistente. Quem chama é responsável por fechar o `context` retornado.
export async function newStealthPage() {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'en-US',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  const page = await context.newPage();
  return { context, page };
}

export async function waitForCloudflareChallenge(page) {
  for (let i = 0; i < 10; i++) {
    const isChallenge = await page.evaluate(
      () =>
        /Just a moment|Executando verificação de segurança|Enable JavaScript and cookies|challenge-platform/i.test(
          document.body?.innerText ?? '',
        ),
    );
    if (!isChallenge) return;
    await page.waitForTimeout(2000);
  }
}
