(() => {
  'use strict';

  const DB_NAME = 'ddf-tracker';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const USER_KEY = 'appState';
  const CATALOG_KEY = 'enrichedCatalogV6';
  const LEGACY_CATALOG_KEYS = ['enrichedCatalogV5', 'enrichedCatalogV4'];
  const LEGACY_USER_KEYS = ['user-state', 'userState', 'state'];
  const APP_VERSION = 6;
  const META_URL = 'https://dreimetadaten.de/data/Serie.json';
  const META_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

  const state = {
    catalog: [],
    user: { version: APP_VERSION, episodes: {}, updatedAt: null },
    page: 'home',
    filter: 'all',
    sort: 'nr',
    ranking: 'rocky',
    search: '',
    detailNr: null,
    time: 'any',
    mood: 'any',
    collectionLabel: '',
    metadataUpdatedAt: null,
    dailyOffset: 0,
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
      authors: normalizeText(`${episode.author || ''} ${episode.scriptAuthor || ''}`),
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
      searchKeywords: uniqueStrings(raw.searchKeywords || raw.keywords || []),
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

  function normalizeUser(raw) {
    const output = { version: APP_VERSION, episodes: {}, updatedAt: raw?.updatedAt || null };
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
    return value == null ? '—' : Number(value).toFixed(2).replace('.', ',');
  }

  function fmtDuration(minutes) {
    if (!minutes) return '—';
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    if (!hours) return `${remaining} Min.`;
    return `${hours} Std.${remaining ? ` ${remaining} Min.` : ''}`;
  }

  function isSpecial(episode) {
    return (episode.durationMin || 0) >= 120 || [100, 125, 150, 175, 200, 225].includes(episode.nr);
  }

  function displayDescription(episode) {
    const description = String(episode.beschreibung || '');
    if (!description || /^Stichwort/i.test(description) || /^Metadaten werden/i.test(description)) return '';
    return description;
  }

  let persistTimer = null;
  let persistChain = Promise.resolve();
  let homeRefreshTimer = null;

  function queueUserPersist() {
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
        button.classList.toggle('active', button.dataset.value === user.rating);
      });
      const heardButton = card.querySelector('[data-heard]');
      if (heardButton) {
        heardButton.classList.toggle('on', user.heard);
        heardButton.textContent = user.heard ? '✓' : '○';
        heardButton.setAttribute('aria-label', user.heard ? 'Als ungehört markieren' : 'Als gehört markieren');
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
      renderSettings();
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
      if (!patch.heard && old.rating) {
        toast('Bewertete Folgen bleiben als gehört markiert. Entferne zuerst die Bewertung.');
        patchVisibleEpisode(number);
        return;
      }
      if (!patch.heard) next.heardAt = null;
    }

    state.user.episodes[String(number)] = next;
    state.user.updatedAt = now;

    // Sofortige, optimistische UI-Aktualisierung. IndexedDB läuft danach im Hintergrund.
    patchVisibleEpisode(number);
    if (state.detailNr === number) refreshDetail();
    queueUserPersist();
    scheduleSecondaryRefresh();
  }

  function episodeFeatures(episode) {
    const features = [];
    for (const tag of episode.tags || []) features.push({ key: `tag:${normalizeText(tag)}`, label: tag, type: 'tag' });
    for (const character of importantCharacters(episode, 8)) features.push({ key: `character:${normalizeText(character)}`, label: character, type: 'character' });
    return features;
  }

  function tasteProfile() {
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
    return { weights, rated };
  }

  function recommendationScore(episode) {
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
    return { score, match, reasons };
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
    const source = episode._search?.all || '';
    if (mood === 'klassiker') return episode.nr <= 40;
    if (mood === 'grusel') return episode.tags.some((tag) => ['Grusel', 'Mystery'].includes(tag));
    if (mood === 'familie') return source.includes('tante mathilda') || source.includes('onkel titus') || source.includes('ben peck') || episode.tags.includes('Familie');
    if (mood === 'skinny') return source.includes('skinny norris');
    if (mood === 'hugenay') return source.includes('hugenay');
    if (mood === 'meer') return episode.tags.includes('Meer & Insel');
    if (mood === 'kunst') return episode.tags.includes('Kunst');
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
    state.page = page;
    document.querySelectorAll('.page').forEach((element) => element.classList.toggle('active', element.dataset.page === page));
    document.querySelectorAll('[data-nav]').forEach((element) => element.classList.toggle('active', element.dataset.nav === page));
    if (page === 'episodes') renderEpisodes();
    if (page === 'ranking') renderRanking();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    const kicker = options.kicker || (isSpecial(episode) ? 'Spezial-Empfehlung' : 'Persönliche Empfehlung');
    return `
      <div class="recommendation-top">
        <div>
          <span class="eyebrow">${esc(kicker)}</span>
          <h3>${episode.nr}. ${esc(episode.titel)}</h3>
          <p>${result.reasons.length ? 'Passt zu Merkmalen deiner besonders gut bewerteten Folgen.' : 'Ausgewählt anhand des Community-Rankings und deiner bisherigen Daten.'}</p>
        </div>
        <div class="match-badge"><strong>${result.match}%</strong><span>Match</span></div>
      </div>
      <div class="recommend-reasons">${reasons.slice(0, 6).map((reason) => `<span>${esc(reason)}</span>`).join('')}</div>
      <div class="recommendation-actions"><button class="primary-button" data-open="${episode.nr}">Folge ansehen</button></div>`;
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
          <span><strong>${episode.nr}. ${esc(episode.titel)}</strong><small>${episode.heard ? 'Gehört' : 'Offen'} · ${ratingLabel(episode.rating)}${episode.durationMin ? ` · ${fmtDuration(episode.durationMin)}` : ''}</small></span>
          <span class="compact-rating">${ratingSymbol(episode.rating)}</span>
        </button>`).join('')
      : '<div class="empty-message">Noch keine Aktivität. Eine Bewertung markiert die Folge automatisch als gehört.</div>';
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
            <span class="episode-number">FOLGE ${episode.nr}</span>
            <h3 class="episode-title">${esc(episode.titel)}</h3>
            ${description ? `<p class="episode-description">${esc(description)}</p>` : ''}
          </div>
          <button class="heard-button ${episode.heard ? 'on' : ''}" data-heard="${episode.nr}" aria-label="${episode.heard ? 'Als ungehört markieren' : 'Als gehört markieren'}">${episode.heard ? '✓' : '○'}</button>
        </div>
        <div class="episode-footer">
          <div class="badges">
            <span class="badge">${fmtDuration(episode.durationMin)}</span>
            ${isSpecial(episode) ? '<span class="badge special-badge">✦ Spezial</span>' : ''}
            <span class="badge">Rocky ${fmtRocky(episode.rockyRanking)}</span>
            ${showMatch ? `<span class="badge match">${result.match}% Match</span>` : `<span class="badge">${ratingLabel(episode.rating)}</span>`}
          </div>
          <div class="rating-mini" aria-label="Eigene Bewertung">
            <button data-rate="${episode.nr}:minus" data-value="minus" class="${episode.rating === 'minus' ? 'active' : ''}" aria-label="Minus">−</button>
            <button data-rate="${episode.nr}:neutral" data-value="neutral" class="${episode.rating === 'neutral' ? 'active' : ''}" aria-label="Neutral">●</button>
            <button data-rate="${episode.nr}:plus" data-value="plus" class="${episode.rating === 'plus' ? 'active' : ''}" aria-label="Plus">＋</button>
            <button data-rate="${episode.nr}:super" data-value="super" class="${episode.rating === 'super' ? 'active' : ''}" aria-label="Super">★</button>
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
      label = 'Match';
    } else {
      mainValue = ratingSymbol(episode.rating);
      label = ratingLabel(episode.rating);
    }
    const details = [fmtDuration(episode.durationMin), importantCharacters(episode, 2).join(' · ')].filter((item) => item && item !== '—').join(' · ');
    return `
      <button class="ranking-card" data-open="${episode.nr}">
        <span class="rank-position">${position}</span>
        <span class="rank-main"><strong>${episode.nr}. ${esc(episode.titel)}</strong><small>${esc(details || 'Keine Zusatzdaten')}</small></span>
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
      return;
    }
    if (state.ranking === 'match') {
      const ranked = recommendationPool('any', 'any');
      info.innerHTML = `<strong>${ranked.length}</strong> ungehörte Folgen, sortiert nach deinem Profil. Super-Folgen zählen dabei doppelt.`;
      list.innerHTML = ranked.slice(0, 100).map((episode, index) => rankingCard(episode, index + 1, 'match')).join('') || '<div class="empty-message">Du hast alle Folgen gehört.</div>';
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
  }

  function renderSettings() {
    const states = Object.keys(state.user.episodes).length;
    const roles = state.catalog.reduce((sum, episode) => sum + (episode.characters?.length || 0), 0);
    $('storageInfo').textContent = `${state.catalog.length} Folgen · ${states} persönliche Einträge · ${state.catalog.filter((episode) => episode.rockyRanking != null).length} Rocky-Wertungen`;
    $('metadataInfo').textContent = state.metadataUpdatedAt
      ? `Folgenwissen: ${roles.toLocaleString('de-DE')} Rollen · aktualisiert ${new Date(state.metadataUpdatedAt).toLocaleDateString('de-DE')}`
      : 'Laufzeiten, Figuren und Kapitel werden beim ersten Online-Start ergänzt.';
  }

  function renderAll() {
    renderHome();
    if (state.page === 'episodes') renderEpisodes();
    if (state.page === 'ranking') renderRanking();
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
    state.detailNr = Number(number);
    refreshDetail();
    $('detailOverlay').classList.remove('hidden');
    $('detailOverlay').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    state.detailNr = null;
    $('detailOverlay').classList.add('hidden');
    $('detailOverlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function refreshDetail() {
    const base = state.catalog.find((episode) => episode.nr === state.detailNr);
    if (!base) return;
    const episode = merged(base);
    const result = recommendationScore(episode);
    const description = displayDescription(episode);
    const characters = importantCharacters(episode, 8);
    $('detailNumber').textContent = `Folge ${episode.nr}`;
    $('detailTitle').textContent = episode.titel;
    $('detailMatch').textContent = `${result.match}%`;
    $('detailDescription').textContent = description || 'Für diese Folge ist noch keine Kurzbeschreibung lokal gespeichert. Unter Einstellungen kannst du das Folgenwissen aktualisieren.';
    $('detailMeta').innerHTML = `
      <span class="badge">${fmtDuration(episode.durationMin)}</span>
      ${isSpecial(episode) ? '<span class="badge special-badge">✦ Spezial / extra lang</span>' : ''}
      <span class="badge">Rocky ${fmtRocky(episode.rockyRanking)}</span>
      ${episode.releaseDate ? `<span class="badge">${esc(new Date(episode.releaseDate).toLocaleDateString('de-DE'))}</span>` : ''}`;

    $('detailReasonsSection').classList.toggle('hidden', !result.reasons.length);
    $('detailReasons').innerHTML = result.reasons.map((reason) => `<span>${esc(reason)}</span>`).join('');
    $('detailCharactersSection').classList.toggle('hidden', !characters.length);
    $('detailCharacters').innerHTML = characters.map((character) => `<span>${esc(character)}</span>`).join('');
    $('detailThemesSection').classList.toggle('hidden', !episode.tags.length);
    $('detailThemes').innerHTML = episode.tags.slice(0, 10).map((tag) => `<span>${esc(tag)}</span>`).join('');

    document.querySelectorAll('#detailRating [data-rating]').forEach((button) => button.classList.toggle('active', button.dataset.rating === episode.rating));
    $('detailHeard').checked = episode.heard;
    $('detailHeardDate').textContent = episode.heardAt
      ? `Zuletzt markiert am ${new Date(episode.heardAt).toLocaleDateString('de-DE')}`
      : 'Eine Bewertung markiert die Folge automatisch als gehört.';
    if (document.activeElement !== $('detailNote')) $('detailNote').value = episode.note || '';
  }

  function toast(message) {
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
      if (!count && !confirm('Das Backup enthält keine Folgenstände. Trotzdem importieren?')) return;
      if (!confirm(`${count} gespeicherte Folgenstände importieren und vorhandene Daten ersetzen?`)) return;
      state.user = normalized;
      state.user.updatedAt = new Date().toISOString();
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
    };
  }

  function mergeCatalogs(base, enrichment) {
    const map = new Map(base.map((episode) => [episode.nr, episode]));
    for (const item of enrichment || []) {
      const nr = Number(item.nr ?? item.nummer);
      if (!nr || nr > 248) continue;
      const existing = map.get(nr) || {};
      const enriched = item.nummer != null || item.sprechrollen
        ? metadataToEpisode(item, existing)
        : {
          ...existing,
          ...item,
          nr,
          rockyRanking: existing.rockyRanking ?? item.rockyRanking ?? null,
          searchKeywords: uniqueStrings([existing.searchKeywords || [], item.searchKeywords || []]),
        };
      map.set(nr, normalizeEpisode(enriched));
    }
    return [...map.values()].filter((episode) => episode.nr <= 248).sort((a, b) => a.nr - b.nr);
  }

  async function updateMetadata(manual = false) {
    try {
      if (manual) toast('Laufzeiten, Figuren und Kapitel werden geladen …');
      const response = await fetch(META_URL, { cache: 'no-store', mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const series = Array.isArray(data?.serie) ? data.serie : [];
      if (!series.length) throw new Error('Keine Metadaten gefunden');
      state.catalog = mergeCatalogs(state.catalog, series);
      state.metadataUpdatedAt = data?.dbInfo?.lastModified || new Date().toISOString();
      await dbSet(CATALOG_KEY, { catalog: state.catalog, updatedAt: state.metadataUpdatedAt });
      renderAll();
      if (manual) {
        const roleCount = state.catalog.reduce((sum, episode) => sum + episode.characters.length, 0);
        toast(`${state.catalog.filter((episode) => episode.durationMin).length} Folgen und ${roleCount} Rollen aktualisiert.`);
      }
    } catch (error) {
      console.warn(error);
      if (manual) toast('Folgenwissen konnte gerade nicht geladen werden. Die App bleibt offline nutzbar.');
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
    showPage('episodes');
    renderEpisodes();
  }

  function clearCollection() {
    state.collectionLabel = '';
    setMood('any');
    renderEpisodes();
  }

  function bind() {
    document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.nav)));
    document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.go)));
    $('quickSettings').addEventListener('click', () => showPage('settings'));

    $('searchInput').addEventListener('input', debounce((event) => {
      state.search = event.target.value;
      state.collectionLabel = '';
      renderEpisodes();
    }));
    $('clearSearch').addEventListener('click', () => {
      state.search = '';
      $('searchInput').value = '';
      renderEpisodes();
      $('searchInput').focus();
    });
    $('filterChips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button));
      renderEpisodes();
    });
    $('episodeSort').addEventListener('change', (event) => {
      state.sort = event.target.value;
      renderEpisodes();
    });

    $('rankingMode').addEventListener('click', (event) => {
      const button = event.target.closest('[data-ranking]');
      if (!button) return;
      state.ranking = button.dataset.ranking;
      document.querySelectorAll('[data-ranking]').forEach((item) => item.classList.toggle('active', item === button));
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

    $('exportButton').addEventListener('click', exportBackup);
    $('importButton').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) importBackupFile(file);
    });
    $('updateMetadataButton').addEventListener('click', () => updateMetadata(true));
    $('reloadCatalogButton').addEventListener('click', async () => {
      const seed = normalizeCatalog(window.DDF_EPISODES_SEED || []);
      state.catalog = seed;
      state.metadataUpdatedAt = null;
      await dbDelete(CATALOG_KEY);
      renderAll();
      toast('Eingebauter Katalog wurde neu geladen.');
      updateMetadata(false);
    });
    $('resetButton').addEventListener('click', async () => {
      if (!confirm('Wirklich alle persönlichen Hörstände, Bewertungen und Notizen löschen?')) return;
      state.user = { version: APP_VERSION, episodes: {}, updatedAt: new Date().toISOString() };
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
      if (button && state.detailNr) saveEpisode(state.detailNr, { rating: button.dataset.rating });
    });
    $('detailHeard').addEventListener('change', (event) => {
      if (state.detailNr) saveEpisode(state.detailNr, { heard: event.target.checked });
    });
    $('detailNote').addEventListener('input', (event) => {
      clearTimeout(noteTimer);
      const number = state.detailNr;
      const value = event.target.value;
      noteTimer = setTimeout(() => {
        if (number) saveEpisode(number, { note: value });
      }, 450);
    });
    $('clearRating').addEventListener('click', () => {
      if (state.detailNr) saveEpisode(state.detailNr, { rating: null });
    });

    document.addEventListener('click', (event) => {
      const ratingButton = event.target.closest('[data-rate]');
      if (ratingButton) {
        event.preventDefault();
        event.stopPropagation();
        const [number, rating] = ratingButton.dataset.rate.split(':');
        saveEpisode(Number(number), { rating });
        return;
      }
      const heardButton = event.target.closest('[data-heard]');
      if (heardButton) {
        event.preventDefault();
        event.stopPropagation();
        const number = Number(heardButton.dataset.heard);
        saveEpisode(number, { heard: !userFor(number).heard });
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

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.detailNr) closeDetail();
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
    state.catalog = seed;
    return { cached: false, needsUpdate: true };
  }

  async function init() {
    try {
      const catalogStatus = await loadCatalog();
      await loadUser();
      bind();
      renderAll();
      if (catalogStatus.needsUpdate) updateMetadata(false);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
    } catch (error) {
      console.error(error);
      toast('App-Daten konnten nicht geladen werden.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
