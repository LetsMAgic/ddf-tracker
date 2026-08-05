(() => {
  'use strict';

  const DB_NAME = 'ddf-tracker';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const USER_KEY = 'appState';
  const CATALOG_KEY = 'enrichedCatalogV13';
  const LEGACY_CATALOG_KEYS = ['enrichedCatalogV10', 'enrichedCatalogV9', 'enrichedCatalogV8', 'enrichedCatalogV7', 'enrichedCatalogV6', 'enrichedCatalogV5', 'enrichedCatalogV4'];
  const LEGACY_USER_KEYS = ['user-state', 'userState', 'state'];
  const APP_VERSION = '13.0.0';
  const DEFAULT_STREAMING_SERVICE = 'spotify';
  const META_URL = 'https://dreimetadaten.de/data/Serie.json';
  const META_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

  const state = {
    catalog: [],
    user: { version: APP_VERSION, episodes: {}, playlists: [], settings: { preferredService: DEFAULT_STREAMING_SERVICE, tutorialCompleted: false, playlistTab: 'essentials' }, updatedAt: null },
    page: 'home',
    filter: 'all',
    authorFilter: 'all',
    eraFilter: 'all',
    sort: 'nr',
    ranking: 'rocky',
    search: '',
    detailNr: null,
    time: 'any',
    mood: 'any',
    collectionLabel: '',
    metadataUpdatedAt: null,
    dailyOffset: 0,
    playlistDetailId: null,
    playlistEditorId: null,
    playlistEditorSeedNr: null,
    playlistPickerNr: null,
    generatedPlan: null,
    playlistSuggestionOffset: 0,
    playlistSuggestionMode: 'similar',
    playlistTab: 'essentials',
    tutorialStep: 0,
    tutorialPositionFrame: 0,
    tutorialPositionTimer: 0,
    tutorialActive: false,
    tutorialAdvancing: false,
    tutorialPreparedStep: -1,
    tutorialTarget: null,
    tutorialSnapshot: null,
    tutorialEpisodeNr: null,
    tutorialPlaylistId: null,
    tutorialSmartPlaylistId: null,
    tutorialInputTimer: 0,
    tutorialLockedScrollY: 0,
    tutorialProgrammaticScroll: false,
    tutorialKeyboardActive: false,
    tutorialKeyboardTimer: 0,
    tutorialViewportTimer: 0,
    pendingUnheardNr: null,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
  const debounce = (fn, wait = 180) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  let dbPromise;
  let noteTimer;
  let pendingNote = null;
  let confirmResolver = null;
  let lastFocusedElement = null;

  const TAG_RULES = [
    ['Grusel', ['geist', 'gespenst', 'spuk', 'grusel', 'schreck', 'dämon', 'vampir', 'werwolf', 'untot', 'jenseits', 'hexen', 'fluch', 'toten', 'monster', 'moor', 'nebel']],
    ['Mystery', ['rätsel', 'geheimnis', 'mysteri', 'phantom', 'unsichtbar', 'vision', 'botschaft', 'zeichen', 'legende']],
    ['Schatz', ['schatz', 'erbe', 'gold', 'silber', 'rubin', 'diamant', 'perle', 'kelch', 'jade', 'kristall', 'maya', 'azteken', 'inka']],
    ['Kunst', ['kunst', 'gemälde', 'bilder', 'maler', 'museum', 'skulptur', 'madonna', 'filmstar', 'drehbuch', 'comic']],
    ['Musik', ['musik', 'song', 'melodie', 'sinfonie', 'lied', 'flöte', 'geige', 'sänger', 'band', 'fantasmofon']],
    ['Technik', ['computer', 'internet', 'e-mail', 'email', 'sms', 'gps', 'ufo', 'virus', 'handy', 'technik', 'roboter']],
    ['Sport', ['fußball', 'spieler', 'doping', 'foul', 'skateboard', 'ritt', 'poker', 'sieg', 'sport']],
    ['Meer & Insel', ['insel', 'meer', 'see', 'riff', 'hai', 'yacht', 'schiff', 'segler', 'tauchen', 'grotte', 'bucht', 'barrakuda', 'flut']],
    ['Ausland', ['mexiko', 'europa', 'afrika', 'asien', 'japan', 'indien', 'frankreich', 'london', 'ägypten', 'karpaten', 'samurai', 'wikinger']],
    ['Natur', ['wald', 'berg', 'canyon', 'schlucht', 'höhle', 'ranch', 'sturm', 'eis', 'feuer', 'tier', 'tiger', 'löwe', 'vogel', 'schlange', 'spinne', 'ameise']],
    ['Zirkus & Bühne', ['zirkus', 'gaukler', 'zauberer', 'bauchredner', 'puppe', 'bühne', 'diva', 'schauspiel']],
    ['Verbrechen', ['mord', 'entführung', 'schmuggel', 'mafia', 'gangster', 'diebstahl', 'räuber', 'erpress', 'betrug', 'verdacht', 'schuld']],
    ['Familie', ['tante mathilda', 'onkel titus', 'ben peck', 'mr. shaw', 'mr. andrews', 'familie', 'opa', 'großvater']],
    ['Weihnachten', ['weihnacht', 'advent', 'bescherung', 'glocken']],
    ['Humor', ['humor', 'komisch', 'verrückt', 'schrullig']],
  ];

  const TAG_LABELS = new Map([
    ['grusel', 'Grusel'], ['mystery', 'Mystery'], ['krimi', 'Verbrechen'], ['abenteuer', 'Abenteuer'],
    ['humor', 'Humor'], ['wasser', 'Meer & Insel'], ['meer', 'Meer & Insel'], ['insel', 'Meer & Insel'],
    ['sci-fi', 'Technik'], ['science-fiction', 'Technik'], ['sport', 'Sport'], ['kunst', 'Kunst'],
    ['musik', 'Musik'], ['ausland', 'Ausland'], ['schatz', 'Schatz'], ['familie', 'Familie'],
  ]);

  const IMPORTANT_CHARACTER_RULES = [
    { label: 'Victor Hugenay', patterns: ['victor hugenay', 'hugenay'], keywords: ['böser franzose', 'franzose', 'französischer meisterdieb', 'meisterdieb', 'kunstdieb', 'kunstfälscher'] },
    { label: 'Skinny Norris', patterns: ['skinny norris', 'skinny'], keywords: ['erzfeind', 'rivale', 'schulrivale', 'gegner der drei fragezeichen'] },
    { label: 'Ben Peck', patterns: ['ben peck'], keywords: ['peters opa', 'peters großvater', 'opa von peter', 'großvater von peter', 'peters familie'] },
    { label: 'Tante Mathilda', patterns: ['tante mathilda', 'mathilda jonas'], keywords: ['justus tante', 'tante von justus', 'kirschkuchen', 'familie jonas'] },
    { label: 'Onkel Titus', patterns: ['onkel titus', 'titus jonas'], keywords: ['justus onkel', 'onkel von justus', 'schrottplatz', 'gebrauchtwarencenter'] },
    { label: 'Morton', patterns: ['morton'], keywords: ['chauffeur', 'rolls royce', 'rolls-royce'] },
    { label: 'Inspektor Cotta', patterns: ['inspektor cotta', 'inspector cotta'], keywords: ['polizei', 'kommissar', 'cotta'] },
    { label: 'Kommissar Reynolds', patterns: ['kommissar reynolds', 'inspektor reynolds'], keywords: ['polizei', 'reynolds'] },
    { label: 'Kelly Madigan', patterns: ['kelly madigan', 'kelly'], keywords: ['peters freundin', 'freundin von peter'] },
    { label: 'Lys de Kerk', patterns: ['lys de kerk', 'lys'], keywords: ['justus freundin', 'freundin von justus'] },
    { label: 'Jelena Charkova', patterns: ['jelena charkova', 'jelena'], keywords: ['bobs freundin', 'freundin von bob', 'rollstuhl'] },
    { label: 'Rubbish George', patterns: ['rubbish george'], keywords: ['obdachloser', 'straßenbewohner', 'müll george'] },
    { label: 'Mr. Shaw', patterns: ['mr. shaw', 'henry shaw'], keywords: ['peters vater', 'vater von peter'] },
    { label: 'Mr. Andrews', patterns: ['mr. andrews', 'john andrews'], keywords: ['bobs vater', 'vater von bob', 'journalist'] },
    { label: 'Elizabeth Zapata', patterns: ['elizabeth zapata'], keywords: ['justus freundin'] },
    { label: 'Patrick & Kenneth', patterns: ['patrick kenneth', 'patrick und kenneth', 'patrick & kenneth'], keywords: ['schrottplatzhelfer', 'helfer auf dem schrottplatz', 'irische brüder'] },
    { label: 'Allie Jamison', patterns: ['allie jamison', 'allie'], keywords: ['allie'] },
    { label: 'Mr. Hitfield', patterns: ['mr. hitfield', 'hector sebastian'], keywords: ['hitfield', 'hector sebastian', 'schauspieler'] },
    { label: 'Dr. Franklin', patterns: ['dr. franklin', 'doktor franklin'], keywords: ['franklin'] },
    { label: 'Lesley Dimple', patterns: ['lesley dimple', 'lesley'], keywords: ['lesley'] },
    { label: 'Inspektor Kershaw', patterns: ['inspektor kershaw', 'inspector kershaw', 'kershaw'], keywords: ['polizei', 'kershaw'] },
    { label: 'Monique Carrera', patterns: ['monique carrera'], keywords: ['monique'] },
    { label: 'Brittany', patterns: ['brittany'], keywords: ['brittany'] },
    { label: 'Dick Perry', patterns: ['dick perry'], keywords: ['privatdetektiv', 'detektiv perry'] },
    { label: 'Kenny Cinelly', patterns: ['kenny cinelly'], keywords: ['kenny'] },
    { label: 'Mrs. Bennett', patterns: ['mrs. bennett', 'miss bennett'], keywords: ['bennett'] },
  ];

  const QUERY_ALIASES = [
    [['peters opa', 'peters grossvater', 'opa von peter', 'grossvater von peter'], 'ben peck'],
    [['boeser franzose', 'boser franzose', 'franzoesischer meisterdieb', 'meisterdieb'], 'victor hugenay'],
    [['skinny', 'erzfeind', 'schulrivale'], 'skinny norris'],
    [['tante von justus', 'justus tante', 'kirschkuchen'], 'tante mathilda'],
    [['onkel von justus', 'justus onkel', 'gebrauchtwarencenter'], 'onkel titus'],
    [['chauffeur', 'rolls royce'], 'morton'],
    [['peters vater', 'vater von peter'], 'mr shaw'],
    [['bobs vater', 'vater von bob'], 'mr andrews'],
    [['peters freundin', 'freundin von peter'], 'kelly madigan'],
    [['justus freundin', 'freundin von justus'], 'lys de kerk'],
    [['bobs freundin', 'freundin von bob'], 'jelena charkova'],
    [['schrottplatzhelfer', 'helfer auf dem schrottplatz', 'irische brueder'], 'patrick kenneth'],
    [['hector sebastian'], 'mr hitfield'],
    [['detektiv perry', 'privatdetektiv'], 'dick perry'],
  ];

  const CURATED_PLAYLISTS = [
    { id: 'halloween', icon: '☾', title: 'Halloween in Rocky Beach', description: 'Düstere, unheimliche und atmosphärische Fälle für einen langen Herbstabend.', type: 'theme', mood: 'grusel', max: 14 },
    { id: 'winter', icon: '❄', title: 'Advent & Weihnachten', description: 'Alle eingebauten Adventskalender-Specials plus winterliche Hauptfolgen.', type: 'numbers', numbers: [77,142,202,10007,10008,10009,10010,10011,10012], sequence: false },
    { id: 'football', icon: '⚽', title: 'Fußballfälle', description: 'Stadien, Spieler, Fouls, Turniere und gestohlene Siege.', type: 'numbers', numbers: [63,81,123,141,153,164,176,245], sequence: false },
    { id: 'andre-marx', icon: '✎', title: 'André Marx', description: 'Fälle eines der prägendsten Autoren der modernen Serie.', type: 'author', author: 'André Marx', max: 24 },
    { id: 'summer', icon: '≈', title: 'Sommer, Meer & Inseln', description: 'Inseln, Küsten, Schiffe, Tauchen und salzige Seeluft.', type: 'theme', mood: 'meer', max: 16 },
    { id: 'classics', icon: '◇', title: 'Die ersten Klassiker', description: 'Die ersten 39 Hörspielfolgen in chronologischer Reihenfolge.', type: 'range', from: 1, to: 39 },
    { id: 'hugenay', icon: '♜', title: 'Die Hugenay-Chronik', description: 'Die wichtigsten Auftritte des französischen Meisterdiebs in sinnvoller Reihenfolge.', type: 'numbers', numbers: [9,16,103,125], sequence: true },
    { id: 'feuriges-auge', icon: '◆', title: 'Vor Feuriges Auge', description: 'Der klassische Ursprung des Rubins und anschließend die Jubiläumsfolge.', type: 'numbers', numbers: [5,200], sequence: true },
    { id: 'taipan', icon: '⌁', title: 'Vor dem dunklen Taipan', description: 'Fälle und Motive, auf die das Live-Hörspiel besonders deutlich zurückgreift.', type: 'numbers', numbers: [2,5,16,23,25], sequence: true },
    { id: 'jubilaeum', icon: '★', title: 'Die großen Jubiläen', description: 'Die langen Jubiläumsfälle als Marathon in Reihenfolge.', type: 'numbers', numbers: [100,125,150,175,200,225], sequence: true },
    { id: 'skinny', icon: '⚡', title: 'Skinny Norris', description: 'Folgen mit dem ewigen Rivalen der drei Detektive.', type: 'theme', mood: 'skinny', max: 18 },
    { id: 'familie', icon: '⌂', title: 'Familie & Rocky Beach', description: 'Tante Mathilda, Onkel Titus, Eltern, Großeltern und vertraute Gesichter.', type: 'theme', mood: 'familie', max: 18 },
  ];

  const ESSENTIAL_PLAYLIST_IDS = new Set(['classics','hugenay','feuriges-auge','taipan','jubilaeum','halloween','winter']);
  const playlistCategory = (definition) => ESSENTIAL_PLAYLIST_IDS.has(definition.id) ? 'essential' : 'theme';

  const STORY_BLOCKS = [
    { id: 'feuriges-auge', title: 'Fluch des Rubins → Feuriges Auge', numbers: [5,200] },
    { id: 'hugenay', title: 'Hugenay-Chronik', numbers: [9,16,103,125] },
    { id: 'jubilaeum-100', title: 'Toteninsel', numbers: [100] },
    { id: 'jubilaeum-125', title: 'Feuermond', numbers: [125] },
    { id: 'jubilaeum-150', title: 'Geisterbucht', numbers: [150] },
    { id: 'jubilaeum-175', title: 'Schattenwelt', numbers: [175] },
    { id: 'jubilaeum-200', title: 'Feuriges Auge', numbers: [200] },
  ];

  const ERA_DEFINITIONS = [
    { id: 'Originalserie / Klassiker', short: 'Originalserie', from: 1, to: 46, description: 'Amerikanische Originalserie vor den Crimebusters.' },
    { id: 'Crimebusters-Ära', short: 'Crimebusters', from: 47, to: 56, description: 'Späte US-Fälle mit modernerem Crimebusters-Ton.' },
    { id: 'Henkel-Waidhofer-Ära', short: 'Henkel-Waidhofer', from: 57, to: 72, description: 'Die sechzehn deutschen Fälle von Brigitte Johanna Henkel-Waidhofer.' },
    { id: 'Triumvirats-Ära', short: 'Triumvirat', from: 73, to: 120, description: 'Die Phase ab 1997 mit jeweils drei gleichzeitig aktiven Hauptautoren.' },
    { id: 'Neue Ära (Fälle nach 2005)', short: 'Neue Ära', from: 121, to: Infinity, description: 'Die breitere Multi-Autoren-Phase der Fälle nach 2005.' },
  ];

  function canonicalEra(value, nr, collection = 'main') {
    if (collection === 'special' || Number(nr) >= 10000) return 'Spezialfolgen';
    const number = Number(nr);
    return ERA_DEFINITIONS.find((era) => number >= era.from && number <= era.to)?.id || String(value || '').trim() || 'Neue Ära (Fälle nach 2005)';
  }

  function eraInfo(episode) {
    if (episode.collection === 'special' || episode.era === 'Spezialfolgen') return { id: 'Spezialfolgen', short: 'Spezial', description: 'Sonderformat außerhalb der regulären Nummerierung.' };
    return ERA_DEFINITIONS.find((era) => era.id === episode.era) || { id: episode.era || '—', short: episode.era || '—', description: '' };
  }

  const STOP_WORDS = new Set(['die', 'der', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen', 'mit', 'und', 'oder', 'von', 'im', 'in', 'auf', 'bei', 'zu', 'zur', 'zum', 'folge', 'fall', 'wo', 'es', 'geht', 'um', 'drei', 'fragezeichen']);
  const MAIN_ROLE_PATTERNS = ['justus jonas', 'peter shaw', 'bob andrews', 'erster detektiv', 'zweiter detektiv', 'recherchen und archiv', 'erzähler', 'erzaehler', 'alfred hitchcock'];

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function normalizeText(value) {
    return String(value ?? '')
      .toLocaleLowerCase('de-DE')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeStreamingService(value) {
    return value === 'appleMusic' ? 'appleMusic' : DEFAULT_STREAMING_SERVICE;
  }

  function safeStreamingUrl(value, service) {
    const text = String(value || '').trim();
    if (!text) return null;
    try {
      const url = new URL(text);
      const validHost = service === 'spotify'
        ? url.hostname === 'open.spotify.com'
        : url.hostname === 'music.apple.com';
      return url.protocol === 'https:' && validHost ? url.href : null;
    } catch {
      return null;
    }
  }

  function directStreamingUrl(raw, service) {
    const linkValue = service === 'spotify'
      ? raw?.spotifyUrl || raw?.links?.spotify
      : raw?.appleMusicUrl || raw?.links?.appleMusic;
    const direct = safeStreamingUrl(linkValue, service);
    if (direct) return direct;
    const id = service === 'spotify'
      ? raw?.spotifyId || raw?.idSpotify || raw?.ids?.spotify
      : raw?.appleMusicId || raw?.idAppleMusic || raw?.ids?.appleMusic;
    const cleanId = String(id || '').trim();
    if (!cleanId) return null;
    return service === 'spotify'
      ? `https://open.spotify.com/intl-de/album/${encodeURIComponent(cleanId)}`
      : `https://music.apple.com/de/album/${encodeURIComponent(cleanId)}`;
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const output = [];
    for (const value of values.flat(Infinity)) {
      const clean = String(value ?? '').trim();
      const key = normalizeText(clean);
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      output.push(clean);
    }
    return output;
  }

  function canonicalTag(tag) {
    const normalized = normalizeText(tag);
    return TAG_LABELS.get(normalized) || String(tag ?? '').trim().replace(/^./, (char) => char.toUpperCase());
  }

  function deriveTags(source, supplied = []) {
    const tags = uniqueStrings(supplied.map(canonicalTag));
    const normalizedSource = normalizeText(source);
    for (const [label, terms] of TAG_RULES) {
      if (terms.some((term) => normalizedSource.includes(normalizeText(term)))) tags.push(label);
    }
    return uniqueStrings(tags);
  }

  function roleValue(role) {
    if (typeof role === 'string') return role;
    return role?.rolle?.name || role?.rolle || role?.name || role?.charakter || '';
  }

  function speakerValue(role) {
    if (typeof role === 'string') return '';
    return role?.sprecher?.name || role?.sprecher || role?.person?.name || '';
  }

  function chapterValue(chapter) {
    if (typeof chapter === 'string') return chapter;
    return chapter?.titel || chapter?.title || chapter?.name || '';
  }

  function authorValue(value) {
    if (Array.isArray(value)) return value.map(authorValue).filter(Boolean).join(', ');
    if (typeof value === 'string') return value;
    return value?.name || '';
  }

  function characterRuleFor(name) {
    const normalized = normalizeText(name);
    return IMPORTANT_CHARACTER_RULES.find((rule) => rule.patterns.some((pattern) => normalized.includes(normalizeText(pattern))));
  }

  function isMainRole(name) {
    const normalized = normalizeText(name);
    return MAIN_ROLE_PATTERNS.some((pattern) => normalized.includes(normalizeText(pattern)));
  }

  function importantCharacters(episode, limit = 7) {
    const selected = [];
    for (const character of episode.characters || []) {
      if (isMainRole(character)) continue;
      const rule = characterRuleFor(character);
      if (rule) selected.push(rule.label);
    }
    for (const character of episode.characters || []) {
      if (isMainRole(character)) continue;
      if (/^(mann|frau|junge|mädchen|polizist|stimme|gast|person|arbeiter|fahrer|reporter|passant|kind)\b/i.test(character)) continue;
      selected.push(character.replace(/,.*$/, '').trim());
      if (uniqueStrings(selected).length >= limit) break;
    }
    return uniqueStrings(selected).slice(0, limit);
  }

  function buildHiddenKeywords(episode) {
    const keywords = [...(episode.searchKeywords || [])];
    for (const character of episode.characters || []) {
      const rule = characterRuleFor(character);
      if (rule) keywords.push(rule.label, ...rule.keywords);
    }
    if ([100, 125, 150, 175, 200, 225].includes(episode.nr)) keywords.push('jubiläum', 'jubiläumsfolge', 'dreiteiler', 'lange folge', 'spezialfolge');
    if ((episode.durationMin || 0) >= 120) keywords.push('extra lang', 'lange folge', 'spezialfolge');
    const era = eraInfo(episode);
    keywords.push(episode.author || '', episode.scriptAuthor || '', era.id, era.short, era.description);
    if (era.id === 'Originalserie / Klassiker') keywords.push('klassiker', 'originalserie', 'amerikanische ära', 'us ära');
    if (era.id === 'Crimebusters-Ära') keywords.push('crimebusters', 'crimebuster');
    if (era.id === 'Henkel-Waidhofer-Ära') keywords.push('bjhw', 'brigitte johanna henkel waidhofer');
    if (era.id === 'Triumvirats-Ära') keywords.push('triumvirat', 'triumpvirats ära', 'andré marx ben nevis andré minninger');
    if (era.id === 'Neue Ära (Fälle nach 2005)') keywords.push('neue ära', 'neuzeit', 'moderne ära', 'fälle nach 2005', 'multi autoren ära');
    return uniqueStrings(keywords);
  }

  function buildSearchFields(episode) {
    const hidden = buildHiddenKeywords(episode);
    const fields = {
      title: normalizeText(`${episode.nr} ${episode.titel}`),
      description: normalizeText(episode.beschreibung),
      tags: normalizeText((episode.tags || []).join(' ')),
      characters: normalizeText((episode.characters || []).filter((character) => !isMainRole(character)).join(' ')),
      speakers: normalizeText((episode.speakers || []).join(' ')),
      chapters: normalizeText((episode.chapters || []).join(' ')),
      hidden: normalizeText(hidden.join(' ')),
      authors: normalizeText(`${episode.author || ''} ${episode.scriptAuthor || ''} ${episode.era || ''}`),
    };
    fields.all = Object.values(fields).join(' ');
    return { fields, hidden };
  }

  function normalizeEpisode(raw) {
    const nr = Number(raw.nr ?? raw.nummer ?? raw.number ?? raw.NumberEuropa);
    const titel = String(raw.titel ?? raw.title ?? raw.Title ?? '').trim();
    const beschreibung = String(raw.beschreibung ?? raw.gesamtbeschreibung ?? raw.description ?? '').trim();
    const durationMin = Number.isFinite(Number(raw.durationMin))
      ? Math.round(Number(raw.durationMin))
      : Number.isFinite(Number(raw.gesamtdauer))
        ? Math.round(Number(raw.gesamtdauer) / 60000)
        : null;
    const characters = uniqueStrings((raw.characters || raw.figuren || raw.sprechrollen || []).map(roleValue));
    const speakers = uniqueStrings((raw.speakers || raw.sprecher || raw.sprechrollen || []).map(speakerValue));
    const chapters = uniqueStrings((raw.chapters || raw.kapitel || []).map(chapterValue));
    const source = [titel, beschreibung, chapters.join(' '), characters.join(' ')].join(' ');
    const episode = {
      nr,
      displayNumber: String(raw.displayNumber || raw.folgenLabel || '').trim(),
      titel,
      beschreibung,
      tags: deriveTags(source, Array.isArray(raw.tags) ? raw.tags : []),
      rockyRanking: Number.isFinite(Number(raw.rockyRanking ?? raw.rocky ?? raw.Rating)) ? Number(raw.rockyRanking ?? raw.rocky ?? raw.Rating) : null,
      collection: raw.collection || 'main',
      durationMin,
      releaseDate: raw.releaseDate || raw.veröffentlichungsdatum || null,
      characters,
      speakers,
      chapters,
      author: authorValue(raw.author || raw.buchautor || raw.buchautoren),
      scriptAuthor: authorValue(raw.scriptAuthor || raw.hörspielskriptautor || raw.hoerspielskriptautor),
      era: canonicalEra(raw.era, nr, raw.collection || 'main'),
      searchKeywords: uniqueStrings(raw.searchKeywords || raw.keywords || []),
      spotifyUrl: directStreamingUrl(raw, 'spotify'),
      appleMusicUrl: directStreamingUrl(raw, 'appleMusic'),
    };
    const built = buildSearchFields(episode);
    episode.searchKeywords = built.hidden;
    episode._search = built.fields;
    return episode;
  }

  function normalizeCatalog(raw) {
    const byNumber = new Map();
    for (const item of Array.isArray(raw) ? raw : []) {
      const episode = normalizeEpisode(item);
      if (episode.nr > 0 && episode.titel) byNumber.set(episode.nr, episode);
    }
    return [...byNumber.values()].sort((a, b) => a.nr - b.nr);
  }

  function normalizeEpisodeState(input = {}) {
    let rating = input.rating ?? input.bewertung ?? null;
    if (rating === '+' || rating === 'positive') rating = 'plus';
    if (rating === '-' || rating === 'negative') rating = 'minus';
    if (rating === '0') rating = 'neutral';
    if (['favorite', 'favourite', 'star'].includes(rating)) rating = 'super';
    if (!['super', 'plus', 'neutral', 'minus'].includes(rating)) rating = null;
    const heard = Boolean(input.heard ?? input.gehoert ?? input.listened) || Boolean(rating);
    return {
      heard,
      rating,
      note: String(input.note ?? input.notiz ?? ''),
      heardAt: input.heardAt ?? input.gehoertAm ?? null,
      updatedAt: input.updatedAt || null,
    };
  }

  function normalizePlaylist(input = {}) {
    const title = String(input.title || input.name || '').trim();
    if (!title) return null;
    return {
      id: String(input.id || `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      title: title.slice(0, 60),
      description: String(input.description || '').trim().slice(0, 300),
      episodeNumbers: [...new Set((input.episodeNumbers || input.episodes || []).map(Number).filter(Number.isFinite))],
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: input.updatedAt || new Date().toISOString(),
      smartMeta: input.smartMeta && typeof input.smartMeta === 'object' ? input.smartMeta : null,
    };
  }

  function normalizeUser(raw) {
    const preferredService = normalizeStreamingService(
      raw?.settings?.preferredService
      || raw?.user?.settings?.preferredService
      || raw?.preferredService,
    );
    const rawSettings = raw?.settings || raw?.user?.settings || {};
    const output = {
      version: APP_VERSION,
      episodes: {},
      playlists: [],
      settings: {
        preferredService,
        tutorialCompleted: Boolean(rawSettings.tutorialCompleted),
        playlistTab: ['essentials','themes','mine'].includes(rawSettings.playlistTab) ? rawSettings.playlistTab : 'essentials',
      },
      updatedAt: raw?.updatedAt || null,
    };
    const playlistSource = raw?.user?.playlists || raw?.playlists || [];
    if (Array.isArray(playlistSource)) {
      output.playlists = playlistSource.map(normalizePlaylist).filter(Boolean);
    }
    const source = raw?.user?.episodes || raw?.episodes || raw?.userData || {};
    if (Array.isArray(source)) {
      for (const item of source) {
        if (item?.nr != null) output.episodes[String(item.nr)] = normalizeEpisodeState(item);
      }
    } else if (source && typeof source === 'object') {
      for (const [number, item] of Object.entries(source)) output.episodes[String(number)] = normalizeEpisodeState(item);
    }
    return output;
  }

  function userFor(number) {
    return state.user.episodes[String(number)] || { heard: false, rating: null, note: '', heardAt: null, updatedAt: null };
  }

  function merged(episode) {
    return { ...episode, ...userFor(episode.nr) };
  }

  function ratingLabel(rating) {
    return rating === 'super' ? 'Super' : rating === 'plus' ? 'Plus' : rating === 'neutral' ? 'Neutral' : rating === 'minus' ? 'Minus' : 'Unbewertet';
  }

  function ratingSymbol(rating) {
    return rating === 'super' ? '★' : rating === 'plus' ? '＋' : rating === 'neutral' ? '●' : rating === 'minus' ? '−' : '—';
  }

  function fmtRocky(value) {
    return value == null ? 'nicht verfügbar' : Number(value).toFixed(2).replace('.', ',');
  }

  function fmtDuration(minutes) {
    if (minutes == null || !Number.isFinite(Number(minutes))) return 'nicht verfügbar';
    const value = Math.max(0, Math.round(Number(minutes)));
    if (value === 0) return '0 Min.';
    const hours = Math.floor(value / 60);
    const remaining = value % 60;
    if (!hours) return `${remaining} Min.`;
    return `${hours} Std.${remaining ? ` ${remaining} Min.` : ''}`;
  }

  function preferredStreamingService() {
    return normalizeStreamingService(state.user?.settings?.preferredService);
  }

  function streamingServiceLabel(service) {
    return service === 'appleMusic' ? 'Apple Music' : 'Spotify';
  }

  function streamingIcon(service) {
    if (service === 'appleMusic') {
      return '<svg class="stream-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><path d="M15.5 7.2v8.1a2.2 2.2 0 1 1-1.2-2V9.1l-5.8 1.2v6.1a2.2 2.2 0 1 1-1.2-2V8.8l8.2-1.6Z"></path></svg>';
    }
    return '<svg class="stream-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M6.8 9.1c3.8-1.1 7.9-.8 11.2.8M7.5 12.3c3.2-.8 6.7-.5 9.5.7M8.2 15.2c2.6-.6 5.4-.3 7.6.6"></path></svg>';
  }

  function streamingDestination(episode, service) {
    const normalizedService = normalizeStreamingService(service);
    const direct = normalizedService === 'appleMusic' ? episode.appleMusicUrl : episode.spotifyUrl;
    if (direct) return { url: direct, exact: true, service: normalizedService };
    const query = encodeURIComponent(`Die drei ??? Folge ${episode.nr} ${episode.titel}`);
    const url = normalizedService === 'appleMusic'
      ? `https://music.apple.com/de/search?term=${query}`
      : `https://open.spotify.com/search/${query}`;
    return { url, exact: false, service: normalizedService };
  }

  function streamingButtonMarkup(episode, service, options = {}) {
    const destination = streamingDestination(episode, service);
    const label = streamingServiceLabel(destination.service);
    const serviceClass = destination.service === 'appleMusic' ? 'apple-music' : 'spotify';
    const data = `${episode.nr}:${destination.service}`;
    if (options.compact) {
      return `<button type="button" class="stream-icon-button ${serviceClass}" data-stream="${data}" aria-label="${destination.exact ? `${label} öffnen` : `${label} durchsuchen`}" title="${destination.exact ? `Bei ${label} hören` : `Auf ${label} suchen`}"></button>`;
    }
    return `<button type="button" class="stream-service-button ${serviceClass}${options.primary ? ' preferred' : ''}" data-stream="${data}">${streamingIcon(destination.service)}<span><strong>${destination.exact ? `Bei ${label} hören` : `Auf ${label} suchen`}</strong><small>${destination.exact ? 'Direkt zur Folge' : 'Noch kein Direktlink verfügbar'}</small></span></button>`;
  }

  function openStreaming(number, service = preferredStreamingService()) {
    const episode = state.catalog.find((item) => item.nr === Number(number));
    if (!episode) {
      toast('Die Folge wurde im Katalog nicht gefunden.');
      return;
    }
    const destination = streamingDestination(episode, service);
    window.location.assign(destination.url);
  }

  function setPreferredStreamingService(service) {
    const normalized = normalizeStreamingService(service);
    if (preferredStreamingService() === normalized) return;
    state.user.settings = { ...(state.user.settings || {}), preferredService: normalized };
    state.user.updatedAt = new Date().toISOString();
    pageDirty.home = true;
    pageDirty.episodes = true;
    pageDirty.settings = true;
    queueUserPersist();
    if (state.page === 'home') renderHome();
    if (state.page === 'episodes') renderEpisodes();
    if (state.page === 'settings') renderSettings();
    if (state.detailNr) refreshDetail();
    toast(`${streamingServiceLabel(normalized)} ist jetzt dein Standard.`);
  }

  function isSpecial(episode) {
    return episode.collection === 'special' || (episode.durationMin || 0) >= 120 || [100, 125, 150, 175, 200, 225].includes(episode.nr);
  }

  function episodeLabel(episode) {
    return episode.displayNumber || `Folge ${episode.nr}`;
  }

  function displayDescription(episode) {
    const description = String(episode.beschreibung || '').trim();
    if (!description || /^Stichwort(?:e|suche)?/i.test(description) || /^Metadaten werden/i.test(description)) return '';
    return description;
  }

  function metadataFallback(label = 'Angabe') {
    return `${label} noch nicht verfügbar`;
  }

  let persistTimer = null;
  let persistChain = Promise.resolve();
  let homeRefreshTimer = null;

  // Performance caches: expensive profile/recommendation calculations and rendered tabs
  // are reused until personal data or catalog metadata actually changes.
  let dataRevision = 0;
  let tasteCache = { revision: -1, value: null };
  const featureCache = new Map();
  const recommendationCache = new Map();
  const pageStatus = { home: false, episodes: false, ranking: false, playlists: false, settings: false };
  const pageDirty = { home: true, episodes: true, ranking: true, playlists: true, settings: true };

  function invalidateDerived({ catalog = false } = {}) {
    dataRevision += 1;
    tasteCache = { revision: -1, value: null };
    recommendationCache.clear();
    if (catalog) featureCache.clear();
    pageDirty.home = true;
    pageDirty.ranking = true;
    pageDirty.settings = true;
    pageDirty.playlists = true;
    pageDirty.episodes = true;
  }

  function markRendered(page) {
    pageStatus[page] = true;
    pageDirty[page] = false;
  }

  function queueUserPersist() {
    if (state.tutorialActive) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const snapshot = typeof structuredClone === 'function'
        ? structuredClone(state.user)
        : JSON.parse(JSON.stringify(state.user));
      persistChain = persistChain
        .then(() => dbSet(USER_KEY, snapshot))
        .catch((error) => {
          console.error('Speichern fehlgeschlagen:', error);
          toast('Speichern fehlgeschlagen. Bitte erneut versuchen.');
        });
    }, 80);
  }

  function patchVisibleEpisode(number) {
    const user = userFor(number);
    const card = document.querySelector(`.episode-card[data-open="${number}"]`);
    if (card) {
      card.classList.remove('rating-none', 'rating-minus', 'rating-neutral', 'rating-plus', 'rating-super');
      card.classList.add(`rating-${user.rating || 'none'}`);
      card.querySelectorAll('[data-rate]').forEach((button) => {
        const active = button.dataset.value === user.rating;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const heardButton = card.querySelector('[data-heard]');
      if (heardButton) {
        heardButton.classList.toggle('on', user.heard);
        heardButton.textContent = user.heard ? '✓' : '○';
        heardButton.setAttribute('aria-label', user.heard ? 'Als ungehört markieren' : 'Als gehört markieren');
        heardButton.setAttribute('aria-pressed', String(Boolean(user.heard)));
      }
      const badges = card.querySelectorAll('.badges .badge');
      const statusBadge = badges[badges.length - 1];
      if (statusBadge) {
        statusBadge.textContent = ratingLabel(user.rating);
        statusBadge.classList.remove('match');
      }
    }

    document.querySelectorAll(`.ranking-card[data-open="${number}"] .own-pill`).forEach((pill) => {
      pill.className = `own-pill ${user.rating || ''}`;
      pill.textContent = user.rating ? `${ratingSymbol(user.rating)} ${ratingLabel(user.rating)}` : '';
    });
  }

  function scheduleSecondaryRefresh() {
    clearTimeout(homeRefreshTimer);
    homeRefreshTimer = setTimeout(() => {
      if (state.page === 'home') renderHome();
      if (state.page === 'ranking') renderRanking();
      if (state.page === 'settings') renderSettings();
    }, 180);
  }

  function saveEpisode(number, patch) {
    const old = userFor(number);
    const now = new Date().toISOString();
    const next = { ...old, ...patch, updatedAt: now };

    if (Object.prototype.hasOwnProperty.call(patch, 'rating') && patch.rating) {
      next.heard = true;
      if (!old.heardAt) next.heardAt = now;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'heard')) {
      if (patch.heard && !old.heard) next.heardAt = now;
      if (!patch.heard) next.heardAt = null;
    }

    state.user.episodes[String(number)] = next;
    state.user.updatedAt = now;
    invalidateDerived();

    // Sofortige, optimistische UI-Aktualisierung. IndexedDB läuft danach im Hintergrund.
    patchVisibleEpisode(number);
    if (state.detailNr === number) refreshDetail();
    queueUserPersist();
    scheduleSecondaryRefresh();
  }

  function flushPendingNote() {
    clearTimeout(noteTimer);
    noteTimer = null;
    if (!pendingNote?.number) return;
    const { number, value } = pendingNote;
    pendingNote = null;
    if (userFor(number).note !== value) saveEpisode(number, { note: value });
  }

  function closeConfirmDialog(result = false) {
    const overlay = $('confirmOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve?.(Boolean(result));
    if (lastFocusedElement?.isConnected) lastFocusedElement.focus({ preventScroll: true });
    lastFocusedElement = null;
  }

  function appConfirm({ kicker = 'Bestätigen', title = 'Aktion bestätigen', message = '', confirmText = 'Bestätigen', cancelText = 'Abbrechen', danger = false } = {}) {
    if (!$('confirmOverlay')) return Promise.resolve(false);
    if (confirmResolver) closeConfirmDialog(false);
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    $('confirmKicker').textContent = kicker;
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    $('confirmAccept').textContent = confirmText;
    $('confirmCancel').textContent = cancelText;
    $('confirmAccept').classList.toggle('danger-button', danger);
    $('confirmAccept').classList.toggle('primary-button', !danger);
    $('confirmOverlay').classList.remove('hidden');
    $('confirmOverlay').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('confirmAccept')?.focus({ preventScroll: true }), 0);
    return new Promise((resolve) => { confirmResolver = resolve; });
  }

  function toggleEpisodeRating(number, rating) {
    const current = userFor(number).rating;
    if (current === rating) {
      saveEpisode(number, { rating: null });
      toast('Bewertung entfernt.');
      return;
    }
    saveEpisode(number, { rating });
  }

  function requestUnheard(number) {
    const current = userFor(number);
    if (!current.heard) return;
    if (!current.rating) {
      saveEpisode(number, { heard: false });
      toast('Als ungehört markiert.');
      return;
    }
    state.pendingUnheardNr = Number(number);
    $('heardResetOverlay').classList.remove('hidden');
    $('heardResetOverlay').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('confirmUnheardAndClear')?.focus({ preventScroll: true }), 0);
  }

  function closeHeardReset() {
    $('heardResetOverlay').classList.add('hidden');
    $('heardResetOverlay').setAttribute('aria-hidden', 'true');
    const number = state.pendingUnheardNr;
    state.pendingUnheardNr = null;
    if (state.detailNr) refreshDetail();
    else if (number && state.page === 'episodes') patchVisibleEpisode(Number(number));
  }

  function confirmUnheardAndClear() {
    const number = state.pendingUnheardNr;
    if (!number) return closeHeardReset();
    state.pendingUnheardNr = null;
    $('heardResetOverlay').classList.add('hidden');
    $('heardResetOverlay').setAttribute('aria-hidden', 'true');
    saveEpisode(number, { heard: false, rating: null, heardAt: null });
    toast('Bewertung entfernt und als ungehört markiert.');
  }

  async function resetEpisodeData(number) {
    const accepted = await appConfirm({
      kicker: 'Folgendaten',
      title: 'Persönliche Daten zurücksetzen?',
      message: 'Bewertung, Hörstatus, Datum und Notiz dieser Folge werden gelöscht. Die Folge bleibt in deinen Playlists.',
      confirmText: 'Folgendaten löschen',
      danger: true,
    });
    if (!accepted) return;
    delete state.user.episodes[String(number)];
    state.user.updatedAt = new Date().toISOString();
    invalidateDerived();
    patchVisibleEpisode(number);
    if (state.detailNr === Number(number)) refreshDetail();
    queueUserPersist();
    scheduleSecondaryRefresh();
    toast('Persönliche Folgendaten wurden zurückgesetzt.');
  }

  function episodeFeatures(episode) {
    const key = Number(episode.nr);
    if (featureCache.has(key)) return featureCache.get(key);
    const features = [];
    for (const tag of episode.tags || []) features.push({ key: `tag:${normalizeText(tag)}`, label: tag, type: 'tag' });
    for (const character of importantCharacters(episode, 8)) features.push({ key: `character:${normalizeText(character)}`, label: character, type: 'character' });
    featureCache.set(key, features);
    return features;
  }

  function tasteProfile() {
    if (tasteCache.revision === dataRevision && tasteCache.value) return tasteCache.value;
    const weights = new Map();
    let rated = 0;
    for (const episode of state.catalog) {
      const user = userFor(episode.nr);
      if (!user.rating) continue;
      rated += 1;
      const delta = user.rating === 'super' ? 2 : user.rating === 'plus' ? 1 : user.rating === 'neutral' ? 0 : -1.25;
      for (const feature of episodeFeatures(episode)) {
        const current = weights.get(feature.key) || { ...feature, weight: 0 };
        current.weight += delta;
        weights.set(feature.key, current);
      }
    }
    const value = { weights, rated };
    tasteCache = { revision: dataRevision, value };
    return value;
  }

  function recommendationScore(episode) {
    const cacheKey = Number(episode.nr);
    const cached = recommendationCache.get(cacheKey);
    if (cached?.revision === dataRevision) return cached.value;
    const profile = tasteProfile();
    const matching = [];
    let similarity = 0;
    for (const feature of episodeFeatures(episode)) {
      const profileFeature = profile.weights.get(feature.key);
      if (!profileFeature) continue;
      similarity += profileFeature.weight;
      if (profileFeature.weight > 0) matching.push(profileFeature);
    }
    const featureCount = Math.max(1, episodeFeatures(episode).length);
    similarity /= Math.sqrt(featureCount);
    const rockyBonus = episode.rockyRanking == null ? 0 : Math.max(0, (6 - episode.rockyRanking) / 5) * 1.35;
    const score = similarity + rockyBonus;
    const match = profile.rated
      ? Math.max(18, Math.min(99, Math.round(58 + similarity * 11 + rockyBonus * 10)))
      : Math.max(52, Math.min(88, Math.round(52 + rockyBonus * 22)));
    const reasons = matching
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4)
      .map((item) => item.label);
    if (!reasons.length && episode.rockyRanking != null && episode.rockyRanking <= 2.1) reasons.push('starkes Community-Ranking');
    const value = { score, match, reasons };
    recommendationCache.set(cacheKey, { revision: dataRevision, value });
    return value;
  }

  function timeMatch(episode, mode = state.time) {
    const minutes = episode.durationMin;
    if (mode === 'any') return true;
    if (!minutes) return false;
    if (mode === 'short') return minutes <= 60;
    if (mode === 'normal') return minutes > 60 && minutes <= 90;
    if (mode === 'long') return minutes > 90;
    if (mode === 'special') return isSpecial(episode);
    return true;
  }

  function moodMatch(episode, mood = state.mood) {
    if (mood === 'any') return true;
    const source = episode?._search?.all || episode?.searchText || buildSearchText(episode || {});
    const tags = Array.isArray(episode?.tags) ? episode.tags : [];
    if (mood === 'klassiker') return Number(episode?.nr) <= 40;
    if (mood === 'grusel') return tags.some((tag) => ['Grusel', 'Mystery'].includes(tag));
    if (mood === 'familie') return source.includes('tante mathilda') || source.includes('onkel titus') || source.includes('ben peck') || tags.includes('Familie');
    if (mood === 'skinny') return source.includes('skinny norris');
    if (mood === 'hugenay') return source.includes('hugenay');
    if (mood === 'meer') return tags.includes('Meer & Insel');
    if (mood === 'kunst') return tags.includes('Kunst');
    return true;
  }

  function rockyCompare(a, b) {
    if (a.rockyRanking == null && b.rockyRanking == null) return 0;
    if (a.rockyRanking == null) return 1;
    if (b.rockyRanking == null) return -1;
    return a.rockyRanking - b.rockyRanking;
  }

  function recommendationPool(time = 'any', mood = 'any') {
    return state.catalog
      .map(merged)
      .filter((episode) => !episode.heard && timeMatch(episode, time) && moodMatch(episode, mood))
      .map((episode) => ({ ...episode, ...recommendationScore(episode) }))
      .sort((a, b) => b.score - a.score || rockyCompare(a, b) || a.nr - b.nr);
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function dailyPick() {
    const list = recommendationPool('any', 'any');
    if (!list.length) return null;
    const top = list.slice(0, Math.min(18, list.length));
    const date = new Date().toISOString().slice(0, 10);
    return top[hashString(`${date}:${state.dailyOffset}`) % top.length];
  }

  function weightedPick(list) {
    if (!list.length) return null;
    const top = list.slice(0, Math.min(22, list.length));
    const minimum = Math.min(...top.map((item) => item.score || 0));
    const weights = top.map((item) => Math.max(0.15, (item.score || 0) - minimum + 0.45));
    let random = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < top.length; index += 1) {
      random -= weights[index];
      if (random <= 0) return top[index];
    }
    return top[0];
  }

  function replayPick() {
    const candidates = state.catalog.map(merged).filter((episode) => episode.heard);
    if (!candidates.length) return null;
    const ratingWeight = { super: 4, plus: 2, neutral: 0.4, minus: -2 };
    return candidates
      .map((episode) => {
        const last = new Date(episode.heardAt || episode.updatedAt || 0).getTime();
        const age = Number.isFinite(last) ? Math.min(5, (Date.now() - last) / 86400000 / 75) : 4;
        return { ...episode, replayScore: (ratingWeight[episode.rating] || 0) + age };
      })
      .sort((a, b) => b.replayScore - a.replayScore)[0];
  }

  function showPage(page) {
    flushPendingNote();
    state.page = page;
    document.querySelectorAll('.page').forEach((element) => element.classList.toggle('active', element.dataset.page === page));
    document.querySelectorAll('[data-nav]').forEach((element) => element.classList.toggle('active', element.dataset.nav === page));

    // Keep already rendered tabs alive. Rebuild only after relevant data changed.
    if (!pageStatus[page] || pageDirty[page]) {
      if (page === 'home') renderHome();
      if (page === 'episodes') renderEpisodes();
      if (page === 'ranking') renderRanking();
      if (page === 'playlists') renderPlaylists();
      if (page === 'settings') renderSettings();
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function calculateStats() {
    const stats = { total: state.catalog.length, heard: 0, minutes: 0, super: 0, plus: 0, neutral: 0, minus: 0, rated: 0 };
    const gradeMap = { super: 4, plus: 3, neutral: 2, minus: 1 };
    const rockyGradeMap = { super: 1.2, plus: 2.0, neutral: 3.2, minus: 4.8 };
    let ownTotal = 0;
    const agreements = [];
    for (const episode of state.catalog) {
      const user = userFor(episode.nr);
      if (user.heard) {
        stats.heard += 1;
        stats.minutes += episode.durationMin || 0;
      }
      if (user.rating) {
        stats[user.rating] += 1;
        stats.rated += 1;
        ownTotal += gradeMap[user.rating];
        if (episode.rockyRanking != null) {
          const difference = Math.abs(rockyGradeMap[user.rating] - episode.rockyRanking);
          agreements.push(Math.max(0, 100 - (difference / 4.8) * 100));
        }
      }
    }
    stats.unheard = stats.total - stats.heard;
    stats.average = stats.rated ? ownTotal / stats.rated : null;
    stats.agreement = agreements.length >= 2 ? Math.round(agreements.reduce((sum, value) => sum + value, 0) / agreements.length) : null;
    const profile = tasteProfile();
    stats.favoriteTheme = [...profile.weights.values()]
      .filter((feature) => feature.type === 'tag' && feature.weight > 0)
      .sort((a, b) => b.weight - a.weight)[0]?.label || '—';
    return stats;
  }

  function averageLabel(value) {
    if (value == null) return '';
    if (value >= 3.65) return 'Du bewertest oft mit Super.';
    if (value >= 2.65) return 'Plus ist deine häufigste Tendenz.';
    if (value >= 1.65) return 'Du bewertest eher ausgewogen.';
    return 'Du bist bei Bewertungen ziemlich streng.';
  }

  function recommendationMarkup(episode, options = {}) {
    if (!episode) return '<div class="empty-message">Keine passende Folge gefunden.</div>';
    const result = recommendationScore(episode);
    const reasons = [...result.reasons];
    if (episode.durationMin) reasons.push(fmtDuration(episode.durationMin));
    if (episode.rockyRanking != null) reasons.push(`Rocky ${fmtRocky(episode.rockyRanking)}`);
    const personal = tasteProfile().rated >= 2;
    const kicker = options.kicker || (isSpecial(episode) ? 'Spezial-Empfehlung' : personal ? 'Persönliche Empfehlung' : 'Startempfehlung');
    return `
      <div class="recommendation-top">
        <div>
          <span class="eyebrow">${esc(kicker)}</span>
          <h3>${esc(episodeLabel(episode))} · ${esc(episode.titel)}</h3>
          <p>${personal && result.reasons.length ? 'Passt zu Merkmalen deiner besonders gut bewerteten Folgen.' : 'Ausgewählt anhand von Community-Wertung, Laufzeit und verfügbaren Folgendaten.'}</p>
        </div>
        <div class="match-badge"><strong>${result.match}%</strong><span>${personal ? 'Match' : 'Tipp'}</span></div>
      </div>
      <div class="recommend-reasons">${reasons.slice(0, 6).map((reason) => `<span>${esc(reason)}</span>`).join('')}</div>
      <div class="recommendation-actions">
        ${streamingButtonMarkup(episode, preferredStreamingService(), { primary: true })}
        <button class="secondary-button" data-open="${episode.nr}">Details</button>
      </div>`;
  }

  function renderHome() {
    const stats = calculateStats();
    const percent = stats.total ? Math.round((stats.heard / stats.total) * 100) : 0;
    $('progressRing').style.setProperty('--progress', `${percent * 3.6}deg`);
    $('progressPercent').textContent = `${percent} %`;
    $('progressFraction').textContent = `${stats.heard} / ${stats.total}`;
    $('progressHeadline').textContent = stats.heard ? `${stats.unheard} Fälle sind noch offen` : 'Dein Archiv wartet';
    $('progressText').textContent = averageLabel(stats.average) || 'Bewerte Folgen, damit Empfehlungen immer genauer werden.';
    $('heardHours').textContent = stats.minutes ? `${Math.round(stats.minutes / 60)} Std.` : '—';
    $('favoriteTheme').textContent = stats.favoriteTheme;
    $('rockyAgreement').textContent = stats.agreement == null ? '—' : `${stats.agreement} %`;
    $('superCount').textContent = stats.super;
    $('plusCount').textContent = stats.plus;
    $('neutralCount').textContent = stats.neutral;
    $('minusCount').textContent = stats.minus;

    const today = dailyPick();
    $('todayCard').classList.remove('loading-card');
    $('todayCard').innerHTML = recommendationMarkup(today, { kicker: 'Heute für dich' });

    const recent = state.catalog
      .map(merged)
      .filter((episode) => episode.updatedAt)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5);
    $('recentList').innerHTML = recent.length
      ? recent.map((episode) => `
        <button class="compact-item" data-open="${episode.nr}">
          <span><strong>${esc(episodeLabel(episode))} · ${esc(episode.titel)}</strong><small>${episode.heard ? 'Gehört' : 'Offen'} · ${ratingLabel(episode.rating)}${episode.durationMin ? ` · ${fmtDuration(episode.durationMin)}` : ''}</small></span>
          <span class="compact-rating">${ratingSymbol(episode.rating)}</span>
        </button>`).join('')
      : '<div class="empty-message">Noch keine Aktivität. Eine Bewertung markiert die Folge automatisch als gehört.</div>';
    markRendered('home');
  }

  function expandedSearchTerms(query) {
    const normalized = normalizeText(query);
    const alternatives = [normalized];
    for (const [aliases, replacement] of QUERY_ALIASES) {
      if (aliases.some((alias) => normalized.includes(normalizeText(alias)))) alternatives.push(normalizeText(replacement));
    }
    const tokens = normalized.split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token));
    if (tokens.length) alternatives.push(tokens.join(' '));
    return uniqueStrings(alternatives.map(normalizeText));
  }

  function searchScore(episode, query) {
    if (!query.trim()) return 0;
    const fields = episode._search || buildSearchFields(episode).fields;
    let best = -1;
    for (const term of expandedSearchTerms(query)) {
      if (!term) continue;
      let score = -1;
      if (fields.title.includes(term)) score = Math.max(score, 150);
      if (fields.characters.includes(term)) score = Math.max(score, 130);
      if (fields.hidden.includes(term)) score = Math.max(score, 122);
      if (fields.chapters.includes(term)) score = Math.max(score, 92);
      if (fields.tags.includes(term)) score = Math.max(score, 78);
      if (fields.description.includes(term)) score = Math.max(score, 72);
      if (fields.authors.includes(term)) score = Math.max(score, 60);
      if (fields.all.includes(term)) score = Math.max(score, 45);
      const tokens = term.split(' ').filter(Boolean);
      if (tokens.length && tokens.every((token) => fields.all.includes(token))) score = Math.max(score, 38 + tokens.length * 4);
      best = Math.max(best, score);
    }
    return best;
  }

  function filteredEpisodes() {
    let list = state.catalog.map(merged);
    if (state.filter === 'heard') list = list.filter((episode) => episode.heard);
    if (state.filter === 'unheard') list = list.filter((episode) => !episode.heard);
    if (['super', 'plus', 'neutral', 'minus'].includes(state.filter)) list = list.filter((episode) => episode.rating === state.filter);
    if (state.filter === 'unrated') list = list.filter((episode) => !episode.rating);
    if (state.filter === 'long') list = list.filter((episode) => (episode.durationMin || 0) > 90);
    if (state.filter === 'special') list = list.filter(isSpecial);
    if (state.collectionLabel) list = list.filter((episode) => moodMatch(episode, state.mood));
    if (state.authorFilter !== 'all') list = list.filter((episode) => episode.author === state.authorFilter);
    if (state.eraFilter !== 'all') list = list.filter((episode) => episode.era === state.eraFilter);

    const query = state.search.trim();
    if (query) {
      list = list
        .map((episode) => ({ ...episode, _searchScore: searchScore(episode, query) }))
        .filter((episode) => episode._searchScore >= 0);
    }

    list.sort((a, b) => {
      if (query && b._searchScore !== a._searchScore) return b._searchScore - a._searchScore;
      if (state.sort === 'nr-desc') return b.nr - a.nr;
      if (state.sort === 'title') return a.titel.localeCompare(b.titel, 'de');
      if (state.sort === 'author') return (a.author || 'ZZZ').localeCompare(b.author || 'ZZZ', 'de') || a.nr - b.nr;
      if (state.sort === 'duration-desc') return (b.durationMin || -1) - (a.durationMin || -1);
      if (state.sort === 'duration-asc') return (a.durationMin ?? 9999) - (b.durationMin ?? 9999);
      if (state.sort === 'rocky-best') return rockyCompare(a, b) || a.nr - b.nr;
      if (state.sort === 'rocky-worst') return -rockyCompare(a, b) || a.nr - b.nr;
      if (state.sort === 'recommendation') return recommendationScore(b).score - recommendationScore(a).score || rockyCompare(a, b);
      if (state.sort === 'own') {
        const order = { super: 4, plus: 3, neutral: 2, minus: 1 };
        return (order[b.rating] || 0) - (order[a.rating] || 0) || a.nr - b.nr;
      }
      return a.nr - b.nr;
    });
    return list;
  }

  function episodeCard(episode) {
    const description = displayDescription(episode);
    const result = recommendationScore(episode);
    const showMatch = tasteProfile().rated > 0 && !episode.heard;
    return `
      <article class="episode-card rating-${episode.rating || 'none'}" data-open="${episode.nr}">
        <div class="episode-main">
          <div>
            <span class="episode-number">${esc(episodeLabel(episode).toUpperCase())}</span>
            <h3 class="episode-title"><button type="button" class="episode-title-button" data-open="${episode.nr}">${esc(episode.titel)}</button></h3>
            ${description ? `<p class="episode-description">${esc(description)}</p>` : ''}
          </div>
          <div class="episode-card-actions">
            ${streamingButtonMarkup(episode, preferredStreamingService(), { compact: true })}
            <button class="heard-button ${episode.heard ? 'on' : ''}" data-heard="${episode.nr}" aria-pressed="${episode.heard}" aria-label="${episode.heard ? 'Als ungehört markieren' : 'Als gehört markieren'}">${episode.heard ? '✓' : '○'}</button>
          </div>
        </div>
        <div class="episode-footer">
          <div class="badges">
            <span class="badge">${fmtDuration(episode.durationMin)}</span>
            ${isSpecial(episode) ? '<span class="badge special-badge">✦ Spezial</span>' : ''}
            <span class="badge">Rocky ${fmtRocky(episode.rockyRanking)}</span>
            ${episode.author ? `<span class="badge author-badge">${esc(episode.author)}</span>` : ''}
            ${showMatch ? `<span class="badge match">${result.match}% Match</span>` : `<span class="badge">${ratingLabel(episode.rating)}</span>`}
          </div>
          <div class="rating-mini" aria-label="Eigene Bewertung">
            <button data-rate="${episode.nr}:minus" data-value="minus" class="${episode.rating === 'minus' ? 'active' : ''}" aria-pressed="${episode.rating === 'minus'}" aria-label="Minus">−</button>
            <button data-rate="${episode.nr}:neutral" data-value="neutral" class="${episode.rating === 'neutral' ? 'active' : ''}" aria-pressed="${episode.rating === 'neutral'}" aria-label="Neutral">●</button>
            <button data-rate="${episode.nr}:plus" data-value="plus" class="${episode.rating === 'plus' ? 'active' : ''}" aria-pressed="${episode.rating === 'plus'}" aria-label="Plus">＋</button>
            <button data-rate="${episode.nr}:super" data-value="super" class="${episode.rating === 'super' ? 'active' : ''}" aria-pressed="${episode.rating === 'super'}" aria-label="Super">★</button>
          </div>
        </div>
      </article>`;
  }

  function renderEpisodes() {
    const list = filteredEpisodes();
    $('episodeResultCount').textContent = `${list.length} ${list.length === 1 ? 'Folge' : 'Folgen'}`;
    $('clearSearch').classList.toggle('hidden', !state.search);
    $('activeCollection').classList.toggle('hidden', !state.collectionLabel);
    if (state.collectionLabel) {
      $('activeCollection').innerHTML = `<span>Sammlung: <strong>${esc(state.collectionLabel)}</strong></span><button id="clearCollection" type="button">Aufheben</button>`;
    }
    $('episodeList').innerHTML = list.length ? list.map(episodeCard).join('') : '<div class="empty-message">Keine Folge passt zu dieser Suche oder diesem Filter.</div>';
    markRendered('episodes');
  }

  function ratingPill(rating) {
    if (!rating) return '';
    return `<em class="own-pill ${rating}">${ratingSymbol(rating)} ${ratingLabel(rating)}</em>`;
  }

  function rankingCard(episode, position, mode) {
    const result = recommendationScore(episode);
    let mainValue;
    let label;
    if (mode === 'rocky') {
      mainValue = fmtRocky(episode.rockyRanking);
      label = 'Rocky';
    } else if (mode === 'match') {
      mainValue = `${result.match}%`;
      label = tasteProfile().rated >= 2 ? 'Match' : 'Tipp';
    } else {
      mainValue = ratingSymbol(episode.rating);
      label = ratingLabel(episode.rating);
    }
    const details = [fmtDuration(episode.durationMin), importantCharacters(episode, 2).join(' · ')].filter((item) => item && item !== '—').join(' · ');
    return `
      <button class="ranking-card" data-open="${episode.nr}">
        <span class="rank-position">${position}</span>
        <span class="rank-main"><strong>${esc(episodeLabel(episode))} · ${esc(episode.titel)}</strong><small>${esc(details || 'Keine Zusatzdaten')}</small></span>
        <span class="rank-side"><strong>${esc(mainValue)}</strong><small>${esc(label)}</small>${mode !== 'mine' ? ratingPill(episode.rating) : ''}</span>
      </button>`;
  }

  function renderRanking() {
    const info = $('rankingInfo');
    const list = $('rankingList');
    if (state.ranking === 'rocky') {
      const ranked = state.catalog.map(merged).filter((episode) => episode.rockyRanking != null).sort(rockyCompare);
      info.innerHTML = `<strong>${ranked.length}</strong> Folgen besitzen eine Rocky-Beach-Community-Wertung. Kleinere Werte sind besser; Folge 29 „Die Originalmusik“ wird dort nicht geführt.`;
      list.innerHTML = ranked.map((episode, index) => rankingCard(episode, index + 1, 'rocky')).join('');
      markRendered('ranking');
      return;
    }
    if (state.ranking === 'match') {
      const ranked = recommendationPool('any', 'any');
      const personal = tasteProfile().rated >= 2;
      info.innerHTML = `<strong>${ranked.length}</strong> ungehörte Folgen, ${personal ? 'sortiert nach deinem Profil' : 'als allgemeine Startempfehlungen sortiert'}. Super-Folgen zählen doppelt. Angezeigt werden die 100 passendsten.`;
      list.innerHTML = ranked.slice(0, 100).map((episode, index) => rankingCard(episode, index + 1, 'match')).join('') || '<div class="empty-message">Du hast alle Folgen gehört.</div>';
      markRendered('ranking');
      return;
    }
    const groups = [
      ['super', '★ Super'], ['plus', 'Plus'], ['neutral', 'Neutral'], ['minus', 'Minus'],
    ];
    const parts = [];
    let total = 0;
    for (const [rating, label] of groups) {
      const episodes = state.catalog.map(merged).filter((episode) => episode.rating === rating).sort(rockyCompare);
      if (!episodes.length) continue;
      total += episodes.length;
      parts.push(`<div class="ranking-group-title"><h3>${label}</h3><span>${episodes.length} Folgen</span></div>`);
      parts.push(episodes.map((episode, index) => rankingCard(episode, index + 1, 'mine')).join(''));
    }
    info.innerHTML = `<strong>${total}</strong> Folgen hast du bewertet. Innerhalb jeder Stufe sortiert das Community-Ranking.`;
    list.innerHTML = parts.join('') || '<div class="empty-message">Noch keine eigenen Bewertungen vorhanden.</div>';
    markRendered('ranking');
  }

  function playlistById(id) {
    return (state.user.playlists || []).find((playlist) => playlist.id === id) || null;
  }

  function episodesForNumbers(numbers = []) {
    const map = new Map(state.catalog.map((episode) => [episode.nr, merged(episode)]));
    return numbers.map((number) => map.get(Number(number))).filter(Boolean);
  }

  function playlistDuration(numbers = []) {
    return episodesForNumbers(numbers).reduce((sum, episode) => sum + (episode.durationMin || 0), 0);
  }

  function curatedEpisodes(definition) {
    let list = state.catalog.map(merged);
    if (definition.type === 'numbers') return episodesForNumbers(definition.numbers);
    if (definition.type === 'range') return list.filter((episode) => episode.nr >= definition.from && episode.nr <= definition.to).sort((a,b)=>a.nr-b.nr);
    if (definition.type === 'author') list = list.filter((episode) => episode.author === definition.author);
    if (definition.type === 'theme') list = list.filter((episode) => moodMatch(episode, definition.mood));
    if (definition.type === 'keywords') {
      list = list.filter((episode) => {
        const haystack = episode.searchText || buildSearchText(episode);
        return definition.keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
      });
    }
    list.sort((a,b) => recommendationScore(b).score - recommendationScore(a).score || rockyCompare(a,b));
    return definition.max ? list.slice(0, definition.max) : list;
  }


function playlistCardMarkup(playlist) {
  const duration = playlistDuration(playlist.episodeNumbers);
  const tutorialCreated = state.tutorialActive && state.tutorialPlaylistId === playlist.id;
  return `<button type="button" class="playlist-card personal${tutorialCreated ? ' tutorial-created-playlist' : ''}" ${tutorialCreated ? 'id="tutorialCreatedPlaylist"' : ''} data-playlist-open="${esc(playlist.id)}" aria-label="Playlist ${esc(playlist.title)} öffnen">
    <span class="playlist-category-label">Meine Liste</span>
    <div class="playlist-card-head"><div><h3>${esc(playlist.title)}</h3><p>${esc(playlist.description || 'Eigene Playlist')}</p></div><span class="playlist-icon">☰</span></div>
    <div class="playlist-meta"><span>${playlist.episodeNumbers.length} Folgen</span><span>${fmtDuration(duration)}</span>${playlist.smartMeta ? '<span>Smart</span>' : ''}</div>
  </button>`;
}

function curatedCardMarkup(definition) {
  let episodes = [];
  try { episodes = curatedEpisodes(definition); } catch (error) { console.warn('Kuratierte Liste konnte nicht berechnet werden:', definition.id, error); }
  const category = playlistCategory(definition);
  const label = category === 'essential' ? 'Essential' : 'Thema';
  return `<button class="curated-card ${category} ${definition.sequence ? 'sequence' : ''}" data-curated-open="${definition.id}">
    <span class="playlist-category-label">${label}</span>
    <div class="curated-card-head"><div><h3>${esc(definition.title)}</h3><p>${esc(definition.description)}</p></div><span class="playlist-icon">${definition.icon}</span></div>
    <div class="playlist-meta"><span>${episodes.length} Folgen</span><span>${fmtDuration(episodes.reduce((sum,e)=>sum+(e.durationMin||0),0))}</span>${definition.sequence ? '<span>Reihenfolge</span>' : ''}</div>
  </button>`;
}

function setPlaylistTab(tab, { persist = true } = {}) {
  const selected = ['essentials','themes','mine'].includes(tab) ? tab : 'essentials';
  state.playlistTab = selected;
  document.querySelectorAll('[data-playlist-tab]').forEach((button) => {
    const active = button.dataset.playlistTab === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('essentialPlaylists').classList.toggle('hidden', selected !== 'essentials');
  $('themePlaylists').classList.toggle('hidden', selected !== 'themes');
  $('userPlaylists').classList.toggle('hidden', selected !== 'mine');
  const intro = {
    essentials: 'Gold markierte Sammlungen sind besonders wichtige Klassiker, Chronologien und saisonale Empfehlungen.',
    themes: 'Stöbere nach Figuren, Autoren, Sport, Meer und weiteren Motiven.',
    mine: 'Deine frei benannten und gespeicherten Smart-Playlists. Sie bleiben nur auf diesem Gerät.',
  }[selected];
  $('playlistTabIntro').textContent = intro;
  if (persist) {
    state.user.settings = { ...(state.user.settings || {}), playlistTab: selected };
    state.user.updatedAt = new Date().toISOString();
    queueUserPersist();
  }
}

function renderPlaylists() {
  const playlists = state.user.playlists || [];
  $('userPlaylists').innerHTML = playlists.length
    ? playlists.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).map(playlistCardMarkup).join('')
    : '<div class="empty-playlists">Noch keine eigene Playlist. Erstelle eine freie Liste oder speichere einen Smart-Plan.</div>';
  const essentialOrder = ['classics','hugenay','jubilaeum','feuriges-auge','taipan','halloween','winter'];
  const essentials = CURATED_PLAYLISTS.filter((definition) => playlistCategory(definition) === 'essential').sort((a,b)=>essentialOrder.indexOf(a.id)-essentialOrder.indexOf(b.id));
  const themes = CURATED_PLAYLISTS.filter((definition) => playlistCategory(definition) === 'theme');
  $('essentialPlaylists').innerHTML = essentials.map(curatedCardMarkup).join('');
  $('themePlaylists').innerHTML = themes.map(curatedCardMarkup).join('');
  setPlaylistTab(state.playlistTab || state.user.settings?.playlistTab || 'essentials', { persist: false });
  markRendered('playlists');
}


  function persistPlaylists(message = '') {
    state.user.updatedAt = new Date().toISOString();
    pageDirty.playlists = true;
    pageDirty.settings = true;
    queueUserPersist();
    if (state.page === 'playlists') renderPlaylists();
    if (message && !state.tutorialActive) toast(message);
  }

  function openPlaylistEditor(id = null, seedNr = null) {
    const playlist = id ? playlistById(id) : null;
    state.playlistEditorId = playlist?.id || null;
    state.playlistEditorSeedNr = seedNr ? Number(seedNr) : null;
    $('playlistEditorTitle').textContent = playlist ? 'Playlist bearbeiten' : 'Neue Playlist';
    $('playlistNameInput').value = playlist?.title || '';
    $('playlistDescriptionInput').value = playlist?.description || '';
    $('playlistEditorOverlay').classList.remove('hidden');
    $('playlistEditorOverlay').setAttribute('aria-hidden','false');
    setTimeout(()=>$('playlistNameInput').focus(),80);
  }

  function closePlaylistEditor() {
    $('playlistEditorOverlay').classList.add('hidden');
    $('playlistEditorOverlay').setAttribute('aria-hidden','true');
    state.playlistEditorId = null;
    state.playlistEditorSeedNr = null;
  }

  function savePlaylistEditor() {
    const title = $('playlistNameInput').value.trim();
    if (title.length < 3) { toast('Bitte gib der Playlist einen Namen mit mindestens drei Zeichen.'); $('playlistNameInput').focus(); return; }
    const description = $('playlistDescriptionInput').value.trim();
    const existing = state.playlistEditorId ? playlistById(state.playlistEditorId) : null;
    if (existing) {
      existing.title = title.slice(0,60); existing.description = description.slice(0,300); existing.updatedAt = new Date().toISOString();
    } else {
      const created = normalizePlaylist({ title, description, episodeNumbers: state.playlistEditorSeedNr ? [state.playlistEditorSeedNr] : [] });
      state.user.playlists.push(created);
      if (state.tutorialActive) state.tutorialPlaylistId = created.id;
    }
    closePlaylistEditor(); closePlaylistPicker();
    state.playlistTab = 'mine';
    state.user.settings = { ...(state.user.settings || {}), playlistTab: 'mine' };
    persistPlaylists(existing ? 'Playlist aktualisiert.' : 'Playlist erstellt.');
  }

  function openPlaylistPicker(number) {
    state.playlistPickerNr = Number(number);
    const episode = state.catalog.find((item)=>item.nr===state.playlistPickerNr);
    $('playlistPickerTitle').textContent = episode ? `„${episode.titel}“ merken` : 'Zu Playlist hinzufügen';
    const playlists = state.user.playlists || [];
    $('playlistPickerList').innerHTML = playlists.length ? playlists.map((playlist)=>{
      const added = playlist.episodeNumbers.includes(state.playlistPickerNr);
      return `<button class="picker-row ${added?'added':''}" data-picker-playlist="${esc(playlist.id)}"><span><strong>${esc(playlist.title)}</strong><small>${playlist.episodeNumbers.length} Folgen</small></span><b>${added?'✓':'＋'}</b></button>`;
    }).join('') : '<div class="empty-playlists">Erstelle zuerst eine Playlist.</div>';
    $('playlistPickerOverlay').classList.remove('hidden'); $('playlistPickerOverlay').setAttribute('aria-hidden','false');
    setTimeout(() => ($('playlistPickerList').querySelector('button') || $('pickerNewPlaylist'))?.focus({ preventScroll: true }), 0);
  }

  function closePlaylistPicker() { $('playlistPickerOverlay').classList.add('hidden'); $('playlistPickerOverlay').setAttribute('aria-hidden','true'); state.playlistPickerNr=null; }

  function toggleEpisodeInPlaylist(id, number) {
    const playlist=playlistById(id); if(!playlist) return;
    const index=playlist.episodeNumbers.indexOf(number);
    if(index>=0) playlist.episodeNumbers.splice(index,1); else playlist.episodeNumbers.push(number);
    playlist.updatedAt=new Date().toISOString(); persistPlaylists(index>=0?'Aus Playlist entfernt.':'Zur Playlist hinzugefügt.'); openPlaylistPicker(number);
  }

  function playlistStats(episodes) {
    const heard=episodes.filter(e=>e.heard).length;
    return { duration: episodes.reduce((s,e)=>s+(e.durationMin||0),0), heard };
  }

  function playlistAddResultMarkup(episode, playlist) {
    const meta = [fmtDuration(episode.durationMin), episode.heard ? 'gehört' : 'offen', episode.rating ? ratingLabel(episode.rating) : '', episode.rockyRanking != null ? `Rocky ${Number(episode.rockyRanking).toFixed(2)}` : ''].filter(Boolean).join(' · ');
    return `<div class="playlist-add-row" data-add-row="${episode.nr}"><button class="playlist-add-info" data-open="${episode.nr}"><strong>${esc(episodeLabel(episode))} · ${esc(episode.titel)}</strong><small>${esc(meta)}</small><span>Beschreibung ansehen</span></button><button class="playlist-add-confirm" data-playlist-quick-add="${playlist.id}:${episode.nr}" aria-label="Zur Playlist hinzufügen">＋</button></div>`;
  }

  function showPlaylistInlineStatus(message, tone = 'success') {
    if (state.tutorialActive) return;
    const node = $('playlistInlineStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `playlist-inline-status ${tone}`;
    node.classList.remove('hidden');
    clearTimeout(state.playlistInlineTimer);
    state.playlistInlineTimer = setTimeout(() => node.classList.add('hidden'), 2600);
  }

  function pulsePlaylistCard(id) {
    if (state.tutorialActive) return;
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-playlist-open="${CSS.escape(String(id))}"]`);
      if (!card) return;
      card.classList.remove('just-saved');
      void card.offsetWidth;
      card.classList.add('just-saved');
      setTimeout(() => card.classList.remove('just-saved'), 1700);
    });
  }

  function refreshOpenPlaylist(options = {}) {
    const id = state.playlistDetailId;
    if (!id || id.startsWith('curated:')) return;
    const query = $('playlistAddSearch')?.value || '';
    const panelWasOpen = !$('playlistAddPanel')?.classList.contains('hidden');
    openPlaylistDetail(id, false, { keepAddPanel: options.keepAddPanel ?? panelWasOpen, query });
    if (options.message) showPlaylistInlineStatus(options.message, options.tone || 'success');
  }

  function renderPlaylistAddResults(query = '') {
    const id = state.playlistDetailId;
    if (!id || id.startsWith('curated:')) return;
    const playlist = playlistById(id); if (!playlist) return;
    const q = normalizeText(query);
    const results = state.catalog.map(merged).filter((episode) => !playlist.episodeNumbers.includes(episode.nr)).filter((episode) => {
      if (!q) return true;
      const hay = normalizeText([episode.nr, episode.titel, displayDescription(episode), ...(episode.tags || []), ...(episode.characters || []), ...(episode.keywords || [])].join(' '));
      return hay.includes(q);
    }).slice(0, 40);
    $('playlistAddResults').innerHTML = results.length ? results.map((episode) => playlistAddResultMarkup(episode, playlist)).join('') : '<div class="empty-playlists">Keine passende Folge gefunden.</div>';
  }

  const PLAYLIST_SIGNAL_STOP = new Set(['verbrechen', 'abenteuer', 'mystery']);

  function playlistSignalCharacters(episode) {
    return importantCharacters(episode, 12).filter((name) => {
      const normalized = normalizeText(name);
      return normalized && !MAIN_ROLE_PATTERNS.some((pattern) => normalized.includes(normalizeText(pattern)));
    });
  }

  function playlistCommonSignals(episodes) {
    const count = (items) => {
      const map = new Map();
      items.flat().filter(Boolean).forEach((value) => map.set(value, (map.get(value) || 0) + 1));
      return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'de'));
    };
    const minimum = episodes.length > 1 ? 2 : 1;
    const tags = count(episodes.map((episode) => (episode.tags || []).filter((tag) => !PLAYLIST_SIGNAL_STOP.has(normalizeText(tag)))))
      .filter(([, amount]) => amount >= minimum);
    const chars = count(episodes.map(playlistSignalCharacters)).filter(([, amount]) => amount >= minimum);
    return { tags: tags.slice(0, 4).map(([value]) => value), chars: chars.slice(0, 3).map(([value]) => value) };
  }

  function playlistSuggestionScore(candidate, playlistEpisodes, mode='similar') {
    if (!playlistEpisodes.length) return -999;
    const existing = new Set(playlistEpisodes.map((e)=>e.nr)); if (existing.has(candidate.nr)) return -999;
    let score = recommendationScore(candidate).score * .35;
    const tags = new Set(candidate.tags || []), chars = new Set(playlistSignalCharacters(candidate));
    const signals = playlistCommonSignals(playlistEpisodes);
    score += signals.tags.filter((x)=>tags.has(x)).length * 4;
    score += signals.chars.filter((x)=>chars.has(x)).length * 5;
    for (const source of playlistEpisodes) {
      score += (source.tags || []).filter((x)=>tags.has(x)).length * .7;
      score += playlistSignalCharacters(source).filter((x)=>chars.has(x)).length * 1.1;
    }
    const block = STORY_BLOCKS.find((b)=>b.numbers.includes(candidate.nr) && b.numbers.some((nr)=>existing.has(nr)));
    if (block) score += 18;
    if (mode === 'variety') {
      const overlap = playlistEpisodes.reduce((sum,e)=>sum+(e.tags||[]).filter((x)=>tags.has(x)).length,0);
      score += Math.max(0,7-overlap);
    }
    if (!candidate.heard) score += 1.5;
    return score;
  }

  function playlistSuggestionReason(candidate, playlistEpisodes) {
    const existing = new Set(playlistEpisodes.map((e)=>e.nr));
    const block = STORY_BLOCKS.find((b)=>b.numbers.includes(candidate.nr) && b.numbers.some((nr)=>existing.has(nr)));
    if (block) return `gehört zur Reihenfolge „${block.title}“`;
    const signals = playlistCommonSignals(playlistEpisodes);
    const sharedTags = signals.tags.filter((x)=>(candidate.tags||[]).includes(x));
    const sharedChars = signals.chars.filter((x)=>playlistSignalCharacters(candidate).includes(x));
    if (sharedChars.length) return `gleiche Figur: ${sharedChars[0]}`;
    if (sharedTags.length) return `passt zu ${sharedTags.slice(0,2).join(' · ')}`;
    return candidate.heard ? 'passt zu deinem bisherigen Geschmack' : 'passende ungehörte Ergänzung';
  }

  function renderPlaylistSuggestions() {
    const id = state.playlistDetailId;
    const section = $('playlistSuggestionsSection');
    if (!id || id.startsWith('curated:')) { section.classList.add('hidden'); return; }
    const playlist = playlistById(id); if (!playlist || !playlist.episodeNumbers.length) { section.classList.add('hidden'); return; }
    const episodes = episodesForNumbers(playlist.episodeNumbers);
    const candidates = state.catalog.map(merged).map((episode)=>({episode,score:playlistSuggestionScore(episode,episodes,state.playlistSuggestionMode)})).filter((x)=>x.score>-100).sort((a,b)=>b.score-a.score);
    const start = state.playlistSuggestionOffset % Math.max(1,Math.min(12,candidates.length));
    const selected = candidates.slice(start,start+8).concat(start+8>candidates.length?candidates.slice(0,(start+8)-candidates.length):[]).slice(0,8);
    const signals = playlistCommonSignals(episodes);
    $('playlistSuggestionSummary').textContent = signals.tags.length || signals.chars.length ? `Erkannt: ${[...signals.tags,...signals.chars].slice(0,5).join(' · ')}` : 'Vorschläge aus Stimmung, Figuren, Reihenfolgen und deinem Geschmack.';
    $('playlistSuggestionMode').textContent = state.playlistSuggestionMode==='similar'?'Ähnlich':'Abwechslung';
    $('playlistSuggestions').innerHTML = selected.map(({episode,score})=>{
      const reason=playlistSuggestionReason(episode,episodes); const block=reason.startsWith('gehört zur Reihenfolge');
      const meta=[fmtDuration(episode.durationMin),episode.heard?'gehört':'offen',episode.rating?ratingLabel(episode.rating):'',episode.rockyRanking!=null?`Rocky ${Number(episode.rockyRanking).toFixed(2)}`:''].filter(Boolean).join(' · ');
      const match = Math.max(52, Math.min(95, Math.round(55 + score * 1.35)));
      return `<div class="playlist-suggestion-row ${block?'story-link':''}"><button class="playlist-suggestion-main" data-open="${episode.nr}"><strong>${esc(episodeLabel(episode))} · ${esc(episode.titel)} <span class="match-pill">${match}%</span></strong><small>${esc(meta)}<br>${esc(reason)}</small></button><button class="playlist-suggestion-detail" data-open="${episode.nr}" aria-label="Details">i</button><button class="playlist-suggestion-add" data-playlist-suggest-add="${id}:${episode.nr}" aria-label="Hinzufügen">＋</button></div>`;
    }).join('');
    section.classList.remove('hidden');
  }

  function openPlaylistDetail(id, curated=false, options={}) {
    let title,description,episodes,editable=false,kicker='Playlist';
    if(curated){ const def=CURATED_PLAYLISTS.find(x=>x.id===id); if(!def)return; title=def.title;description=def.description;episodes=curatedEpisodes(def);kicker=def.sequence?'Kuratierte Reihenfolge':'Kuratierte Sammlung'; }
    else { const pl=playlistById(id);if(!pl)return;title=pl.title;description=pl.description;episodes=episodesForNumbers(pl.episodeNumbers);editable=true;kicker=pl.smartMeta?'Smart Playlist':'Eigene Playlist'; }
    state.playlistDetailId=curated?`curated:${id}`:id;
    $('playlistDetailKicker').textContent=kicker; $('playlistDetailTitle').textContent=title; $('playlistDetailDescription').textContent=description||'Keine Beschreibung';
    const stats=playlistStats(episodes); $('playlistDetailStats').innerHTML=`<span>${episodes.length} Folgen</span><span>${fmtDuration(stats.duration)}</span><span>${stats.heard} gehört</span>`;
    $('playlistEditButton').classList.toggle('hidden',!editable); $('playlistDeleteButton').classList.toggle('hidden',!editable); $('playlistAddEpisodeButton').classList.toggle('hidden',!editable); if (!options.keepAddPanel) $('playlistAddPanel').classList.add('hidden');
    $('playlistPlayFirst').disabled=!episodes.length;
    $('playlistEpisodeList').innerHTML=episodes.length?episodes.map((episode,index)=>`<div class="playlist-episode" data-playlist-episode="${episode.nr}"><span class="playlist-index">${index+1}</span><button class="rank-main playlist-episode-main" data-open="${episode.nr}"><strong>${esc(episodeLabel(episode))} · ${esc(episode.titel)}</strong><small>${fmtDuration(episode.durationMin)} · ${episode.heard?'gehört':'offen'} · Details ansehen</small></button><button class="playlist-row-info" data-open="${episode.nr}" aria-label="Vollständige Beschreibung">i</button>${editable?`<span class="playlist-row-actions"><button data-playlist-move="${id}:${index}:-1" aria-label="Nach oben verschieben" ${index === 0 ? 'disabled' : ''}>↑</button><button data-playlist-move="${id}:${index}:1" aria-label="Nach unten verschieben" ${index === episodes.length - 1 ? 'disabled' : ''}>↓</button><button data-playlist-remove="${id}:${episode.nr}" aria-label="Aus Playlist entfernen">×</button></span>`:''}</div>`).join(''):'<div class="empty-playlists">Diese Liste enthält noch keine Folgen.</div>';
    if (options.keepAddPanel && editable) {
      $('playlistAddPanel').classList.remove('hidden');
      if ($('playlistAddSearch')) $('playlistAddSearch').value = options.query || '';
      renderPlaylistAddResults(options.query || '');
    }
    renderPlaylistSuggestions();
    $('playlistDetailOverlay').classList.remove('hidden'); $('playlistDetailOverlay').setAttribute('aria-hidden','false');
    setTimeout(() => $('closePlaylistDetail')?.focus({ preventScroll: true }), 0);
  }

  function closePlaylistDetail(){ $('playlistDetailOverlay').classList.add('hidden');$('playlistDetailOverlay').setAttribute('aria-hidden','true');$('playlistAddPanel').classList.add('hidden');state.playlistDetailId=null; }

  function currentPlaylistEpisodes(){
    if(!state.playlistDetailId)return[];
    if(state.playlistDetailId.startsWith('curated:')){const def=CURATED_PLAYLISTS.find(x=>x.id===state.playlistDetailId.slice(8));return def?curatedEpisodes(def):[];}
    const pl=playlistById(state.playlistDetailId);return pl?episodesForNumbers(pl.episodeNumbers):[];
  }

  function candidateScoreForPlan(episode,mood,status,author='all'){
    if(status==='unheard'&&episode.heard)return -999;
    if(status==='heard'&&!episode.heard)return -999;
    if(author!=='all' && episode.author!==author)return -999;
    let score=recommendationScore(episode).score;
    if(mood!=='any') score += moodMatch(episode,mood)?5:-5;
    if(status==='mixed') score += episode.heard?(episode.rating==='super'?2:episode.rating==='plus'?1:-1):2;
    return score;
  }

  function buildSmartPlan(target,mood,status,continuity,author='all'){
    const all=state.catalog.map(merged).filter(e=>e.durationMin&&candidateScoreForPlan(e,mood,status,author)>-100);
    const used=new Set(); const units=[];
    if(continuity){
      for(const block of STORY_BLOCKS){const eps=episodesForNumbers(block.numbers).filter(e=>all.some(a=>a.nr===e.nr));if(eps.length===block.numbers.length&&eps.length>1){eps.forEach(e=>used.add(e.nr));units.push({episodes:eps,duration:eps.reduce((s,e)=>s+e.durationMin,0),score:eps.reduce((s,e)=>s+candidateScoreForPlan(e,mood,status,author),0)+3,title:block.title});}}
    }
    for(const episode of all){if(!used.has(episode.nr))units.push({episodes:[episode],duration:episode.durationMin,score:candidateScoreForPlan(episode,mood,status,author),title:episode.titel});}
    let best=[];let bestMetric=Infinity;
    for(let run=0;run<450;run++){
      const shuffled=units.slice().sort((a,b)=>(b.score+Math.random()*8)-(a.score+Math.random()*8));let chosen=[];let total=0;
      for(const unit of shuffled){if(total+unit.duration<=target+18 && (Math.random()<.72 || total<target*.55)){chosen.push(unit);total+=unit.duration;if(total>=target-8)break;}}
      const metric=Math.abs(target-total)-chosen.reduce((s,u)=>s+Math.max(0,u.score),0)*.025;
      if(metric<bestMetric){bestMetric=metric;best=chosen;}
    }
    const episodes=best.flatMap(unit=>unit.episodes);return {episodes,duration:episodes.reduce((s,e)=>s+e.durationMin,0)};
  }

  function smartPlanReason(episode, index, episodes, plan) {
    const reasons = [];
    const previous = episodes[index - 1];
    const block = STORY_BLOCKS.find((item) => item.numbers.includes(episode.nr));
    if (plan.continuity && block) {
      const included = block.numbers.filter((nr) => episodes.some((item) => item.nr === nr));
      if (included.length > 1) reasons.push(`Teil der Reihenfolge „${block.title}“`);
    }
    if (previous) {
      const shared = (episode.tags || []).filter((tag) => (previous.tags || []).includes(tag)).slice(0, 2);
      if (shared.length) reasons.push(`passt thematisch zu „${previous.titel}“ (${shared.join(' · ')})`);
    }
    if (!episode.heard) reasons.push('noch nicht gehört');
    else if (episode.rating === 'super') reasons.push('eine deiner Super-Folgen');
    else if (episode.rating === 'plus') reasons.push('von dir positiv bewertet');
    if (plan.mood !== 'any') reasons.push(`passt zur Stimmung „${moodLabel(plan.mood)}“`);
    if (!reasons.length) reasons.push('gute Mischung aus Laufzeit, Bewertung und Abwechslung');
    return reasons.slice(0, 2).join(' · ');
  }

  function smartPlanEpisodeMarkup(episode, index, episodes, plan) {
    const description = displayDescription(episode) || 'Keine Kurzbeschreibung vorhanden.';
    const reason = smartPlanReason(episode, index, episodes, plan);
    return `<article class="plan-episode-card">
      <div class="plan-episode-number">${index + 1}</div>
      <div class="plan-episode-copy">
        <div class="plan-episode-title"><strong>${esc(episodeLabel(episode) + ' · ' + episode.titel)}</strong><span>${fmtDuration(episode.durationMin)}</span></div>
        <p>${esc(description)}</p>
        <small><b>Warum dabei:</b> ${esc(reason)}</small>
      </div>
    </article>`;
  }

  function generatePlan(){
    const target=Math.max(30,Math.min(720,(Number($('planHours').value)||0)*60+(Number($('planMinutes').value)||0)));
    const mood=$('planMood').value,status=$('planStatus').value,continuity=$('planContinuity').checked,author=$('planAuthor')?.value||'all';
    const result=buildSmartPlan(target,mood,status,continuity,author); state.generatedPlan={...result,target,mood,status,continuity,author,title:$('planName').value.trim()||'Smart Playlist'};
    $('planSavedStatus')?.classList.add('hidden');
    $('planPreview').classList.remove('hidden');
    $('planPreview').innerHTML=`<div class="plan-preview-head"><div><h3>${esc(state.generatedPlan.title)}</h3><p>${result.episodes.length} Folgen · ${fmtDuration(result.duration)} von gewünschten ${fmtDuration(target)}</p></div><strong>${Math.abs(target-result.duration)<=15?'Sehr passend':`${Math.abs(target-result.duration)} Min. Abweichung`}</strong></div><div class="plan-preview-list detailed">${result.episodes.map((episode,index)=>smartPlanEpisodeMarkup(episode,index,result.episodes,state.generatedPlan)).join('')}</div><div class="plan-preview-actions"><button id="saveGeneratedPlan" class="primary-button">Playlist speichern</button><button id="regeneratePlan" class="subtle-button">Neu mischen</button></div>`;
  }

  function saveGeneratedPlan(){
    const plan=state.generatedPlan;if(!plan||!plan.episodes.length)return;
    state.user.playlists.push(normalizePlaylist({title:plan.title,description:`Automatisch geplant: ${fmtDuration(plan.target)} · ${moodLabel(plan.mood)} · ${plan.status==='unheard'?'nur ungehört':plan.status==='heard'?'nur bekannt':'gemischt'}`,episodeNumbers:plan.episodes.map(e=>e.nr),smartMeta:{target:plan.target,mood:plan.mood,status:plan.status,continuity:plan.continuity}}));
    const savedTitle = plan.title;
    const savedPlaylist = state.user.playlists[state.user.playlists.length - 1];
    if (state.tutorialActive) state.tutorialSmartPlaylistId = savedPlaylist?.id || null;
    state.playlistTab = 'mine';
    state.user.settings = { ...(state.user.settings || {}), playlistTab: 'mine' };
    persistPlaylists('Smart Playlist gespeichert.');
    $('planPreview').classList.add('hidden');
    $('planPreview').innerHTML='';
    state.generatedPlan=null;
    $('planName').value = 'Autofahrt';
    $('planHours').value = '5';
    $('planMinutes').value = '0';
    $('planMood').value = 'any';
    $('planStatus').value = 'mixed';
    if ($('planAuthor')) $('planAuthor').value = 'all';
    $('planContinuity').checked = true;
    const status=$('planSavedStatus');
    if(status){
      clearTimeout(state.planSavedTimer);
      if (state.tutorialActive) {
        status.classList.add('hidden');
        status.innerHTML = '';
      } else {
        status.innerHTML=`<span>✓</span><div><strong>„${esc(savedTitle)}“ gespeichert</strong><small>Die Playlist findest du jetzt direkt unter „Meine Playlists“.</small></div>`;
        status.classList.remove('hidden');
        status.scrollIntoView({behavior:'smooth',block:'nearest'});
        setTimeout(() => {
          pulsePlaylistCard(savedPlaylist.id);
          document.querySelector('[data-playlist-open="' + savedPlaylist.id + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
        state.planSavedTimer=setTimeout(()=>status.classList.add('hidden'),5000);
      }
    }
  }



function tutorialCreatedPlaylistCard() {
  const exact = document.getElementById('tutorialCreatedPlaylist');
  if (exact?.isConnected && exact.getClientRects().length) return exact;
  const wantedId = String(state.tutorialPlaylistId || '');
  const cards = [...document.querySelectorAll('#userPlaylists .playlist-card[data-playlist-open]')]
    .filter((card) => card.isConnected && card.getClientRects().length);
  if (!cards.length) return null;
  return cards.find((card) => String(card.dataset.playlistOpen || '') === wantedId) || cards[0];
}

const TUTORIAL_STEPS = [
  {
    id: 'go-episodes',
    contextPage: 'home',
    focus: '[data-nav="episodes"]',
    actionTarget: '[data-nav="episodes"]',
    card: 'top',
    title: 'Folgen finden',
    text: 'Im Folgenbereich kannst du suchen, filtern, bewerten und einzelne Fälle öffnen.',
    action: 'Tippe unten auf „Folgen“.',
    event: 'click',
    verify: () => state.page === 'episodes',
    skipReveal: true,
    settle: 80,
  },
  {
    id: 'search-submit',
    contextPage: 'episodes',
    focus: '#searchInput',
    actionTarget: '#searchInput',
    allowedTargets: ['#searchInput'],
    card: 'bottom',
    title: 'Suche',
    text: 'Du kannst nach Titeln, Autoren, Figuren, Handlungen und Stichwörtern suchen.',
    action: 'Gib mindestens drei Zeichen ein, zum Beispiel „Skinny“, und bestätige mit Enter oder „Suchen“.',
    event: 'enter',
    prepare: () => {
      state.search = '';
      state.collectionLabel = '';
      const input = $('searchInput');
      if (input) input.value = '';
      pageDirty.episodes = true;
      renderEpisodes();
      document.body.classList.add('tutorial-search-step');
    },
    onAction: (event) => {
      const input = event?.target;
      const value = String(input?.value || '').trim();
      state.search = value;
      state.collectionLabel = '';
      pageDirty.episodes = true;
      renderEpisodes();
      input?.blur();
    },
    verify: (event) => String(event?.target?.value || '').trim().length >= 3 && Boolean(document.querySelector('.episode-card')),
    invalidMessage: 'Gib mindestens drei Zeichen ein und bestätige die Suche mit Enter.',
    revealAlign: 'top',
    revealOffsetY: 18,
    after: () => document.body.classList.remove('tutorial-search-step'),
    beforePosition: () => {
      document.documentElement.classList.add('tutorial-instant-scroll');
      window.scrollTo(0, 0);
      const page = document.querySelector('#episodesPage, [data-page="episodes"]');
      if (page && 'scrollTop' in page) page.scrollTop = 0;
      void document.documentElement.offsetHeight;
      document.documentElement.classList.remove('tutorial-instant-scroll');
    },
    settle: 180,
  },
  {
    id: 'open-result',
    contextPage: 'episodes',
    focus: () => document.querySelector('.episode-card .episode-title'),
    actionTarget: () => document.querySelector('.episode-card .episode-title'),
    card: 'top',
    title: 'Suchergebnis öffnen',
    text: 'In der Detailansicht findest du Beschreibung, Bewertung, Streaminglinks und Zusatzwissen.',
    action: 'Tippe auf den hervorgehobenen Folgentitel.',
    event: 'click',
    verify: () => Boolean(state.detailNr) && !$('detailOverlay').classList.contains('hidden'),
    after: () => { state.tutorialEpisodeNr = Number(state.detailNr); },
    waitForKeyboardClose: true,
    beforePosition: () => {
      const target = document.querySelector('.episode-card .episode-title');
      const sticky = document.querySelector('.sticky-tools');
      const card = $('tutorialCard');
      if (!target || !sticky || !card?.classList.contains('tutorial-card-top-fixed')) return;
      const targetRect = target.getBoundingClientRect();
      const stickyRect = sticky.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const desiredTop = Math.max(stickyRect.bottom, cardRect.bottom) + 16;
      const delta = targetRect.top - desiredTop;
      if (Math.abs(delta) > 1) {
        document.documentElement.classList.add('tutorial-instant-scroll');
        window.scrollTo(0, Math.max(0, window.scrollY + delta));
        document.documentElement.classList.remove('tutorial-instant-scroll');
      }
    },
    skipReveal: true,
    settle: 180,
  },
  {
    id: 'rate-plus',
    focus: '#detailRating [data-rating="plus"]',
    actionTarget: '#detailRating [data-rating="plus"]',
    card: 'top',
    title: 'Folge bewerten',
    text: 'Minus, Neutral, Plus und Super schließen sich gegenseitig aus. Eine Bewertung markiert die Folge automatisch als gehört.',
    action: 'Tippe auf „Plus“.',
    event: 'click',
    verify: () => userFor(state.tutorialEpisodeNr).rating === 'plus',
    settle: 70,
  },
  {
    id: 'remove-plus',
    focus: '#detailRating [data-rating="plus"]',
    actionTarget: '#detailRating [data-rating="plus"]',
    card: 'top',
    title: 'Bewertung entfernen',
    text: 'Eine aktive Bewertung lässt sich durch erneutes Antippen wieder löschen.',
    action: 'Tippe noch einmal auf „Plus“.',
    event: 'click',
    verify: () => !userFor(state.tutorialEpisodeNr).rating,
    settle: 70,
  },
  {
    id: 'rate-super',
    focus: '#detailRating [data-rating="super"]',
    actionTarget: '#detailRating [data-rating="super"]',
    card: 'top',
    title: 'Lieblingsfolge markieren',
    text: 'Super-Folgen zählen doppelt für dein Geschmacksprofil und prägen Empfehlungen besonders stark.',
    action: 'Tippe auf „Super“.',
    event: 'click',
    verify: () => userFor(state.tutorialEpisodeNr).rating === 'super' && userFor(state.tutorialEpisodeNr).heard,
    settle: 70,
  },
  {
    id: 'request-unheard',
    focus: '.detail-heard-control',
    actionTarget: '.detail-heard-control',
    card: 'top',
    title: 'Hörstatus ändern',
    text: 'Du kannst eine Folge jederzeit wieder als ungehört markieren.',
    action: 'Tippe auf „Schon gehört“.',
    event: 'click',
    verify: () => !$('heardResetOverlay').classList.contains('hidden'),
    settle: 150,
  },
  {
    id: 'confirm-unheard',
    focus: '#heardResetOverlay .action-sheet',
    actionTarget: '#confirmUnheardAndClear',
    allowedTargets: ['#confirmUnheardAndClear'],
    card: 'top',
    title: 'Hörstatus zurücksetzen',
    text: 'Bei einer bewerteten Folge werden Bewertung und Hörstatus gemeinsam zurückgesetzt.',
    action: 'Tippe auf „Bewertung entfernen & ungehört“.',
    event: 'click',
    verify: () => {
      const user = userFor(state.tutorialEpisodeNr);
      return !user.rating && !user.heard && $('heardResetOverlay').classList.contains('hidden');
    },
    settle: 160,
  },
  {
    id: 'open-knowledge',
    focus: '#detailKnowledgeSection > summary',
    actionTarget: '#detailKnowledgeSection > summary',
    card: 'top',
    title: 'Zusatzwissen',
    text: 'Die Wissenskarte enthält Autor, Ära, Laufzeit, Themen, Figuren und weitere Einordnungen.',
    action: 'Tippe auf „Wissenskarte“.',
    event: 'click',
    beforePosition: () => {
      const sheet = document.querySelector('#detailOverlay .detail-sheet');
      const summary = document.querySelector('#detailKnowledgeSection > summary');
      if (sheet && summary) {
        const targetTop = Math.max(0, summary.offsetTop - Math.max(110, sheet.clientHeight * 0.25));
        sheet.scrollTop = targetTop;
      }
    },
    revealAlign: 'center',
    verify: () => Boolean($('detailKnowledgeSection')?.open),
    settle: 140,
  },
  {
    id: 'read-knowledge-close',
    focus: '#detailOverlay .detail-sheet',
    actionTarget: '#closeDetail',
    allowedTargets: ['#detailOverlay .detail-sheet'],
    allowScroll: '#detailOverlay .detail-sheet',
    card: 'bottom',
    compact: true,
    reading: true,
    title: 'Wissenskarte',
    text: 'Hier findest du Autor, Ära, Laufzeit, Themen, Figuren und Rückbezüge.',
    action: 'Scrolle durch die Angaben. Schließe die Folge danach mit dem ×.',
    event: 'click',
    prepare: () => {
      document.body.classList.add('tutorial-reading-detail');
      const section = $('detailKnowledgeSection');
      if (section) section.open = true;
    },
    beforePosition: () => {
      const sheet = document.querySelector('#detailOverlay .detail-sheet');
      const section = $('detailKnowledgeSection');
      if (sheet && section) sheet.scrollTop = Math.max(0, section.offsetTop - 76);
    },
    skipReveal: true,
    verify: () => !state.detailNr && $('detailOverlay').classList.contains('hidden'),
    after: () => document.body.classList.remove('tutorial-reading-detail'),
    settle: 100,
  },
  {
    id: 'go-playlists',
    contextPage: 'episodes',
    focus: '[data-nav="playlists"]',
    actionTarget: '[data-nav="playlists"]',
    card: 'top',
    title: 'Listen und Hörpläne',
    text: 'Im Listenbereich findest du kuratierte Sammlungen, eigene Playlists und automatisch erstellte Hörpläne.',
    action: 'Tippe unten auf „Listen“.',
    event: 'click',
    prepare: () => {
      state.playlistTab = 'essentials';
      state.user.settings = { ...(state.user.settings || {}), playlistTab: 'essentials' };
      pageDirty.playlists = true;
    },
    verify: () => state.page === 'playlists',
    skipReveal: true,
    settle: 150,
  },
  {
    id: 'themes-tab',
    contextPage: 'playlists',
    focus: '[data-playlist-tab="themes"]',
    actionTarget: '[data-playlist-tab="themes"]',
    card: 'bottom',
    title: 'Themensammlungen',
    text: 'Hier findest du fertige Listen zu Weihnachten, Halloween, Fußball, Autoren und weiteren Themen.',
    action: 'Tippe auf „Themen“.',
    event: 'click',
    verify: () => state.playlistTab === 'themes',
    settle: 90,
  },
  {
    id: 'mine-tab',
    contextPage: 'playlists',
    focus: '[data-playlist-tab="mine"]',
    actionTarget: '[data-playlist-tab="mine"]',
    card: 'bottom',
    title: 'Eigene Playlists',
    text: 'Unter „Meine“ liegen deine frei benannten Listen und gespeicherten Smart-Playlists.',
    action: 'Tippe auf „Meine“.',
    event: 'click',
    verify: () => state.playlistTab === 'mine',
    settle: 90,
  },
  {
    id: 'new-playlist',
    contextPage: 'playlists',
    focus: '#newPlaylistButton',
    actionTarget: '#newPlaylistButton',
    card: 'bottom',
    title: 'Neue Playlist',
    text: 'Eigene Playlists können einen Namen, eine Beschreibung und eine frei gewählte Reihenfolge erhalten.',
    action: 'Tippe auf „Neue Playlist“.',
    event: 'click',
    verify: () => !$('playlistEditorOverlay').classList.contains('hidden'),
    revealAlign: 'top',
    settle: 260,
  },
  {
    id: 'create-playlist',
    focus: ['#playlistNameInput', '#savePlaylistButton'],
    actionTarget: '#savePlaylistButton',
    allowedTargets: ['#playlistEditorOverlay .note-field', '#savePlaylistButton'],
    allowScroll: '#playlistEditorOverlay .mini-sheet',
    card: 'top',
    title: 'Playlist speichern',
    text: 'Die Beschreibung ist optional. Der Name muss mindestens drei Zeichen lang sein.',
    action: 'Gib einen Namen ein und tippe anschließend auf „Playlist speichern“.',
    event: 'click',
    verify: () => Boolean(state.tutorialPlaylistId)
      && $('playlistEditorOverlay').classList.contains('hidden')
      && Boolean(document.querySelector(`[data-playlist-open="${state.tutorialPlaylistId}"]`)),
    invalidMessage: () => String($('playlistNameInput')?.value || '').trim().length < 3
      ? 'Gib zuerst einen Namen mit mindestens drei Zeichen ein.'
      : 'Tippe auf „Playlist speichern“.',
    beforePosition: () => {
      const sheet = document.querySelector('#playlistEditorOverlay .mini-sheet');
      if (sheet) sheet.scrollTop = 0;
    },
    after: () => tutorialBlurTextControls(),
    settle: 230,
  },
  {
    id: 'open-playlist',
    contextPage: 'playlists',
    focus: () => state.tutorialPlaylistId ? document.querySelector(`#userPlaylists [data-playlist-open="${CSS.escape(String(state.tutorialPlaylistId))}"]`) : null,
    actionTarget: () => state.tutorialPlaylistId ? document.querySelector(`#userPlaylists [data-playlist-open="${CSS.escape(String(state.tutorialPlaylistId))}"]`) : null,
    card: 'top',
    title: 'Playlist öffnen',
    text: 'In der Playlist kannst du Folgen hinzufügen, sortieren, entfernen und passende Vorschläge ansehen.',
    action: 'Tippe auf die gerade erstellte Playlist.',
    event: 'click',
    waitForKeyboardClose: true,
    prepare: () => {
      state.playlistTab = 'mine';
      state.user.settings = { ...(state.user.settings || {}), playlistTab: 'mine' };
      pageDirty.playlists = true;
      $('planSavedStatus')?.classList.add('hidden');
      renderPlaylists();
    },
    revealAlign: 'center',
    focusPadding: 7,
    verify: () => String(state.playlistDetailId || '') === String(state.tutorialPlaylistId || '') && !$('playlistDetailOverlay').classList.contains('hidden'),
    invalidMessage: 'Tippe direkt auf die hervorgehobene Playlist-Karte.',
    settle: 180,
  },
  {
    id: 'open-add-panel',
    focus: '#playlistAddEpisodeButton',
    actionTarget: '#playlistAddEpisodeButton',
    card: 'top',
    title: 'Folge hinzufügen',
    text: 'Innerhalb einer Playlist kannst du nach Folgen suchen und sie direkt übernehmen.',
    action: 'Tippe auf „Folge hinzufügen“.',
    event: 'click',
    beforePosition: () => {
      const sheet = document.querySelector('#playlistDetailOverlay .playlist-sheet');
      const button = $('playlistAddEpisodeButton');
      if (sheet && button) sheet.scrollTop = Math.max(0, button.offsetTop - 110);
    },
    verify: () => !$('playlistAddPanel').classList.contains('hidden'),
    settle: 160,
  },
  {
    id: 'add-first-episode',
    focus: () => document.querySelector('#playlistAddResults [data-playlist-quick-add]'),
    actionTarget: () => document.querySelector('#playlistAddResults [data-playlist-quick-add]'),
    card: 'top',
    title: 'Folge übernehmen',
    text: 'Das Plus fügt die ausgewählte Folge sofort zur Playlist hinzu.',
    action: 'Tippe beim ersten Vorschlag auf das Plus.',
    event: 'click',
    verify: () => {
      const playlist = playlistById(state.tutorialPlaylistId);
      return Boolean(playlist?.episodeNumbers?.length);
    },
    settle: 210,
  },
  {
    id: 'open-added-detail',
    focus: () => document.querySelector('#playlistEpisodeList .playlist-episode-main'),
    actionTarget: () => document.querySelector('#playlistEpisodeList .playlist-episode-main'),
    card: 'top',
    title: 'Folgendetails öffnen',
    text: 'Auch aus einer Playlist kannst du die vollständige Beschreibung einer Folge öffnen.',
    action: 'Tippe auf die hinzugefügte Folge.',
    event: 'click',
    prepare: () => {
      $('playlistAddPanel')?.classList.add('hidden');
      if (state.tutorialPlaylistId) openPlaylistDetail(state.tutorialPlaylistId, false);
    },
    verify: () => Boolean(state.detailNr) && !$('detailOverlay').classList.contains('hidden'),
    settle: 280,
  },
  {
    id: 'read-description-close',
    focus: '#detailOverlay .detail-sheet',
    actionTarget: '#closeDetail',
    allowedTargets: ['#detailOverlay .detail-sheet'],
    allowScroll: '#detailOverlay .detail-sheet',
    card: 'bottom',
    compact: true,
    reading: true,
    title: 'Folgenbeschreibung',
    text: 'Hier findest du Handlung, Laufzeit, Streaminglinks, Bewertung und weitere Angaben.',
    action: 'Scrolle durch die Details. Kehre danach mit dem × zur Playlist zurück.',
    event: 'click',
    prepare: () => document.body.classList.add('tutorial-reading-detail'),
    beforePosition: () => {
      const sheet = document.querySelector('#detailOverlay .detail-sheet');
      if (sheet) sheet.scrollTop = 0;
    },
    skipReveal: true,
    verify: () => !state.detailNr
      && !$('playlistDetailOverlay').classList.contains('hidden')
      && state.playlistDetailId === state.tutorialPlaylistId,
    after: () => document.body.classList.remove('tutorial-reading-detail'),
    settle: 100,
  },
  {
    id: 'close-playlist',
    focus: '#closePlaylistDetail',
    actionTarget: '#closePlaylistDetail',
    card: 'bottom',
    title: 'Playlist schließen',
    text: 'Mit dem × gelangst du zurück zur Listenübersicht.',
    action: 'Tippe auf das × der Playlist.',
    event: 'click',
    verify: () => !state.playlistDetailId && $('playlistDetailOverlay').classList.contains('hidden'),
    settle: 190,
  },
  {
    id: 'choose-smart-mood',
    contextPage: 'playlists',
    focus: '#planMood',
    actionTarget: '#planMood',
    card: 'bottom',
    title: 'Smart-Playlist einstellen',
    text: 'Der Planer kann Dauer, Stimmung, Hörstatus, Autor und zusammenhängende Geschichten berücksichtigen.',
    action: 'Wähle bei „Stimmung“ eine andere Option als „Bunte Mischung“.',
    event: 'change',
    prepare: () => {
      $('planName').value = 'Tutorial-Mix';
      $('planHours').value = '1';
      $('planMinutes').value = '30';
      $('planMood').value = 'any';
      $('planStatus').value = 'mixed';
      if ($('planAuthor')) $('planAuthor').value = 'all';
      $('planContinuity').checked = true;
      state.generatedPlan = null;
      $('planPreview').classList.add('hidden');
      $('planPreview').innerHTML = '';
    },
    verify: () => $('planMood').value !== 'any',
    invalidMessage: 'Wähle eine konkrete Stimmung aus.',
    settle: 100,
  },
  {
    id: 'generate-smart',
    contextPage: 'playlists',
    focus: '#generatePlanButton',
    actionTarget: '#generatePlanButton',
    card: 'top',
    title: 'Hörplan erstellen',
    text: 'Aus deinen Angaben stellt die App eine passende Auswahl mit möglichst genauer Gesamtdauer zusammen.',
    action: 'Tippe auf „Smart Playlist erstellen“.',
    event: 'click',
    verify: () => Boolean(state.generatedPlan)
      && !$('planPreview').classList.contains('hidden')
      && Boolean($('saveGeneratedPlan')),
    settle: 230,
  },
  {
    id: 'read-save-smart',
    focus: '#planPreview',
    actionTarget: '#saveGeneratedPlan',
    allowedTargets: ['#planPreview'],
    allowScroll: '#planPreview',
    card: 'top',
    compact: true,
    reading: true,
    title: 'Smart-Playlist prüfen',
    text: 'Die Vorschau zeigt Folgen, Dauer und die Gründe für die Zusammenstellung.',
    action: 'Sieh dir den Hörplan an und tippe anschließend auf „Playlist speichern“.',
    event: 'click',
    prepare: () => document.body.classList.add('tutorial-reading-plan'),
    verify: () => !state.generatedPlan && Boolean(state.tutorialSmartPlaylistId),
    after: () => document.body.classList.remove('tutorial-reading-plan'),
    settle: 230,
  },
  {
    id: 'go-settings',
    contextPage: 'playlists',
    focus: '[data-nav="settings"]',
    actionTarget: '[data-nav="settings"]',
    card: 'top',
    title: 'Einstellungen',
    text: 'Hier wählst du deinen Streamingdienst, verwaltest Backups, aktualisierst den Katalog und startest das Tutorial erneut.',
    action: 'Tippe unten auf „Einstellungen“.',
    event: 'click',
    prepare: () => {
      $('planSavedStatus')?.classList.add('hidden');
      clearTimeout(state.planSavedTimer);
    },
    verify: () => state.page === 'settings',
    skipReveal: true,
    settle: 140,
  },
  {
    id: 'backup',
    contextPage: 'settings',
    focus: '#exportButton',
    actionTarget: '#exportButton',
    card: 'bottom',
    title: 'JSON-Backup',
    text: 'Deine Änderungen werden automatisch auf diesem Gerät gespeichert. Ein JSON-Backup eignet sich für zusätzliche Sicherheit oder einen Gerätewechsel.',
    action: 'Tippe auf „JSON exportieren“, um die Sicherungsfunktion kennenzulernen.',
    event: 'click',
    intercept: true,
    verify: () => true,
    revealAlign: 'top',
    settle: 70,
  },
  {
    id: 'done',
    focus: null,
    card: 'bottom',
    title: 'Einführung abgeschlossen',
    text: 'Du kannst nun Folgen suchen, bewerten, in Playlists sammeln und passende Hörpläne erstellen.',
    action: 'Tippe auf „App benutzen“.',
    event: 'finish',
  },
];
function tutorialCompleted() {
  return Boolean(state.user.settings?.tutorialCompleted);
}

function cloneTutorialValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function setTutorialCompleted(value) {
  state.user.settings = { ...(state.user.settings || {}), tutorialCompleted: Boolean(value) };
  state.user.updatedAt = new Date().toISOString();
  queueUserPersist();
}

function currentTutorialStep() {
  return TUTORIAL_STEPS[state.tutorialStep] || null;
}

function resolveTutorialElements(spec) {
  if (!spec) return [];
  let value = typeof spec === 'function' ? spec() : spec;
  if (!value) return [];
  if (!Array.isArray(value)) value = [value];
  const elements = [];
  value.flat(Infinity).forEach((item) => {
    if (!item) return;
    if (typeof item === 'string') {
      document.querySelectorAll(item).forEach((element) => elements.push(element));
    } else if (item instanceof Element) {
      elements.push(item);
    }
  });
  return [...new Set(elements)];
}

function tutorialFocusElements(step = currentTutorialStep()) {
  return resolveTutorialElements(step?.focus ?? step?.target);
}

function tutorialActionElements(step = currentTutorialStep()) {
  return resolveTutorialElements(step?.actionTarget ?? step?.target ?? step?.focus);
}

function tutorialAllowedElements(step = currentTutorialStep()) {
  return [...new Set([
    ...tutorialActionElements(step),
    ...resolveTutorialElements(step?.allowedTargets),
  ])];
}

function tutorialAllowScrollElements(step = currentTutorialStep()) {
  return resolveTutorialElements(step?.allowScroll);
}

function elementMatchesAny(target, elements) {
  return elements.some((element) => element === target || element.contains(target));
}

function tutorialRectFor(elements) {
  const rects = elements
    .filter((element) => element?.isConnected)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

function tutorialScrollableAncestor(element) {
  let parent = element?.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (/(auto|scroll)/.test(overflowY) && parent.scrollHeight > parent.clientHeight + 4) return parent;
    parent = parent.parentElement;
  }
  return null;
}

function tutorialHasFixedAncestor(element) {
  let node = element;
  while (node && node !== document.documentElement) {
    if (getComputedStyle(node).position === 'fixed') return true;
    node = node.parentElement;
  }
  return false;
}

function resetTutorialCardPosition() {
  const card = $('tutorialCard');
  card.classList.remove(
    'top', 'is-above', 'is-below', 'is-scrollable',
    'tutorial-card-top-fixed', 'tutorial-card-bottom-fixed',
    'tutorial-card-compact', 'tutorial-card-reading',
  );
  card.style.removeProperty('top');
  card.style.removeProperty('bottom');
  card.style.removeProperty('max-height');
  card.style.removeProperty('overflow-y');
}

function tutorialViewportMetrics() {
  const visual = window.visualViewport;
  const top = visual?.offsetTop || 0;
  const height = visual?.height || window.innerHeight;
  const bottom = top + height;
  const nav = document.querySelector('.bottom-nav');
  const navRect = nav && !nav.classList.contains('hidden') ? nav.getBoundingClientRect() : null;
  const safeBottom = navRect && navRect.top > top && navRect.top < bottom ? navRect.top - 12 : bottom - 12;
  return {
    top,
    bottom,
    height,
    safeTop: top + Math.max(58, Math.min(92, height * 0.075)),
    safeBottom,
  };
}

function tutorialChooseCardSide(step, elements) {
  if (step?.card === 'top' || step?.card === 'bottom') return step.card;
  const rect = tutorialRectFor(elements);
  if (!rect) return 'bottom';
  const viewport = tutorialViewportMetrics();
  return ((rect.top + rect.bottom) / 2) < (viewport.top + viewport.height / 2) ? 'bottom' : 'top';
}

function tutorialApplyCardLayout(step, side) {
  const card = $('tutorialCard');
  resetTutorialCardPosition();
  card.classList.add(side === 'top' ? 'tutorial-card-top-fixed' : 'tutorial-card-bottom-fixed');
  card.classList.toggle('tutorial-card-compact', Boolean(step?.compact));
  card.classList.toggle('tutorial-card-reading', Boolean(step?.reading));
  const viewport = tutorialViewportMetrics();
  const ratio = step?.reading ? 0.29 : step?.compact ? 0.27 : 0.37;
  card.style.maxHeight = `${Math.max(step?.compact ? 148 : 180, Math.floor(viewport.height * ratio))}px`;
  card.style.overflowY = 'auto';
}

function tutorialVisibleBand(side) {
  const viewport = tutorialViewportMetrics();
  const cardRect = $('tutorialCard').getBoundingClientRect();
  if (side === 'top') {
    return { top: Math.max(viewport.safeTop, cardRect.bottom + 14), bottom: viewport.safeBottom };
  }
  return { top: viewport.safeTop, bottom: Math.min(viewport.safeBottom, cardRect.top - 14) };
}

async function tutorialWaitFrames(count = 2) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

async function tutorialFindElements(step, attempts = 18) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    step?.beforePosition?.();
    const elements = tutorialFocusElements(step).filter((element) => element?.isConnected && element.getClientRects().length);
    if (elements.length && tutorialRectFor(elements)) return elements;
    await tutorialWaitFrames(1);
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
  return [];
}

async function revealTutorialTarget(elements, side, step = {}) {
  if (!elements.length || step.skipReveal) return;
  const primary = elements[0];
  if (tutorialHasFixedAncestor(primary)) return;
  const scrollParent = tutorialScrollableAncestor(primary);
  let rect = tutorialRectFor(elements);
  if (!rect) return;
  const band = tutorialVisibleBand(side);
  const sticky = document.querySelector('.sticky-tools');
  if (sticky && sticky.offsetParent !== null && !sticky.contains(primary)) {
    const stickyRect = sticky.getBoundingClientRect();
    if (stickyRect.top <= band.top + 24 && stickyRect.bottom > band.top && stickyRect.bottom < band.bottom) {
      band.top = stickyRect.bottom + 12;
    }
  }
  const available = Math.max(90, band.bottom - band.top);
  const height = rect.bottom - rect.top;
  let desiredTop;
  if (step.revealAlign === 'top' || height > available * 0.84) desiredTop = band.top;
  else if (step.revealAlign === 'bottom') desiredTop = band.bottom - height;
  else desiredTop = band.top + Math.max(0, (available - height) / 2);
  desiredTop += Number(step.revealOffsetY || 0);
  desiredTop = Math.max(band.top, Math.min(desiredTop, band.bottom - Math.min(height, available)));
  const delta = rect.top - desiredTop;
  if (Math.abs(delta) < 1) return;
  state.tutorialProgrammaticScroll = true;
  document.documentElement.classList.add('tutorial-instant-scroll');
  if (scrollParent) scrollParent.scrollTop = Math.max(0, scrollParent.scrollTop + delta);
  else window.scrollTo(0, Math.max(0, window.scrollY + delta));
  await tutorialWaitFrames(2);
  document.documentElement.classList.remove('tutorial-instant-scroll');
  state.tutorialProgrammaticScroll = false;
}

function setTutorialFocusRect(step, elements) {
  const overlay = $('tutorialOverlay');
  const focus = $('tutorialFocus');
  const rect = tutorialRectFor(elements);
  if (!rect) {
    overlay.classList.add('no-focus');
    focus.style.width = '0px';
    focus.style.height = '0px';
    return false;
  }
  const viewport = tutorialViewportMetrics();
  const pad = Number(step?.focusPadding ?? 8);
  const left = Math.max(6, rect.left - pad);
  const top = Math.max(viewport.top + 6, rect.top - pad);
  const right = Math.min(window.innerWidth - 6, rect.right + pad);
  const bottom = Math.min(viewport.bottom - 6, rect.bottom + pad);
  if (right <= left || bottom <= top) return false;
  overlay.classList.remove('no-focus');
  focus.style.left = `${left}px`;
  focus.style.top = `${top}px`;
  focus.style.width = `${right - left}px`;
  focus.style.height = `${bottom - top}px`;
  state.tutorialTarget = elements[0] || null;
  state.tutorialLockedScrollY = window.scrollY;
  return true;
}

async function positionTutorialFocus(step = currentTutorialStep()) {
  const overlay = $('tutorialOverlay');
  if (!state.tutorialActive || overlay.classList.contains('hidden')) return false;
  let elements = await tutorialFindElements(step);
  const side = tutorialChooseCardSide(step, elements);
  tutorialApplyCardLayout(step, side);
  await tutorialWaitFrames(2);
  if (elements.length) {
    await revealTutorialTarget(elements, side, step);
    elements = await tutorialFindElements(step, 5);
  }
  return elements.length ? setTutorialFocusRect(step, elements) : step?.event === 'finish';
}
function clearTutorialStepClasses() {
  document.body.classList.remove('tutorial-reading-detail', 'tutorial-reading-plan', 'tutorial-search-step');
}

function prepareTutorialStep(step) {
  clearTutorialStepClasses();
  if (step.contextPage && state.page !== step.contextPage) showPage(step.contextPage);
  step.prepare?.();
}

function tutorialTextControl(element) {
  if (!(element instanceof Element)) return false;
  return element.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]');
}

function tutorialBlurTextControls() {
  const active = document.activeElement;
  if (tutorialTextControl(active)) active.blur();
  document.querySelectorAll('input:focus, textarea:focus, select:focus, [contenteditable=true]:focus').forEach((element) => element.blur());
}

function tutorialKeyboardLooksOpen() {
  const visual = window.visualViewport;
  if (!visual) return false;
  return visual.height < window.innerHeight * 0.82;
}

function waitForTutorialViewportStable(maxWait = 950, stableFor = 170) {
  return new Promise((resolve) => {
    const visual = window.visualViewport;
    if (!visual) { setTimeout(resolve, 260); return; }
    const started = performance.now();
    let lastChange = started;
    let lastHeight = visual.height;
    let lastTop = visual.offsetTop;
    const check = () => {
      const now = performance.now();
      if (Math.abs(visual.height - lastHeight) > 1 || Math.abs(visual.offsetTop - lastTop) > 1) {
        lastHeight = visual.height;
        lastTop = visual.offsetTop;
        lastChange = now;
      }
      if ((now - lastChange >= stableFor && !tutorialKeyboardLooksOpen()) || now - started >= maxWait) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function refreshTutorialFocusRectOnly() {
  if (!state.tutorialActive) return;
  const step = currentTutorialStep();
  const elements = tutorialFocusElements(step).filter((element) => element?.isConnected && element.getClientRects().length);
  if (elements.length) setTutorialFocusRect(step, elements);
}

function scheduleTutorialKeyboardRefresh(delay = 170) {
  clearTimeout(state.tutorialViewportTimer);
  state.tutorialViewportTimer = setTimeout(() => {
    if (!state.tutorialActive) return;
    refreshTutorialFocusRectOnly();
  }, delay);
}

function waitForTutorialSettle(milliseconds = 100) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, milliseconds)));
  });
}

async function renderTutorialStep() {
  const step = currentTutorialStep();
  if (!step) return finishTutorial();
  state.tutorialAdvancing = false;
  state.tutorialPreparedStep = state.tutorialStep;
  const overlay = $('tutorialOverlay');
  const focus = $('tutorialFocus');
  const token = ++state.tutorialPositionFrame;
  overlay.classList.add('tutorial-positioning');
  overlay.classList.remove('no-focus', 'tutorial-keyboard-active');
  focus.style.width = '0px';
  focus.style.height = '0px';
  document.body.dataset.tutorialStep = step.id;

  if (step.waitForKeyboardClose) {
    tutorialBlurTextControls();
    state.tutorialKeyboardActive = false;
    await waitForTutorialViewportStable();
    if (!state.tutorialActive || token !== state.tutorialPositionFrame || currentTutorialStep() !== step) return;
  }

  clearTutorialStepClasses();
  if (step.contextPage && state.page !== step.contextPage) showPage(step.contextPage);
  step.prepare?.();
  await tutorialWaitFrames(2);
  await new Promise((resolve) => setTimeout(resolve, Number(step.settle ?? 110)));
  if (!state.tutorialActive || token !== state.tutorialPositionFrame || currentTutorialStep() !== step) return;

  if (step.prePositionAsync) {
    await step.prePositionAsync();
    await tutorialWaitFrames(2);
    if (!state.tutorialActive || token !== state.tutorialPositionFrame || currentTutorialStep() !== step) return;
  }

  $('tutorialProgress').textContent = `${state.tutorialStep + 1} von ${TUTORIAL_STEPS.length}`;
  $('tutorialTitle').textContent = step.title;
  $('tutorialText').textContent = step.text;
  const action = $('tutorialAction');
  action.textContent = step.action || '';
  action.classList.remove('success', 'warning');
  $('tutorialDemo').classList.add('hidden');
  $('tutorialDemo').innerHTML = '';
  $('tutorialBack').classList.add('hidden');
  const finishButton = $('tutorialNext');
  finishButton.classList.toggle('hidden', step.event !== 'finish');
  finishButton.textContent = 'App benutzen';
  await tutorialWaitFrames(2);

  const positioned = await positionTutorialFocus(step);
  if (!state.tutorialActive || token !== state.tutorialPositionFrame || currentTutorialStep() !== step) return;
  if (!positioned) {
    overlay.classList.add('no-focus');
    action.textContent = 'Der Bereich wird vorbereitet. Versuche die Aktion gleich noch einmal.';
  }
  state.tutorialLockedScrollY = window.scrollY;
  overlay.classList.remove('tutorial-positioning');
}

function tutorialNudge(message = '') {
  const action = $('tutorialAction');
  action.textContent = message || currentTutorialStep()?.action || 'Nutze das hervorgehobene Element.';
  action.classList.add('warning');
  $('tutorialFocus').classList.remove('tutorial-nudge');
  void $('tutorialFocus').offsetWidth;
  $('tutorialFocus').classList.add('tutorial-nudge');
  setTimeout(() => $('tutorialFocus').classList.remove('tutorial-nudge'), 320);
}

function tutorialInvalidMessage(step) {
  if (typeof step?.invalidMessage === 'function') return step.invalidMessage();
  return step?.invalidMessage || 'Die Aktion ist noch nicht abgeschlossen. Probiere es noch einmal.';
}

function completeTutorialAction(event = null) {
  const step = currentTutorialStep();
  if (!step || state.tutorialAdvancing) return;
  const delay = Number(step.verifyDelay || 90);
  setTimeout(() => {
    if (!state.tutorialActive || state.tutorialAdvancing || currentTutorialStep() !== step) return;
    let valid = true;
    try { valid = step.verify ? Boolean(step.verify(event)) : true; } catch (error) { valid = false; console.warn(error); }
    if (!valid) {
      tutorialNudge(tutorialInvalidMessage(step));
      return;
    }
    step.after?.(event);
    state.tutorialAdvancing = true;
    $('tutorialAction').classList.remove('warning', 'success');
    setTimeout(() => {
      if (!state.tutorialActive) return;
      state.tutorialStep += 1;
      state.tutorialPreparedStep = -1;
      renderTutorialStep();
    }, 120);
  }, delay);
}

function tutorialClickCapture(event) {
  if (!state.tutorialActive) return;
  const card = $('tutorialCard');
  if (card.contains(event.target)) return;
  const step = currentTutorialStep();
  if (!step || step.event === 'finish') {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  const allowed = tutorialAllowedElements(step);
  const actions = tutorialActionElements(step);
  const insideAllowed = elementMatchesAny(event.target, allowed);
  const insideAction = elementMatchesAny(event.target, actions);

  if (!insideAllowed) {
    event.preventDefault();
    event.stopImmediatePropagation();
    tutorialNudge();
    return;
  }

  if (!insideAction || step.event !== 'click') return;
  if (step.intercept) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  step.onAction?.(event);
  completeTutorialAction(event);
}

function tutorialFocusInCapture(event) {
  if (!state.tutorialActive || !tutorialTextControl(event.target)) return;
  const step = currentTutorialStep();
  if (!elementMatchesAny(event.target, tutorialAllowedElements(step))) return;
  state.tutorialKeyboardActive = true;
  $('tutorialOverlay')?.classList.add('tutorial-keyboard-active');
  state.tutorialLockedScrollY = window.scrollY;
  scheduleTutorialKeyboardRefresh(260);
}

function tutorialFocusOutCapture(event) {
  if (!state.tutorialActive || !tutorialTextControl(event.target)) return;
  clearTimeout(state.tutorialKeyboardTimer);
  state.tutorialKeyboardTimer = setTimeout(() => {
    if (tutorialTextControl(document.activeElement)) return;
    state.tutorialKeyboardActive = false;
    $('tutorialOverlay')?.classList.remove('tutorial-keyboard-active');
    state.tutorialLockedScrollY = window.scrollY;
    scheduleTutorialKeyboardRefresh(120);
  }, 360);
}

function tutorialViewportChangeCapture() {
  if (!state.tutorialActive) return;
  if (state.tutorialKeyboardActive || tutorialTextControl(document.activeElement)) {
    state.tutorialLockedScrollY = window.scrollY;
    scheduleTutorialKeyboardRefresh(180);
  }
}

function tutorialInputCapture(event) {
  if (!state.tutorialActive) return;
  const step = currentTutorialStep();
  if (!step || step.event !== 'input') return;
  if (!elementMatchesAny(event.target, tutorialActionElements(step))) return;
  clearTimeout(state.tutorialInputTimer);
  state.tutorialInputTimer = setTimeout(() => completeTutorialAction(event), step.verifyDelay || 100);
}

function tutorialKeydownCapture(event) {
  if (!state.tutorialActive) return;
  const step = currentTutorialStep();
  if (!step || step.event !== 'enter' || event.key !== 'Enter') return;
  if (!elementMatchesAny(event.target, tutorialActionElements(step))) return;
  event.preventDefault();
  step.onAction?.(event);
  completeTutorialAction(event);
}

function tutorialSearchCapture(event) {
  if (!state.tutorialActive) return;
  const step = currentTutorialStep();
  if (!step || step.event !== 'enter') return;
  if (!elementMatchesAny(event.target, tutorialActionElements(step))) return;
  event.preventDefault();
  step.onAction?.(event);
  completeTutorialAction(event);
}

function tutorialChangeCapture(event) {
  if (!state.tutorialActive) return;
  const step = currentTutorialStep();
  if (!step || step.event !== 'change') return;
  if (!elementMatchesAny(event.target, tutorialActionElements(step))) return;
  step.onAction?.(event);
  completeTutorialAction(event);
}

function tutorialScrollCapture(event) {
  if (!state.tutorialActive || state.tutorialProgrammaticScroll) return;
  if ($('tutorialCard')?.contains(event.target)) return;
  const allowed = tutorialAllowScrollElements();
  if (allowed.length && elementMatchesAny(event.target, allowed)) return;
  event.preventDefault();
}

function tutorialWindowScrollGuard() {
  if (!state.tutorialActive || state.tutorialProgrammaticScroll) return;
  const overlay = $('tutorialOverlay');
  if (!overlay || overlay.classList.contains('tutorial-positioning')) return;
  if (state.tutorialKeyboardActive || tutorialTextControl(document.activeElement)) {
    state.tutorialLockedScrollY = window.scrollY;
    scheduleTutorialKeyboardRefresh(120);
    return;
  }
  if (Math.abs(window.scrollY - state.tutorialLockedScrollY) < 1) return;
  window.scrollTo(0, state.tutorialLockedScrollY);
}


function snapshotTutorialSession() {
  return {
    user: cloneTutorialValue(state.user),
    ui: {
      page: state.page,
      filter: state.filter,
      authorFilter: state.authorFilter,
      eraFilter: state.eraFilter,
      sort: state.sort,
      ranking: state.ranking,
      search: state.search,
      time: state.time,
      mood: state.mood,
      collectionLabel: state.collectionLabel,
      playlistTab: state.playlistTab,
    },
  };
}

function closeTutorialSurfaces() {
  clearTimeout(state.tutorialInputTimer);
  clearTutorialStepClasses();
  $('heardResetOverlay').classList.add('hidden');
  $('heardResetOverlay').setAttribute('aria-hidden', 'true');
  state.pendingUnheardNr = null;
  closeDetail();
  closePlaylistDetail();
  closePlaylistEditor();
  closePlaylistPicker();
  document.body.style.overflow = '';
}

function restoreTutorialSession({ completed = true, message = '' } = {}) {
  const snapshot = state.tutorialSnapshot;
  state.tutorialActive = false;
  state.tutorialAdvancing = false;
  state.tutorialTarget = null;
  state.tutorialPreparedStep = -1;
  state.tutorialPositionFrame += 1;
  document.body.classList.remove('tutorial-running');
  delete document.body.dataset.tutorialStep;
  clearTimeout(persistTimer);
  closeTutorialSurfaces();

  if (snapshot) {
    state.user = snapshot.user;
    Object.assign(state, snapshot.ui);
  }
  state.tutorialSnapshot = null;
  state.tutorialEpisodeNr = null;
  state.tutorialPlaylistId = null;
  state.tutorialSmartPlaylistId = null;
  state.generatedPlan = null;
  state.search = state.search || '';
  invalidateDerived();
  renderAll();
  showPage(state.page || 'home');
  $('searchInput').value = state.search;
  $('tutorialOverlay').classList.add('hidden');
  $('tutorialOverlay').setAttribute('aria-hidden', 'true');
  setTutorialCompleted(completed);
  if (message) toast(message);
}

function startTutorial({ fromSettings = false } = {}) {
  closeHelp();
  if (state.tutorialActive) return;
  clearTimeout(persistTimer);
  state.tutorialSnapshot = snapshotTutorialSession();
  state.tutorialActive = true;
  state.tutorialStep = 0;
  state.tutorialPreparedStep = -1;
  state.tutorialEpisodeNr = null;
  state.tutorialPlaylistId = null;
  state.tutorialSmartPlaylistId = null;
  state.tutorialAdvancing = false;
  closeTutorialSurfaces();
  document.body.classList.add('tutorial-running');
  showPage('home');
  $('tutorialOverlay').classList.remove('hidden');
  $('tutorialOverlay').setAttribute('aria-hidden', 'false');
  renderTutorialStep();
}

function finishTutorial() {
  restoreTutorialSession({ completed: true });
}

function skipTutorial() {
  restoreTutorialSession({ completed: true });
}

function tutorialNext() {
  if (currentTutorialStep()?.event === 'finish') finishTutorial();
}

function tutorialBack() {
  tutorialNudge('Dieses Tutorial wird durch echte Aktionen gesteuert.');
}


function openHelp() {
  $('helpOverlay').classList.remove('hidden');
  $('helpOverlay').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('closeHelp')?.focus({ preventScroll: true }), 0);
}

function closeHelp() {
  $('helpOverlay').classList.add('hidden');
  $('helpOverlay').setAttribute('aria-hidden', 'true');
}

  function renderSettings() {
    const preferred = preferredStreamingService();
    document.querySelectorAll('#streamingPreference [data-service]').forEach((button) => {
      const active = button.dataset.service === preferred;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('streamingPreferenceInfo').textContent = `Schnellbuttons öffnen ${streamingServiceLabel(preferred)}. In den Folgendetails bleiben beide Dienste sichtbar.`;
    const states = Object.keys(state.user.episodes).length;
    const roles = state.catalog.reduce((sum, episode) => sum + (episode.characters?.length || 0), 0);
    const spotifyLinks = state.catalog.filter((episode) => episode.spotifyUrl).length;
    const appleLinks = state.catalog.filter((episode) => episode.appleMusicUrl).length;
    $('storageInfo').textContent = `${state.catalog.length} Folgen · ${states} persönliche Einträge · ${(state.user.playlists||[]).length} Playlists · ${state.catalog.filter((episode) => episode.rockyRanking != null).length} Rocky-Wertungen`;
    if ($('appVersionInfo')) $('appVersionInfo').textContent = `Version ${APP_VERSION.replace(/\.0$/, '')} · Offline-fähig`;
    $('metadataInfo').textContent = state.metadataUpdatedAt
      ? `${roles.toLocaleString('de-DE')} Rollen · ${spotifyLinks} Spotify- und ${appleLinks} Apple-Music-Direktlinks · aktualisiert ${new Date(state.metadataUpdatedAt).toLocaleDateString('de-DE')}`
      : `${spotifyLinks} Spotify- und ${appleLinks} Apple-Music-Direktlinks eingebaut; weiteres Folgenwissen wird online ergänzt.`;
    markRendered('settings');
  }


  function populateAuthorControls() {
    const authors = uniqueStrings(state.catalog.map((episode) => episode.author).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'de'));
    const authorOptions = '<option value="all">Alle</option>' + authors.map((author)=>`<option value="${esc(author)}">${esc(author)}</option>`).join('');
    for (const id of ['authorFilter','planAuthor']) {
      const select = $(id);
      if (!select) continue;
      const current = select.value || 'all';
      select.innerHTML = authorOptions;
      select.value = authors.includes(current) ? current : 'all';
    }
  }

  function renderAll() {
    populateAuthorControls();
    renderHome();
    if (state.page === 'episodes') renderEpisodes();
    if (state.page === 'ranking') renderRanking();
    if (state.page === 'playlists') renderPlaylists();
    renderSettings();
  }

  function showRecommendation(episode, kicker = '') {
    if (!episode) {
      toast('Keine passende Folge mit dieser Auswahl gefunden.');
      return;
    }
    $('todayCard').innerHTML = recommendationMarkup(episode, { kicker: kicker || 'Für deine Auswahl' });
    $('todayCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function openDetail(number) {
    const requestedNumber = Number(number);
    const base = state.catalog.find((episode) => episode.nr === requestedNumber);
    if (!base) {
      toast('Die Folge wurde im Katalog nicht gefunden.');
      return;
    }
    state.detailNr = requestedNumber;
    document.querySelectorAll('#detailOverlay details.detail-accordion').forEach((section) => { section.open = false; });
    const detailOverlay = $('detailOverlay');
    const playlistIsOpen = !$('playlistDetailOverlay').classList.contains('hidden');
    detailOverlay.classList.toggle('overlay-front', playlistIsOpen);
    detailOverlay.classList.remove('hidden');
    detailOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    try {
      refreshDetail();
    } catch (error) {
      console.error('Folgendetails konnten nicht vollständig geladen werden:', error);
      // Keep the modal usable instead of letting one malformed metadata field
      // terminate the whole interaction on iOS WebKit.
      $('detailNumber').textContent = episodeLabel(base);
      $('detailTitle').textContent = base.titel || 'Folgendetails';
      $('detailDescription').textContent = displayDescription(base) || 'Für diese Folge sind derzeit nicht alle Details verfügbar.';
      $('detailKnowledgeGrid').innerHTML = '';
      $('detailConnectionsSection').classList.add('hidden');
      $('detailSimilarSection').classList.add('hidden');
      $('detailTriviaSection').classList.add('hidden');
    }
    setTimeout(() => $('closeDetail')?.focus({ preventScroll: true }), 0);
  }

  function closeDetail() {
    flushPendingNote();
    state.detailNr = null;
    const detailOverlay = $('detailOverlay');
    detailOverlay.classList.add('hidden');
    detailOverlay.classList.remove('overlay-front');
    detailOverlay.setAttribute('aria-hidden', 'true');
    // Bleibt die Playlist geöffnet, darf der Hintergrund weiterhin nicht scrollen.
    document.body.style.overflow = $('playlistDetailOverlay').classList.contains('hidden') ? '' : 'hidden';
  }

  function formatReleaseDate(value) {
    if (!value) return 'noch nicht verfügbar';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'noch nicht verfügbar' : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function episodeFormats(episode) {
    const formats = [];
    if (episode.collection === 'special') formats.push('Sonderfolge');
    else formats.push('Reguläre Folge');
    if ([100, 125, 150, 175, 200, 225].includes(episode.nr)) formats.push('Jubiläums-Dreiteiler');
    if ((episode.durationMin || 0) >= 120 && !formats.includes('Jubiläums-Dreiteiler')) formats.push('Extra lang');
    return formats;
  }

  function knownAdversaries(episode) {
    const adversaries = new Set(['Victor Hugenay', 'Skinny Norris', 'Dick Perry']);
    return importantCharacters(episode, 14).filter((name) => adversaries.has(name));
  }

  function connectionSignature(numbers = []) {
    return [...new Set(numbers.map(Number).filter(Number.isFinite))].sort((a, b) => a - b).join('-');
  }

  function storyConnections(episode) {
    const bySignature = new Map();

    // Kuratierte Reihen haben Vorrang, damit dieselbe Chronik nicht doppelt
    // unter leicht unterschiedlichen Namen angezeigt wird.
    for (const definition of CURATED_PLAYLISTS) {
      if (!definition.sequence || definition.type !== 'numbers' || !definition.numbers.includes(episode.nr)) continue;
      const signature = connectionSignature(definition.numbers);
      bySignature.set(signature, {
        id: `curated:${definition.id}`,
        curatedId: definition.id,
        title: definition.title,
        description: definition.description,
        numbers: [...definition.numbers],
        episodes: episodesForNumbers(definition.numbers),
      });
    }

    for (const block of STORY_BLOCKS) {
      if (!block.numbers.includes(episode.nr) || block.numbers.length < 2) continue;
      const signature = connectionSignature(block.numbers);
      if (bySignature.has(signature)) continue;
      bySignature.set(signature, {
        id: `story:${block.id}`,
        curatedId: null,
        title: block.title,
        description: 'Zusammenhängende Fälle und wichtige Rückbezüge in sinnvoller Reihenfolge.',
        numbers: [...block.numbers],
        episodes: episodesForNumbers(block.numbers),
      });
    }

    return [...bySignature.values()].filter((item) => item.episodes.length > 1).slice(0, 4);
  }

  function currentConnection(connectionId) {
    const base = state.catalog.find((episode) => episode.nr === state.detailNr);
    if (!base) return null;
    return storyConnections(merged(base)).find((connection) => connection.id === connectionId) || null;
  }

  function openConnectionPlaylist(connectionId) {
    const connection = currentConnection(connectionId);
    if (!connection) return;
    if (connection.curatedId) {
      closeDetail();
      openPlaylistDetail(connection.curatedId, true);
      return;
    }
    saveConnectionPlaylist(connectionId, true);
  }

  function saveConnectionPlaylist(connectionId, openAfterSave = false) {
    const connection = currentConnection(connectionId);
    if (!connection) return;
    const signature = connectionSignature(connection.numbers);
    let playlist = (state.user.playlists || []).find((item) => connectionSignature(item.episodeNumbers) === signature);
    let created = false;
    if (!playlist) {
      playlist = normalizePlaylist({
        title: connection.title,
        description: connection.description || 'Zusammenhängende Fälle in empfohlener Reihenfolge.',
        episodeNumbers: connection.numbers,
        smartMeta: { source: 'story-connection', connectionId: connection.id },
      });
      state.user.playlists.push(playlist);
      created = true;
      persistPlaylists();
    }
    toast(created ? 'Reihenfolge als Playlist gespeichert ✓' : 'Diese Playlist ist bereits gespeichert.');
    if (openAfterSave && playlist) {
      closeDetail();
      openPlaylistDetail(playlist.id, false);
    }
  }

  function similarEpisodes(episode, limit = 4) {
    // Mobile-safe: use the already cached recommendation features instead of
    // rebuilding character lists for the entire catalogue whenever a detail opens.
    const sourceFeatures = new Map(episodeFeatures(episode).map((feature) => [feature.key, feature]));
    const results = [];
    for (const base of state.catalog) {
      if (base.nr === episode.nr) continue;
      const item = merged(base);
      let score = 0;
      let reason = '';
      for (const feature of episodeFeatures(item)) {
        const shared = sourceFeatures.get(feature.key);
        if (!shared) continue;
        const weight = feature.type === 'character' ? 3.2 : 2.2;
        score += weight;
        if (!reason) reason = shared.label;
      }
      if (item.author && item.author === episode.author) {
        score += 1.25;
        if (!reason) reason = `ebenfalls ${item.author}`;
      }
      if (item.era && item.era === episode.era) score += .35;
      if (item.rockyRanking != null) score += Math.max(0, 2.8 - item.rockyRanking) * .22;
      if (score > 0) results.push({ item, score, reason });
    }
    return results.sort((a,b) => b.score - a.score || rockyCompare(a.item,b.item)).slice(0, limit);
  }

  function knowledgeTrivia(episode) {
    const facts = [];
    const era = eraInfo(episode);
    if (era.description) facts.push(era.description);
    if ([100, 125, 150, 175, 200, 225].includes(episode.nr)) facts.push('Diese Folge ist ein großer Jubiläumsfall und als zusammenhängender Dreiteiler angelegt.');
    if ((episode.durationMin || 0) >= 180) facts.push(`Mit ${fmtDuration(episode.durationMin)} gehört sie zu den besonders langen Hörspielen.`);
    const connections = storyConnections(episode);
    if (connections.length) facts.push(`Sie ist Teil der kuratierten Reihenfolge „${connections[0].title}“.`);
    if (episode.scriptAuthor) facts.push(`Die Hörspielbearbeitung stammt von ${episode.scriptAuthor}.`);
    return uniqueStrings(facts).slice(0, 3);
  }

  function knowledgeItem(label, value, hint = '') {
    if (!value || value === '—') return '';
    return `<div class="knowledge-item"><span>${esc(label)}</span><strong>${esc(value)}</strong>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
  }

  function renderKnowledge(episode) {
    const era = eraInfo(episode);
    const moods = (episode.tags || []).slice(0, 4).join(' · ') || '—';
    const formats = episodeFormats(episode).join(' · ');
    $('detailKnowledgeGrid').innerHTML = [
      knowledgeItem('Buchautor', episode.author || 'noch nicht verfügbar'),
      knowledgeItem('Hörspielbearbeitung', episode.scriptAuthor || 'noch nicht verfügbar'),
      knowledgeItem('Ära', era.short, era.id !== era.short ? era.id : ''),
      knowledgeItem('Erstveröffentlichung', formatReleaseDate(episode.releaseDate)),
      knowledgeItem('Laufzeit', fmtDuration(episode.durationMin)),
      knowledgeItem('Format', formats),
      knowledgeItem('Stimmung & Themen', moods === '—' ? 'noch nicht verfügbar' : moods),
      knowledgeItem('Rocky-Beach', episode.rockyRanking == null ? 'Keine Wertung' : fmtRocky(episode.rockyRanking), episode.rockyRanking == null ? '' : 'kleiner ist besser'),
    ].join('');

    const adversaries = knownAdversaries(episode);
    if (adversaries.length) {
      $('detailKnowledgeGrid').insertAdjacentHTML('beforeend', knowledgeItem('Bekannte Gegenspieler', adversaries.join(' · ')));
    }

    const connections = storyConnections(episode);
    $('detailConnectionsSection').classList.toggle('hidden', !connections.length);
    $('detailConnections').innerHTML = connections.map((connection) => `<article class="connection-card">
      <div class="connection-card-head"><span><strong>${esc(connection.title)}</strong><small>${connection.episodes.length} Folgen in empfohlener Reihenfolge</small></span></div>
      <div class="connection-episodes">${connection.episodes.map((item, index) => `<button data-open="${item.nr}" class="relation-row ${item.nr === episode.nr ? 'current' : ''}"><span class="relation-index">${index + 1}</span><span><strong>${esc(episodeLabel(item))} · ${esc(item.titel)}</strong><small>${esc(fmtDuration(item.durationMin))}${item.nr === episode.nr ? ' · aktuelle Folge' : ''}</small></span><b>›</b></button>`).join('')}</div>
      <div class="connection-actions"><button class="subtle-button" data-connection-open="${esc(connection.id)}">Playlist öffnen</button><button class="subtle-button" data-connection-save="${esc(connection.id)}">Als eigene Playlist speichern</button></div>
    </article>`).join('');

    const similar = similarEpisodes(episode);
    $('detailSimilarSection').classList.toggle('hidden', !similar.length);
    $('detailSimilar').innerHTML = similar.map(({ item, reason }) => `<button data-open="${item.nr}" class="similar-card"><span><strong>${esc(episodeLabel(item))} · ${esc(item.titel)}</strong><small>${esc(reason || fmtDuration(item.durationMin))}</small></span><b>›</b></button>`).join('');

    const trivia = knowledgeTrivia(episode);
    $('detailTriviaSection').classList.toggle('hidden', !trivia.length);
    $('detailTrivia').innerHTML = trivia.map((fact) => `<p>${esc(fact)}</p>`).join('');
  }

  function refreshDetail() {
    const base = state.catalog.find((episode) => episode.nr === state.detailNr);
    if (!base) return;
    const episode = merged(base);
    const result = recommendationScore(episode);
    const description = displayDescription(episode);
    const characters = importantCharacters(episode, 8);
    $('detailNumber').textContent = episodeLabel(episode);
    $('detailTitle').textContent = episode.titel;
    $('detailMatch').textContent = `${result.match}%`;
    $('detailDescription').textContent = episode.longDescription || description || 'Für diese Folge ist derzeit keine Kurzbeschreibung verfügbar.';
    renderKnowledge(episode);
    $('detailStreamingButtons').innerHTML = ['spotify', 'appleMusic'].map((service) => streamingButtonMarkup(episode, service)).join('');
    $('detailMeta').innerHTML = `
      <span class="badge">${fmtDuration(episode.durationMin)}</span>
      ${isSpecial(episode) ? '<span class="badge special-badge">✦ Spezial / extra lang</span>' : ''}
      <span class="badge">Rocky ${fmtRocky(episode.rockyRanking)}</span>
      ${episode.author ? `<span class="badge author-badge">${esc(episode.author)}</span>` : ''}
      ${episode.era ? `<span class="badge era-badge">${esc(eraInfo(episode).short)}</span>` : ''}`;

    $('detailReasonsSection').classList.toggle('hidden', !result.reasons.length);
    $('detailReasons').innerHTML = result.reasons.map((reason) => `<span>${esc(reason)}</span>`).join('');
    $('detailCharactersSection').classList.toggle('hidden', !characters.length);
    $('detailCharacters').innerHTML = characters.map((character) => `<span>${esc(character)}</span>`).join('');
    const detailTags = Array.isArray(episode.tags) ? episode.tags : [];
    $('detailThemesSection').classList.toggle('hidden', !detailTags.length);
    $('detailThemes').innerHTML = detailTags.slice(0, 10).map((tag) => `<span>${esc(tag)}</span>`).join('');
    $('detailPeopleSection').classList.toggle('hidden', !characters.length && !detailTags.length);

    document.querySelectorAll('#detailRating [data-rating]').forEach((button) => {
      const active = button.dataset.rating === episode.rating;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('clearRating').classList.toggle('hidden', !episode.rating);
    $('detailHeard').checked = episode.heard;
    $('detailHeardDate').textContent = episode.heardAt
      ? `Zuletzt markiert am ${new Date(episode.heardAt).toLocaleDateString('de-DE')}`
      : 'Eine Bewertung markiert die Folge automatisch als gehört.';
    if (document.activeElement !== $('detailNote')) $('detailNote').value = episode.note || '';
  }

  function toast(message) {
    if (state.tutorialActive) return;
    const element = $('toast');
    element.textContent = message;
    element.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.add('hidden'), 3000);
  }

  async function exportBackup() {
    try {
      const payload = {
        app: 'ddf-folgen-tracker',
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        episodes: state.user.episodes,
        playlists: state.user.playlists,
        settings: state.user.settings,
      };
      const text = JSON.stringify(payload, null, 2);
      const name = `ddf-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'DDF Tracker Backup', files: [file] });
        toast('Backup ist bereit zum Sichern.');
        return;
      }
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      toast('Backup wurde exportiert.');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error(error);
        toast('Export konnte nicht gestartet werden.');
      }
    }
  }

  function readFileText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function importBackupFile(file) {
    try {
      const parsed = JSON.parse(await readFileText(file));
      const normalized = normalizeUser(parsed);
      const count = Object.keys(normalized.episodes).length;
      if (!count) {
        const emptyAccepted = await appConfirm({ title: 'Leeres Backup importieren?', message: 'Das Backup enthält keine Folgenstände. Playlists und Einstellungen können trotzdem übernommen werden.', confirmText: 'Trotzdem importieren' });
        if (!emptyAccepted) return;
      }
      const accepted = await appConfirm({
        kicker: 'Backup importieren',
        title: 'Vorhandene Daten ersetzen?',
        message: `${count} gespeicherte Folgenstände sowie enthaltene Playlists und Einstellungen werden importiert. Deine aktuellen lokalen Daten werden ersetzt.`,
        confirmText: 'Backup importieren',
        danger: true,
      });
      if (!accepted) return;
      state.user = normalized;
      state.user.updatedAt = new Date().toISOString();
      invalidateDerived();
      await dbSet(USER_KEY, state.user);
      renderAll();
      toast(`${count} Folgenstände importiert.`);
    } catch (error) {
      console.error(error);
      toast('Die JSON-Datei ist ungültig oder nicht lesbar.');
    } finally {
      $('importFile').value = '';
    }
  }

  async function loadUser() {
    let raw = await dbGet(USER_KEY);
    if (!raw) {
      for (const key of LEGACY_USER_KEYS) {
        raw = await dbGet(key);
        if (raw) break;
      }
    }
    if (raw) state.user = normalizeUser(raw);
    await dbSet(USER_KEY, state.user);
  }

  function cleanMetadataTitle(title) {
    return String(title || '')
      .replace(/^Die drei \?\?\?\s*(?:und\s+)?/i, '')
      .replace(/^\.\.\.\s*/, '')
      .trim();
  }

  function metadataToEpisode(meta, existing = {}) {
    const characters = uniqueStrings((meta.sprechrollen || []).map(roleValue));
    const speakers = uniqueStrings((meta.sprechrollen || []).map(speakerValue));
    const chapters = uniqueStrings((meta.kapitel || []).map(chapterValue));
    const description = String(meta.gesamtbeschreibung || meta.beschreibung || existing.beschreibung || '').trim();
    return {
      ...existing,
      nr: Number(meta.nummer ?? existing.nr),
      titel: existing.titel || cleanMetadataTitle(meta.titel),
      beschreibung: description,
      durationMin: Number.isFinite(Number(meta.gesamtdauer)) ? Math.round(Number(meta.gesamtdauer) / 60000) : existing.durationMin || null,
      releaseDate: meta.veröffentlichungsdatum || existing.releaseDate || null,
      characters: characters.length ? characters : existing.characters || [],
      speakers: speakers.length ? speakers : existing.speakers || [],
      chapters: chapters.length ? chapters : existing.chapters || [],
      author: authorValue(meta.autor || meta.buchautor || meta.buchautoren) || existing.author || '',
      scriptAuthor: authorValue(meta.hörspielskriptautor || meta.hoerspielskriptautor) || existing.scriptAuthor || '',
      spotifyUrl: directStreamingUrl(meta, 'spotify') || existing.spotifyUrl || null,
      appleMusicUrl: directStreamingUrl(meta, 'appleMusic') || existing.appleMusicUrl || null,
    };
  }


  function applyCanonicalCorrections(catalog) {
    return catalog.map((episode) => {
      if (episode.nr === 29) return normalizeEpisode({
        ...episode,
        titel: 'Die Originalmusik',
        beschreibung: 'Eine reine Musikfolge mit Melodien aus der EUROPA-Hörspielserie. Die Stücke wurden als Hintergrundmusik in verschiedenen Fällen verwendet; eine eigentliche Detektivhandlung gibt es nicht.',
        tags: uniqueStrings([episode.tags || [], ['musik', 'sonderfolge']]),
        searchKeywords: uniqueStrings([episode.searchKeywords || [], ['originalmusik', 'musikfolge', 'soundtrack', 'melodien', 'europa musik', 'keine handlung', 'sonderfolge']]),
      });
      if (episode.nr === 240) return normalizeEpisode({
        ...episode,
        titel: 'Die schwarze Rose',
        beschreibung: 'Wer schickt Justus eine schwarze Rose? Die drei ??? suchen nach dem unbekannten Absender und geraten dabei in einen neuen rätselhaften Fall.',
        rockyRanking: 2.2593,
        searchKeywords: uniqueStrings([episode.searchKeywords || [], ['schwarze rose', 'rose', 'justus', 'unbekannter absender']]),
      });
      if (episode.nr === 241) return normalizeEpisode({
        ...episode,
        titel: 'Meister des Lichts',
        beschreibung: 'Die drei ??? ermitteln in einem Fall rund um einen geheimnisvollen Meister des Lichts.',
        rockyRanking: 2.7727,
        searchKeywords: uniqueStrings([episode.searchKeywords || [], ['meister des lichts', 'licht', 'magier']]),
      });
      return episode;
    });
  }

  function mergeCatalogs(base, enrichment) {
    const map = new Map(base.map((episode) => [episode.nr, episode]));
    for (const item of enrichment || []) {
      const nr = Number(item.nr ?? item.nummer);
      if (!nr || nr > 11000) continue;
      const existing = map.get(nr) || {};
      const enriched = item.nummer != null || item.sprechrollen
        ? metadataToEpisode(item, existing)
        : {
          ...existing,
          ...item,
          nr,
          rockyRanking: existing.rockyRanking ?? item.rockyRanking ?? null,
          searchKeywords: uniqueStrings([existing.searchKeywords || [], item.searchKeywords || []]),
          spotifyUrl: item.spotifyUrl || existing.spotifyUrl || null,
          appleMusicUrl: item.appleMusicUrl || existing.appleMusicUrl || null,
        };
      map.set(nr, normalizeEpisode(enriched));
    }
    return applyCanonicalCorrections([...map.values()].filter((episode) => episode.nr <= 11000).sort((a, b) => a.nr - b.nr));
  }

  async function updateMetadata(manual = false) {
    try {
      if (manual) toast('Laufzeiten, Figuren, Kapitel und Streaming-Links werden geladen …');
      const response = await fetch(META_URL, { cache: 'no-store', mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const series = Array.isArray(data?.serie) ? data.serie : [];
      if (!series.length) throw new Error('Keine Metadaten gefunden');
      state.catalog = mergeCatalogs(state.catalog, series);
      invalidateDerived({ catalog: true });
      state.metadataUpdatedAt = data?.dbInfo?.lastModified || new Date().toISOString();
      await dbSet(CATALOG_KEY, { catalog: state.catalog, updatedAt: state.metadataUpdatedAt });
      renderAll();
      if (manual) {
        const roleCount = state.catalog.reduce((sum, episode) => sum + episode.characters.length, 0);
        toast(`${state.catalog.filter((episode) => episode.durationMin).length} Folgen und ${roleCount} Rollen aktualisiert.`);
      }
    } catch (error) {
      if (manual) {
        console.warn(error);
        toast('Folgenwissen konnte gerade nicht geladen werden. Die App bleibt offline nutzbar.');
      }
    }
  }

  function setMood(mood) {
    state.mood = mood;
    document.querySelectorAll('#moodPicker [data-mood]').forEach((button) => button.classList.toggle('active', button.dataset.mood === mood));
  }

  function moodLabel(mood) {
    return {
      any: 'Alle Themen', grusel: 'Grusel & Mystery', klassiker: 'Klassiker', familie: 'Familie',
      skinny: 'Skinny Norris', hugenay: 'Victor Hugenay', meer: 'Meer & Insel', kunst: 'Kunst',
    }[mood] || mood;
  }

  function openMoodCollection() {
    state.collectionLabel = state.mood === 'any' ? '' : moodLabel(state.mood);
    state.search = '';
    $('searchInput').value = '';
    state.filter = 'all';
    document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all'));
    pageDirty.episodes = true;
    showPage('episodes');
  }

  function clearCollection() {
    state.collectionLabel = '';
    setMood('any');
    pageDirty.episodes = true;
    renderEpisodes();
  }

  function bind() {
    document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.nav)));
    document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.go)));
    $('quickSettings').addEventListener('click', () => showPage('settings'));
    $('newPlaylistButton').addEventListener('click',()=>openPlaylistEditor());
    $('newPlaylistTextButton').addEventListener('click',()=>openPlaylistEditor());
    $('playlistLibraryTabs').addEventListener('click',(event)=>{const button=event.target.closest('[data-playlist-tab]');if(button)setPlaylistTab(button.dataset.playlistTab);});
    $('generatePlanButton').addEventListener('click',generatePlan);
    $('planPreview').addEventListener('click',(event)=>{if(event.target.closest('#saveGeneratedPlan'))saveGeneratedPlan();if(event.target.closest('#regeneratePlan'))generatePlan();});
    $('closePlaylistEditor').addEventListener('click',closePlaylistEditor); $('savePlaylistButton').addEventListener('click',savePlaylistEditor);
    $('closePlaylistPicker').addEventListener('click',closePlaylistPicker); $('pickerNewPlaylist').addEventListener('click',()=>{const nr=state.playlistPickerNr;closePlaylistPicker();openPlaylistEditor(null,nr);});
    $('closePlaylistDetail').addEventListener('click',closePlaylistDetail);
    $('playlistAddEpisodeButton').addEventListener('click',()=>{const panel=$('playlistAddPanel');panel.classList.toggle('hidden');if(!panel.classList.contains('hidden')){renderPlaylistAddResults('');setTimeout(()=>$('playlistAddSearch').focus(),50);}});
    $('playlistAddClose').addEventListener('click',()=>$('playlistAddPanel').classList.add('hidden'));
    $('playlistAddSearch').addEventListener('input',debounce((event)=>renderPlaylistAddResults(event.target.value),100));
    $('playlistSuggestionRefresh').addEventListener('click',()=>{state.playlistSuggestionOffset+=8;renderPlaylistSuggestions();});
    $('playlistSuggestionMode').addEventListener('click',()=>{state.playlistSuggestionMode=state.playlistSuggestionMode==='similar'?'variety':'similar';state.playlistSuggestionOffset=0;renderPlaylistSuggestions();});
    $('detailAddPlaylist').addEventListener('click',()=>{if(state.detailNr)openPlaylistPicker(state.detailNr);});
    $('playlistPlayFirst').addEventListener('click',()=>{const first=currentPlaylistEpisodes()[0];if(first)openStreaming(first.nr,preferredStreamingService());});
    $('playlistEditButton').addEventListener('click',()=>{const id=state.playlistDetailId;closePlaylistDetail();if(id&&!id.startsWith('curated:'))openPlaylistEditor(id);});
    $('playlistDeleteButton').addEventListener('click', async () => {
      const id = state.playlistDetailId;
      if (!id || id.startsWith('curated:')) return;
      const playlist = playlistById(id);
      if (!playlist) return;
      const accepted = await appConfirm({ kicker: 'Playlist', title: `„${playlist.title}“ löschen?`, message: 'Die Playlist wird entfernt. Deine Bewertungen und Hörstände bleiben erhalten.', confirmText: 'Playlist löschen', danger: true });
      if (!accepted) return;
      state.user.playlists = state.user.playlists.filter((item) => item.id !== id);
      closePlaylistDetail();
      persistPlaylists('Playlist gelöscht.');
    });


    $('searchInput').addEventListener('input', debounce((event) => {
      state.search = event.target.value;
      state.collectionLabel = '';
      pageDirty.episodes = true;
      renderEpisodes();
    }));
    $('clearSearch').addEventListener('click', () => {
      state.search = '';
      $('searchInput').value = '';
      pageDirty.episodes = true;
      renderEpisodes();
      $('searchInput').focus();
    });
    $('filterChips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button));
      pageDirty.episodes = true;
      renderEpisodes();
    });
    $('episodeSort').addEventListener('change', (event) => {
      state.sort = event.target.value;
      pageDirty.episodes = true;
      renderEpisodes();
    });
    $('authorFilter')?.addEventListener('change', (event) => {
      state.authorFilter = event.target.value;
      pageDirty.episodes = true;
      renderEpisodes();
    });
    $('eraFilter')?.addEventListener('change', (event) => {
      state.eraFilter = event.target.value;
      pageDirty.episodes = true;
      renderEpisodes();
    });

    $('rankingMode').addEventListener('click', (event) => {
      const button = event.target.closest('[data-ranking]');
      if (!button) return;
      state.ranking = button.dataset.ranking;
      document.querySelectorAll('[data-ranking]').forEach((item) => item.classList.toggle('active', item === button));
      pageDirty.ranking = true;
      renderRanking();
    });

    $('timePicker').addEventListener('click', (event) => {
      const button = event.target.closest('[data-time]');
      if (!button) return;
      state.time = button.dataset.time;
      document.querySelectorAll('[data-time]').forEach((item) => item.classList.toggle('active', item === button));
    });
    $('moodPicker').addEventListener('click', (event) => {
      const button = event.target.closest('[data-mood]');
      if (button) setMood(button.dataset.mood);
    });
    $('timeRecommendButton').addEventListener('click', () => showRecommendation(weightedPick(recommendationPool(state.time, state.mood)), moodLabel(state.mood)));
    $('exploreMoodButton').addEventListener('click', openMoodCollection);
    $('dailyRefreshButton').addEventListener('click', () => {
      state.dailyOffset += 1;
      $('todayCard').innerHTML = recommendationMarkup(dailyPick(), { kicker: 'Alternative für heute' });
    });
    $('randomNewButton').addEventListener('click', () => {
      const candidates = state.catalog.map(merged).filter((episode) => !episode.heard);
      showRecommendation(candidates[Math.floor(Math.random() * candidates.length)], 'Zufällige neue Folge');
    });
    $('randomHeardButton').addEventListener('click', () => showRecommendation(replayPick(), 'Zum Wiederhören'));
    $('randomSpecialButton').addEventListener('click', () => showRecommendation(weightedPick(recommendationPool('special', 'any')), 'Lange Spezialfolge'));

    $('streamingPreference').addEventListener('click', (event) => {
      const button = event.target.closest('[data-service]');
      if (button) setPreferredStreamingService(button.dataset.service);
    });

    $('exportButton').addEventListener('click', exportBackup);
    $('importButton').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) importBackupFile(file);
    });
    $('updateMetadataButton').addEventListener('click', () => updateMetadata(true));
    $('reloadCatalogButton').addEventListener('click', async () => {
      const seed = normalizeCatalog(window.DDF_EPISODES_SEED || []);
      state.catalog = applyCanonicalCorrections(seed);
      invalidateDerived({ catalog: true });
      state.metadataUpdatedAt = null;
      await dbDelete(CATALOG_KEY);
      renderAll();
      toast('Eingebauter Katalog wurde neu geladen.');
      updateMetadata(false);
    });
    $('startTutorialButton').addEventListener('click', () => startTutorial({ fromSettings: true }));
    $('openHelpButton').addEventListener('click', openHelp);
    $('closeHelp').addEventListener('click', closeHelp);
    $('helpOverlay').addEventListener('click', (event) => { if (event.target === $('helpOverlay')) closeHelp(); });
    $('helpStartTutorial').addEventListener('click', () => startTutorial({ fromSettings: true }));
    $('tutorialNext').addEventListener('click', tutorialNext);
    $('tutorialBack').addEventListener('click', tutorialBack);
    $('skipTutorial').addEventListener('click', skipTutorial);
    document.addEventListener('click', tutorialClickCapture, true);
    document.addEventListener('input', tutorialInputCapture, true);
    document.addEventListener('keydown', tutorialKeydownCapture, true);
    document.addEventListener('search', tutorialSearchCapture, true);
    document.addEventListener('change', tutorialChangeCapture, true);
    document.addEventListener('focusin', tutorialFocusInCapture, true);
    document.addEventListener('focusout', tutorialFocusOutCapture, true);
    document.addEventListener('wheel', tutorialScrollCapture, { capture: true, passive: false });
    document.addEventListener('touchmove', tutorialScrollCapture, { capture: true, passive: false });
    window.addEventListener('scroll', tutorialWindowScrollGuard, { passive: true });
    window.visualViewport?.addEventListener('resize', tutorialViewportChangeCapture, { passive: true });
    window.visualViewport?.addEventListener('scroll', tutorialViewportChangeCapture, { passive: true });
    $('closeHeardReset').addEventListener('click', closeHeardReset);
    $('cancelHeardReset').addEventListener('click', closeHeardReset);
    $('confirmUnheardAndClear').addEventListener('click', confirmUnheardAndClear);
    $('heardResetOverlay').addEventListener('click', (event) => { if (event.target === $('heardResetOverlay')) closeHeardReset(); });
    $('closeConfirm').addEventListener('click', () => closeConfirmDialog(false));
    $('confirmCancel').addEventListener('click', () => closeConfirmDialog(false));
    $('confirmAccept').addEventListener('click', () => closeConfirmDialog(true));
    $('confirmOverlay').addEventListener('click', (event) => { if (event.target === $('confirmOverlay')) closeConfirmDialog(false); });

    $('resetButton').addEventListener('click', async () => {
      const accepted = await appConfirm({
        kicker: 'Persönliche Daten',
        title: 'Alle persönlichen Daten löschen?',
        message: 'Hörstände, Bewertungen, Notizen und eigene Playlists werden unwiderruflich von diesem Gerät entfernt.',
        confirmText: 'Alle Daten löschen',
        danger: true,
      });
      if (!accepted) return;
      state.user = { version: APP_VERSION, episodes: {}, playlists: [], settings: { preferredService: preferredStreamingService(), tutorialCompleted: false, playlistTab: 'essentials' }, updatedAt: new Date().toISOString() };
      invalidateDerived();
      await dbSet(USER_KEY, state.user);
      renderAll();
      toast('Persönliche Daten wurden zurückgesetzt.');
    });

    $('closeDetail').addEventListener('click', closeDetail);
    $('detailOverlay').addEventListener('click', (event) => {
      if (event.target === $('detailOverlay')) closeDetail();
    });
    $('detailRating').addEventListener('click', (event) => {
      const button = event.target.closest('[data-rating]');
      if (button && state.detailNr) toggleEpisodeRating(state.detailNr, button.dataset.rating);
    });
    $('detailHeard').addEventListener('change', (event) => {
      if (!state.detailNr) return; if (event.target.checked) saveEpisode(state.detailNr, { heard: true }); else requestUnheard(state.detailNr);
    });
    $('detailNote').addEventListener('input', (event) => {
      clearTimeout(noteTimer);
      pendingNote = { number: Number(state.detailNr), value: event.target.value };
      noteTimer = setTimeout(flushPendingNote, 350);
    });
    $('detailNote').addEventListener('blur', flushPendingNote);
    $('clearRating').addEventListener('click', () => {
      if (state.detailNr) { saveEpisode(state.detailNr, { rating: null }); toast('Bewertung entfernt.'); }
    });
    $('resetEpisodeData').addEventListener('click', () => { if (state.detailNr) resetEpisodeData(state.detailNr); });

    document.addEventListener('click', (event) => {
      const playlistOpen=event.target.closest('[data-playlist-open]');if(playlistOpen){openPlaylistDetail(playlistOpen.dataset.playlistOpen,false);return;}
      const curatedOpen=event.target.closest('[data-curated-open]');if(curatedOpen){openPlaylistDetail(curatedOpen.dataset.curatedOpen,true);return;}
      const picker=event.target.closest('[data-picker-playlist]');if(picker&&state.playlistPickerNr){toggleEpisodeInPlaylist(picker.dataset.pickerPlaylist,state.playlistPickerNr);return;}
      const quickAdd=event.target.closest('[data-playlist-quick-add]');if(quickAdd){const [id,nr]=quickAdd.dataset.playlistQuickAdd.split(':');const pl=playlistById(id);const number=Number(nr);if(pl&&!pl.episodeNumbers.includes(number)){quickAdd.disabled=true;quickAdd.textContent='✓';pl.episodeNumbers.push(number);pl.updatedAt=new Date().toISOString();persistPlaylists();refreshOpenPlaylist({keepAddPanel:true,message:'Folge hinzugefügt ✓'});}return;}
      const suggestAdd=event.target.closest('[data-playlist-suggest-add]');if(suggestAdd){const [id,nr]=suggestAdd.dataset.playlistSuggestAdd.split(':');const pl=playlistById(id);const number=Number(nr);if(pl&&!pl.episodeNumbers.includes(number)){suggestAdd.disabled=true;suggestAdd.textContent='✓';pl.episodeNumbers.push(number);pl.updatedAt=new Date().toISOString();persistPlaylists();refreshOpenPlaylist({message:'Passende Folge hinzugefügt ✓'});}return;}
            const move=event.target.closest('[data-playlist-move]');if(move){const [id,indexText,deltaText]=move.dataset.playlistMove.split(':');const pl=playlistById(id),index=Number(indexText),next=index+Number(deltaText);if(pl&&next>=0&&next<pl.episodeNumbers.length){[pl.episodeNumbers[index],pl.episodeNumbers[next]]=[pl.episodeNumbers[next],pl.episodeNumbers[index]];pl.updatedAt=new Date().toISOString();persistPlaylists();refreshOpenPlaylist({message:'Reihenfolge aktualisiert'});}return;}
      const remove=event.target.closest('[data-playlist-remove]');if(remove){const [id,nr]=remove.dataset.playlistRemove.split(':');const pl=playlistById(id);if(pl){const row=remove.closest('[data-playlist-episode]');row?.classList.add('removing');setTimeout(()=>{pl.episodeNumbers=pl.episodeNumbers.filter(n=>n!==Number(nr));pl.updatedAt=new Date().toISOString();persistPlaylists();refreshOpenPlaylist({message:'Folge entfernt'});},160);}return;}
      const connectionOpen = event.target.closest('[data-connection-open]');
      if (connectionOpen) {
        event.preventDefault();
        event.stopPropagation();
        openConnectionPlaylist(connectionOpen.dataset.connectionOpen);
        return;
      }
      const connectionSave = event.target.closest('[data-connection-save]');
      if (connectionSave) {
        event.preventDefault();
        event.stopPropagation();
        saveConnectionPlaylist(connectionSave.dataset.connectionSave, false);
        connectionSave.textContent = 'Gespeichert ✓';
        connectionSave.disabled = true;
        return;
      }
      const streamButton = event.target.closest('[data-stream]');
      if (streamButton) {
        event.preventDefault();
        event.stopPropagation();
        const [number, service] = streamButton.dataset.stream.split(':');
        openStreaming(Number(number), service);
        return;
      }
      const ratingButton = event.target.closest('[data-rate]');
      if (ratingButton) {
        event.preventDefault();
        event.stopPropagation();
        const [number, rating] = ratingButton.dataset.rate.split(':');
        toggleEpisodeRating(Number(number), rating);
        return;
      }
      const heardButton = event.target.closest('[data-heard]');
      if (heardButton) {
        event.preventDefault();
        event.stopPropagation();
        const number = Number(heardButton.dataset.heard);
        userFor(number).heard ? requestUnheard(number) : saveEpisode(number, { heard: true });
        return;
      }
      const collectionClear = event.target.closest('#clearCollection');
      if (collectionClear) {
        clearCollection();
        return;
      }
      const openButton = event.target.closest('[data-open]');
      if (openButton) openDetail(openButton.dataset.open);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushPendingNote();
    });
    window.addEventListener('pagehide', flushPendingNote);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const visibleDialog = [...document.querySelectorAll('.overlay:not(.hidden) [role="dialog"], .overlay:not(.hidden) [role="alertdialog"], #tutorialOverlay:not(.hidden) [role="dialog"]')].pop();
      if (!visibleDialog) return;
      const focusable = [...visibleDialog.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!$('tutorialOverlay').classList.contains('hidden')) skipTutorial();
        else if (!$('confirmOverlay').classList.contains('hidden')) closeConfirmDialog(false);
        else if (!$('heardResetOverlay').classList.contains('hidden')) closeHeardReset();
        else if (!$('helpOverlay').classList.contains('hidden')) closeHelp();
        else if (state.detailNr) closeDetail();
        else if (state.playlistDetailId) closePlaylistDetail();
        else { closePlaylistEditor(); closePlaylistPicker(); }
      }
    });
  }

  async function loadCatalog() {
    let seed = normalizeCatalog(window.DDF_EPISODES_SEED || []);
    if (!seed.length) {
      const response = await fetch('episodes.json', { cache: 'no-store' });
      seed = normalizeCatalog(await response.json());
    }

    const cached = await dbGet(CATALOG_KEY);
    if (cached?.catalog?.length) {
      state.catalog = mergeCatalogs(seed, cached.catalog);
      state.metadataUpdatedAt = cached.updatedAt || null;
      return { cached: true, needsUpdate: !state.catalog.some((episode) => episode.characters?.length) || !cached.updatedAt || Date.now() - new Date(cached.updatedAt).getTime() > META_MAX_AGE };
    }

    for (const key of LEGACY_CATALOG_KEYS) {
      const legacy = await dbGet(key);
      if (legacy?.catalog?.length) {
        state.catalog = mergeCatalogs(seed, legacy.catalog);
        state.metadataUpdatedAt = legacy.updatedAt || null;
        return { cached: false, needsUpdate: true };
      }
    }
    state.catalog = applyCanonicalCorrections(seed);
    return { cached: false, needsUpdate: true };
  }

  async function init() {
    try {
      const catalogStatus = await loadCatalog();
      await loadUser();
      state.playlistTab = state.user.settings?.playlistTab || 'essentials';
      invalidateDerived({ catalog: true });
      bind();
      renderAll();
      if (!tutorialCompleted()) setTimeout(() => startTutorial(), 450);
      if (catalogStatus.needsUpdate) updateMetadata(false);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then((registration) => {
          registration.update?.().catch(() => {});
          const info = $('appUpdateInfo');
          if (info) info.textContent = navigator.onLine ? 'Offline bereit · App-Shell wird automatisch aktuell gehalten.' : 'Offline-Modus aktiv · lokale Daten verfügbar.';
        }).catch((error) => {
          console.warn(error);
          const info = $('appUpdateInfo');
          if (info) info.textContent = 'Lokale Daten verfügbar · Offline-Cache konnte nicht bestätigt werden.';
        });
      }
    } catch (error) {
      console.error(error);
      toast('App-Daten konnten nicht geladen werden.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
