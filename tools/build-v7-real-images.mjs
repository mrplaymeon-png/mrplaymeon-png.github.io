import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'v6', 'index.html');
const OUT = path.join(ROOT, 'v7');
const REAL_DIR = path.join(OUT, 'real');
const USER_AGENT = 'PetriCoachNRW/7.1 (https://github.com/mrplaymeon-png/mrplaymeon-png.github.io; educational app; contact: repository owner)';
const sourceHtml = fs.readFileSync(SOURCE, 'utf8');

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
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

async function fetchRetry(url, options = {}, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(options.headers || {}) }
      });
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) throw lastError;
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      await sleep(Math.max(retryAfter * 1000, 900 * attempt));
    } catch (error) {
      lastError = error;
      await sleep(900 * attempt);
    }
  }
  throw new Error(`${lastError?.message || 'Abruf fehlgeschlagen'} – ${url}`);
}

function addGroup(target, title, keys) {
  for (const key of keys) target[key] = title;
}

const VISUAL_TITLE = {};
addGroup(VISUAL_TITLE, 'Fish anatomy', ['body-shapes','fins','fish-family','mouth-positions','mucus','organs','heart']);
addGroup(VISUAL_TITLE, 'Fish gill', ['gills']);
addGroup(VISUAL_TITLE, 'Lateral line', ['lateral-line']);
addGroup(VISUAL_TITLE, 'Swim bladder', ['swim-bladder']);
addGroup(VISUAL_TITLE, 'Fish scale', ['scale-age']);
addGroup(VISUAL_TITLE, 'Fish vision', ['fish-vision']);
addGroup(VISUAL_TITLE, 'Otolith', ['hearing']);
addGroup(VISUAL_TITLE, 'Osmoregulation', ['osmoregulation']);
addGroup(VISUAL_TITLE, 'Ectotherm', ['ectotherm']);
addGroup(VISUAL_TITLE, 'Fish development', ['growth','yolk-sac']);
addGroup(VISUAL_TITLE, 'Fish hatchery', ['egg-temperature','trout-eggs']);
addGroup(VISUAL_TITLE, 'Roe', ['spawn-eggs','spawn-calendar']);
addGroup(VISUAL_TITLE, 'Brown trout', ['winter-spawn','gravel-spawn']);
addGroup(VISUAL_TITLE, 'European perch', ['egg-ribbon','perch-spines']);
addGroup(VISUAL_TITLE, 'European bitterling', ['bitterling-mussel']);
addGroup(VISUAL_TITLE, 'Three-spined stickleback', ['stickleback']);
addGroup(VISUAL_TITLE, 'Common carp', ['cyprinid','pharyngeal-teeth','plant-spawn']);
addGroup(VISUAL_TITLE, 'Barbel (anatomy)', ['barbels']);
addGroup(VISUAL_TITLE, 'Dropsy (fish disease)', ['disease']);
addGroup(VISUAL_TITLE, 'Argulus foliaceus', ['carp-louse']);
addGroup(VISUAL_TITLE, 'Fish disease and parasites', ['parasite']);
addGroup(VISUAL_TITLE, 'European eel', ['eel']);
addGroup(VISUAL_TITLE, 'Wels catfish', ['wels']);
addGroup(VISUAL_TITLE, 'Tench', ['tench']);
addGroup(VISUAL_TITLE, 'European brook lamprey', ['lamprey']);
addGroup(VISUAL_TITLE, 'Stone loach', ['loaches']);
addGroup(VISUAL_TITLE, 'Burbot', ['burbot']);
addGroup(VISUAL_TITLE, 'Dissolved oxygen', ['water-oxygen','oxygen-needs','temperature-oxygen']);
addGroup(VISUAL_TITLE, 'Fish kill', ['oxygen-distress','night-oxygen']);
addGroup(VISUAL_TITLE, 'Ice fishing', ['ice-oxygen']);
addGroup(VISUAL_TITLE, 'Fish hook', ['hooks','fly-hook','deep-hook']);
addGroup(VISUAL_TITLE, 'Fishing reel', ['stationary-reel','multiplier-reel','fly-reel','reel-types','drag']);
addGroup(VISUAL_TITLE, 'Fishing rod', ['rod-parts','rod-rings','rod-grips','perch-rod']);
addGroup(VISUAL_TITLE, 'Fishing line', ['line-check','line-strength','line-twist','knot-strength','steel-leader']);
addGroup(VISUAL_TITLE, 'Fishing swivel', ['swivel']);
addGroup(VISUAL_TITLE, 'Fishing lure', ['spinner','spinner-spoon','wobbler']);
addGroup(VISUAL_TITLE, 'Fly fishing', ['fly-wet']);
addGroup(VISUAL_TITLE, 'Jigging', ['pilker']);
addGroup(VISUAL_TITLE, 'Fishing tackle', ['running-lead','packed-gear','gag-tool','humane-tools']);
addGroup(VISUAL_TITLE, 'Catch and release', ['wet-hands','measure-fish','fish-drill','animal-welfare','humane-sequence']);
addGroup(VISUAL_TITLE, 'Fishing license', ['documents','exam-doc','permit','access-right','rules-layer','closed-season']);
addGroup(VISUAL_TITLE, 'Fishing bait', ['live-bait']);
addGroup(VISUAL_TITLE, 'Poaching', ['prohibited-methods']);
addGroup(VISUAL_TITLE, 'Electrofishing', ['electric-fishing']);
addGroup(VISUAL_TITLE, 'Fish stocking', ['stocking']);
addGroup(VISUAL_TITLE, 'Fishery management', ['hege','fisheries-coop','fisheries-fund','overstocking']);
addGroup(VISUAL_TITLE, 'Game warden', ['officer']);
addGroup(VISUAL_TITLE, 'North Rhine-Westphalia', ['map-nrw','authority-levels']);
addGroup(VISUAL_TITLE, 'Floodplain', ['flooded-land']);
addGroup(VISUAL_TITLE, 'Pond', ['drain-water','small-waters']);
addGroup(VISUAL_TITLE, 'Reservoir', ['reservoir-level']);
addGroup(VISUAL_TITLE, 'Gravel pit', ['gravel-pit']);
addGroup(VISUAL_TITLE, 'Stream', ['stream-bed','river-zones']);
addGroup(VISUAL_TITLE, 'Lake stratification', ['lake-layers']);
addGroup(VISUAL_TITLE, 'Underwater', ['light-depth']);
addGroup(VISUAL_TITLE, 'Littoral zone', ['shallow-zone']);
addGroup(VISUAL_TITLE, 'Aquatic plant', ['aquatic-plants','plant-zones']);
addGroup(VISUAL_TITLE, 'Reed bed', ['reed-zone']);
addGroup(VISUAL_TITLE, 'Nymphaea alba', ['water-lily']);
addGroup(VISUAL_TITLE, 'Algal bloom', ['algae-bloom']);
addGroup(VISUAL_TITLE, 'Eutrophication', ['eutrophic','nutrients']);
addGroup(VISUAL_TITLE, 'Water pollution', ['pollution']);
addGroup(VISUAL_TITLE, 'Photosynthesis', ['photosynthesis']);
addGroup(VISUAL_TITLE, 'Food chain', ['food-chain']);
addGroup(VISUAL_TITLE, 'Common kingfisher', ['kingfisher']);
addGroup(VISUAL_TITLE, 'Waterfowl', ['birds']);
addGroup(VISUAL_TITLE, 'Common frog', ['amphibian']);
addGroup(VISUAL_TITLE, 'Grass snake', ['reptile']);
addGroup(VISUAL_TITLE, 'Dragonfly', ['protected-insect']);
addGroup(VISUAL_TITLE, 'IUCN Red List', ['red-list']);
addGroup(VISUAL_TITLE, 'Crayfish', ['mauser']);
addGroup(VISUAL_TITLE, 'Lift net', ['lift-net']);
addGroup(VISUAL_TITLE, 'Wildlife', ['escape-distance']);
addGroup(VISUAL_TITLE, 'Zander', ['zander-spawn']);

const SPECIES_TITLE = {
  'Bachforelle':'Brown trout','Meerforelle':'Sea trout','Lachs':'Atlantic salmon','Regenbogenforelle':'Rainbow trout','Bachsaibling':'Brook trout','Äsche':'European grayling','Hecht':'Northern pike','Aal':'European eel','Zährte':'Vimba vimba','Rotauge':'Common roach','Moderlieschen':'Belica','Hasel':'Common dace','Döbel':'European chub','Aland':'Ide (fish)','Schneider':'Alburnoides bipunctatus','Elritze':'Common minnow','Rotfeder':'Common rudd','Schleie':'Tench','Nase':'Common nase','Gründling':'Gudgeon (fish)','Barbe':'Common barbel','Ukelei':'Bleak (fish)','Güster':'White bream','Brasse':'Common bream','Maifisch':'Allis shad','Bitterling':'European bitterling','Karausche':'Crucian carp','Giebel':'Prussian carp','Wildkarpfen':'Common carp','Schmerle':'Stone loach','Schlammpeitzger':'Weatherfish','Steinbeißer':'Spined loach','Wels':'Wels catfish','Kessler-Grundel':'Bighead goby','Quappe':'Burbot','Flussbarsch':'European perch','Zander':'Zander','Kaulbarsch':'Ruffe','Groppe (Mühlkoppe)':'European bullhead','Dreistachliger Stichling':'Three-spined stickleback','Zwergstichling':'Ninespine stickleback','Bach-/Flussneunauge':'European brook lamprey','Rapfen':'Asp (fish)','Makrele':'Atlantic mackerel','Flunder':'European flounder','Kabeljau (Dorsch)':'Atlantic cod','Nordseeschnäpel':'Houting','Edelkrebs':'Astacus astacus','Amerikanischer Krebs':'Spinycheek crayfish'
};

const PRACTICE_TITLE = {
  A1:'Float fishing', A2:'Feeder fishing', A3:'Carp fishing', A4:'European eel', A5:'Northern pike', A6:'Spin fishing', A7:'Fly fishing', A8:'Fly fishing', A9:'Jigging', A10:'Surf fishing'
};

const COMPONENT_TITLE = {
  rod:'Fishing rod', reel:'Fishing reel', line:'Fishing line', indicator:'Fishing float', weight:'Fishing sinker', leader:'Fishing tackle', swivel:'Fishing swivel', hook:'Fish hook', lure:'Fishing lure', net:'Landing net', measure:'Catch and release', humane:'Fishing tackle'
};

const allVisualKeys = [...new Set(QUESTIONS.map(q => q.visual).filter(Boolean))].sort();
const missingVisualKeys = allVisualKeys.filter(key => !VISUAL_TITLE[key]);
if (missingVisualKeys.length) throw new Error(`Fehlende Foto-Themen: ${missingVisualKeys.join(', ')}`);

function visualFallback(key) {
  if (['hooks','fly-hook','deep-hook','stationary-reel','multiplier-reel','fly-reel','reel-types','drag','rod-parts','rod-rings','rod-grips','perch-rod','line-check','line-strength','line-twist','knot-strength','steel-leader','swivel','spinner','spinner-spoon','wobbler','fly-wet','pilker','running-lead','packed-gear','gag-tool','humane-tools'].includes(key)) return ['Fishing tackle','Fishing'];
  if (['documents','exam-doc','permit','access-right','rules-layer','closed-season','live-bait','prohibited-methods','officer','map-nrw','authority-levels','fisheries-coop','fisheries-fund'].includes(key)) return ['Fishing','Fishery'];
  if (['algae-bloom','eutrophic','nutrients','pollution','photosynthesis','food-chain','water-oxygen','oxygen-needs','temperature-oxygen','oxygen-distress','night-oxygen','ice-oxygen','flooded-land','drain-water','reservoir-level','gravel-pit','stream-bed','river-zones','lake-layers','light-depth','shallow-zone','aquatic-plants','plant-zones','reed-zone','water-lily','small-waters'].includes(key)) return ['Freshwater ecosystem','Lake'];
  if (['kingfisher','birds','amphibian','reptile','protected-insect','red-list','escape-distance'].includes(key)) return ['Wildlife','Nature'];
  return ['Fish','Freshwater fish'];
}

const tasks = [];
for (const key of allVisualKeys) tasks.push({ kind:'visual', key, label:key, titles:[VISUAL_TITLE[key], ...visualFallback(key)] });
for (const item of SPECIES) {
  const [name, latin] = item;
  tasks.push({ kind:'species', key:name, label:name, titles:[SPECIES_TITLE[name], latin, 'Freshwater fish', 'Fish'].filter(Boolean) });
}
for (const item of PRACTICE) tasks.push({ kind:'practice', key:item.id, label:item.name, titles:[PRACTICE_TITLE[item.id], 'Fishing rod', 'Fishing'].filter(Boolean) });
for (const item of COMPONENTS) tasks.push({ kind:'component', key:item[0], label:item[0], titles:[COMPONENT_TITLE[item[1]], 'Fishing tackle', 'Fishing'].filter(Boolean) });

const badImageName = /(?:^|[_\s-])(map|diagram|logo|icon|coat[_\s-]?of[_\s-]?arms|flag|drawing|illustration|painting|engraving|woodcut|poster|stamp|screenshot|scan|chart|graph|seal|symbol|pictogram|collage|scheme)(?:[_\s.-]|$)/i;
const titleKey = value => String(value || '').replace(/_/g, ' ').trim().toLocaleLowerCase('en-US');

async function fetchWikipediaImages(titles) {
  const result = new Map();
  for (const group of chunk([...new Set(titles.filter(Boolean))], 25)) {
    const params = new URLSearchParams({
      action:'query', titles:group.join('|'), redirects:'1', prop:'pageimages|info', inprop:'url', piprop:'thumbnail|name|original', pithumbsize:'720', pilimit:'max', format:'json', formatversion:'2', origin:'*'
    });
    const response = await fetchRetry(`https://en.wikipedia.org/w/api.php?${params}`, { headers:{ Accept:'application/json' } });
    const data = await response.json();
    const aliases = new Map();
    for (const entry of data?.query?.normalized || []) aliases.set(titleKey(entry.from), titleKey(entry.to));
    for (const entry of data?.query?.redirects || []) aliases.set(titleKey(entry.from), titleKey(entry.to));
    const pages = new Map((data?.query?.pages || []).map(page => [titleKey(page.title), page]));
    const resolve = input => {
      let current = titleKey(input), guard = 0;
      while (aliases.has(current) && guard++ < 10) current = aliases.get(current);
      return current;
    };
    for (const input of group) {
      const page = pages.get(resolve(input)) || pages.get(titleKey(input));
      if (!page || page.missing || !page.thumbnail?.source || !page.pageimage) continue;
      if (String(page.pageimage).toLowerCase().endsWith('.svg') || badImageName.test(page.pageimage)) continue;
      result.set(titleKey(input), {
        requestedTitle: input,
        resolvedTitle: page.title,
        wikiPage: page.canonicalurl || page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`,
        imageName: page.pageimage,
        thumbnail: page.thumbnail.source,
        original: page.original?.source || page.thumbnail.source
      });
    }
    await sleep(350);
  }
  return result;
}

const allCandidateTitles = tasks.flatMap(task => task.titles);
console.log(`Lade Seitenbilder für ${new Set(allCandidateTitles).size} kuratierte Wikipedia-Themen in wenigen Sammelabfragen …`);
const wikiImages = await fetchWikipediaImages(allCandidateTitles);

function chooseWikiImage(task) {
  for (let i = 0; i < task.titles.length; i++) {
    const candidate = wikiImages.get(titleKey(task.titles[i]));
    if (candidate) return { ...candidate, fallback:i > 0, selectedTitle:task.titles[i] };
  }
  throw new Error(`${task.kind}/${task.key}: keines der kuratierten Themen besitzt ein geeignetes Seitenfoto (${task.titles.join(' | ')})`);
}

const chosen = tasks.map(task => ({ task, wiki:chooseWikiImage(task) }));

async function fetchCommonsMetadata(names) {
  const result = new Map();
  for (const group of chunk([...new Set(names)], 25)) {
    const params = new URLSearchParams({
      action:'query', titles:group.map(name => `File:${name}`).join('|'), redirects:'1', prop:'imageinfo', iiprop:'url|mime|size|extmetadata', iiurlwidth:'720', format:'json', formatversion:'2', origin:'*'
    });
    const response = await fetchRetry(`https://commons.wikimedia.org/w/api.php?${params}`, { headers:{ Accept:'application/json' } });
    const data = await response.json();
    for (const page of data?.query?.pages || []) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      const key = titleKey(String(page.title || '').replace(/^File:/i,''));
      result.set(key, { page, info });
    }
    await sleep(450);
  }
  return result;
}

console.log(`Lade Lizenz- und Quelldaten für ${new Set(chosen.map(entry => entry.wiki.imageName)).size} Bilder in Sammelabfragen …`);
const commons = await fetchCommonsMetadata(chosen.map(entry => entry.wiki.imageName));

const selectedByUrl = new Map();
for (const entry of chosen) {
  const metadata = commons.get(titleKey(entry.wiki.imageName));
  const info = metadata?.info;
  const ext = info?.extmetadata || {};
  const filePage = info?.descriptionurl || entry.wiki.wikiPage;
  const imageUrl = info?.thumburl || entry.wiki.thumbnail;
  const image = {
    downloadUrl:imageUrl,
    source:filePage,
    title:String(metadata?.page?.title || entry.wiki.imageName).replace(/^File:/i,''),
    author:short(ext.Artist?.value || ext.Credit?.value || 'Urheber siehe Quelldatei'),
    license:short(ext.LicenseShortName?.value || ext.UsageTerms?.value || 'Lizenz siehe Quelldatei', 90),
    licenseUrl:ext.LicenseUrl?.value || filePage,
    description:short(ext.ImageDescription?.value || ext.ObjectName?.value || entry.wiki.resolvedTitle, 180),
    wikiPage:entry.wiki.wikiPage,
    fallback:entry.wiki.fallback,
    selectedTitle:entry.wiki.selectedTitle
  };
  entry.image = image;
  selectedByUrl.set(image.downloadUrl, image);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const uniqueImages = [...selectedByUrl.values()];
console.log(`Lade ${uniqueImages.length} unterschiedliche echte Fotos gedrosselt herunter …`);
await mapLimit(uniqueImages, 2, async (image, index) => {
  const response = await fetchRetry(image.downloadUrl, { headers:{ Accept:'image/avif,image/webp,image/png,image/jpeg,*/*' } });
  const type = (response.headers.get('content-type') || '').split(';')[0];
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2500) throw new Error(`Bilddatei zu klein: ${image.title}`);
  const fileName = `${sha(image.downloadUrl).slice(0,18)}.${ext}`;
  image.file = `real/${fileName}`;
  image.bytes = bytes.length;
  fs.writeFileSync(path.join(OUT, image.file), bytes);
  console.log(`${index + 1}/${uniqueImages.length} ${image.title} (${Math.round(bytes.length / 1024)} KB)`);
  await sleep(260);
});

const byKind = { visual:{}, species:{}, practice:{}, component:{} };
for (const entry of chosen) {
  const photo = {
    file:entry.image.file, source:entry.image.source, title:entry.image.title, author:entry.image.author, license:entry.image.license,
    licenseUrl:entry.image.licenseUrl, description:entry.image.description, bytes:entry.image.bytes,
    selectedTitle:entry.image.selectedTitle, fallback:entry.image.fallback
  };
  byKind[entry.task.kind][normalize(entry.task.key)] = photo;
}

const questionMap = {};
for (const question of QUESTIONS) questionMap[normalize(question.question)] = byKind.visual[normalize(question.visual)];
const speciesMap = {};
for (const item of SPECIES) speciesMap[normalize(item[0])] = byKind.species[normalize(item[0])];
const practiceMap = {};
for (const item of PRACTICE) {
  const photo = byKind.practice[normalize(item.id)];
  practiceMap[normalize(item.id)] = photo;
  practiceMap[normalize(item.name)] = photo;
}
const componentMap = {};
for (const item of COMPONENTS) componentMap[normalize(item[0])] = byKind.component[normalize(item[0])];
const allFiles = [...new Set(uniqueImages.map(image => image.file))];
const data = { version:'7.1.0', questions:questionMap, species:speciesMap, practice:practiceMap, components:componentMap, allFiles };

const css = `
.real-photo-card{margin:12px 0 14px;background:#071c21;border:1px solid #2a5963;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,.18)}
.real-photo-card img{display:block;width:100%;height:auto;max-height:360px;object-fit:cover;background:#09252c}
.real-photo-card.compact img{height:150px;object-fit:cover}
.real-photo-caption{display:flex;gap:8px;justify-content:space-between;align-items:flex-start;padding:9px 11px;color:#9cb9bf;font-size:.68rem;line-height:1.35}
.real-photo-caption strong{display:block;color:#d8f7f9;font-size:.72rem;margin-bottom:2px}
.real-photo-caption a{color:#74dce5;text-decoration:none;white-space:nowrap}
.real-photo-badge{display:inline-flex;align-items:center;gap:5px;background:#12414a;color:#aef4f7;border-radius:999px;padding:5px 9px;font-size:.67rem;font-weight:800;margin-bottom:8px}
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
  function findByContainedText(map,text){const n=norm(text);if(map[n])return map[n];const key=Object.keys(map).sort((a,b)=>b.length-a.length).find(k=>n.includes(k)||k.includes(n));return key?map[key]:null;}
  function figure(meta,label,compact=false){
    if(!meta)return null;
    const fig=document.createElement('figure');fig.className='real-photo-card'+(compact?' compact':'');fig.dataset.realPhoto='1';
    const badge=document.createElement('div');badge.className='real-photo-badge';badge.textContent='📷 Echtes Lernfoto';
    const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt='Echtes Foto: '+String(label||'Lernbeispiel');img.src=new URL(meta.file,BASE).href;img.addEventListener('error',()=>fig.remove(),{once:true});
    const cap=document.createElement('figcaption');cap.className='real-photo-caption';
    const info=document.createElement('span'),strong=document.createElement('strong'),credit=document.createElement('span');strong.textContent=label;credit.textContent=(meta.author||'Urheber siehe Quelle')+' · '+(meta.license||'Lizenz siehe Quelle');info.append(strong,credit);
    const link=document.createElement('a');link.href=meta.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Quelle & Lizenz';cap.append(info,link);fig.append(badge,img,cap);return fig;
  }
  function enhanceQuestion(){const box=document.querySelector('.learning-visual');if(!box||box.querySelector(':scope > .real-photo-card'))return;const text=document.querySelector('#questionText')?.textContent||'';const photo=figure(DATA.questions[norm(text)],'Echtes Beispiel zur richtigen Lösung');if(photo){const h=box.querySelector('h3');h?h.after(photo):box.prepend(photo);}}
  function enhanceSpecies(){document.querySelectorAll('.species-card:not([data-photo-enhanced])').forEach(card=>{const title=card.querySelector('b')?.textContent||card.textContent;const photo=figure(findByContainedText(DATA.species,title),String(title).trim(),true);if(photo){card.prepend(photo);card.dataset.photoEnhanced='1';}});}
  function enhancePractice(){document.querySelectorAll('.practice-card:not([data-photo-enhanced])').forEach(card=>{const title=card.querySelector('h3,b,strong')?.textContent||card.textContent;const photo=figure(findByContainedText(DATA.practice,title),String(title).trim(),true);if(photo){const diagram=card.querySelector('.practice-diagram');diagram?diagram.prepend(photo):card.insertBefore(photo,card.children[1]||null);card.dataset.photoEnhanced='1';}});}
  function enhanceComponents(){document.querySelectorAll('.component-card:not([data-photo-enhanced])').forEach(card=>{const title=card.querySelector('h3,b,strong')?.textContent||card.textContent;const photo=figure(findByContainedText(DATA.components,title),String(title).trim(),true);if(photo){card.prepend(photo);card.dataset.photoEnhanced='1';}});}
  function enhanceHome(){const pill=document.querySelector('#homeView .pill');if(pill&&!pill.dataset.realUpdated){pill.textContent='Offline · Version 7.1 · 180 Fragen · echte Fotos';pill.dataset.realUpdated='1';}const note=document.querySelector('#homeView .source-note');if(note&&!note.dataset.realUpdated){note.insertAdjacentText('beforeend',' Echte Fotos stammen aus Wikimedia Commons beziehungsweise Wikipedia; Urheber und Lizenz sind direkt am jeweiligen Foto verlinkt.');note.dataset.realUpdated='1';}}
  let pending=false;function enhance(){pending=false;enhanceHome();enhanceQuestion();enhanceSpecies();enhancePractice();enhanceComponents();}function schedule(){if(pending)return;pending=true;requestAnimationFrame(enhance);}new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('DOMContentLoaded',schedule,{once:true});schedule();
  function cacheBadge(){let badge=document.querySelector('.photo-cache-status');if(!badge){badge=document.createElement('div');badge.className='photo-cache-status';badge.hidden=true;document.body.append(badge);}return badge;}
  async function startOfflineCache(){if(!('serviceWorker' in navigator))return;try{const registration=await navigator.serviceWorker.ready;const worker=registration.active||registration.waiting||registration.installing;if(!worker)return;const badge=cacheBadge();const channel=new MessageChannel();channel.port1.onmessage=event=>{const msg=event.data||{};if(msg.type==='REAL_IMAGE_PROGRESS'){badge.hidden=false;badge.textContent='Echte Fotos offline speichern: '+msg.done+' / '+msg.total;}if(msg.type==='REAL_IMAGE_DONE'){badge.textContent='Alle echten Lernfotos sind offline gespeichert ✓';setTimeout(()=>{badge.hidden=true;},3500);const status=document.querySelector('#offlineStatus');if(status)status.textContent='App und echte Lernfotos sind auf diesem Gerät offline verfügbar.';}};worker.postMessage({type:'CACHE_REAL_IMAGES',files:DATA.allFiles},[channel.port2]);}catch(error){console.warn('Foto-Offlinecache:',error);}}
  window.addEventListener('load',()=>setTimeout(startOfflineCache,1600),{once:true});
})();
`;

let indexHtml = sourceHtml
  .replace(/Version 6\.0/g, 'Version 7.1')
  .replace('</head>', '<link rel="stylesheet" href="real-images.css?v=7.1.0">\n</head>')
  .replace('</body>', '<script src="real-images.js?v=7.1.0"></script>\n</body>');
fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml);
fs.writeFileSync(path.join(OUT, 'real-images.css'), css.trim() + '\n');
fs.writeFileSync(path.join(OUT, 'real-images.js'), runtime.trim() + '\n');

const iconSource = fs.existsSync(path.join(ROOT, 'v6', 'icon.svg')) ? path.join(ROOT, 'v6', 'icon.svg') : path.join(ROOT, 'icon.svg');
fs.copyFileSync(iconSource, path.join(OUT, 'icon.svg'));
const manifest = {name:'PetriCoach NRW – Angelscheintrainer mit echten Lernfotos',short_name:'PetriCoach',description:'Bebilderter Intensivtrainer für die Fischerprüfung in Nordrhein-Westfalen.',lang:'de-DE',start_url:'./',scope:'./',display:'standalone',orientation:'portrait-primary',background_color:'#06191e',theme_color:'#073b46',icons:[{src:'icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]};
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const sw = `
const CORE='petricoach-v7-core-2';
const PHOTOS='petricoach-v7-real-2';
const CORE_FILES=['./','./index.html','./real-images.css','./real-images.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CORE).then(cache=>cache.addAll(CORE_FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('petricoach-v7-')&&![CORE,PHOTOS].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==location.origin)return;if(url.pathname.includes('/v7/real/')){event.respondWith(caches.open(PHOTOS).then(async cache=>(await cache.match(event.request))||fetch(event.request).then(response=>{if(response.ok)cache.put(event.request,response.clone());return response;})));return;}if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CORE).then(cache=>cache.put('./index.html',copy));return response;}).catch(()=>caches.match('./index.html')));return;}event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok)caches.open(CORE).then(cache=>cache.put(event.request,response.clone()));return response;})));});
self.addEventListener('message',event=>{const msg=event.data||{};if(msg.type!=='CACHE_REAL_IMAGES'||!Array.isArray(msg.files))return;const port=event.ports&&event.ports[0];event.waitUntil((async()=>{const cache=await caches.open(PHOTOS);let done=0;const total=msg.files.length;for(const file of msg.files){const request=new Request(new URL(file,self.registration.scope).href,{cache:'reload'});if(!(await cache.match(request))){try{const response=await fetch(request);if(response.ok)await cache.put(request,response);}catch(error){console.warn('Foto nicht gecacht',file,error);}}done++;if(port&&(done===total||done%4===0))port.postMessage({type:'REAL_IMAGE_PROGRESS',done,total});}if(port)port.postMessage({type:'REAL_IMAGE_DONE',done,total});})());});
`;
fs.writeFileSync(path.join(OUT, 'sw.js'), sw.trim() + '\n');

const report = {
  status:'built', version:data.version, questions:QUESTIONS.length, species:SPECIES.length, practice:PRACTICE.length, components:COMPONENTS.length,
  visualTopics:Object.keys(byKind.visual).length, logicalPhotoAssignments:chosen.length, uniquePhotoFiles:allFiles.length,
  totalPhotoBytes:allFiles.reduce((sum,file)=>sum+fs.statSync(path.join(OUT,file)).size,0),
  fallbackAssignments:chosen.filter(entry=>entry.image.fallback).map(entry=>({kind:entry.task.kind,key:entry.task.key,selectedTitle:entry.image.selectedTitle,title:entry.image.title})),
  sources:chosen.map(entry=>({kind:entry.task.kind,key:entry.task.key,label:entry.task.label,...byKind[entry.task.kind][normalize(entry.task.key)]}))
};
fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify(report, null, 2));

if (QUESTIONS.length !== 180 || SPECIES.length !== 49 || PRACTICE.length !== 10 || COMPONENTS.length !== 12) throw new Error('Lerndaten unvollständig');
if (Object.keys(questionMap).length !== QUESTIONS.length) throw new Error('Nicht jede Frage hat eine Fotozuordnung');
if (Object.keys(speciesMap).length !== SPECIES.length) throw new Error('Nicht jede Art hat eine Fotozuordnung');
if (allFiles.length < 65) throw new Error(`Zu wenige unterschiedliche Fotos: ${allFiles.length}`);
if (/DecompressionStream|Failed to Decode Data/.test(indexHtml)) throw new Error('Alte Dekomprimierung oder Fehlermeldung in V7 gefunden');
console.log(JSON.stringify({status:report.status,version:report.version,questions:report.questions,species:report.species,practice:report.practice,components:report.components,assignments:report.logicalPhotoAssignments,uniquePhotos:report.uniquePhotoFiles,photoMB:(report.totalPhotoBytes/1024/1024).toFixed(1),fallbacks:report.fallbackAssignments.length},null,2));
