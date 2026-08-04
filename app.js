(() => {
  'use strict';

  const DB_NAME = 'ddf-tracker';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const USER_KEY = 'appState';
  const LEGACY_USER_KEYS = ['user-state', 'userState', 'state'];
  const APP_VERSION = 3;

  const state = {
    catalog: [],
    user: { version: APP_VERSION, episodes: {}, updatedAt: null },
    page: 'home', filter: 'all', sort: 'nr', ranking: 'rocky', search: '', detailNr: null
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const debounce = (fn, ms=150) => { let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; };

  let dbPromise;
  function openDB(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    });
    return dbPromise;
  }
  async function dbGet(key){ const db=await openDB(); return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}); }
  async function dbSet(key,val){ const db=await openDB(); return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(val,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);}); }

  function normalizeCatalog(raw){
    return (Array.isArray(raw)?raw:[]).map(x=>({
      nr:Number(x.nr ?? x.number ?? x.NumberEuropa),
      titel:String(x.titel ?? x.title ?? x.Title ?? '').trim(),
      beschreibung:String(x.beschreibung ?? x.description ?? '').trim(),
      tags:Array.isArray(x.tags)?x.tags.map(String):[],
      rockyRanking:Number.isFinite(Number(x.rockyRanking ?? x.rocky ?? x.Rating)) ? Number(x.rockyRanking ?? x.rocky ?? x.Rating) : null,
      collection:x.collection || 'main'
    })).filter(x=>x.nr>0 && x.titel).sort((a,b)=>a.nr-b.nr);
  }

  function normalizeUser(raw){
    const out={version:APP_VERSION,episodes:{},updatedAt:raw?.updatedAt || null};
    const source = raw?.user?.episodes || raw?.episodes || raw?.userData || {};
    if (Array.isArray(source)) {
      for (const item of source) if (item?.nr != null) out.episodes[String(item.nr)] = normalizeEpisodeState(item);
    } else if (source && typeof source === 'object') {
      for (const [nr,item] of Object.entries(source)) out.episodes[String(nr)] = normalizeEpisodeState(item);
    }
    return out;
  }

  function normalizeEpisodeState(item={}){
    let rating=item.rating ?? item.bewertung ?? null;
    if (rating==='+' || rating==='positive') rating='plus';
    if (rating==='-' || rating==='negative') rating='minus';
    if (rating==='0') rating='neutral';
    if (!['plus','neutral','minus'].includes(rating)) rating=null;
    return { heard:Boolean(item.heard ?? item.gehoert ?? item.listened), rating, updatedAt:item.updatedAt || null };
  }

  function userFor(nr){ return state.user.episodes[String(nr)] || {heard:false,rating:null,updatedAt:null}; }
  function merged(ep){ return {...ep,...userFor(ep.nr)}; }
  function ratingLabel(r){ return r==='plus'?'Plus':r==='neutral'?'Neutral':r==='minus'?'Minus':'Unbewertet'; }
  function ratingSymbol(r){ return r==='plus'?'＋':r==='neutral'?'●':r==='minus'?'−':'—'; }
  function fmtRocky(v){ return v==null?'—':Number(v).toFixed(2).replace('.',','); }

  async function saveEpisode(nr, patch){
    const old=userFor(nr);
    state.user.episodes[String(nr)]={...old,...patch,updatedAt:new Date().toISOString()};
    state.user.updatedAt=new Date().toISOString();
    await dbSet(USER_KEY,state.user);
    renderAll();
  }

  function profile(){
    const weights={}; let rated=0;
    for(const ep of state.catalog){
      const u=userFor(ep.nr); if(!u.rating) continue; rated++;
      const delta=u.rating==='plus'?2:u.rating==='neutral'?.25:-1.4;
      for(const tag of ep.tags) weights[tag]=(weights[tag]||0)+delta;
    }
    return {weights,rated};
  }

  function recommendationScore(ep){
    const {weights,rated}=profile();
    let tagScore=0, positive=0;
    for(const tag of ep.tags){ const w=weights[tag]||0; tagScore+=w; if(w>0) positive++; }
    const tagBase=ep.tags.length ? tagScore/Math.sqrt(ep.tags.length) : 0;
    const rocky=ep.rockyRanking==null?0:Math.max(0,6-ep.rockyRanking)*0.26;
    const freshness=Math.min(ep.nr/500,0.3);
    const score=tagBase+rocky+freshness;
    const match=rated===0 ? Math.round(55 + rocky*8) : Math.max(1,Math.min(99,Math.round(55+score*7)));
    return {score,match,positive};
  }

  function getRecommendationPool(){
    return state.catalog.map(merged).filter(e=>!e.heard).map(e=>({...e,...recommendationScore(e)})).sort((a,b)=>b.score-a.score || rockyCompare(a,b) || a.nr-b.nr);
  }
  function rockyCompare(a,b){ if(a.rockyRanking==null&&b.rockyRanking==null)return 0;if(a.rockyRanking==null)return 1;if(b.rockyRanking==null)return -1;return a.rockyRanking-b.rockyRanking; }

  function weightedPick(list){
    if(!list.length)return null;
    const top=list.slice(0,Math.min(20,list.length));
    const min=Math.min(...top.map(x=>x.score||0));
    const weights=top.map(x=>Math.max(.15,(x.score||0)-min+.5));
    let r=Math.random()*weights.reduce((a,b)=>a+b,0);
    for(let i=0;i<top.length;i++){r-=weights[i];if(r<=0)return top[i];}
    return top[0];
  }

  function showPage(page){
    state.page=page;
    document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
    document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===page));
    if(page==='episodes') renderEpisodes();
    if(page==='ranking') renderRanking();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function stats(){
    let heard=0,plus=0,rated=0;
    for(const ep of state.catalog){const u=userFor(ep.nr);if(u.heard)heard++;if(u.rating)rated++;if(u.rating==='plus')plus++;}
    return {total:state.catalog.length,heard,unheard:state.catalog.length-heard,plus,rated};
  }

  function renderHome(){
    const s=stats(), pct=s.total?Math.round(s.heard/s.total*100):0;
    $('progressPercent').textContent=`${pct} %`; $('progressBar').style.width=`${pct}%`;
    $('heardCount').textContent=s.heard; $('unheardCount').textContent=s.unheard; $('plusCount').textContent=s.plus; $('ratedCount').textContent=s.rated;
    const recent=state.catalog.map(merged).filter(e=>e.updatedAt).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,5);
    $('recentList').innerHTML=recent.length?recent.map(e=>`<button class="compact-item" data-open="${e.nr}"><span><strong>${e.nr}. ${esc(e.titel)}</strong><small>${e.heard?'Gehört':'Offen'} · ${ratingLabel(e.rating)}</small></span><span>${ratingSymbol(e.rating)}</span></button>`).join(''):'<div class="empty-message">Noch keine Aktivität. Markiere eine Folge als gehört oder gib eine Bewertung ab.</div>';
  }

  function filteredEpisodes(){
    let list=state.catalog.map(merged); const q=state.search.trim().toLowerCase();
    if(state.filter==='heard')list=list.filter(e=>e.heard); if(state.filter==='unheard')list=list.filter(e=>!e.heard);
    if(['plus','neutral','minus'].includes(state.filter))list=list.filter(e=>e.rating===state.filter); if(state.filter==='unrated')list=list.filter(e=>!e.rating);
    if(q)list=list.filter(e=>[e.nr,e.titel,e.beschreibung,...e.tags].join(' ').toLowerCase().includes(q));
    list.sort((a,b)=>{
      if(state.sort==='nr-desc')return b.nr-a.nr; if(state.sort==='title')return a.titel.localeCompare(b.titel,'de');
      if(state.sort==='rocky-best')return rockyCompare(a,b)||a.nr-b.nr; if(state.sort==='rocky-worst')return -rockyCompare(a,b)||a.nr-b.nr;
      if(state.sort==='recommendation')return recommendationScore(b).score-recommendationScore(a).score||rockyCompare(a,b);
      if(state.sort==='own'){const o={plus:3,neutral:2,minus:1};return (o[b.rating]||0)-(o[a.rating]||0)||a.nr-b.nr;} return a.nr-b.nr;
    }); return list;
  }

  function episodeCard(e){
    return `<article class="episode-card rating-${e.rating||'none'}" data-open="${e.nr}">
      <div class="episode-top"><div><span class="episode-number">FOLGE ${e.nr}</span><h3 class="episode-title">${esc(e.titel)}</h3>${e.beschreibung?`<p class="episode-description">${esc(e.beschreibung)}</p>`:''}</div><button class="heard-button ${e.heard?'on':''}" data-heard="${e.nr}">${e.heard?'✓':'○'}</button></div>
      <div class="episode-footer"><div class="badges"><span class="badge">Rocky ${fmtRocky(e.rockyRanking)}</span><span class="badge">${ratingLabel(e.rating)}</span></div><div class="rating-mini" aria-label="Bewertung"><button data-rate="${e.nr}:minus" class="${e.rating==='minus'?'active':''}">−</button><button data-rate="${e.nr}:neutral" class="${e.rating==='neutral'?'active':''}">●</button><button data-rate="${e.nr}:plus" class="${e.rating==='plus'?'active':''}">＋</button></div></div>
    </article>`;
  }

  function renderEpisodes(){ const list=filteredEpisodes(); $('episodeResultCount').textContent=`${list.length} von ${state.catalog.length} Folgen`; $('episodeList').innerHTML=list.length?list.map(episodeCard).join(''):'<div class="empty-message">Keine passenden Folgen gefunden.</div>'; }

  function renderRanking(){
    const mode=state.ranking; let list=[],info='';
    if(mode==='rocky'){
      list=state.catalog.map(merged).filter(e=>e.rockyRanking!=null).sort((a,b)=>rockyCompare(a,b));
      info=`Für <strong>${list.length}</strong> Folgen ist derzeit eine Rocky-Beach-Wertung in deinem Katalog hinterlegt. Kleinere Werte sind besser.`;
    } else if(mode==='mine'){
      const order={plus:3,neutral:2,minus:1}; list=state.catalog.map(merged).filter(e=>e.rating).sort((a,b)=>(order[b.rating]-order[a.rating])||rockyCompare(a,b)||a.nr-b.nr);
      info=`Dein Ranking gruppiert Folgen nach <strong>Plus, Neutral und Minus</strong>. Innerhalb einer Gruppe entscheidet die Rocky-Beach-Wertung.`;
    } else {
      list=getRecommendationPool(); info=`Ungehörte Folgen werden aus deinem Bewertungsprofil berechnet. Das externe Ranking dient nur als zusätzlicher Faktor und Tiebreaker.`;
    }
    $('rankingInfo').innerHTML=info;
    $('rankingList').innerHTML=list.length?list.map((e,i)=>`<button class="ranking-card" data-open="${e.nr}"><span class="rank-position">${i+1}</span><span class="rank-main"><strong>${e.nr}. ${esc(e.titel)}</strong><small>${mode==='mine'?ratingLabel(e.rating):e.tags.slice(0,3).map(esc).join(' · ')||'Keine Tags hinterlegt'}</small></span><span class="rank-score"><strong>${mode==='match'?`${e.match}%`:mode==='mine'?ratingSymbol(e.rating):fmtRocky(e.rockyRanking)}</strong><small>${mode==='match'?'Match':mode==='mine'?'deins':'Rocky'}</small></span></button>`).join(''):'<div class="empty-message">Für diese Ansicht sind noch keine Daten vorhanden.</div>';
  }

  function renderSettings(){ const s=stats(); $('storageInfo').textContent=`${s.total} Folgen · ${s.heard} gehört · ${s.rated} bewertet`; }
  function renderAll(){ renderHome(); renderEpisodes(); renderRanking(); renderSettings(); if(state.detailNr) refreshDetail(); }

  function showRecommendation(ep){
    if(!ep){toast('Keine passende Folge gefunden.');return;}
    const score=recommendationScore(ep); const tags=ep.tags.slice(0,3).join(' · ');
    $('recommendationCard').classList.remove('empty-state');
    $('recommendationCard').innerHTML=`<div><span class="feature-kicker">${score.match}% passend</span><h3>${ep.nr}. ${esc(ep.titel)}</h3><p>${tags?`Passt zu deinem Profil: ${esc(tags)}.`:'Auswahl anhand deiner Bewertungen und des externen Rankings.'}</p></div><button class="primary-button" data-open="${ep.nr}">Folge ansehen</button>`;
  }

  function openDetail(nr){ state.detailNr=Number(nr); refreshDetail(); $('detailOverlay').classList.remove('hidden'); $('detailOverlay').setAttribute('aria-hidden','false'); }
  function closeDetail(){ state.detailNr=null; $('detailOverlay').classList.add('hidden'); $('detailOverlay').setAttribute('aria-hidden','true'); }
  function refreshDetail(){
    const ep=state.catalog.find(x=>x.nr===state.detailNr); if(!ep)return; const e=merged(ep);
    $('detailNumber').textContent=`Folge ${e.nr}`; $('detailTitle').textContent=e.titel; $('detailDescription').textContent=e.beschreibung||'Keine Kurzbeschreibung vorhanden.';
    $('detailMeta').innerHTML=`<span class="badge">Rocky-Beach ${fmtRocky(e.rockyRanking)}</span>${e.tags.slice(0,6).map(t=>`<span class="badge">${esc(t)}</span>`).join('')}`;
    document.querySelectorAll('#detailRating [data-rating]').forEach(b=>b.classList.toggle('active',b.dataset.rating===e.rating)); $('detailHeard').checked=e.heard;
  }

  function toast(msg){ const el=$('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),2600); }

  async function exportBackup(){
    try{
      const payload={app:'ddf-folgen-tracker',version:APP_VERSION,exportedAt:new Date().toISOString(),episodes:state.user.episodes};
      const text=JSON.stringify(payload,null,2), name=`ddf-backup-${new Date().toISOString().slice(0,10)}.json`;
      const file=new File([text],name,{type:'application/json'});
      if(navigator.share && navigator.canShare?.({files:[file]})){ await navigator.share({title:'DDF Tracker Backup',files:[file]}); toast('Backup bereitgestellt.'); }
      else { const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Backup wurde exportiert.'); }
    }catch(err){ if(err?.name!=='AbortError'){console.error(err);toast('Export konnte nicht gestartet werden.');} }
  }

  async function importBackupFile(file){
    try{
      const text=await file.text(); const parsed=JSON.parse(text); const normalized=normalizeUser(parsed);
      if(!Object.keys(normalized.episodes).length && !confirm('Das Backup enthält keine Folgenstände. Trotzdem importieren?'))return;
      const count=Object.keys(normalized.episodes).length;
      if(!confirm(`${count} gespeicherte Folgenstände importieren und vorhandene Daten ersetzen?`))return;
      state.user=normalized; state.user.updatedAt=new Date().toISOString(); await dbSet(USER_KEY,state.user); renderAll(); toast(`${count} Folgenstände importiert.`);
    }catch(err){console.error(err);toast('Die JSON-Datei ist ungültig oder nicht lesbar.');}
    finally{$('importFile').value='';}
  }

  async function loadUser(){
    let raw=await dbGet(USER_KEY);
    if(!raw){for(const key of LEGACY_USER_KEYS){raw=await dbGet(key);if(raw)break;}}
    if(raw)state.user=normalizeUser(raw); await dbSet(USER_KEY,state.user);
  }

  function bind(){
    document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.nav)));
    document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.go)));
    $('quickSettings').addEventListener('click',()=>showPage('settings'));
    $('searchInput').addEventListener('input',debounce(e=>{state.search=e.target.value;renderEpisodes();}));
    $('filterChips').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;state.filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderEpisodes();});
    $('episodeSort').addEventListener('change',e=>{state.sort=e.target.value;renderEpisodes();});
    $('rankingMode').addEventListener('click',e=>{const b=e.target.closest('[data-ranking]');if(!b)return;state.ranking=b.dataset.ranking;document.querySelectorAll('[data-ranking]').forEach(x=>x.classList.toggle('active',x===b));renderRanking();});
    $('recommendButton').addEventListener('click',()=>showRecommendation(weightedPick(getRecommendationPool())));
    $('randomNewButton').addEventListener('click',()=>{const a=state.catalog.map(merged).filter(e=>!e.heard);showRecommendation(a[Math.floor(Math.random()*a.length)]);});
    $('randomHeardButton').addEventListener('click',()=>{const a=state.catalog.map(merged).filter(e=>e.heard);showRecommendation(a[Math.floor(Math.random()*a.length)]);});
    $('exportButton').addEventListener('click',exportBackup);
    $('importButton').addEventListener('click',()=>$('importFile').click());
    $('importFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importBackupFile(f);});
    $('reloadCatalogButton').addEventListener('click',()=>{state.catalog=normalizeCatalog(window.DDF_EPISODES_SEED||[]);renderAll();toast('Katalog wurde neu geladen.');});
    $('resetButton').addEventListener('click',async()=>{if(!confirm('Wirklich alle persönlichen Hörstände und Bewertungen löschen?'))return;state.user={version:APP_VERSION,episodes:{},updatedAt:new Date().toISOString()};await dbSet(USER_KEY,state.user);renderAll();toast('Persönliche Daten wurden zurückgesetzt.');});
    $('closeDetail').addEventListener('click',closeDetail); $('detailOverlay').addEventListener('click',e=>{if(e.target===$('detailOverlay'))closeDetail();});
    $('detailRating').addEventListener('click',e=>{const b=e.target.closest('[data-rating]');if(b&&state.detailNr)saveEpisode(state.detailNr,{rating:b.dataset.rating});});
    $('detailHeard').addEventListener('change',e=>{if(state.detailNr)saveEpisode(state.detailNr,{heard:e.target.checked});});
    $('clearRating').addEventListener('click',()=>{if(state.detailNr)saveEpisode(state.detailNr,{rating:null});});
    document.addEventListener('click',e=>{
      const rate=e.target.closest('[data-rate]'); if(rate){e.preventDefault();e.stopPropagation();const[nr,rating]=rate.dataset.rate.split(':');saveEpisode(Number(nr),{rating});return;}
      const heard=e.target.closest('[data-heard]'); if(heard){e.preventDefault();e.stopPropagation();const nr=Number(heard.dataset.heard);saveEpisode(nr,{heard:!userFor(nr).heard});return;}
      const open=e.target.closest('[data-open]'); if(open)openDetail(open.dataset.open);
    });
  }

  async function init(){
    try{
      state.catalog=normalizeCatalog(window.DDF_EPISODES_SEED||[]);
      if(!state.catalog.length){const r=await fetch('episodes.json',{cache:'no-store'});state.catalog=normalizeCatalog(await r.json());}
      await loadUser(); bind(); renderAll();
      if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.warn);
    }catch(err){console.error(err);toast('App-Daten konnten nicht geladen werden.');}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
