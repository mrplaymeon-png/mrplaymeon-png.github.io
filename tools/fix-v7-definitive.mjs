import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, value) {
  fs.writeFileSync(file, value, 'utf8');
}

function lines(...items) {
  return items.join('\n');
}

function replaceIdempotent(source, before, after, label) {
  if (source.includes(after)) {
    console.log(`${label}: bereits korrigiert`);
    return source;
  }
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: erwartet wurde genau 1 Ausgangstreffer, gefunden wurden ${count}`);
  }
  console.log(`${label}: korrigiert`);
  return source.replace(before, after);
}

const builderFile = 'tools/build-v7-real-images.mjs';
let builder = read(builderFile);

builder = replaceIdempotent(
  builder,
  lines(
    '.bottom{z-index:2147483647!important;isolation:isolate;pointer-events:auto!important;transform:translateX(-50%) translateZ(0)!important}',
    '.bottom button{position:relative;z-index:2;pointer-events:auto!important;touch-action:manipulation}',
    'main{position:relative;z-index:0}'
  ),
  lines(
    'body > .bottom{position:fixed!important;left:0!important;right:0!important;bottom:0!important;transform:none!important;margin:0 auto!important;width:min(820px,100%)!important;max-width:820px!important;z-index:2147483647!important;isolation:isolate!important;pointer-events:auto!important}',
    'body > .bottom,body > .bottom *{pointer-events:auto!important}',
    'body > .bottom button{position:relative!important;z-index:1!important;pointer-events:auto!important;touch-action:manipulation}',
    '.shell,main,.view,.species-grid,.practice-list,.component-list,.species-card,.practice-card,.component-card{position:relative;z-index:auto!important}'
  ),
  'Navigation-CSS'
);

builder = replaceIdempotent(
  builder,
  '.real-photo-caption{pointer-events:auto;display:flex;gap:8px;justify-content:space-between;align-items:flex-start;padding:9px 11px;color:#9cb9bf;font-size:.68rem;line-height:1.35}',
  '.real-photo-caption{pointer-events:none;display:flex;gap:8px;justify-content:space-between;align-items:flex-start;padding:9px 11px;color:#9cb9bf;font-size:.68rem;line-height:1.35}',
  'Foto-Unterschrift'
);

builder = replaceIdempotent(
  builder,
  "function liftNavigation(){const nav=document.querySelector('.bottom');if(nav&&nav.parentElement!==document.body){document.body.appendChild(nav);}if(nav){nav.style.setProperty('position','fixed','important');nav.style.setProperty('z-index','2147483647','important');nav.style.setProperty('pointer-events','auto','important');}}",
  "function liftNavigation(){const nav=document.querySelector('.bottom');if(!nav)return;if(nav.parentElement!==document.body)document.body.appendChild(nav);const styles={position:'fixed',left:'0',right:'0',bottom:'0',transform:'none',margin:'0 auto',width:'min(820px, 100%)','max-width':'820px','z-index':'2147483647','pointer-events':'auto'};for(const [key,value] of Object.entries(styles))nav.style.setProperty(key,value,'important');for(const button of nav.querySelectorAll('button')){button.style.setProperty('pointer-events','auto','important');button.style.setProperty('touch-action','manipulation','important');}}",
  'Navigation-Laufzeitlogik'
);

builder = replaceIdempotent(
  builder,
  '  let pending=false;function enhance(){pending=false;liftNavigation();enhanceHome();enhanceQuestion();enhanceSpecies();enhancePractice();enhanceComponents();}',
  lines(
    '  liftNavigation();',
    '  let pending=false;function enhance(){pending=false;liftNavigation();enhanceHome();enhanceQuestion();enhanceSpecies();enhancePractice();enhanceComponents();}'
  ),
  'Sofortige Navigationseinordnung'
);

write(builderFile, builder);

const testFile = 'tools/test-v7.mjs';
let test = read(testFile);

test = replaceIdempotent(
  test,
  lines('const failedRequests = [];', 'const dialogs = [];'),
  lines('const failedRequests = [];', 'const httpErrors = [];', 'const dialogs = [];'),
  'HTTP-Fehlerliste'
);

const requestFailedBefore = lines(
  "page.on('requestfailed', request => {",
  '  const target = request.url();',
  "  if (target.includes('/v7/')) failedRequests.push(`${target}: ${request.failure()?.errorText || 'fehlgeschlagen'}`);",
  '});'
);
const requestFailedAfter = lines(
  requestFailedBefore,
  "page.on('response', response => {",
  '  const target = response.url();',
  "  if (target.includes('/v7/') && response.status() >= 400) {",
  '    httpErrors.push(`${response.status()} ${target}`);',
  '  }',
  '});'
);
test = replaceIdempotent(test, requestFailedBefore, requestFailedAfter, 'HTTP-Statuspruefung');

test = replaceIdempotent(
  test,
  "  report.questionPhoto = await loadedPhoto(page.locator('.learning-visual .real-photo-card img').first(), 'Echtes Foto zur richtigen Lösung wurde nicht geladen');",
  lines(
    "  report.questionPhoto = await loadedPhoto(page.locator('.learning-visual .real-photo-card img').first(), 'Echtes Foto zur richtigen Lösung wurde nicht geladen');",
    '  report.realPhotoVisible = report.questionPhoto.width > 100 && report.questionPhoto.height > 60;'
  ),
  'Sichtbares Lernfoto'
);

test = replaceIdempotent(
  test,
  "  await page.locator('.bottom [data-nav=\"practice\"]').click();",
  lines(
    "  await page.waitForFunction(() => document.querySelector('.bottom')?.parentElement === document.body, null, { timeout: 10000 });",
    "  const practiceNav = page.locator('body > .bottom [data-nav=\"practice\"]');",
    '  const navigationHitTest = await practiceNav.evaluate(element => {',
    '    const rect = element.getBoundingClientRect();',
    '    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);',
    '    return Boolean(target && (target === element || element.contains(target)));',
    '  });',
    '  report.navigationHitTest = navigationHitTest;',
    "  check(navigationHitTest, 'Untere Navigation wird von Seiteninhalt überdeckt');",
    '  await practiceNav.click();'
  ),
  'Echter Navigationstest'
);

const successBefore = lines(
  '  report.dialogs = dialogs;',
  '  report.pageErrors = pageErrors;',
  '  report.failedRequests = failedRequests;',
  '  check(pageErrors.length === 0, `JavaScript-Fehler: ${pageErrors.join(\' | \')}`);',
  '  check(failedRequests.length === 0, `Lokale App-Dateien konnten nicht geladen werden: ${failedRequests.join(\' | \')}`);',
  "  report.status = 'ok';"
);
const successAfter = lines(
  '  report.dialogs = dialogs;',
  '  report.pageErrors = pageErrors;',
  '  report.failedRequests = failedRequests;',
  '  report.httpErrors = httpErrors;',
  '  check(pageErrors.length === 0, `JavaScript-Fehler: ${pageErrors.join(\' | \')}`);',
  '  check(failedRequests.length === 0, `Lokale App-Dateien konnten nicht geladen werden: ${failedRequests.join(\' | \')}`);',
  '  check(httpErrors.length === 0, `App-Dateien lieferten HTTP-Fehler: ${httpErrors.join(\' | \')}`);',
  "  report.status = 'passed';"
);
test = replaceIdempotent(test, successBefore, successAfter, 'Erfolgsstatus und HTTP-Pruefung');

const failureBefore = lines(
  '  report.dialogs = dialogs;',
  '  report.pageErrors = pageErrors;',
  '  report.failedRequests = failedRequests;',
  '  try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}'
);
const failureAfter = lines(
  '  report.dialogs = dialogs;',
  '  report.pageErrors = pageErrors;',
  '  report.failedRequests = failedRequests;',
  '  report.httpErrors = httpErrors;',
  '  try { await page.screenshot({ path: screenshot, fullPage: true }); } catch {}'
);
test = replaceIdempotent(test, failureBefore, failureAfter, 'Fehlerbericht mit HTTP-Status');

write(testFile, test);

const workflowFile = '.github/workflows/publish-v7-final.yml';
let workflow = read(workflowFile);
workflow = replaceIdempotent(
  workflow,
  lines(
    '          if(report.pageErrors?.length) throw new Error(`Browserfehler: ${report.pageErrors.join(\'; \')}`);',
    '          if(report.failedRequests?.length) throw new Error(`Fehlgeschlagene App-Abrufe: ${report.failedRequests.join(\'; \')}`);'
  ),
  lines(
    '          if(report.pageErrors?.length) throw new Error(`Browserfehler: ${report.pageErrors.join(\'; \')}`);',
    '          if(report.failedRequests?.length) throw new Error(`Fehlgeschlagene App-Abrufe: ${report.failedRequests.join(\'; \')}`);',
    '          if(report.httpErrors?.length) throw new Error(`HTTP-Fehler der App: ${report.httpErrors.join(\'; \')}`);'
  ),
  'Lokale Workflow-HTTP-Pruefung'
);
workflow = replaceIdempotent(
  workflow,
  '          if(live.pageErrors?.length||live.failedRequests?.length) throw new Error(`Live-Browserfehler: ${JSON.stringify(live)}`);',
  '          if(live.pageErrors?.length||live.failedRequests?.length||live.httpErrors?.length) throw new Error(`Live-Browserfehler: ${JSON.stringify(live)}`);',
  'Live-Workflow-HTTP-Pruefung'
);
write(workflowFile, workflow);

write('404.html', `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#073b46">
<title>PetriCoach NRW</title>
<style>html,body{margin:0;min-height:100%;display:grid;place-items:center;background:#06191e;color:#f6fbfc;font:18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:22px}a{color:#75e1e8;font-weight:800}</style>
</head>
<body><p>Diese Adresse wurde nicht gefunden.<br><a href="/">PetriCoach NRW öffnen</a></p><script>setTimeout(()=>location.replace('/'),1200)</script></body>
</html>`);

write('v7-final-trigger.txt', `definitive-fix-${new Date().toISOString()}\n`);
console.log('Alle Quellkorrekturen wurden erfolgreich vorbereitet.');
