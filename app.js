
(() => {
  const DB_NAME = 'ddf-tracker';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const STATE_KEY = 'appState';
  const CATALOG_KEY = 'catalog';

  const els = {};
  const state = {
    filter: 'all',
    sort: 'nr',
    search: '',
    catalog: [],
    user: { episodes: {}, version: 1, updatedAt: null },
    currentEdit: null,
    catalogLoaded: false,
  };

  const ratingOrder = { plus: 2, neutral: 1, minus: 0, none: -1 };

  function $(id){ return document.getElementById(id); }

  function toast(msg){
    const wrap = $('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function slugify(s){
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }

  function parseTags(value){
    return String(value || '')
      .split(/[,\n;]/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  function fmtRating(r){
    if (r === null || r === undefined || r === '') return '—';
    const n = Number(r);
    return Number.isFinite(n) ? n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'') : '—';
  }

  function userStateFor(nr){
    return state.user.episodes[String(nr)] || { heard:false, rating:'neutral', tags:[], note:'' };
  }

  function episodeMerged(ep){
    const u = userStateFor(ep.nr);
    const tags = [...(ep.tags || [])];
    for (const t of (u.tags || [])) if (!tags.includes(t)) tags.push(t);
    return { ...ep, ...u, tags };
  }

  function ratingLabel(r){
    return r === 'plus' ? 'Plus' : r === 'minus' ? 'Minus' : 'Neutral';
  }

  function saveUserState(){
    state.user.updatedAt = new Date().toISOString();
    return idbSet(STATE_KEY, state.user).then(() => {
      $('syncText').textContent = `Gespeichert ${new Date(state.user.updatedAt).toLocaleString('de-DE')}`;
    });
  }

  async function idbOpen(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  let dbPromise = null;
  async function db(){
    if (!dbPromise) dbPromise = idbOpen();
    return dbPromise;
  }

  async function idbGet(key){
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value){
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function idbClear(){
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function normalizeImported(data){
    if (Array.isArray(data)) {
      return { catalog: data, user: null };
    }
    if (data && Array.isArray(data.catalog)) {
      return { catalog: data.catalog, user: data.user || null };
    }
    if (data && data.episodes && typeof data.episodes === 'object') {
      return { catalog: null, user: data };
    }
    return { catalog: null, user: null };
  }

  function autoEnhanceCatalog(raw){
    return raw.map(item => {
      const tags = Array.isArray(item.tags) ? item.tags.slice() : [];
      const desc = item.beschreibung || item.description || '';
      return {
        nr: Number(item.nr ?? item.NumberEuropa ?? item.number ?? item.numberEuropa ?? 0),
        titel: item.titel || item.Title || item.title || '',
        beschreibung: desc,
        tags,
        rockyRanking: item.rockyRanking ?? item.rocky ?? item.Rating ?? null,
        collection: item.collection || 'main'
      };
    }).filter(ep => ep.nr && ep.titel);
  }

  async function loadCatalogFromSeed(){
    const seed = window.DDF_EPISODES_SEED || [];
    state.catalog = autoEnhanceCatalog(seed).sort((a,b)=>a.nr-b.nr);
    state.catalogLoaded = true;
    await idbSet(CATALOG_KEY, state.catalog);
  }

  async function tryLoadStoredCatalog(){
    const stored = await idbGet(CATALOG_KEY);
    if (Array.isArray(stored) && stored.length) {
      state.catalog = stored;
      state.catalogLoaded = true;
      return true;
    }
    return false;
  }

  function computeStats(){
    const total = state.catalog.length;
    let heard = 0, plus = 0, minus = 0;
    for (const ep of state.catalog) {
      const u = userStateFor(ep.nr);
      if (u.heard) heard++;
      if (u.rating === 'plus') plus++;
      if (u.rating === 'minus') minus++;
    }
    $('heardCount').textContent = heard;
    $('unheardCount').textContent = total - heard;
    $('plusCount').textContent = plus;
    $('resultInfo').textContent = `${visibleEpisodes().length} von ${total} Folgen`;
    $('statusText').textContent = state.catalogLoaded
      ? `Katalog geladen: ${total} Folgen`
      : 'Kein Katalog geladen';
  }

  function visibleEpisodes(){
    const q = state.search.trim().toLowerCase();
    let list = state.catalog.map(episodeMerged);
    if (state.filter === 'heard') list = list.filter(e => e.heard);
    if (state.filter === 'unheard') list = list.filter(e => !e.heard);
    if (state.filter === 'plus') list = list.filter(e => e.rating === 'plus');
    if (state.filter === 'neutral') list = list.filter(e => e.rating === 'neutral');
    if (state.filter === 'minus') list = list.filter(e => e.rating === 'minus');
    if (q) {
      list = list.filter(e => {
        const hay = [
          e.titel,
          e.beschreibung,
          e.tags.join(' '),
          e.note || '',
          String(e.nr),
          ratingLabel(e.rating),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    list.sort((a,b) => {
      const rockyA = Number.isFinite(Number(a.rockyRanking)) ? Number(a.rockyRanking) : null;
      const rockyB = Number.isFinite(Number(b.rockyRanking)) ? Number(b.rockyRanking) : null;
      if (state.sort === 'nr-desc') return b.nr - a.nr;
      if (state.sort === 'title') return a.titel.localeCompare(b.titel, 'de');
      if (state.sort === 'rocky-best') {
        if (rockyA === null && rockyB === null) return a.nr - b.nr;
        if (rockyA === null) return 1;
        if (rockyB === null) return -1;
        return rockyA - rockyB || a.nr - b.nr;
      }
      if (state.sort === 'rocky-worst') {
        if (rockyA === null && rockyB === null) return a.nr - b.nr;
        if (rockyA === null) return 1;
        if (rockyB === null) return -1;
        return rockyB - rockyA || a.nr - b.nr;
      }
      if (state.sort === 'rating') {
        return (ratingOrder[b.rating] ?? -1) - (ratingOrder[a.rating] ?? -1) || a.nr - b.nr;
      }
      return a.nr - b.nr;
    });
    return list;
  }

  function render(){
    computeStats();
    const list = $('episodeList');
    list.innerHTML = '';
    const items = visibleEpisodes();
    for (const ep of items) {
      const card = document.createElement('article');
      card.className = `item rating-${ep.rating || 'neutral'}`;
      card.dataset.nr = ep.nr;

      const top = document.createElement('div');
      top.className = 'item-top';

      const left = document.createElement('div');
      left.className = 'item-title-wrap';
      const title = document.createElement('h3');
      title.className = 'item-title';
      title.textContent = `${ep.nr}. ${ep.titel}`;
      const ratingBanner = document.createElement('div');
      ratingBanner.className = `rating-banner ${ep.rating || 'neutral'}`;
      ratingBanner.innerHTML = `<span>Deine Bewertung</span><strong>${ep.rating === 'plus' ? '＋ Plus' : ep.rating === 'minus' ? '－ Minus' : '• Neutral'}</strong>`;
      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const parts = [];
      if (ep.collection !== 'main') parts.push(ep.collection);
      if (ep.beschreibung) parts.push(ep.beschreibung);
      if (ep.note) parts.push(`Notiz: ${ep.note}`);
      meta.textContent = parts.join(' · ');
      const rocky = document.createElement('div');
      rocky.className = 'rocky-badge' + (ep.rockyRanking == null ? ' missing' : '');
      rocky.textContent = ep.rockyRanking == null ? 'Rocky-Beach: keine Wertung' : `Rocky-Beach: ${fmtRating(ep.rockyRanking)} (1 = sehr gut)`;
      left.append(ratingBanner, title, meta, rocky);

      const heardBtn = document.createElement('button');
      heardBtn.className = 'pill' + (ep.heard ? ' on' : '');
      heardBtn.textContent = ep.heard ? '✓ gehört' : '○ offen';
      heardBtn.addEventListener('click', async () => {
        setUser(ep.nr, { heard: !ep.heard });
      });

      top.append(left, heardBtn);

      const actions = document.createElement('div');
      actions.className = 'item-actions rating-segment';

      const ratingButtons = ['plus','neutral','minus'].map(rate => {
        const b = document.createElement('button');
        b.className = 'pill ' + rate + (ep.rating === rate ? ' on' : '');
        b.textContent = rate === 'plus' ? '＋ Plus' : rate === 'neutral' ? '• Neutral' : '－ Minus';
        b.addEventListener('click', () => setUser(ep.nr, { rating: rate }));
        return b;
      });
      ratingButtons.forEach(b => actions.appendChild(b));

      const edit = document.createElement('button');
      edit.className = 'pill';
      edit.textContent = '✎ Tags/Notiz';
      edit.addEventListener('click', () => openEditor(ep.nr));
      actions.appendChild(edit);

      const tags = document.createElement('div');
      tags.className = 'tags';
      const allTags = (ep.tags || []).slice(0, 8);
      for (const t of allTags) {
        const chip = document.createElement('span');
        chip.className = 'tag' + ((userStateFor(ep.nr).tags || []).includes(t) ? ' user' : '');
        chip.textContent = t;
        tags.appendChild(chip);
      }
      if ((ep.tags || []).length === 0) {
        const chip = document.createElement('span');
        chip.className = 'tag';
        chip.textContent = 'keine Tags';
        tags.appendChild(chip);
      }

      card.append(top, actions, tags);
      list.appendChild(card);
    }

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'item';
      empty.textContent = 'Keine Treffer.';
      list.appendChild(empty);
    }
  }

  async function setUser(nr, patch){
    const key = String(nr);
    const current = userStateFor(nr);
    const updated = { ...current, ...patch };
    if (updated.tags && !Array.isArray(updated.tags)) updated.tags = parseTags(updated.tags);
    if (updated.note === undefined) updated.note = current.note || '';
    state.user.episodes[key] = updated;
    await saveUserState();
    render();
  }

  function openEditor(nr){
    const ep = episodeMerged(state.catalog.find(e => e.nr === nr));
    state.currentEdit = nr;
    $('editNr').textContent = `Folge ${ep.nr}`;
    $('editTitle').textContent = ep.titel;
    $('heardToggle').checked = !!ep.heard;
    $('tagsInput').value = (state.user.episodes[String(nr)]?.tags || []).join(', ');
    $('noteInput').value = state.user.episodes[String(nr)]?.note || '';
    document.querySelectorAll('.rate-btn').forEach(btn => btn.classList.toggle('selected', btn.dataset.rate === ep.rating));
    $('editorOverlay').classList.remove('hidden');
    $('editorOverlay').setAttribute('aria-hidden', 'false');
  }

  function closeEditor(){
    $('editorOverlay').classList.add('hidden');
    $('editorOverlay').setAttribute('aria-hidden', 'true');
    state.currentEdit = null;
  }

  async function saveEditor(){
    if (!state.currentEdit) return;
    const nr = state.currentEdit;
    const current = userStateFor(nr);
    const chosenRate = document.querySelector('.rate-btn.selected')?.dataset.rate || current.rating || 'neutral';
    await setUser(nr, {
      heard: $('heardToggle').checked,
      rating: chosenRate,
      tags: parseTags($('tagsInput').value),
      note: $('noteInput').value.trim(),
    });
    closeEditor();
  }

  function clearEditorSelection(){
    document.querySelectorAll('.rate-btn').forEach(btn => btn.classList.remove('selected'));
  }

  function scoreEpisode(ep){
    const heardPlus = state.catalog
      .map(episodeMerged)
      .filter(e => e.heard && e.rating === 'plus');
    const heardMinus = state.catalog
      .map(episodeMerged)
      .filter(e => e.heard && e.rating === 'minus');

    const profile = new Map();
    for (const e of heardPlus) {
      const factor = 1 + Math.min(2, (e.tags || []).length * 0.15);
      for (const tag of (e.tags || [])) profile.set(tag, (profile.get(tag) || 0) + factor);
    }
    for (const e of heardMinus) {
      for (const tag of (e.tags || [])) profile.set(tag, (profile.get(tag) || 0) - 0.35);
    }

    const tags = ep.tags || [];
    let tagScore = 0;
    let maxPossible = 0;
    for (const [tag, weight] of profile.entries()) {
      if (weight > 0) maxPossible += weight;
    }
    for (const tag of tags) {
      tagScore += profile.get(tag) || 0;
    }
    const tagNorm = maxPossible > 0 ? tagScore / maxPossible : 0;

    const rocky = ep.rockyRanking;
    const rockyNorm = rocky ? Math.max(0, (6 - Number(rocky)) / 5) : 0.3;

    const directBonus = (ep.rating === 'plus' ? 0.2 : 0) + (ep.heard ? -0.1 : 0.1);
    const buzz = (tags.length ? Math.min(tags.length / 8, 0.25) : 0);
    return (tagNorm * 0.70) + (rockyNorm * 0.22) + directBonus + buzz;
  }

  function recommendation(mode = 'recommend'){
    const pool = state.catalog.map(episodeMerged).filter(ep => !ep.heard);
    if (!pool.length) return null;
    if (mode === 'random-new') {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const scored = pool.map(ep => ({
      ep,
      score: scoreEpisode(ep),
      rocky: Number.isFinite(Number(ep.rockyRanking)) ? Number(ep.rockyRanking) : 9.9
    })).sort((a,b) => b.score - a.score || a.rocky - b.rocky || a.ep.nr - b.ep.nr);
    return scored[0]?.ep || null;
  }

  function heardRandom(){
    const pool = state.catalog.map(episodeMerged).filter(ep => ep.heard);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function showRecommendation(ep, reason){
    const box = $('recommendationBox');
    if (!ep) {
      box.classList.remove('hidden');
      box.innerHTML = '<h3>Keine passende Folge gefunden</h3><p>Vielleicht erst ein paar Folgen als gehört und bewertet markieren.</p>';
      return;
    }
    const tags = ep.tags || [];
    const text = reason || 'Gewichtet nach deinen Plus-Folgen und den Tags.';
    box.classList.remove('hidden');
    box.innerHTML = `
      <h3>Empfehlung: ${ep.nr}. ${escapeHtml(ep.titel)}</h3>
      <p>${escapeHtml(text)}</p>
      <p><strong>Tags:</strong> ${tags.map(escapeHtml).join(', ') || '—'}</p>
      <p><strong>Rocky-Beach:</strong> ${escapeHtml(fmtRating(ep.rockyRanking))}</p>
      <p><button class="primary" id="openRecommended">Folge öffnen</button></p>
    `;
    $('openRecommended').addEventListener('click', () => openEditor(ep.nr));
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  async function exportBackup(){
    const payload = {
      app: 'ddf-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: state.user,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ddf-tracker-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup exportiert.');
  }

  async function importBackupFile(file){
    const txt = await file.text();
    let data;
    try { data = JSON.parse(txt); }
    catch { throw new Error('Ungültige JSON-Datei'); }

    const { catalog, user } = normalizeImported(data);
    if (catalog) {
      state.catalog = autoEnhanceCatalog(catalog).sort((a,b)=>a.nr-b.nr);
      state.catalogLoaded = true;
      await idbSet(CATALOG_KEY, state.catalog);
      toast(`Katalog importiert: ${state.catalog.length} Folgen`);
    }
    if (user) {
      state.user = user;
      state.user.episodes ||= {};
      state.user.version ||= 1;
      await idbSet(STATE_KEY, state.user);
      toast('Benutzerdaten importiert.');
    }
    render();
  }

  async function reloadCatalog(){
    try {
      state.catalog = autoEnhanceCatalog(window.DDF_EPISODES_SEED || []).sort((a,b)=>a.nr-b.nr);
      state.catalogLoaded = true;
      await idbSet(CATALOG_KEY, state.catalog);
      toast('Katalog neu geladen.');
      render();
    } catch (e) {
      console.error(e);
      toast('Katalog konnte nicht neu geladen werden.');
    }
  }

  function attachEvents(){
    $('search').addEventListener('input', (e) => {
      state.search = e.target.value;
      render();
    });

    document.querySelectorAll('.filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.filter;
        render();
      });
    });

    $('sortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      render();
    });

    $('btnRecommend').addEventListener('click', () => {
      const ep = recommendation('recommend');
      if (ep) showRecommendation(ep);
      else toast('Keine ungehörte Folge übrig.');
    });

    $('btnRandomNew').addEventListener('click', () => {
      const ep = recommendation('random-new');
      if (!ep) return toast('Keine ungehörte Folge übrig.');
      showRecommendation(ep, 'Zufällig aus den ungehörten Folgen gewählt.');
    });

    $('btnRandomHeard').addEventListener('click', () => {
      const ep = heardRandom();
      if (!ep) return toast('Noch keine gehörte Folge markiert.');
      openEditor(ep.nr);
    });

    $('btnExportBackup').addEventListener('click', exportBackup);
    $('btnImportBackup').addEventListener('click', () => $('fileInput').click());
    $('btnLoadCatalog').addEventListener('click', reloadCatalog);

    $('fileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await importBackupFile(file);
      } catch (err) {
        console.error(err);
        toast(err.message || 'Import fehlgeschlagen');
      } finally {
        e.target.value = '';
      }
    });

    $('btnCloseEditor').addEventListener('click', closeEditor);
    $('editorOverlay').addEventListener('click', (e) => {
      if (e.target === $('editorOverlay')) closeEditor();
    });
    $('btnSaveEpisode').addEventListener('click', saveEditor);
    $('btnResetEpisode').addEventListener('click', async () => {
      if (!state.currentEdit) return;
      state.user.episodes[String(state.currentEdit)] = { heard:false, rating:'neutral', tags:[], note:'' };
      await saveUserState();
      toast('Folge zurückgesetzt.');
      closeEditor();
      render();
    });

    document.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rate-btn').forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    $('btnSettings').addEventListener('click', () => {
      const info = `Katalog: ${state.catalog.length} Folgen · Datenbank: IndexedDB`;
      toast(info);
    });
  }

  async function init(){
    els.heardCount = $('heardCount');
    await db();

    const storedState = await idbGet(STATE_KEY);
    if (storedState && typeof storedState === 'object') {
      state.user = storedState;
      state.user.episodes ||= {};
    }

    const storedCatalog = await tryLoadStoredCatalog();
    if (!storedCatalog) {
      await loadCatalogFromSeed();
    }

    state.catalog = state.catalog.sort((a,b)=>a.nr-b.nr);
    state.catalogLoaded = true;
    attachEvents();
    render();
    toast('Bereit. Tipp: Katalog ist lokal geladen.');
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch {}
    }
    if (navigator.storage?.persist) {
      try { await navigator.storage.persist(); } catch {}
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
