export const APP_VERSION = '16.2.0';
export const DB_NAME = 'ddf-tracker';
export const DB_VERSION = 1;
export const STORE_NAME = 'kv';
export const USER_KEY = 'appState';
export const CATALOG_KEY = 'enrichedCatalogV16_2';
export const LEGACY_CATALOG_KEYS = ['enrichedCatalogV16','enrichedCatalogV15','enrichedCatalogV14','enrichedCatalogV13','enrichedCatalogV10','enrichedCatalogV9','enrichedCatalogV8','enrichedCatalogV7','enrichedCatalogV6','enrichedCatalogV5','enrichedCatalogV4'];
export const LEGACY_USER_KEYS = ['user-state','userState','state'];
export const STREAMING_SERVICES = [
  { id:'spotify', label:'Spotify' },
  { id:'appleMusic', label:'Apple Music' },
  { id:'bookbeat', label:'BookBeat' },
  { id:'amazonMusic', label:'Amazon Music' },
  { id:'youtubeMusic', label:'YouTube Music' },
  { id:'deezer', label:'Deezer' },
  { id:'amazon', label:'Amazon' },
];
export const DEFAULT_STREAMING_SERVICE = 'spotify';
export const RATING_ORDER = ['super','plus','neutral','minus'];
export const RATING_LABELS = { minus: 'Minus', neutral: 'Neutral', plus: 'Plus', super: 'Super' };
export const RATING_VALUES = { minus: -1.7, neutral: 0, plus: 1, super: 2.15 };

export const appState = {
  catalog: [], user: null, page: 'home', detailNr: null, recommendationNr: null,
  filter: 'all', authorFilter: 'all', eraFilter: 'all', yearFilter: 'all', sort: 'nr',
  search: '', time: 'any', mood: 'any', ranking: 'rocky', playlistTab: 'essentials',
  episodeRenderLimit: 40, quickRateQueue: [], quickRateIndex: 0, quickRateHistory: [], importCandidate: null,
  metadataUpdatedAt: null, currentPlaylistId: null, smartPlaylistDraft: null, smartPlaylistOptions: null, scrollPositions: {},
};

export const nowIso = () => new Date().toISOString();
export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
export const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
export const normalizeText = (value) => String(value ?? '').toLocaleLowerCase('de-DE').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export const unique = (values) => {
  const seen = new Set(); const out = [];
  for (const item of asArray(values).flat(Infinity)) {
    const clean = String(item ?? '').trim(); const key = normalizeText(clean);
    if (!clean || seen.has(key)) continue; seen.add(key); out.push(clean);
  }
  return out;
};
export const formatDuration = (minutes) => {
  const value = Number(minutes); if (!Number.isFinite(value) || value <= 0) return 'Dauer unbekannt';
  const h = Math.floor(value / 60); const m = Math.round(value % 60);
  return h ? `${h} Std.${m ? ` ${m} Min.` : ''}` : `${m} Min.`;
};
export const formatDate = (value, fallback = '—') => {
  if (!value) return fallback; const date = new Date(value); if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
};
export const formatRelativeDate = (value) => {
  if (!value) return 'noch nie'; const date = new Date(value); if (Number.isNaN(date.getTime())) return 'unbekannt';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'heute'; if (days === 1) return 'gestern'; if (days < 7) return `vor ${days} Tagen`; return formatDate(value);
};
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

let dbPromise;
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
export async function dbGet(key) {
  const db = await openDB(); return new Promise((resolve,reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function dbSet(key,value) {
  const db = await openDB(); return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE_NAME,'readwrite'); tx.objectStore(STORE_NAME).put(value,key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
export async function dbDelete(key) {
  const db = await openDB(); return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE_NAME,'readwrite'); tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

function normalizeRating(value) {
  if (['minus','neutral','plus','super'].includes(value)) return value;
  if (value === '-' || value === -1 || value === 'negative') return 'minus';
  if (value === '0' || value === 0 || value === 'okay') return 'neutral';
  if (value === '+' || value === 1 || value === 'positive') return 'plus';
  if (value === '++' || value === 2 || value === 'favorite' || value === 'favourite') return 'super';
  return null;
}
function normalizeEpisodeState(raw = {}) {
  const rating = normalizeRating(raw.rating ?? raw.bewertung ?? raw.vote);
  const heard = Boolean(raw.heard ?? raw.gehoert ?? raw.listened ?? rating);
  const heardAt = raw.heardAt || raw.lastHeardAt || raw.gehoertAm || null;
  return {
    heard, rating: heard ? rating : null, heardAt: heard ? heardAt : null,
    listenCount: Math.max(heard ? 1 : 0, Number(raw.listenCount || raw.heardCount || raw.count || 0) || 0),
    note: String(raw.note ?? raw.notes ?? raw.notiz ?? ''), updatedAt: raw.updatedAt || heardAt || null,
  };
}
function normalizePlaylist(raw = {}, index = 0) {
  const episodeNrs = asArray(raw.episodeNrs ?? raw.numbers ?? raw.episodes ?? raw.items)
    .map((item) => Number(typeof item === 'object' ? item.nr ?? item.number : item)).filter(Number.isFinite);
  return {
    id: String(raw.id || uid(`playlist-${index}`)), name: String(raw.name || raw.title || `Playlist ${index + 1}`).trim().slice(0,60),
    description: String(raw.description || raw.beschreibung || '').trim().slice(0,240), episodeNrs: [...new Set(episodeNrs)],
    createdAt: raw.createdAt || nowIso(), updatedAt: raw.updatedAt || raw.createdAt || nowIso(), generated: Boolean(raw.generated),
  };
}
function normalizeHistory(rawHistory = [], episodes = {}) {
  const seen = new Set(); const result = [];
  for (const item of asArray(rawHistory)) {
    const nr = Number(typeof item === 'object' ? item.nr ?? item.number ?? item.episodeNr : item); if (!Number.isFinite(nr)) continue;
    const sourceAt = typeof item === 'object' ? item.at || item.heardAt || item.date || item.timestamp : episodes[nr]?.heardAt;
    const at = sourceAt && !Number.isNaN(new Date(sourceAt).getTime()) ? new Date(sourceAt).toISOString() : nowIso();
    const key = `${nr}|${at}`; if (seen.has(key)) continue; seen.add(key);
    result.push({ id: typeof item === 'object' && item.id ? String(item.id) : uid('listen'), nr, at });
  }
  return result.sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0,3000);
}
export function defaultUser() {
  return {
    version: APP_VERSION, episodes: {}, playlists: [], pinned: [], history: [],
    settings: {
      preferredService: DEFAULT_STREAMING_SERVICE, tutorialCompleted: false, episodeView: 'compact', playlistTab: 'essentials',
      recommendationHistory: [], snoozedRecommendations: {}, hiddenRecommendations: [], featureFeedback: {}, queue: [],
      filters: { filter:'all', author:'all', era:'all', year:'all', sort:'nr' },
      lastBackupAt: null, lastBackupActivityCount: 0, backupReminderDismissedAt: null, lastVersionSeen: APP_VERSION,
    }, updatedAt: null,
  };
}
export function normalizeUser(raw = {}) {
  const base = defaultUser(); const source = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const rawEpisodes = source.episodes || source.episodeStates || source.ratings || {};
  const episodes = {};
  if (Array.isArray(rawEpisodes)) {
    for (const item of rawEpisodes) { const nr = Number(item.nr ?? item.number); if (Number.isFinite(nr)) episodes[nr] = normalizeEpisodeState(item); }
  } else {
    for (const [key,value] of Object.entries(rawEpisodes || {})) { const nr = Number(key); if (Number.isFinite(nr)) episodes[nr] = normalizeEpisodeState(value); }
  }
  const rawSettings = source.settings || {};
  const hidden = asArray(rawSettings.hiddenRecommendations).map(Number).filter(Number.isFinite);
  const snoozed = {};
  for (const [key,value] of Object.entries(rawSettings.snoozedRecommendations || {})) {
    const nr = Number(key); if (Number.isFinite(nr) && value) snoozed[nr] = String(value);
  }
  const feedback = {};
  for (const [key,value] of Object.entries(rawSettings.featureFeedback || {})) {
    const number = Number(value); if (key && Number.isFinite(number) && number !== 0) feedback[key] = clamp(number,-5,5);
  }
  const queue = asArray(rawSettings.queue).map(Number).filter(Number.isFinite);
  const user = {
    version: APP_VERSION, episodes,
    playlists: asArray(source.playlists).map(normalizePlaylist),
    pinned: [...new Set(asArray(source.pinned || source.favorites).map(Number).filter(Number.isFinite))],
    history: normalizeHistory(source.history || source.listenHistory, episodes),
    settings: {
      ...base.settings, ...rawSettings,
      preferredService: STREAMING_SERVICES.some((service) => service.id === rawSettings.preferredService) ? rawSettings.preferredService : DEFAULT_STREAMING_SERVICE,
      episodeView: ['compact','detailed','cover'].includes(rawSettings.episodeView) ? rawSettings.episodeView : 'compact',
      recommendationHistory: asArray(rawSettings.recommendationHistory).map(Number).filter(Number.isFinite).slice(-30),
      snoozedRecommendations: snoozed, hiddenRecommendations: [...new Set(hidden)], featureFeedback: feedback,
      queue: [...new Set(queue)], filters: { ...base.settings.filters, ...(rawSettings.filters || {}) },
    }, updatedAt: source.updatedAt || null,
  };
  for (const [nr,status] of Object.entries(user.episodes)) {
    if (status.heard && status.heardAt && !user.history.some((item) => item.nr === Number(nr))) {
      user.history.push({ id: uid('listen'), nr: Number(nr), at: status.heardAt });
    }
  }
  user.history.sort((a,b) => new Date(b.at) - new Date(a.at));
  return user;
}
export async function loadUser() {
  let raw = await dbGet(USER_KEY);
  if (!raw) {
    for (const key of LEGACY_USER_KEYS) { raw = await dbGet(key); if (raw) break; }
  }
  appState.user = normalizeUser(raw || {}); await dbSet(USER_KEY, appState.user); return appState.user;
}
let saveTimer;
export function saveUser(immediate = false) {
  if (!appState.user) return Promise.resolve();
  appState.user.version = APP_VERSION; appState.user.updatedAt = nowIso();
  clearTimeout(saveTimer);
  if (immediate) return dbSet(USER_KEY, appState.user);
  return new Promise((resolve) => {
    saveTimer = setTimeout(() => dbSet(USER_KEY, appState.user).then(resolve).catch((error) => { console.error(error); resolve(); }), 100);
  });
}
export function episodeState(nr) {
  const key = Number(nr); if (!appState.user.episodes[key]) appState.user.episodes[key] = normalizeEpisodeState({});
  return appState.user.episodes[key];
}
export function setHeard(nr, heard, { addHistory = true } = {}) {
  const status = episodeState(nr);
  if (heard) {
    const wasHeard = status.heard;
    const at = nowIso(); status.heard = true; status.heardAt = at;
    if (addHistory) appState.user.history.unshift({ id: uid('listen'), nr: Number(nr), at });
    status.listenCount = addHistory ? appState.user.history.filter((item) => item.nr === Number(nr)).length : Math.max(1,Number(status.listenCount)||0,wasHeard?1:0);
  } else {
    status.heard = false; status.rating = null; status.heardAt = null; status.listenCount = 0;
    appState.user.history = appState.user.history.filter((item) => item.nr !== Number(nr));
  }
  status.updatedAt = nowIso(); saveUser(); return status;
}
export function addListen(nr) {
  const status = episodeState(nr); const at = nowIso(); status.heard = true; status.heardAt = at;
  appState.user.history.unshift({ id: uid('listen'), nr: Number(nr), at }); status.listenCount = appState.user.history.filter((item) => item.nr === Number(nr)).length;
  status.updatedAt = at; saveUser(); return status;
}
export function setRating(nr, rating) {
  const status = episodeState(nr); const normalized = normalizeRating(rating);
  if (normalized && !status.heard) setHeard(nr,true);
  status.rating = status.rating === normalized ? null : normalized; status.heard = status.heard || Boolean(status.rating); status.updatedAt = nowIso(); saveUser(); return status;
}
export function setNote(nr,note) { const status = episodeState(nr); status.note = String(note ?? '').slice(0,10000); status.updatedAt = nowIso(); saveUser(); return status; }
export function togglePinned(nr) {
  const number = Number(nr); const list = appState.user.pinned; const index = list.indexOf(number);
  if (index >= 0) list.splice(index,1); else list.unshift(number); saveUser(); return index < 0;
}
export function toggleQueue(nr) {
  const number = Number(nr); const list = appState.user.settings.queue; const index = list.indexOf(number);
  if (index >= 0) list.splice(index,1); else list.push(number); saveUser(); return index < 0;
}
export function removeFromQueue(nr) { appState.user.settings.queue = appState.user.settings.queue.filter((item) => item !== Number(nr)); saveUser(); }
export function addManyToQueue(nrs) { const queue = appState.user.settings.queue; for (const nr of nrs.map(Number)) if (Number.isFinite(nr) && !queue.includes(nr)) queue.push(nr); saveUser(); }
export function moveQueueItem(nr,direction) {
  const queue = appState.user.settings.queue; const index = queue.indexOf(Number(nr)); const next = clamp(index + direction,0,queue.length - 1);
  if (index < 0 || index === next) return; [queue[index],queue[next]] = [queue[next],queue[index]]; saveUser();
}
export function getEpisode(nr) { return appState.catalog.find((episode) => episode.nr === Number(nr)) || null; }
export function availableEpisode(episode) { if (!episode) return false; if (!episode.releaseDate) return true; const date = new Date(episode.releaseDate); return Number.isNaN(date.getTime()) || date <= new Date(); }
export function activityCount(user = appState.user) { return Object.values(user?.episodes || {}).filter((status) => status.heard || status.rating || status.note).length + (user?.playlists?.length || 0) + (user?.history?.length || 0); }
export function profileRatingCount() { return Object.values(appState.user?.episodes || {}).filter((status) => status.rating).length; }
export function persistFilters() {
  appState.user.settings.filters = { filter: appState.filter, author: appState.authorFilter, era: appState.eraFilter, year: appState.yearFilter, sort: appState.sort }; saveUser();
}
export function setStoredFilters() {
  const filters = appState.user?.settings?.filters || {}; appState.filter = filters.filter || 'all'; appState.authorFilter = filters.author || 'all'; appState.eraFilter = filters.era || 'all'; appState.yearFilter = filters.year || 'all'; appState.sort = filters.sort || 'nr';
}
export function resetRuntimeState() {
  appState.detailNr = null; appState.recommendationNr = null; appState.search = ''; appState.quickRateQueue = []; appState.quickRateIndex = 0; appState.quickRateHistory = []; appState.currentPlaylistId = null; appState.smartPlaylistDraft = null; appState.smartPlaylistOptions = null;
}
