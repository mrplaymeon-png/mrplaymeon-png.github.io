import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'v6', 'index.html');
const OUT = path.join(ROOT, 'v7');
const REAL_DIR = path.join(OUT, 'real');
const USER_AGENT = 'PetriCoachNRW/7.0 (https://github.com/mrplaymeon-png/mrplaymeon-png.github.io; educational app)';
const sourceHtml = fs.readFileSync(SOURCE, 'utf8');
const visualQueries = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'v7-image-queries.json'), 'utf8'));

function extractConst(name) {
  const marker = `const ${name}=`;
  const start = sourceHtml.indexOf(marker);
  if (start < 0) throw new Error(`${name}: Marker nicht gefunden`);
  let i = start + marker.length;
  while (/\s/.test(sourceHtml[i])) i++;
  const opener = sourceHtml[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (!closer) throw new Error(`${name}: kein Array oder Objekt`);
  let depth = 0, quote = null, escaped = false, end = -1;
  for (let p = i; p < sourceHtml.length; p++) {
    const ch = sourceHtml[p];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === opener) depth++;
    if (ch === closer && --depth === 0) { end = p + 1; break; }
  }
  if (end < 0) throw new Error(`${name}: Abschluss nicht gefunden`);
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${sourceHtml.slice(i, end)})`, Object.create(null), { timeout: 3000 })));
}

const QUESTIONS = extractConst('QUESTIONS');
const SPECIES = extractConst('SPECIES');
const PRACTICE = extractConst('PRACTICE');
const COMPONENTS = extractConst('COMPONENTS');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(REAL_DIR, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de-DE');
const slug = value => normalize(value).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'bild';
const stripHtml = value => String(value || '')
  .replace(/<br\s*\/?\s*>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#039;|&apos;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();
const short = (value, max = 150) => {
  const text = stripHtml(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
};
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

async function fetchRetry(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(options.headers || {}) }
      });
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`${response.status} ${response.statusText} – ${url}`);
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(650 * attempt);
  }
  throw lastError || new Error(`Abruf fehlgeschlagen: ${url}`);
}

const badTitle = /\b(svg|logo|icon|coat of arms|flag|map|diagram|scheme|drawing|illustration|painting|engraving|woodcut|poster|stamp|screenshot|scan|chart|graph|seal|symbol|pictogram|collage)\b/i;

function candidateScore(page, info, query, index) {
  const title = String(page.title || '').replace(/^File:/, '').toLowerCase();
  const tokens = query.toLowerCase().split(/[^a-z0-9äöüß]+/).filter(t => t.length >= 4);
  let score = 100 - index;
  for (const token of tokens) if (title.includes(token)) score += 8;
  if (info.mime === 'image/jpeg') score += 14;
  if ((info.width || 0) >= 1000) score += 5;
  if ((info.height || 0) >= 600) score += 3;
  if (badTitle.test(title)) score -= 120;
  if (/\b(juvenile|adult|male|female|close|underwater|river|lake|fish|fishing)\b/i.test(title)) score += 4;
  return score;
}

async function searchCommons(query) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '24',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '720',
    format: 'json',
    formatversion: '2',
    origin: '*'
  });
  const response = await fetchRetry(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { Accept: 'application/json' } });
  const data = await response.json();
  const candidates = [];
  for (const [index, page] of (data?.query?.pages || []).entries()) {
    const info = page?.imageinfo?.[0];
    if (!info || !['image/jpeg', 'image/png'].includes(info.mime)) continue;
    if (!info.thumburl && !info.url) continue;
    const score = candidateScore(page, info, query, index);
    if (score < 0) continue;
    candidates.push({ page, info, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

const downloaded = new Map();
async function saveCandidate(candidate) {
  const { page, info } = candidate;
  const url = info.thumburl || info.url;
  if (downloaded.has(url)) return downloaded.get(url);
  const response = await fetchRetry(url, { headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' } });
  const type = (response.headers.get('content-type') || info.mime || '').split(';')[0];
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2500) throw new Error(`Bilddatei zu klein: ${page.title}`);
  const fileName = `${sha(url).slice(0, 18)}.${ext}`;
  const relative = `real/${fileName}`;
  fs.writeFileSync(path.join(OUT, relative), bytes);
  const metadata = info.extmetadata || {};
  const source = `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || '').replace(/ /g, '_'))}`;
  const result = {
    file: relative,
    source,
    title: String(page.title || '').replace(/^File:/, ''),
    author: short(metadata.Artist?.value || metadata.Credit?.value || 'Urheber siehe Quelldatei'),
    license: short(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || 'Lizenz siehe Quelldatei', 80),
    licenseUrl: metadata.LicenseUrl?.value || source,
    description: short(metadata.ImageDescription?.value || metadata.ObjectName?.value || '', 180),
    bytes: bytes.length
  };
  downloaded.set(url, result);
  return result;
}

const fallbackByKind = {
  visual: 'freshwater fishing fish water',
  species: 'freshwater fish underwater',
  practice: 'fishing rod reel tackle',
  component: 'fishing tackle equipment'
};

async function resolvePhoto(task) {
  const queries = [task.query, ...(task.alternatives || []), fallbackByKind[task.kind]]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
  let lastError;
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    try {
      const candidate = await searchCommons(query);
      if (!candidate) continue;
      const saved = await saveCandidate(candidate);
      return { ...saved, label: task.label, query, fallback: i > 0 };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${task.kind}/${task.key}: kein Foto gefunden (${lastError?.message || 'ohne Treffer'})`);
}

function practiceQuery(item) {
  const byType = {
    float: 'float fishing rod setup',
    feeder: 'feeder fishing rod rig',
    ground: item.name.includes('Aal') ? 'eel fishing bottom rig' : 'carp fishing rod setup',
    spin: 'pike spinning rod lure',
    'spin-light': 'perch spinning rod lure',
    'fly-dry': 'dry fly fishing rod setup',
    'fly-wet': 'wet fly fishing rod setup',
    pilk: 'cod pilk fishing rod boat',
    surf: 'surfcasting fishing rod beach'
  };
  return byType[item.type] || `${item.name} fishing rod`;
}

function componentQuery(item) {
  const byCode = {
    rod: 'fishing rod close up',
    reel: 'spinning fishing reel close up',
    line: 'fishing line spool close up',
    indicator: 'fishing float bite indicator',
    weight: 'fishing sinkers weights assortment',
    leader: 'fishing leader rig close up',
    swivel: 'fishing swivel macro',
    hook: 'fishing hook macro',
    lure: 'fishing lures assortment',
    net: 'landing net fishing',
    measure: 'fish measuring mat angling',
    humane: 'fish priest angling tool knife'
  };
  return byCode[item[1]] || `${item[0]} fishing tackle`;
}

const missingQueries = [...new Set(QUESTIONS.map(q => q.visual).filter(Boolean))].filter(key => !visualQueries[key]);
if (missingQueries.length) throw new Error(`Für diese Lernbilder fehlen Suchbegriffe: ${missingQueries.join(', ')}`);

const tasks = [];
for (const key of [...new Set(QUESTIONS.map(q => q.visual).filter(Boolean))].sort()) {
  tasks.push({ kind: 'visual', key, label: key, query: visualQueries[key] });
}
for (const item of SPECIES) {
  const [name, latin] = item;
  tasks.push({ kind: 'species', key: name, label: name, query: latin || `${name} fish`, alternatives: [`${name} Fisch`] });
}
for (const item of PRACTICE) {
  tasks.push({ kind: 'practice', key: item.id, label: item.name, query: practiceQuery(item), alternatives: [item.name] });
}
for (const item of COMPONENTS) {
  tasks.push({ kind: 'component', key: item[0], label: item[0], query: componentQuery(item) });
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

console.log(`Suche ${tasks.length} echte Lernfotos bei Wikimedia Commons …`);
const resolved = await mapLimit(tasks, 4, async (task, index) => {
  const photo = await resolvePhoto(task);
  console.log(`${index + 1}/${tasks.length} ${task.kind}: ${task.label} -> ${photo.title}${photo.fallback ? ' [Fallback]' : ''}`);
  return { task, photo };
});

const byKind = { visual: {}, species: {}, practice: {}, component: {} };
for (const { task, photo } of resolved) byKind[task.kind][normalize(task.key)] = photo;

const questionMap = {};
for (const question of QUESTIONS) questionMap[normalize(question.question)] = byKind.visual[normalize(question.visual)];
const speciesMap = {};
for (const item of SPECIES) speciesMap[normalize(item[0])] = byKind.species[normalize(item[0])];
const practiceMap = {};
for (const item of PRACTICE) {
  practiceMap[normalize(item.id)] = byKind.practice[normalize(item.id)];
  practiceMap[normalize(item.name)] = byKind.practice[normalize(item.id)];
}
const componentMap = {};
for (const item of COMPONENTS) componentMap[normalize(item[0])] = byKind.component[normalize(item[0])];
const allFiles = [...new Set(resolved.map(entry => entry.photo.file))];

const data = { version: '7.0.0', questions: questionMap, species: speciesMap, practice: practiceMap, components: componentMap, allFiles };

const css = `
.real-photo-card{margin:12px 0 14px;background:#071c21;border:1px solid #2a5963;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,.18)}
.real-photo-card img{display:block;width:100%;height:auto;max-height:360px;object-fit:cover;background:#09252c}
.real-photo-card.compact img{height:150px;object-fit:cover}
.real-photo-caption{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;padding:9px 11px;color:#9cb9bf;font-size:.68rem;line-height:1.35}
.real-photo-caption strong{display:block;color:#d8f7f9;font-size:.72rem;margin-bottom:2px}
.real-photo-caption a{color:#74dce5;text-decoration:none;white-space:nowrap}
.real-photo-badge{display:inline-flex;align-items:center;gap:5px;background:#12414a;color:#aef4f7;border-radius:999px;padding:5px 9px;font-size:.67rem;font-weight:800;margin-bottom:8px}
.real-photo-failed{display:none}
.photo-cache-status{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:60;max-width:calc(100vw - 30px);background:#10333b;border:1px solid #2d6974;color:#e9feff;padding:10px 14px;border-radius:999px;font-size:.76rem;font-weight:750;box-shadow:0 10px 30px rgba(0,0,0,.3)}
.species-card .real-photo-card{margin-top:0}.species-card .real-photo-card img{height:135px;object-fit:cover}.species-card>.real-photo-card+svg{display:none}
.practice-card>.real-photo-card img,.component-card>.real-photo-card img{height:180px;object-fit:cover}
.learning-visual>.real-photo-card{margin-top:8px}.learning-visual>.real-photo-card+svg{margin-top:10px}
@media(max-width:520px){.real-photo-card img{max-height:270px}.real-photo-caption{display:block}.real-photo-caption a{display:inline-block;margin-top:5px}.species-card .real-photo-card img{height:115px}}
`;

const runtime = `
(() => {
  'use strict';
  const DATA=${JSON.stringify(data)};
  const BASE=new URL('.',document.currentScript.src);
  const norm=value=>String(value||'').normalize('NFKC').replace(/\\s+/g,' ').trim().toLocaleLowerCase('de-DE');
  const escText=value=>String(value||'');
  function findByContainedText(map,text){
    const n=norm(text);
    if(map[n]) return map[n];
    const keys=Object.keys(map).sort((a,b)=>b.length-a.length);
    const key=keys.find(k=>n.includes(k)||k.includes(n));
    return key?map[key]:null;
  }
  function figure(meta,label,compact=false){
    if(!meta) return null;
    const fig=document.createElement('figure');
    fig.className='real-photo-card'+(compact?' compact':'');
    fig.dataset.realPhoto='1';
    const badge=document.createElement('div');
    badge.className='real-photo-badge';
    badge.textContent='📷 Echtes Lernfoto';
    const img=document.createElement('img');
    img.loading='lazy'; img.decoding='async'; img.alt='Echtes Foto: '+escText(label);
    img.src=new URL(meta.file,BASE).href;
    img.addEventListener('error',()=>fig.remove(),{once:true});
    const cap=document.createElement('figcaption');
    cap.className='real-photo-caption';
    const info=document.createElement('span');
    const strong=document.createElement('strong'); strong.textContent=label;
    const credit=document.createElement('span'); credit.textContent=(meta.author||'Urheber siehe Quelle')+' · '+(meta.license||'Lizenz siehe Quelle');
    info.append(strong,credit);
    const link=document.createElement('a'); link.href=meta.source; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent='Quelle & Lizenz';
    cap.append(info,link);
    fig.append(badge,img,cap);
    return fig;
  }
  function enhanceQuestion(){
    const box=document.querySelector('.learning-visual');
    if(!box||box.querySelector(':scope > .real-photo-card')) return;
    const text=document.querySelector('#questionText')?.textContent||'';
    const meta=DATA.questions[norm(text)];
    const photo=figure(meta,'Echtes Beispiel zur richtigen Lösung');
    if(photo){const h=box.querySelector('h3');h?h.after(photo):box.prepend(photo);}
  }
  function enhanceSpecies(){
    document.querySelectorAll('.species-card:not([data-photo-enhanced])').forEach(card=>{
      const title=card.querySelector('b')?.textContent||card.textContent;
      const meta=findByContainedText(DATA.species,title);
      if(!meta) return;
      const photo=figure(meta,String(title).trim(),true);
      if(photo){card.prepend(photo);card.dataset.photoEnhanced='1';}
    });
  }
  function enhancePractice(){
    document.querySelectorAll('.practice-card:not([data-photo-enhanced])').forEach(card=>{
      const title=card.querySelector('h3,b,strong')?.textContent||card.textContent;
      const meta=findByContainedText(DATA.practice,title);
      if(!meta) return;
      const photo=figure(meta,String(title).trim(),true);
      if(photo){const diagram=card.querySelector('.practice-diagram');diagram?diagram.prepend(photo):card.insertBefore(photo,card.children[1]||null);card.dataset.photoEnhanced='1';}
    });
  }
  function enhanceComponents(){
    document.querySelectorAll('.component-card:not([data-photo-enhanced])').forEach(card=>{
      const title=card.querySelector('h3,b,strong')?.textContent||card.textContent;
      const meta=findByContainedText(DATA.components,title);
      if(!meta) return;
      const photo=figure(meta,String(title).trim(),true);
      if(photo){card.prepend(photo);card.dataset.photoEnhanced='1';}
    });
  }
  function enhanceHome(){
    const pill=document.querySelector('#homeView .pill');
    if(pill&&!pill.dataset.realUpdated){pill.textContent='Offline · Version 7.0 · 180 Fragen · echte Fotos';pill.dataset.realUpdated='1';}
    const note=document.querySelector('#homeView .source-note');
    if(note&&!note.dataset.realUpdated){note.insertAdjacentText('beforeend',' Echte Fotos stammen aus Wikimedia Commons; Urheber und Lizenz sind direkt am jeweiligen Foto verlinkt.');note.dataset.realUpdated='1';}
  }
  let pending=false;
  function enhance(){pending=false;enhanceHome();enhanceQuestion();enhanceSpecies();enhancePractice();enhanceComponents();}
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(enhance);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',schedule,{once:true});
  schedule();

  function cacheBadge(){
    let badge=document.querySelector('.photo-cache-status');
    if(!badge){badge=document.createElement('div');badge.className='photo-cache-status';badge.hidden=true;document.body.append(badge);}return badge;
  }
  async function startOfflineCache(){
    if(!('serviceWorker' in navigator)) return;
    try{
      const registration=await navigator.serviceWorker.ready;
      const worker=registration.active||registration.waiting||registration.installing;
      if(!worker) return;
      const badge=cacheBadge();
      const channel=new MessageChannel();
      channel.port1.onmessage=event=>{
        const msg=event.data||{};
        if(msg.type==='REAL_IMAGE_PROGRESS'){
          badge.hidden=false;badge.textContent='Echte Fotos offline speichern: '+msg.done+' / '+msg.total;
        }
        if(msg.type==='REAL_IMAGE_DONE'){
          badge.textContent='Alle echten Lernfotos sind offline gespeichert ✓';
          setTimeout(()=>{badge.hidden=true;},3500);
          const status=document.querySelector('#offlineStatus');if(status)status.textContent='App und echte Lernfotos sind auf diesem Gerät offline verfügbar.';
        }
      };
      worker.postMessage({type:'CACHE_REAL_IMAGES',files:DATA.allFiles},[channel.port2]);
    }catch(error){console.warn('Foto-Offlinecache:',error);}
  }
  window.addEventListener('load',()=>setTimeout(startOfflineCache,1600),{once:true});
})();
`;

let indexHtml = sourceHtml
  .replace(/Version 6\.0/g, 'Version 7.0')
  .replace('</head>', '<link rel="stylesheet" href="real-images.css?v=7.0.0">\n</head>')
  .replace('</body>', '<script src="real-images.js?v=7.0.0"></script>\n</body>');
fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml);
fs.writeFileSync(path.join(OUT, 'real-images.css'), css.trim() + '\n');
fs.writeFileSync(path.join(OUT, 'real-images.js'), runtime.trim() + '\n');

const iconSource = fs.existsSync(path.join(ROOT, 'v6', 'icon.svg')) ? path.join(ROOT, 'v6', 'icon.svg') : path.join(ROOT, 'icon.svg');
fs.copyFileSync(iconSource, path.join(OUT, 'icon.svg'));
const manifest = {
  name: 'PetriCoach NRW – Angelscheintrainer mit echten Lernfotos',
  short_name: 'PetriCoach',
  description: 'Bebilderter Intensivtrainer für die Fischerprüfung in Nordrhein-Westfalen.',
  lang: 'de-DE', start_url: './', scope: './', display: 'standalone', orientation: 'portrait-primary',
  background_color: '#06191e', theme_color: '#073b46',
  icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
};
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const sw = `
const CORE='petricoach-v7-core-1';
const PHOTOS='petricoach-v7-real-1';
const CORE_FILES=['./','./index.html','./real-images.css','./real-images.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CORE).then(cache=>cache.addAll(CORE_FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('petricoach-v7-')&&![CORE,PHOTOS].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname.includes('/v7/real/')){
    event.respondWith(caches.open(PHOTOS).then(async cache=>(await cache.match(event.request))||fetch(event.request).then(response=>{if(response.ok)cache.put(event.request,response.clone());return response;})));
    return;
  }
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CORE).then(cache=>cache.put('./index.html',copy));return response;}).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok)caches.open(CORE).then(cache=>cache.put(event.request,response.clone()));return response;})));
});
self.addEventListener('message',event=>{
  const msg=event.data||{};if(msg.type!=='CACHE_REAL_IMAGES'||!Array.isArray(msg.files))return;
  const port=event.ports&&event.ports[0];
  event.waitUntil((async()=>{
    const cache=await caches.open(PHOTOS);let done=0;const total=msg.files.length;
    for(const file of msg.files){
      const request=new Request(new URL(file,self.registration.scope).href,{cache:'reload'});
      if(!(await cache.match(request))){try{const response=await fetch(request);if(response.ok)await cache.put(request,response);}catch(error){console.warn('Foto nicht gecacht',file,error);}}
      done++;if(port&&(done===total||done%4===0))port.postMessage({type:'REAL_IMAGE_PROGRESS',done,total});
    }
    if(port)port.postMessage({type:'REAL_IMAGE_DONE',done,total});
  })());
});
`;
fs.writeFileSync(path.join(OUT, 'sw.js'), sw.trim() + '\n');

const report = {
  status: 'built', version: data.version,
  questions: QUESTIONS.length, species: SPECIES.length, practice: PRACTICE.length, components: COMPONENTS.length,
  visualTopics: Object.keys(byKind.visual).length,
  logicalPhotoAssignments: resolved.length,
  uniquePhotoFiles: allFiles.length,
  totalPhotoBytes: allFiles.reduce((sum, file) => sum + fs.statSync(path.join(OUT, file)).size, 0),
  fallbackAssignments: resolved.filter(entry => entry.photo.fallback).map(entry => ({ kind: entry.task.kind, key: entry.task.key, query: entry.photo.query, title: entry.photo.title })),
  sources: resolved.map(entry => ({ kind: entry.task.kind, key: entry.task.key, label: entry.task.label, ...entry.photo }))
};
fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify(report, null, 2));

if (QUESTIONS.length !== 180 || SPECIES.length !== 49 || PRACTICE.length !== 10 || COMPONENTS.length !== 12) throw new Error('Lerndaten unvollständig');
if (Object.keys(questionMap).length !== QUESTIONS.length) throw new Error('Nicht jede Frage hat eine Fotozuordnung');
if (Object.keys(speciesMap).length !== SPECIES.length) throw new Error('Nicht jede Art hat eine Fotozuordnung');
if (allFiles.length < 80) throw new Error(`Zu wenige unterschiedliche Fotos: ${allFiles.length}`);
if (/DecompressionStream|Failed to Decode Data/.test(indexHtml)) throw new Error('Alte Dekomprimierung oder Fehlermeldung in V7 gefunden');
console.log(JSON.stringify({ ...report, sources: undefined }, null, 2));
