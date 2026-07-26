import fs from 'node:fs';
import { chromium } from 'playwright';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173/v7/';
const output = process.env.TEST_REPORT || 'v7/test-report.json';
const screenshot = process.env.TEST_SCREENSHOT || 'v7/mobile-test.png';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'de-DE'
});
const page = await context.newPage();
const pageErrors = [];
const failedRequests = [];
const dialogs = [];
page.on('pageerror', error => pageErrors.push(String(error)));
page.on('dialog', async dialog => {
  dialogs.push({ type: dialog.type(), message: dialog.message() });
  await dialog.accept();
});
page.on('requestfailed', request => {
  const target = request.url();
  if (target.includes('/v7/')) failedRequests.push(`${target}: ${request.failure()?.errorText || 'fehlgeschlagen'}`);
});

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadedPhoto(locator, message) {
  await locator.waitFor({ state: 'visible', timeout: 20000 });
  await locator.evaluate(img => img.complete || new Promise((resolve, reject) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', reject, { once: true });
  }));
  const data = await locator.evaluate(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight, alt: img.alt }));
  check(data.width > 100 && data.height > 60, message);
  return data;
}

const report = { status: 'running', url, viewport: '390x844' };
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('#homeView.active', { timeout: 20000 });
  report.title = await page.title();
  report.homeVersion = await page.locator('#homeView .pill').innerText();
  check(/Version 7(?:\.|\b)/.test(report.homeVersion), 'Version-7-Kennzeichnung fehlt');
  check(report.homeVersion.includes('echte Fotos'), 'Hinweis auf echte Fotos fehlt');

  await page.locator('[data-start="guided"]').click();
  await page.waitForSelector('#quizView.active .answer', { timeout: 10000 });
  report.question = await page.locator('#questionText').innerText();
  const answerCount = await page.locator('.answer').count();
  check(answerCount === 3, `Erwartet wurden 3 Antworten, gefunden: ${answerCount}`);
  for (let i = 0; i < answerCount; i++) {
    if (await page.locator('.learning-visual').count()) break;
    const button = page.locator('.answer').nth(i);
    if (await button.isEnabled()) {
      await button.click();
      await page.waitForTimeout(300);
    }
  }
  await page.waitForSelector('.learning-visual .real-photo-card img', { timeout: 20000 });
  report.questionPhoto = await loadedPhoto(page.locator('.learning-visual .real-photo-card img').first(), 'Echtes Foto zur richtigen Lösung wurde nicht geladen');
  check(await page.locator('.learning-visual svg').count() > 0, 'Erklärende Lernskizze wurde versehentlich entfernt');
  check(await page.locator('.learning-visual .real-photo-caption a').count() === 1, 'Quellen- und Lizenzlink am Lernfoto fehlt');

  await page.locator('#quitQuiz').click();
  await page.waitForSelector('#homeView.active', { timeout: 10000 });
  await page.locator('[data-nav="species"]').first().click();
  await page.waitForSelector('#speciesView.active .species-card', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('.species-card .real-photo-card').length === 49, null, { timeout: 20000 });
  report.speciesCards = await page.locator('.species-card').count();
  report.speciesPhotos = await page.locator('.species-card .real-photo-card').count();
  check(report.speciesCards === 49, `Es wurden nicht 49 Artenkarten gefunden: ${report.speciesCards}`);
  check(report.speciesPhotos === 49, `Nicht jede Art hat ein echtes Foto: ${report.speciesPhotos}/49`);
  report.firstSpeciesPhoto = await loadedPhoto(page.locator('.species-card .real-photo-card img').first(), 'Erstes Artenfoto wurde nicht geladen');

  await page.locator('.bottom [data-nav="practice"]').click();
  await page.waitForSelector('#practiceView.active .practice-card', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('.practice-card .real-photo-card').length === 10, null, { timeout: 20000 });
  report.practiceCards = await page.locator('.practice-card').count();
  report.practicePhotos = await page.locator('.practice-card .real-photo-card').count();
  check(report.practiceCards === 10, `Es wurden nicht 10 Geräteaufgaben gefunden: ${report.practiceCards}`);
  check(report.practicePhotos === 10, `Nicht jede Geräteaufgabe hat ein echtes Foto: ${report.practicePhotos}/10`);
  report.firstPracticePhoto = await loadedPhoto(page.locator('.practice-card .real-photo-card img').first(), 'Erstes Rutenfoto wurde nicht geladen');

  await page.locator('[data-practice-tab="components"]').click();
  await page.waitForSelector('#componentList:not(.hidden) .component-card', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('.component-card .real-photo-card').length === 12, null, { timeout: 20000 });
  report.componentCards = await page.locator('.component-card').count();
  report.componentPhotos = await page.locator('.component-card .real-photo-card').count();
  check(report.componentCards === 12, `Es wurden nicht 12 Bauteile gefunden: ${report.componentCards}`);
  check(report.componentPhotos === 12, `Nicht jedes Bauteil hat ein echtes Foto: ${report.componentPhotos}/12`);
  report.firstComponentPhoto = await loadedPhoto(page.locator('.component-card .real-photo-card img').first(), 'Erstes Bauteilfoto wurde nicht geladen');

  report.dialogs = dialogs;
  report.pageErrors = pageErrors;
  report.failedRequests = failedRequests;
  check(pageErrors.length === 0, `JavaScript-Fehler: ${pageErrors.join(' | ')}`);
  check(failedRequests.length === 0, `Lokale App-Dateien konnten nicht geladen werden: ${failedRequests.join(' | ')}`);
  report.status = 'ok';
  await page.screenshot({ path: screenshot, fullPage: true });
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  report.dialogs = dialogs;
  report.pageErrors = pageErrors;
  report.failedRequests = failedRequests;
  try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  await browser.close();
  throw error;
}
fs.writeFileSync(output, JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));

// Startet nach der finalen Fotozuordnungs-Reparatur den vollständigen V7-Build.
// Neuaufbau nach der Reparatur der Fotoebene über der unteren Navigation.
