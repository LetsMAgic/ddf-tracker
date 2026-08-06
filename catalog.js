import { appState, asArray, availableEpisode, CATALOG_KEY, dbDelete, dbGet, dbSet, LEGACY_CATALOG_KEYS, normalizeText, unique } from './core.js';

const META_URL = 'https://dreimetadaten.de/data/Serie.json';
const META_MAX_AGE = 1000 * 60 * 60 * 24 * 30;
const TAG_RULES = [
  ['Grusel',['geist','gespenst','spuk','grusel','schreck','dämon','vampir','werwolf','fluch','toten','monster','moor','nebel']],
  ['Mystery',['rätsel','geheimnis','mysteri','phantom','unsichtbar','vision','botschaft','zeichen','legende']],
  ['Schatz',['schatz','erbe','gold','silber','rubin','diamant','perle','kelch','jade','kristall']],
  ['Kunst',['kunst','gemälde','bilder','maler','museum','skulptur','madonna','filmstar','comic']],
  ['Musik',['musik','song','melodie','sinfonie','lied','flöte','geige','sänger','band']],
  ['Technik',['computer','internet','email','gps','ufo','virus','handy','technik','roboter']],
  ['Sport',['fußball','spieler','doping','foul','skateboard','ritt','poker','sport']],
  ['Meer & Insel',['insel','meer','see','riff','hai','yacht','schiff','segler','tauchen','grotte','bucht','flut']],
  ['Ausland',['mexiko','afrika','asien','japan','indien','frankreich','london','ägypten','karpaten']],
  ['Natur',['wald','berg','canyon','schlucht','höhle','ranch','sturm','eis','feuer','tier','tiger','löwe','vogel','schlange']],
  ['Zirkus & Bühne',['zirkus','gaukler','zauberer','bauchredner','puppe','bühne','diva','schauspiel']],
  ['Verbrechen',['mord','entführung','schmuggel','mafia','gangster','diebstahl','räuber','erpress','betrug','verdacht']],
  ['Familie',['tante mathilda','onkel titus','ben peck','mr shaw','mr andrews','familie','opa','großvater']],
  ['Weihnachten',['weihnacht','advent','bescherung','glocken']], ['Humor',['humor','komisch','verrückt','schrullig']],
];
const ALIASES = new Map([
  ['peters opa','ben peck'],['opa von peter','ben peck'],['meisterdieb','victor hugenay'],['boeser franzose','victor hugenay'],
  ['skinny','skinny norris'],['erzfeind','skinny norris'],['kirschkuchen','tante mathilda'],['chauffeur','morton'],
  ['peters freundin','kelly madigan'],['bobs freundin','jelena charkova'],['weihnachtsfolge','weihnachten advent'],
  ['halloween','grusel spuk geist'],['fussballfolge','fussball sport'],['meerfolge','meer insel schiff'],['musikfolge','musik melodie lied'],
]);

const number = (value) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const text = (value) => value == null ? '' : String(value).trim();
const link = (value) => {
  const url = text(value);
  return url ? url.replace(/^http:\/\//i,'https://') : '';
};
function deriveTags(raw) {
  const haystack = normalizeText([raw.titel,raw.beschreibung,asArray(raw.tags).join(' '),asArray(raw.characters).join(' '),asArray(raw.featuredCharacters).join(' ')].join(' '));
  const tags = unique(asArray(raw.tags).map((tag) => String(tag).replace(/(^|\s)\S/g,(char) => char.toUpperCase())));
  for (const [label,keywords] of TAG_RULES) if (keywords.some((keyword) => haystack.includes(normalizeText(keyword)))) tags.push(label);
  return unique(tags);
}
export function normalizeEpisode(raw = {}) {
  const nr = number(raw.nr ?? raw.number ?? raw.nummer ?? raw.folge ?? raw.episode); if (!Number.isFinite(nr)) return null;
  const releaseDate = text(raw.releaseDate ?? raw.release_date ?? raw['veröffentlichungsdatum'] ?? raw.datum ?? raw.date) || null;
  const links = raw.links || {};
  const officialDdfCover = link(raw.coverDdfUrl ?? raw.cover_dreifragezeichen ?? links.cover_dreifragezeichen);
  const officialAppleCover = link(raw.coverItunesUrl ?? raw.cover_itunes ?? links.cover_itunes);
  const episode = {
    ...raw, nr, titel: text(raw.titel ?? raw.title ?? raw.name) || `Folge ${nr}`,
    beschreibung: text(raw.beschreibung ?? raw.gesamtbeschreibung ?? raw.description ?? raw.summary),
    rockyRanking: number(raw.rockyRanking ?? raw.rockyBeach ?? raw.rating),
    collection: text(raw.collection ?? raw.type) || (nr >= 10000 ? 'special' : 'main'),
    author: text(raw.author ?? raw.autor), scriptAuthor: text(raw.scriptAuthor ?? raw['hörspielskriptautor'] ?? raw.hoerspielskript ?? raw.script),
    era: text(raw.era ?? raw.aera), releaseDate, durationMin: raw.gesamtdauer ? Math.round(Number(raw.gesamtdauer) / 60000) : number(raw.durationMin ?? raw.duration ?? raw.laufzeit),
    spotifyUrl: link(raw.spotifyUrl ?? raw.spotify ?? links.spotify),
    appleMusicUrl: link(raw.appleMusicUrl ?? raw.appleMusic ?? raw.apple ?? links.appleMusic),
    bookbeatUrl: link(raw.bookbeatUrl ?? raw.bookbeat ?? links.bookbeat),
    amazonMusicUrl: link(raw.amazonMusicUrl ?? raw.amazonMusic ?? links.amazonMusic),
    youtubeMusicUrl: link(raw.youtubeMusicUrl ?? raw.youTubeMusic ?? raw.youtubeMusic ?? links.youTubeMusic ?? links.youtubeMusic),
    deezerUrl: link(raw.deezerUrl ?? raw.deezer ?? links.deezer),
    amazonUrl: link(raw.amazonUrl ?? raw.amazon ?? links.amazon),
    coverUrl: link(raw.coverUrl) || officialDdfCover || officialAppleCover,
    coverSource: text(raw.coverSource) || (officialDdfCover ? 'dreifragezeichen.de' : officialAppleCover ? 'Apple Music' : ''),
    coverSourceUrl: link(raw.coverSourceUrl) || (officialDdfCover ? link(links.dreifragezeichen) : officialAppleCover ? link(raw.appleMusicUrl ?? raw.appleMusic ?? raw.apple ?? links.appleMusic) : ''),
    characters: unique(asArray(raw.characters ?? raw.figuren ?? raw.roles ?? raw.sprechrollen).map((item) => typeof item === 'object' ? item.rolle || item.name || '' : item)), chapters: unique(asArray(raw.chapters ?? raw.kapitel).map((item) => typeof item === 'object' ? item.titel || item.title || '' : item)),
    featuredCharacters: unique(asArray(raw.featuredCharacters ?? raw.featured ?? raw.praegendeFiguren)),
    searchKeywords: unique(asArray(raw.searchKeywords ?? raw.keywords)),
  };
  episode.streamingLinks = {
    spotify: episode.spotifyUrl,
    appleMusic: episode.appleMusicUrl,
    bookbeat: episode.bookbeatUrl,
    amazonMusic: episode.amazonMusicUrl,
    youtubeMusic: episode.youtubeMusicUrl,
    deezer: episode.deezerUrl,
    amazon: episode.amazonUrl,
  };
  episode.tags = deriveTags(episode);
  episode.year = releaseDate && !Number.isNaN(new Date(releaseDate).getTime()) ? new Date(releaseDate).getFullYear() : null;
  episode.searchFields = {
    title: normalizeText(`${episode.nr} ${episode.titel}`), featured: normalizeText(episode.featuredCharacters.join(' ')),
    characters: normalizeText(episode.characters.join(' ')), chapters: normalizeText(episode.chapters.join(' ')), tags: normalizeText(episode.tags.join(' ')),
    description: normalizeText(episode.beschreibung), people: normalizeText(`${episode.author} ${episode.scriptAuthor} ${episode.era}`),
    keywords: normalizeText(episode.searchKeywords.join(' ')),
  };
  episode.searchText = normalizeText(Object.values(episode.searchFields).join(' '));
  return episode;
}
function mergeEpisode(base,extra) {
  return normalizeEpisode({
    ...base,
    beschreibung: extra.beschreibung || base.beschreibung,
    author: extra.author || base.author,
    scriptAuthor: extra.scriptAuthor || base.scriptAuthor,
    releaseDate: extra.releaseDate || base.releaseDate,
    durationMin: extra.durationMin || base.durationMin,
    spotifyUrl: extra.spotifyUrl || base.spotifyUrl,
    appleMusicUrl: extra.appleMusicUrl || base.appleMusicUrl,
    bookbeatUrl: extra.bookbeatUrl || base.bookbeatUrl,
    amazonMusicUrl: extra.amazonMusicUrl || base.amazonMusicUrl,
    youtubeMusicUrl: extra.youtubeMusicUrl || base.youtubeMusicUrl,
    deezerUrl: extra.deezerUrl || base.deezerUrl,
    amazonUrl: extra.amazonUrl || base.amazonUrl,
    coverUrl: extra.coverUrl || base.coverUrl,
    coverSource: extra.coverSource || base.coverSource,
    coverSourceUrl: extra.coverSourceUrl || base.coverSourceUrl,
    characters: extra.characters?.length ? extra.characters : base.characters,
    chapters: extra.chapters?.length ? extra.chapters : base.chapters,
    featuredCharacters: base.featuredCharacters?.length ? base.featuredCharacters : extra.featuredCharacters,
    searchKeywords: unique([base.searchKeywords,extra.searchKeywords]),
    titel: base.titel,
    rockyRanking: base.rockyRanking,
    collection: base.collection,
    era: base.era || extra.era,
  });
}
function catalogFrom(raw) {
  const map = new Map(); for (const item of asArray(raw)) { const episode = normalizeEpisode(item); if (episode) map.set(episode.nr,episode); }
  return [...map.values()].sort((a,b) => a.nr - b.nr);
}
function extractMetaArray(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ['episodes','data','Serie','serie','items']) if (Array.isArray(raw?.[key])) return raw[key];
  if (raw && typeof raw === 'object') return Object.values(raw).filter((item) => item && typeof item === 'object');
  return [];
}
async function fetchWithTimeout(url,timeout = 5000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),timeout);
  try { const response = await fetch(url,{signal:controller.signal,cache:'no-store'}); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json(); }
  finally { clearTimeout(timer); }
}
export async function loadCatalog() {
  let seed = asArray(window.DDF_EPISODES_SEED);
  if (!seed.length) { try { seed = await fetch('./episodes.json').then((response) => response.json()); } catch { seed = []; } }
  let catalog = catalogFrom(seed); let cached = await dbGet(CATALOG_KEY);
  if (!cached) { for (const key of LEGACY_CATALOG_KEYS) { cached = await dbGet(key); if (cached) break; } }
  if (cached?.episodes?.length) {
    const extras = new Map(catalogFrom(cached.episodes).map((episode) => [episode.nr,episode]));
    catalog = catalog.map((episode) => extras.has(episode.nr) ? mergeEpisode(episode,extras.get(episode.nr)) : episode);
    appState.metadataUpdatedAt = cached.updatedAt || null;
  }
  appState.catalog = catalog; return catalog;
}
export async function refreshMetadata({ force = false } = {}) {
  const cached = await dbGet(CATALOG_KEY); const age = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
  if (!force && age < META_MAX_AGE) return { updated:false,count:appState.catalog.length };
  const raw = await fetchWithTimeout(META_URL,7000); const metadata = catalogFrom(extractMetaArray(raw));
  if (!metadata.length) throw new Error('Keine Metadaten empfangen.');
  const map = new Map(metadata.map((episode) => [episode.nr,episode]));
  appState.catalog = appState.catalog.map((episode) => map.has(episode.nr) ? mergeEpisode(episode,map.get(episode.nr)) : episode);
  const updatedAt = new Date().toISOString(); await dbSet(CATALOG_KEY,{updatedAt,episodes:appState.catalog}); appState.metadataUpdatedAt = updatedAt;
  return { updated:true,count:appState.catalog.length };
}
export async function clearCatalogCache() { await dbDelete(CATALOG_KEY); for (const key of LEGACY_CATALOG_KEYS) await dbDelete(key); await loadCatalog(); }

function levenshtein(a,b) {
  if (!a) return b.length; if (!b) return a.length; const row = Array.from({length:b.length + 1},(_,i) => i);
  for (let i=1;i<=a.length;i++) { let prev = row[0]; row[0] = i; for (let j=1;j<=b.length;j++) { const temp = row[j]; row[j] = Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev = temp; } }
  return row[b.length];
}
export function searchScore(episode,query) {
  let q = normalizeText(query); if (!q) return 1; q = ALIASES.get(q) || q; const fields = episode.searchFields;
  const weights = [['title',150],['featured',130],['keywords',122],['characters',108],['chapters',92],['tags',78],['description',72],['people',60]];
  let score = 0; for (const [key,weight] of weights) { if (fields[key].includes(q)) score = Math.max(score,weight); }
  const tokens = q.split(' ').filter(Boolean); const matched = tokens.filter((token) => episode.searchText.includes(token)).length;
  if (tokens.length && matched) score = Math.max(score,35 + matched / tokens.length * 50);
  if (!score && q.length >= 4) {
    const words = fields.title.split(' ').concat(fields.featured.split(' ')).filter((word) => word.length >= 4);
    const distance = Math.min(...words.map((word) => levenshtein(q,word)),99); if (distance <= Math.max(1,Math.floor(q.length * .25))) score = 28 - distance;
  }
  return score;
}
export function timeMatches(episode,time) {
  if (time === 'any') return true; const d = Number(episode.durationMin); if (!Number.isFinite(d)) return false;
  if (time === 'short') return d <= 50; if (time === 'medium') return d > 50 && d <= 75; if (time === 'long') return d > 75; return true;
}
export function moodMatches(episode,mood) {
  if (mood === 'any') return true; const hay = normalizeText(`${episode.titel} ${episode.beschreibung} ${episode.tags.join(' ')} ${episode.featuredCharacters.join(' ')}`);
  const rules = { grusel:['grusel','geist','spuk','fluch','mystery'], klassiker:['originalserie','klassiker'], familie:['familie','tante mathilda','onkel titus','ben peck'], hugenay:['hugenay'], meer:['meer','insel','schiff','wasser'], kunst:['kunst','gemalde','museum'], skinny:['skinny'] };
  return (rules[mood] || [mood]).some((term) => hay.includes(normalizeText(term)));
}
export function catalogValidation() {
  const issues = []; const seen = new Set();
  for (const episode of appState.catalog) {
    if (seen.has(episode.nr)) issues.push(`Doppelte Nummer ${episode.nr}`); seen.add(episode.nr);
    if (!episode.titel) issues.push(`Folge ${episode.nr}: Titel fehlt`);
    if (episode.durationMin != null && (!Number.isFinite(episode.durationMin) || episode.durationMin <= 0)) issues.push(`Folge ${episode.nr}: ungültige Laufzeit`);
    if (episode.releaseDate && Number.isNaN(new Date(episode.releaseDate).getTime())) issues.push(`Folge ${episode.nr}: ungültiges Datum`);
  }
  return { ok:issues.length===0,count:appState.catalog.length,issues };
}
export function availableCatalog() { return appState.catalog.filter(availableEpisode); }
