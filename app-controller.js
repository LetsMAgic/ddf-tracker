import {
  APP_VERSION, appState, RATING_LABELS, RATING_ORDER, activityCount, addListen, addManyToQueue, availableEpisode,
  esc, formatDate, formatDuration, formatRelativeDate, getEpisode, loadUser, moveQueueItem, nowIso, persistFilters,
  profileRatingCount, removeFromQueue, resetRuntimeState, saveUser, setHeard, setNote, setRating, setStoredFilters,
  togglePinned, toggleQueue,
} from './core.js';
import { catalogValidation, clearCatalogCache, loadCatalog, moodMatches, refreshMetadata, searchScore, timeMatches } from './catalog.js';
import {
  adjustFeatureFeedback, buildTasteProfile, chooseRecommendation, feedbackOptions, hideRecommendation, matchPresentation,
  recommendationScore, restoreHiddenRecommendations, similarEpisodes, snoozeRecommendation, topProfileInsights,
} from './recommendations.js';
import {
  addEpisodeToPlaylist, createPlaylist, curatedPlaylists, deletePlaylist, generateSmartPlaylist, getPlaylist,
  movePlaylistEpisode, playlistStats, playlistSuggestions, removeEpisodeFromPlaylist, resolveCuratedPlaylist, updatePlaylist,
} from './playlists.js';
import { applyImport, backupPreview, emptyPersonalData, exportBackup, parseBackupText } from './backup.js';

const $ = (id) => document.getElementById(id);
const $$ = (selector,root=document) => [...root.querySelectorAll(selector)];
const symbols = { minus:'−',neutral:'0',plus:'+',super:'★' };
let toastTimer, confirmResolver, noteTimer, pendingWorker, reloadingForUpdate = false;

function toast(message,type='default') { const node=$('toast'); node.textContent=message; node.dataset.type=type; node.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.add('hidden'),2700); }
function openDialog(id) { const dialog=$(id); if (dialog && !dialog.open) dialog.showModal(); document.documentElement.classList.add('dialog-open'); }
function closeDialog(id) { const dialog=$(id); if (dialog?.open) dialog.close(); if (!$$('dialog[open]').length) document.documentElement.classList.remove('dialog-open'); }
function confirmAction({title,text,accept='Bestätigen',danger=true,eyebrow='Bestätigen'}) {
  $('confirmEyebrow').textContent=eyebrow; $('confirmTitle').textContent=title; $('confirmText').textContent=text; $('confirmAccept').textContent=accept;
  $('confirmAccept').classList.toggle('danger',danger); $('confirmAccept').classList.toggle('primary',!danger); openDialog('confirmDialog');
  return new Promise((resolve)=>{confirmResolver=resolve;});
}
function streamingUrl(episode,service=appState.user.settings.preferredService) { return service==='appleMusic' ? episode.appleMusicUrl||episode.spotifyUrl : episode.spotifyUrl||episode.appleMusicUrl; }
function streamingName(url) { return url?.includes('music.apple.com') ? 'Apple Music' : 'Spotify'; }
function episodeTitle(episode) { return episode.nr>=10000 ? `Spezial · ${episode.titel}` : `${episode.nr} · ${episode.titel}`; }
function metaLine(episode) { return [episode.author,episode.durationMin?formatDuration(episode.durationMin):null,episode.featuredCharacters?.[0],episode.year].filter(Boolean).map(esc).join(' · '); }
function statusOf(nr) { return appState.user.episodes?.[nr] || {}; }
function cloneValue(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function ratingButtons(nr,current,compact=false) { return `<div class="rating-buttons ${compact?'compact':''}">${['minus','neutral','plus','super'].map((rating)=>`<button class="rating-${rating} ${current===rating?'active':''}" data-action="rate" data-nr="${nr}" data-rating="${rating}" aria-label="${RATING_LABELS[rating]}">${symbols[rating]}${compact?'':`<small>${RATING_LABELS[rating]}</small>`}</button>`).join('')}</div>`; }
function miniRow(episode,queueControls=false) {
  const status=statusOf(episode.nr); return `<article class="mini-row"><button class="mini-main" data-open-episode="${episode.nr}"><span class="episode-number">${episode.nr>=10000?'✦':episode.nr}</span><span><strong>${esc(episode.titel)}</strong><small>${metaLine(episode)}</small></span></button>${queueControls?`<div class="row-actions"><button data-action="queue-up" data-nr="${episode.nr}">↑</button><button data-action="queue-down" data-nr="${episode.nr}">↓</button><button data-action="queue-remove" data-nr="${episode.nr}">×</button></div>`:`<div class="status-dots">${status.rating?`<span class="rating-dot ${status.rating}">${symbols[status.rating]}</span>`:status.heard?'<span class="heard-dot">✓</span>':''}</div>`}</article>`;
}
function compactCard(episode) {
  const status=statusOf(episode.nr),pinned=appState.user.pinned.includes(episode.nr);
  return `<article class="episode-card compact-card"><button class="episode-card-main" data-open-episode="${episode.nr}"><span class="episode-number">${episode.nr>=10000?'✦':episode.nr}</span><span class="episode-card-copy"><strong>${esc(episode.titel)}</strong><small>${metaLine(episode)}</small></span></button><div class="compact-actions">${status.rating?`<span class="rating-pill ${status.rating}">${symbols[status.rating]}</span>`:status.heard?'<span class="heard-pill">✓</span>':''}<button data-action="pin" data-nr="${episode.nr}" class="icon-button ${pinned?'active':''}">${pinned?'📌':'○'}</button></div></article>`;
}
function detailedCard(episode) {
  const status=statusOf(episode.nr),pinned=appState.user.pinned.includes(episode.nr),queued=appState.user.settings.queue.includes(episode.nr);
  return `<article class="episode-card detailed-card"><button class="episode-card-header" data-open-episode="${episode.nr}"><span class="episode-number">${episode.nr>=10000?'✦':episode.nr}</span><span><strong>${esc(episode.titel)}</strong><small>${metaLine(episode)}</small></span><span class="chevron">›</span></button>${episode.beschreibung?`<p>${esc(episode.beschreibung.slice(0,230))}${episode.beschreibung.length>230?' …':''}</p>`:''}<div class="episode-tags">${episode.tags.slice(0,4).map((tag)=>`<span>${esc(tag)}</span>`).join('')}</div>${ratingButtons(episode.nr,status.rating,true)}<div class="episode-card-footer"><button data-action="heard" data-nr="${episode.nr}" class="text-icon-button ${status.heard?'active':''}">${status.heard?'✓ Gehört':'Als gehört markieren'}</button><button data-action="queue" data-nr="${episode.nr}" class="text-icon-button ${queued?'active':''}">${queued?'✓ Als Nächstes':'＋ Als Nächstes'}</button><button data-action="pin" data-nr="${episode.nr}" class="text-icon-button ${pinned?'active':''}">${pinned?'📌 Angeheftet':'○ Anheften'}</button></div></article>`;
}

function renderProfileProgress() {
  const heard=Object.values(appState.user.episodes).filter((status)=>status.heard).length; const total=appState.catalog.filter(availableEpisode).length;
  $('profileProgress').textContent=`${total?Math.round(heard/total*100):0} %`;
}
function pickRecommendation() {
  const result=chooseRecommendation({time:appState.time,mood:appState.mood,timeMatcher:timeMatches,moodMatcher:moodMatches});
  appState.recommendationNr=result?.episode.nr||null; renderRecommendation(); if (!result) toast('Für diese Auswahl wurde keine passende Folge gefunden.','warning');
}
function renderRecommendation() {
  const episode=getEpisode(appState.recommendationNr); $('recommendationResult').classList.toggle('hidden',!episode); if (!episode) return;
  const profile=buildTasteProfile(),score=recommendationScore(episode,profile),match=matchPresentation(episode,profile,score),url=streamingUrl(episode);
  $('recommendationCard').innerHTML=`<div class="recommendation-topline"><span class="match-level">${esc(match.level)}</span><span>Score ${match.scoreValue}</span></div><button class="recommendation-title" data-open-episode="${episode.nr}"><small>${episode.nr>=10000?'Spezialfolge':`Folge ${episode.nr}`}</small><strong>${esc(episode.titel)}</strong></button><p class="recommendation-description">${esc(episode.beschreibung?.slice(0,260)||'Ein starker Vorschlag aus deinem Katalog.')}${episode.beschreibung?.length>260?' …':''}</p><div class="reason-chips">${match.reasons.map((reason)=>`<span>${esc(reason)}</span>`).join('')}</div><div class="profile-confidence">Profilstärke: <strong>${match.strength}</strong> · ${match.ratingCount} Bewertung${match.ratingCount===1?'':'en'}</div>${url?`<a class="button primary full" href="${esc(url)}" target="_blank" rel="noopener">▶ In ${streamingName(url)} anhören</a>`:`<button class="button primary full" data-open-episode="${episode.nr}">Details öffnen</button>`}<div class="recommendation-secondary"><button data-open-episode="${episode.nr}" class="text-button">Details</button><button data-action="queue" data-nr="${episode.nr}" class="text-button">${appState.user.settings.queue.includes(episode.nr)?'Aus Warteschlange':'Als Nächstes'}</button><button data-action="snooze" data-nr="${episode.nr}" class="text-button">Heute nicht</button><button data-action="hide-recommendation" data-nr="${episode.nr}" class="text-button">Ausblenden</button></div>`;
}
function backupDue() {
  const current=activityCount(),last=Number(appState.user.settings.lastBackupActivityCount)||0,newActivity=current-last,lastDate=appState.user.settings.lastBackupAt?new Date(appState.user.settings.lastBackupAt):null;
  const days=lastDate?Math.floor((Date.now()-lastDate.getTime())/86400000):Infinity; const dismissed=appState.user.settings.backupReminderDismissedAt&&Date.now()-new Date(appState.user.settings.backupReminderDismissedAt).getTime()<7*86400000;
  return !dismissed && current>10 && (newActivity>=25||days>=30);
}
function renderHome() {
  renderProfileProgress(); renderRecommendation();
  const queue=appState.user.settings.queue.map(getEpisode).filter(Boolean); $('homeQueue').innerHTML=queue.length?queue.slice(0,4).map((episode)=>miniRow(episode)).join(''):'<p class="muted">Noch keine Folge vorgemerkt.</p>';
  const pinned=appState.user.pinned.map(getEpisode).filter(Boolean); $('homePinned').innerHTML=pinned.length?pinned.slice(0,5).map((episode)=>miniRow(episode)).join(''):'<p class="muted">Noch nichts angeheftet.</p>';
  const seen=new Set(),history=[]; for (const item of appState.user.history) if (!seen.has(item.nr)&&getEpisode(item.nr)) { seen.add(item.nr); history.push(getEpisode(item.nr)); }
  $('homeHistory').innerHTML=history.length?history.slice(0,5).map((episode)=>miniRow(episode)).join(''):'<p class="muted">Noch kein Hörvorgang erfasst.</p>';
  const due=backupDue(); $('backupReminder').classList.toggle('hidden',!due); if (due) $('backupReminderText').textContent=`Seit dem letzten Backup sind ${Math.max(0,activityCount()-(appState.user.settings.lastBackupActivityCount||0))} neue Aktivitäten gespeichert.`;
}

function filteredEpisodes() {
  const profile=buildTasteProfile(); let rows=appState.catalog.map((episode)=>({episode,search:searchScore(episode,appState.search)})).filter((row)=>!appState.search||row.search>0);
  rows=rows.filter(({episode})=>{ const status=statusOf(episode.nr); if (appState.filter==='unheard') return !status.heard; if (appState.filter==='heard') return status.heard; if (RATING_ORDER.includes(appState.filter)) return status.rating===appState.filter; if (appState.filter==='notes') return Boolean(status.note?.trim()); if (appState.filter==='reheard') return (status.listenCount||0)>1; return true; }).filter(({episode})=>appState.authorFilter==='all'||episode.author===appState.authorFilter).filter(({episode})=>appState.eraFilter==='all'||episode.era===appState.eraFilter).filter(({episode})=>appState.yearFilter==='all'||String(episode.year)===appState.yearFilter);
  rows.sort((a,b)=>{ if (appState.search&&b.search!==a.search) return b.search-a.search; switch(appState.sort){case'nr-desc':return b.episode.nr-a.episode.nr;case'title':return a.episode.titel.localeCompare(b.episode.titel,'de');case'author':return (a.episode.author||'').localeCompare(b.episode.author||'','de')||a.episode.nr-b.episode.nr;case'duration-asc':return (a.episode.durationMin||9999)-(b.episode.durationMin||9999);case'duration-desc':return (b.episode.durationMin||0)-(a.episode.durationMin||0);case'rocky-best':return (a.episode.rockyRanking??999)-(b.episode.rockyRanking??999);case'recommendation':return recommendationScore(b.episode,profile,{useDiversity:false}).total-recommendationScore(a.episode,profile,{useDiversity:false}).total;case'own':{const rank={super:4,plus:3,neutral:2,minus:1};return (rank[statusOf(b.episode.nr).rating]||0)-(rank[statusOf(a.episode.nr).rating]||0)||a.episode.nr-b.episode.nr;}default:return a.episode.nr-b.episode.nr;}}); return rows.map((row)=>row.episode);
}
function renderActiveFilters() {
  const chips=[]; if (appState.filter!=='all') chips.push(['filter','Status']); if (appState.authorFilter!=='all') chips.push(['author',appState.authorFilter]); if (appState.eraFilter!=='all') chips.push(['era',appState.eraFilter]); if (appState.yearFilter!=='all') chips.push(['year',appState.yearFilter]); if (appState.search) chips.push(['search',`„${appState.search}“`]);
  $('activeFilters').classList.toggle('hidden',!chips.length); $('activeFilters').innerHTML=chips.map(([key,label])=>`<button data-clear-filter="${key}">${esc(label)} ×</button>`).join('')+(chips.length>1?'<button data-clear-filter="all">Alle zurücksetzen</button>':'');
}
function renderEpisodes() {
  const episodes=filteredEpisodes(),visible=episodes.slice(0,appState.episodeRenderLimit),view=appState.user.settings.episodeView;
  $('episodeCount').textContent=`${episodes.length} Folge${episodes.length===1?'':'n'}`; $('episodeList').innerHTML=visible.length?visible.map((episode)=>view==='detailed'?detailedCard(episode):compactCard(episode)).join(''):'<div class="info-card">Keine passenden Folgen gefunden.</div>';
  $('loadMoreEpisodes').classList.toggle('hidden',visible.length>=episodes.length); renderActiveFilters(); $('clearSearch').classList.toggle('hidden',!appState.search);
  $$('#statusFilters [data-filter]').forEach((button)=>button.classList.toggle('active',button.dataset.filter===appState.filter));
  $$('[data-episode-view]').forEach((button)=>button.classList.toggle('active',button.dataset.episodeView===view));
}

function renderRanking() {
  $$('#rankingMode [data-ranking]').forEach((button)=>button.classList.toggle('active',button.dataset.ranking===appState.ranking)); const profile=buildTasteProfile(); let html='';
  if (appState.ranking==='rocky') {
    const list=appState.catalog.filter((episode)=>Number.isFinite(episode.rockyRanking)).sort((a,b)=>a.rockyRanking-b.rockyRanking); $('rankingInfo').innerHTML=`<strong>Rocky-Beach Community-Ranking</strong><p>${list.length} Folgen mit vorhandener Wertung. Niedrigere Werte stehen weiter oben.</p>`;
    html=list.map((episode,index)=>`<article class="ranking-row"><span>${index+1}</span><button data-open-episode="${episode.nr}"><strong>${esc(episodeTitle(episode))}</strong><small>${metaLine(episode)}</small></button><span class="ranking-value">${episode.rockyRanking.toFixed(2)}</span></article>`).join('');
  } else if (appState.ranking==='mine') {
    const groups={super:[],plus:[],neutral:[],minus:[]}; for (const episode of appState.catalog) { const rating=statusOf(episode.nr).rating; if (rating) groups[rating].push(episode); }
    $('rankingInfo').innerHTML='<strong>Meine Bewertungen</strong><p>Eine ehrliche Bewertungsübersicht statt einer künstlichen Rangnummer.</p>';
    html=RATING_ORDER.map((rating)=>groups[rating].length?`<h3 class="ranking-group-title">${symbols[rating]} ${RATING_LABELS[rating]} · ${groups[rating].length}</h3>${groups[rating].sort((a,b)=>(a.rockyRanking??999)-(b.rockyRanking??999)).map((episode)=>`<article class="ranking-row"><span class="rating-pill ${rating}">${symbols[rating]}</span><button data-open-episode="${episode.nr}"><strong>${esc(episodeTitle(episode))}</strong><small>${metaLine(episode)}</small></button><span>›</span></article>`).join('')}`:'').join('')||'<div class="info-card">Noch keine Folgen bewertet.</div>';
  } else {
    const list=appState.catalog.filter((episode)=>availableEpisode(episode)&&!statusOf(episode.nr).heard).map((episode)=>({episode,score:recommendationScore(episode,profile,{useDiversity:false})})).sort((a,b)=>b.score.total-a.score.total).slice(0,100);
    const strength=profile.ratingCount>=18?'hoch':profile.ratingCount>=7?'mittel':profile.ratingCount>=2?'im Aufbau':'noch allgemein'; $('rankingInfo').innerHTML=`<strong>Persönliche Empfehlungen</strong><p>Profilstärke ${strength} auf Basis von ${profile.ratingCount} Bewertungen.</p>`;
    html=list.map((entry,index)=>{const match=matchPresentation(entry.episode,profile,entry.score);return`<article class="ranking-row"><span>${index+1}</span><button data-open-episode="${entry.episode.nr}"><strong>${episodeTitle(entry.episode)}</strong><small>${match.reasons.map(esc).join(' · ')||metaLine(entry.episode)}</small></button><span class="ranking-value">${match.scoreValue}</span></article>`;}).join('')||'<div class="info-card">Keine ungehörten Folgen verfügbar.</div>';
  }
  $('rankingList').innerHTML=html;
}

function playlistCard(item,curated=false) {
  const playlist=curated?resolveCuratedPlaylist(item):getPlaylist(item.id); const stats=playlistStats(playlist.episodes); const id=curated?`curated:${item.id}`:item.id;
  return `<button class="playlist-card" data-open-playlist="${esc(id)}"><span class="playlist-icon">${curated?item.icon:'☷'}</span><span><strong>${esc(curated?item.title:item.name)}</strong><p>${esc((curated?item.description:item.description)||'Eigene Playlist')}</p></span><small>${stats.heard}/${stats.total} gehört · ${formatDuration(stats.duration)}</small></button>`;
}
function renderPlaylists() {
  const queue=appState.user.settings.queue.map(getEpisode).filter(Boolean); $('queueList').innerHTML=queue.length?queue.map((episode)=>miniRow(episode,true)).join(''):'<p class="muted">Noch keine Folge in „Als Nächstes“.</p>';
  $$('#playlistTabs [data-playlist-tab]').forEach((button)=>button.classList.toggle('active',button.dataset.playlistTab===appState.playlistTab));
  if (appState.playlistTab==='mine') $('playlistGrid').innerHTML=appState.user.playlists.length?appState.user.playlists.map((item)=>playlistCard(item)).join(''):'<div class="info-card">Noch keine eigene Playlist.</div>';
  else $('playlistGrid').innerHTML=curatedPlaylists(appState.playlistTab).map((item)=>playlistCard(item,true)).join('');
}
function renderPlaylistDetail(id) {
  const playlist=getPlaylist(id); if (!playlist) return; appState.currentPlaylistId=id; const stats=playlistStats(playlist.episodes),personal=!String(id).startsWith('curated:')?id:null,suggestions=personal?playlistSuggestions(personal):[];
  $('playlistDialogTitle').innerHTML=`<span class="eyebrow">${personal?'Eigene Playlist':'Kuratierte Liste'}</span><h2>${esc(playlist.name||playlist.title)}</h2>`;
  $('playlistDialogBody').innerHTML=`<section class="playlist-detail-hero"><p>${esc(playlist.description||'')}</p><div class="progress-track"><span style="width:${stats.total?stats.heard/stats.total*100:0}%"></span></div><strong>${stats.heard} von ${stats.total} gehört</strong><small>${formatDuration(stats.duration)} gesamt · ${formatDuration(stats.remaining)} offen</small><div class="button-row"><button data-action="queue-playlist" data-playlist-id="${esc(id)}" class="button primary">＋ Alles als Nächstes</button><button data-action="share-playlist" data-playlist-id="${esc(id)}" class="button secondary">Teilen</button></div></section><section class="detail-section"><h3>Folgen</h3><div class="playlist-items">${playlist.episodes.length?playlist.episodes.map((episode)=>`<article class="playlist-item"><button data-open-episode="${episode.nr}"><span>${episode.nr>=10000?'✦':episode.nr}</span><strong>${esc(episode.titel)}</strong><small>${formatDuration(episode.durationMin)}</small></button>${personal?`<div><button data-action="playlist-up" data-playlist-id="${esc(personal)}" data-nr="${episode.nr}">↑</button><button data-action="playlist-down" data-playlist-id="${esc(personal)}" data-nr="${episode.nr}">↓</button><button data-action="playlist-remove" data-playlist-id="${esc(personal)}" data-nr="${episode.nr}">×</button></div>`:''}</article>`).join(''):'<p class="muted">Diese Liste ist leer.</p>'}</div></section>${suggestions.length?`<section class="detail-section"><h3>Passt dazu</h3><div class="suggestion-list">${suggestions.map((entry)=>`<article><button data-open-episode="${entry.episode.nr}"><strong>${episodeTitle(entry.episode)}</strong><small>${entry.reasons.map(esc).join(' · ')||metaLine(entry.episode)}</small></button><button data-action="playlist-add" data-playlist-id="${esc(personal)}" data-nr="${entry.episode.nr}">＋</button></article>`).join('')}</div></section>`:''}${personal?`<div class="button-row"><button data-action="edit-playlist" data-playlist-id="${esc(personal)}" class="button secondary">Bearbeiten</button><button data-action="delete-playlist" data-playlist-id="${esc(personal)}" class="button danger">Löschen</button></div>`:''}`; openDialog('playlistDialog');
}
function openPlaylistEditor(id=null,seedNr=null) {
  const playlist=id?appState.user.playlists.find((item)=>item.id===id):null; $('playlistEditorTitle').textContent=playlist?'Playlist bearbeiten':'Playlist erstellen'; $('playlistEditorId').value=playlist?.id||''; $('playlistEditorSeedNr').value=seedNr||''; $('playlistName').value=playlist?.name||''; $('playlistDescription').value=playlist?.description||''; openDialog('playlistEditorDialog'); setTimeout(()=>$('playlistName').focus(),100);
}

function smartPlaylistOptionsFromForm() {
  return {
    name:$('smartName').value,
    targetMinutes:(Number($('smartHours').value)||0)*60+(Number($('smartMinutes').value)||0),
    mood:$('smartMood').value,
    status:$('smartStatus').value,
    author:$('smartAuthor').value,
    continuity:$('smartContinuity').checked,
  };
}
function renderSmartPlaylistPreview() {
  const draft=appState.smartPlaylistDraft; if (!draft) return;
  const difference=draft.duration-draft.targetMinutes;
  const differenceText=Math.abs(difference)<=5?'nahezu genau passend':difference>0?`${difference} Min. länger als geplant`:`${Math.abs(difference)} Min. kürzer als geplant`;
  $('smartPlaylistDialogTitle').innerHTML=`<span class="eyebrow">Smart Playlist · Vorschau</span><h2>${esc(draft.name)}</h2>`;
  $('smartPlaylistPreview').innerHTML=`<section class="smart-preview-hero"><div class="smart-preview-stats"><div><strong>${draft.episodes.length}</strong><span>Folgen</span></div><div><strong>${formatDuration(draft.duration)}</strong><span>Vorschlag</span></div><div><strong>${formatDuration(draft.targetMinutes)}</strong><span>Zielzeit</span></div></div><p>${esc(differenceText)}. Es wird noch nichts gespeichert.</p></section><section class="smart-preview-list" aria-label="Vorgeschlagene Folgen">${draft.episodes.map((episode,index)=>`<article class="smart-preview-item"><span class="smart-preview-position">${index+1}</span><div><strong>${esc(episodeTitle(episode))}</strong><small>${metaLine(episode)}</small></div><button class="icon-button subtle" data-action="smart-remove" data-nr="${episode.nr}" aria-label="${esc(episode.titel)} aus dem Vorschlag entfernen">×</button></article>`).join('')||'<div class="info-card">Der Vorschlag enthält keine Folgen mehr.</div>'}</section><div class="smart-preview-actions"><button class="button secondary full" data-action="smart-regenerate">Andere Vorschläge</button><div class="button-row"><button class="button secondary" data-action="smart-queue" ${draft.episodes.length?'':'disabled'}>Als Nächstes übernehmen</button><button class="button primary" data-action="smart-save" ${draft.episodes.length?'':'disabled'}>Playlist speichern</button></div></div>`;
}
function createSmartPlaylistPreview(options=smartPlaylistOptionsFromForm()) {
  const result=generateSmartPlaylist(options); if (!result) { toast('Für diese Auswahl wurden keine passenden Vorschläge gefunden.','warning'); return; }
  appState.smartPlaylistOptions=options; appState.smartPlaylistDraft=result; renderSmartPlaylistPreview(); openDialog('smartPlaylistDialog');
}
function profileSummary(insights,count) {
  if (count<2) return 'Bewerte ein paar bekannte Folgen. Danach kann der Tracker deinen Hörgeschmack deutlich besser erklären und berücksichtigen.';
  const parts=[]; if (insights.tags[0]) parts.push(`Du magst besonders ${insights.tags.slice(0,2).map((item)=>item.label).join(' und ')}`); if (insights.authors[0]) parts.push(`${insights.authors[0].label} passt überdurchschnittlich gut zu dir`); if (insights.characters[0]) parts.push(`wiederkehrende Fälle mit ${insights.characters[0].label} fallen positiv auf`); return `${parts.join('. ')}${parts.length?'.':''}`;
}
function renderProfile() {
  const profile=buildTasteProfile(),insights=topProfileInsights(profile),heard=Object.values(appState.user.episodes).filter((status)=>status.heard).length,hours=Math.round(appState.user.history.reduce((sum,item)=>sum+(getEpisode(item.nr)?.durationMin||0),0)/60),ratings=Object.values(appState.user.episodes).filter((status)=>status.rating).length;
  $('profileContent').innerHTML=`<div class="profile-stats"><div class="profile-stat"><strong>${heard}</strong><span>gehört</span></div><div class="profile-stat"><strong>${ratings}</strong><span>bewertet</span></div><div class="profile-stat"><strong>${hours}</strong><span>Hörstunden</span></div></div><p class="profile-summary">${esc(profileSummary(insights,profile.ratingCount))}</p><div class="insight-block"><h3>Das magst du</h3><div class="chips">${[...insights.characters,...insights.tags,...insights.authors].slice(0,9).map((item)=>`<span>${esc(item.label)}</span>`).join('')||'<span>Noch zu wenig Daten</span>'}</div></div>${insights.negativeTags.length||insights.negativeAuthors.length?`<div class="insight-block"><h3>Passt eher nicht</h3><div class="chips">${[...insights.negativeTags,...insights.negativeAuthors].slice(0,6).map((item)=>`<span>${esc(item.label)}</span>`).join('')}</div></div>`:''}<div class="button-row"><button class="button primary" data-action="open-quick-rate">Schnell bewerten</button><button class="button secondary" data-go="ranking" data-close-dialog="profileDialog">Meine Bewertungen</button></div>`; openDialog('profileDialog');
}
function detailNeighbors(nr) { const available=appState.catalog.filter(availableEpisode); const index=available.findIndex((episode)=>episode.nr===Number(nr)); return {prev:available[index-1],next:available[index+1]}; }
function renderEpisodeDetail(nr) {
  const episode=getEpisode(nr); if (!episode) return; appState.detailNr=episode.nr; const status=statusOf(episode.nr),pinned=appState.user.pinned.includes(episode.nr),queued=appState.user.settings.queue.includes(episode.nr),similar=similarEpisodes(episode),listens=appState.user.history.filter((item)=>item.nr===episode.nr),preferred=streamingUrl(episode),neighbors=detailNeighbors(episode.nr);
  $('episodeDialogTitle').innerHTML=`<span class="eyebrow">${episode.nr>=10000?'Spezialfolge':`Folge ${episode.nr}`}</span><h2>${esc(episode.titel)}</h2>`;
  $('episodeDialogBody').innerHTML=`<section class="detail-hero"><div class="detail-meta">${metaLine(episode)}</div>${episode.beschreibung?`<p>${esc(episode.beschreibung)}</p>`:''}<div class="episode-tags">${episode.tags.map((tag)=>`<span>${esc(tag)}</span>`).join('')}</div></section><section class="detail-section detail-section-primary status-section"><h3>Dein Status</h3>${ratingButtons(episode.nr,status.rating)}<div class="detail-action-grid"><button data-action="heard" data-nr="${episode.nr}" class="button secondary ${status.heard?'active':''}">${status.heard?'✓ Gehört':'Als gehört markieren'}</button><button data-action="queue" data-nr="${episode.nr}" class="button secondary ${queued?'active':''}">${queued?'✓ Als Nächstes':'＋ Als Nächstes'}</button><button data-action="pin" data-nr="${episode.nr}" class="button secondary ${pinned?'active':''}">${pinned?'📌 Angeheftet':'○ Anheften'}</button></div></section><section class="detail-section detail-section-primary streaming-section"><h3>Streaming</h3><div class="streaming-grid">${episode.spotifyUrl?`<a class="button secondary" href="${esc(episode.spotifyUrl)}" target="_blank" rel="noopener">Spotify</a>`:''}${episode.appleMusicUrl?`<a class="button secondary" href="${esc(episode.appleMusicUrl)}" target="_blank" rel="noopener">Apple Music</a>`:''}</div></section><section class="detail-section detail-section-secondary"><h3>Folgenwissen</h3><div class="facts-grid"><div class="fact"><span>Autor</span><strong>${esc(episode.author||'—')}</strong></div><div class="fact"><span>Hörspielskript</span><strong>${esc(episode.scriptAuthor||'—')}</strong></div><div class="fact"><span>Veröffentlicht</span><strong>${formatDate(episode.releaseDate)}</strong></div><div class="fact"><span>Rocky-Beach</span><strong>${Number.isFinite(episode.rockyRanking)?episode.rockyRanking.toFixed(2):'—'}</strong></div></div>${episode.featuredCharacters.length?`<h4>Prägende Figuren</h4><div class="chips">${episode.featuredCharacters.map((name)=>`<span>${esc(name)}</span>`).join('')}</div>`:''}${episode.characters.length?`<h4>Figuren & Sprecherrollen</h4><div class="chips">${episode.characters.slice(0,30).map((name)=>`<span>${esc(name)}</span>`).join('')}</div>`:''}${episode.chapters.length?`<h4>Kapitel</h4><ol>${episode.chapters.map((chapter)=>`<li>${esc(chapter)}</li>`).join('')}</ol>`:''}</section><section class="detail-section detail-section-secondary"><h3>Hörverlauf</h3>${listens.length?`<div class="listen-history">${listens.slice(0,20).map((item,index)=>`<div><span>${index+1}. Hören</span><strong>${formatDate(item.at)}</strong></div>`).join('')}</div>`:'<p class="muted">Noch kein Hörvorgang erfasst.</p>'}<button data-action="add-listen" data-nr="${episode.nr}" class="text-button">Weiteren Hörvorgang hinzufügen</button></section><section class="detail-section detail-section-secondary"><h3>Persönliche Notiz</h3><textarea id="episodeNote" rows="6" placeholder="Was möchtest du dir merken?">${esc(status.note||'')}</textarea><small id="noteSaveState" class="muted"></small></section><section class="detail-section detail-section-secondary"><h3>Zu Playlists hinzufügen</h3><div class="playlist-check-list">${appState.user.playlists.length?appState.user.playlists.map((playlist)=>`<label><input type="checkbox" data-playlist-check="${esc(playlist.id)}" data-nr="${episode.nr}" ${playlist.episodeNrs.includes(episode.nr)?'checked':''}><span>${esc(playlist.name)}</span></label>`).join(''):'<p class="muted">Noch keine eigene Playlist vorhanden.</p>'}<button data-action="new-playlist-with" data-nr="${episode.nr}" class="text-button">＋ Neue Playlist mit dieser Folge</button></div></section>${similar.length?`<section class="detail-section detail-section-secondary"><h3>Ähnliche Folgen</h3><div class="mini-list">${similar.map((entry)=>miniRow(entry.episode)).join('')}</div></section>`:''}<div class="detail-nav"><button class="button secondary" data-action="detail-prev" ${neighbors.prev?'':'disabled'}>← Vorherige</button><button class="button secondary" data-action="detail-next" ${neighbors.next?'':'disabled'}>Nächste →</button></div>`;
  $('episodeStickyActions').innerHTML=`${preferred?`<a href="${esc(preferred)}" target="_blank" rel="noopener" class="button primary">▶ Anhören</a>`:''}<button data-action="heard" data-nr="${episode.nr}" class="button sticky-tertiary">${status.heard?'✓ Gehört':'Gehört'}</button><button data-action="rate-focus" class="button secondary sticky-secondary">Bewerten</button>`; openDialog('episodeDialog');
}

function quickRateCandidates() {
  const rated=new Set(Object.entries(appState.user.episodes).filter(([,status])=>status.rating).map(([nr])=>Number(nr)));
  const heardUnrated=appState.catalog.filter((episode)=>statusOf(episode.nr).heard&&!rated.has(episode.nr)); const popular=appState.catalog.filter((episode)=>!rated.has(episode.nr)&&availableEpisode(episode)).sort((a,b)=>(a.rockyRanking??999)-(b.rockyRanking??999));
  return [...new Map([...heardUnrated,...popular].map((episode)=>[episode.nr,episode])).values()];
}
function openQuickRate() { appState.quickRateQueue=quickRateCandidates(); appState.quickRateIndex=0; appState.quickRateHistory=[]; renderQuickRate(); openDialog('quickRateDialog'); }
function captureQuickRateStep(episode) {
  const nr=episode.nr,hasState=Object.prototype.hasOwnProperty.call(appState.user.episodes,nr);
  appState.quickRateHistory.push({nr,index:appState.quickRateIndex,hasState,status:hasState?cloneValue(appState.user.episodes[nr]):null,history:cloneValue(appState.user.history.filter((item)=>item.nr===nr))});
}
function restoreQuickRateStep() {
  const step=appState.quickRateHistory.pop(); if (!step) return;
  if (step.hasState) appState.user.episodes[step.nr]=step.status; else delete appState.user.episodes[step.nr];
  appState.user.history=appState.user.history.filter((item)=>item.nr!==step.nr).concat(step.history).sort((a,b)=>new Date(b.at)-new Date(a.at));
  appState.quickRateIndex=step.index; saveUser(); renderQuickRate(); renderHome(); renderRanking(); toast('Letzte Auswahl zurückgenommen.');
}
function renderQuickRate() {
  const episode=appState.quickRateQueue[appState.quickRateIndex],count=profileRatingCount(),canGoBack=appState.quickRateHistory.length>0;
  if (!episode) { $('quickRateContent').innerHTML=`<div class="quick-rate-card"><div class="tutorial-visual">✓</div><h3>Alles erledigt</h3><p class="muted">Du hast alle verfügbaren Kandidaten durchgesehen.</p>${canGoBack?'<button class="button secondary full" data-quick-action="back">← Letzte Auswahl ändern</button>':''}<button class="button primary full" data-close-dialog="quickRateDialog">Fertig</button></div>`; return; }
  $('quickRateContent').innerHTML=`<div class="quick-rate-progress"><span style="width:${Math.min(100,(appState.quickRateIndex+1)/Math.min(20,appState.quickRateQueue.length)*100)}%"></span></div><div class="quick-rate-card"><span class="episode-number">${episode.nr>=10000?'✦':episode.nr}</span><small>Folge ${episode.nr}</small><h3>${esc(episode.titel)}</h3><p class="muted quick-rate-meta">${metaLine(episode)}</p><div class="quick-rate-actions">${['minus','neutral','plus','super'].map((rating)=>`<button class="${rating}" data-quick-rating="${rating}" aria-label="${RATING_LABELS[rating]}">${symbols[rating]}</button>`).join('')}</div><div class="quick-rate-navigation"><button class="button secondary" data-quick-action="back" ${canGoBack?'':'disabled'}>← Zurück</button><button class="button secondary" data-quick-action="unheard">Nicht gehört</button><button class="button ghost" data-quick-action="skip">Überspringen</button></div><p class="muted quick-rate-profile">${count} Bewertungen · Profil ${count>=18?'stark':count>=7?'mittel':'im Aufbau'}</p><small class="quick-rate-hint">Du kannst jede Bewertung später jederzeit ändern.</small></div>`;
}
function advanceQuickRate() { appState.quickRateIndex+=1; renderQuickRate(); }
function renderFeedback() {
  const episode=getEpisode(appState.recommendationNr); if (!episode) return; const options=feedbackOptions(episode);
  $('feedbackContent').innerHTML=`<p class="muted">Wähle, welcher Teil von „${esc(episode.titel)}“ künftig stärker oder schwächer gewichtet werden soll.</p><div class="feedback-options">${options.map((item)=>`<article class="feedback-option"><strong>${esc(item.label)}</strong><div><button class="button secondary" data-feedback-key="${esc(item.key)}" data-feedback-direction="-1">Weniger davon</button><button class="button secondary" data-feedback-key="${esc(item.key)}" data-feedback-direction="1">Mehr davon</button></div></article>`).join('')}</div>`; openDialog('feedbackDialog');
}

function diagnosticsText() {
  const status=navigator.serviceWorker?.controller?'aktiv':'nicht kontrolliert'; return [`App-Version: ${APP_VERSION}`,`Katalog: ${appState.catalog.length} Folgen`,`Metadaten aktualisiert: ${formatRelativeDate(appState.metadataUpdatedAt)}`,`Persönliche Zustände: ${Object.keys(appState.user.episodes).length}`,`Bewertungen: ${profileRatingCount()}`,`Playlists: ${appState.user.playlists.length}`,`Warteschlange: ${appState.user.settings.queue.length}`,`Service Worker: ${status}`,`IndexedDB: ${'indexedDB' in window?'verfügbar':'nicht verfügbar'}`].join('\n');
}
function renderSettings() {
  $$('[data-service]').forEach((button)=>button.classList.toggle('active',button.dataset.service===appState.user.settings.preferredService)); $$('[data-episode-view]').forEach((button)=>button.classList.toggle('active',button.dataset.episodeView===appState.user.settings.episodeView));
  $('diagnosticsCard').innerHTML=diagnosticsText().split('\n').map((line)=>{const [label,...rest]=line.split(': ');return`<div class="diagnostic"><span>${esc(label)}</span><strong>${esc(rest.join(': '))}</strong></div>`;}).join('');
}
function populateSelects() {
  const authors=[...new Set(appState.catalog.map((episode)=>episode.author).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de')); const eras=[...new Set(appState.catalog.map((episode)=>episode.era).filter(Boolean))]; const years=[...new Set(appState.catalog.map((episode)=>episode.year).filter(Boolean))].sort((a,b)=>b-a);
  $('authorFilter').innerHTML='<option value="all">Alle</option>'+authors.map((value)=>`<option>${esc(value)}</option>`).join(''); $('smartAuthor').innerHTML='<option value="all">Alle</option>'+authors.map((value)=>`<option>${esc(value)}</option>`).join(''); $('eraFilter').innerHTML='<option value="all">Alle</option>'+eras.map((value)=>`<option>${esc(value)}</option>`).join(''); $('yearFilter').innerHTML='<option value="all">Alle</option>'+years.map((value)=>`<option>${value}</option>`).join('');
  $('authorFilter').value=authors.includes(appState.authorFilter)?appState.authorFilter:'all'; $('eraFilter').value=eras.includes(appState.eraFilter)?appState.eraFilter:'all'; $('yearFilter').value=years.map(String).includes(String(appState.yearFilter))?String(appState.yearFilter):'all'; $('episodeSort').value=appState.sort;
}
function renderImportPreview(candidate) {
  appState.importCandidate=candidate; const preview=backupPreview(candidate); $('importPreview').innerHTML=`<p>Backup ${preview.exportedAt?`vom <strong>${formatDate(preview.exportedAt)}</strong>`:'ohne Datumsangabe'} · Version ${esc(preview.version)}</p><div class="import-summary"><div><strong>${preview.episodeStates}</strong><span>Folgenstände</span></div><div><strong>${preview.playlists}</strong><span>Playlists</span></div><div><strong>${preview.pinned}</strong><span>Anheftungen</span></div><div><strong>${preview.history}</strong><span>Verlaufseinträge</span></div></div><p class="muted">${preview.conflicts} Einträge unterscheiden sich vom aktuellen Stand.</p><div class="button-row"><button class="button primary" data-import-mode="merge">Zusammenführen</button><button class="button danger" data-import-mode="replace">Ersetzen</button></div><p class="muted">Beim Ersetzen wird vorher automatisch dein aktueller Stand heruntergeladen.</p>`; openDialog('importDialog');
}
function renderTutorial(step=0) {
  const steps=[{icon:'⌕',title:'Folge finden',text:'Auf der Startseite bekommst du sofort einen verfügbaren, normalerweise ungehörten Vorschlag. Laufzeit und Stimmung kannst du optional einschränken.'},{icon:'★',title:'Bewerten',text:'Minus, Neutral, Plus und Super verbessern dein Profil. Eine Bewertung markiert die Folge automatisch als gehört.'},{icon:'↓',title:'Daten sichern',text:'Alles bleibt lokal auf deinem Gerät. Exportiere regelmäßig ein JSON-Backup, besonders vor einem Gerätewechsel.'}]; const item=steps[step]; $('tutorialTitle').textContent=item.title; $('tutorialContent').innerHTML=`<div class="quick-rate-card"><div class="tutorial-visual">${item.icon}</div><p>${esc(item.text)}</p><div class="tutorial-dots">${steps.map((_,index)=>`<span class="${index===step?'active':''}"></span>`).join('')}</div><button class="button primary full" data-tutorial-next="${step}">${step===steps.length-1?'App benutzen':'Weiter'}</button>${step<steps.length-1?'<button class="text-button" data-tutorial-skip>Überspringen</button>':''}</div>`; openDialog('tutorialDialog');
}

function navigate(page,{restore=true}={}) {
  if (appState.page) appState.scrollPositions[appState.page]=window.scrollY; appState.page=page;
  $$('.page').forEach((node)=>node.classList.toggle('active',node.dataset.page===page)); $$('.bottom-nav [data-go]').forEach((button)=>button.classList.toggle('active',button.dataset.go===page));
  history.replaceState(null,'',page==='home'?'./':`#${page}`); requestAnimationFrame(()=>window.scrollTo(0,restore?(appState.scrollPositions[page]||0):0));
}
function refreshViews(detailNr=null) { renderHome(); renderEpisodes(); renderRanking(); renderPlaylists(); renderSettings(); if (detailNr&&$('episodeDialog').open) renderEpisodeDetail(detailNr); }
async function toggleHeardAction(nr) {
  const status=statusOf(nr); if (status.heard&&status.rating) { const yes=await confirmAction({title:'Wieder auf ungehört setzen?',text:'Dabei wird auch deine Bewertung entfernt. Notiz und Playlists bleiben erhalten.',accept:'Auf ungehört setzen'}); if (!yes) return; }
  setHeard(nr,!status.heard); toast(status.heard?'Als gehört markiert.':'Auf ungehört gesetzt.'); refreshViews(nr);
}
function handleRating(nr,rating) { const status=setRating(nr,rating); toast(status.rating?`${RATING_LABELS[status.rating]} gespeichert.`:'Bewertung entfernt.'); refreshViews(nr); }
async function sharePlaylist(id) {
  const playlist=getPlaylist(id); if (!playlist) return; const text=[playlist.name||playlist.title,...playlist.episodes.map((episode)=>`${episode.nr}. ${episode.titel}`)].join('\n');
  try { if (navigator.share) await navigator.share({title:playlist.name||playlist.title,text}); else { await navigator.clipboard.writeText(text); toast('Playlist kopiert.'); } } catch(error) { if(error?.name!=='AbortError') toast('Teilen nicht möglich.','error'); }
}

function bindDelegatedEvents() {
  document.addEventListener('click',async(event)=>{
    const close=event.target.closest('[data-close-dialog]'); if(close){closeDialog(close.dataset.closeDialog);return;}
    const go=event.target.closest('[data-go]'); if(go){const page=go.dataset.go; const closeId=go.dataset.closeDialog;if(closeId)closeDialog(closeId);navigate(page);return;}
    const openEpisode=event.target.closest('[data-open-episode]'); if(openEpisode){renderEpisodeDetail(Number(openEpisode.dataset.openEpisode));return;}
    const openPlaylist=event.target.closest('[data-open-playlist]'); if(openPlaylist){renderPlaylistDetail(openPlaylist.dataset.openPlaylist);return;}
    const clear=event.target.closest('[data-clear-filter]'); if(clear){const key=clear.dataset.clearFilter;if(key==='all'||key==='filter')appState.filter='all';if(key==='all'||key==='author')appState.authorFilter='all';if(key==='all'||key==='era')appState.eraFilter='all';if(key==='all'||key==='year')appState.yearFilter='all';if(key==='all'||key==='search'){appState.search='';$('episodeSearch').value='';}populateSelects();persistFilters();renderEpisodes();return;}
    const quickRating=event.target.closest('[data-quick-rating]'); if(quickRating){const episode=appState.quickRateQueue[appState.quickRateIndex];if(episode){captureQuickRateStep(episode);setRating(episode.nr,quickRating.dataset.quickRating);if(profileRatingCount()%5===0)toast('Dein Geschmacksprofil wurde verbessert.');advanceQuickRate();renderHome();renderRanking();}return;}
    const quickAction=event.target.closest('[data-quick-action]'); if(quickAction){if(quickAction.dataset.quickAction==='back'){restoreQuickRateStep();return;}const episode=appState.quickRateQueue[appState.quickRateIndex];if(!episode)return;captureQuickRateStep(episode);if(quickAction.dataset.quickAction==='unheard'&&statusOf(episode.nr).heard)setHeard(episode.nr,false);advanceQuickRate();renderHome();renderRanking();return;}
    const feedback=event.target.closest('[data-feedback-key]'); if(feedback){adjustFeatureFeedback(feedback.dataset.feedbackKey,Number(feedback.dataset.feedbackDirection));closeDialog('feedbackDialog');pickRecommendation();toast('Deine Präferenz wurde gespeichert.');return;}
    const importButton=event.target.closest('[data-import-mode]'); if(importButton){const mode=importButton.dataset.importMode;if(mode==='replace')await exportBackup({forceDownload:true});await applyImport(appState.importCandidate,mode);closeDialog('importDialog');setStoredFilters();populateSelects();renderAll();toast(mode==='replace'?'Backup ersetzt aktuellen Stand.':'Backup wurde zusammengeführt.');return;}
    const tutorialNext=event.target.closest('[data-tutorial-next]'); if(tutorialNext){const step=Number(tutorialNext.dataset.tutorialNext);if(step>=2){appState.user.settings.tutorialCompleted=true;saveUser();closeDialog('tutorialDialog');}else renderTutorial(step+1);return;}
    if(event.target.closest('[data-tutorial-skip]')){appState.user.settings.tutorialCompleted=true;saveUser();closeDialog('tutorialDialog');return;}
    const action=event.target.closest('[data-action]'); if(!action)return; const nr=Number(action.dataset.nr);
    switch(action.dataset.action){
      case'rate':handleRating(nr,action.dataset.rating);break; case'heard':await toggleHeardAction(nr);break; case'add-listen':addListen(nr);toast('Weiterer Hörvorgang hinzugefügt.');refreshViews(nr);break;
      case'pin':toast(togglePinned(nr)?'Folge angeheftet.':'Anheftung entfernt.');refreshViews(nr);break;case'queue':toast(toggleQueue(nr)?'Zur Warteschlange hinzugefügt.':'Aus der Warteschlange entfernt.');refreshViews(nr);break;
      case'queue-up':moveQueueItem(nr,-1);renderPlaylists();renderHome();break;case'queue-down':moveQueueItem(nr,1);renderPlaylists();renderHome();break;case'queue-remove':removeFromQueue(nr);renderPlaylists();renderHome();break;
      case'snooze':snoozeRecommendation(nr);appState.recommendationNr=null;renderHome();toast('Die Folge wird sieben Tage nicht empfohlen.');break;case'hide-recommendation':hideRecommendation(nr);appState.recommendationNr=null;renderHome();toast('Die Folge wurde ausgeblendet.');break;
      case'open-quick-rate':closeDialog('profileDialog');openQuickRate();break;case'rate-focus':$('episodeDialogBody').querySelector('.rating-buttons')?.scrollIntoView({behavior:'smooth',block:'center'});break;case'new-playlist-with':openPlaylistEditor(null,nr);break;
      case'queue-playlist':{const playlist=getPlaylist(action.dataset.playlistId);if(playlist){addManyToQueue(playlist.episodes.map((episode)=>episode.nr));renderPlaylists();renderHome();toast(`${playlist.episodes.length} Folgen vorgemerkt.`);}break;}
      case'share-playlist':await sharePlaylist(action.dataset.playlistId);break;case'playlist-up':movePlaylistEpisode(action.dataset.playlistId,nr,-1);renderPlaylistDetail(action.dataset.playlistId);renderPlaylists();break;case'playlist-down':movePlaylistEpisode(action.dataset.playlistId,nr,1);renderPlaylistDetail(action.dataset.playlistId);renderPlaylists();break;case'playlist-remove':removeEpisodeFromPlaylist(action.dataset.playlistId,nr);renderPlaylistDetail(action.dataset.playlistId);renderPlaylists();break;case'playlist-add':addEpisodeToPlaylist(action.dataset.playlistId,nr);renderPlaylistDetail(action.dataset.playlistId);renderPlaylists();break;
      case'edit-playlist':{const id=action.dataset.playlistId;closeDialog('playlistDialog');openPlaylistEditor(id);break;}case'delete-playlist':{const id=action.dataset.playlistId;if(await confirmAction({title:'Playlist löschen?',text:'Die enthaltenen Folgen und Bewertungen bleiben erhalten.',accept:'Playlist löschen'})){deletePlaylist(id);closeDialog('playlistDialog');renderPlaylists();toast('Playlist gelöscht.');}break;}
      case'smart-regenerate':{if(appState.smartPlaylistOptions)createSmartPlaylistPreview(appState.smartPlaylistOptions);break;}
      case'smart-remove':{const draft=appState.smartPlaylistDraft;if(draft){draft.episodes=draft.episodes.filter((episode)=>episode.nr!==nr);draft.episodeNrs=draft.episodes.map((episode)=>episode.nr);draft.duration=draft.episodes.reduce((sum,episode)=>sum+(episode.durationMin||0),0);renderSmartPlaylistPreview();}break;}
      case'smart-queue':{const draft=appState.smartPlaylistDraft;if(draft?.episodes.length){addManyToQueue(draft.episodes.map((episode)=>episode.nr));closeDialog('smartPlaylistDialog');renderPlaylists();renderHome();toast(`${draft.episodes.length} Vorschläge wurden als Nächstes vorgemerkt.`);}break;}
      case'smart-save':{const draft=appState.smartPlaylistDraft;if(draft?.episodes.length){const playlist=createPlaylist({name:draft.name,description:draft.description,episodeNrs:draft.episodes.map((episode)=>episode.nr),generated:true});appState.playlistTab='mine';appState.user.settings.playlistTab='mine';saveUser();closeDialog('smartPlaylistDialog');renderPlaylists();renderPlaylistDetail(playlist.id);toast(`Playlist mit ${draft.episodes.length} Folgen gespeichert.`);}break;}
      case'detail-prev':{const previous=detailNeighbors(appState.detailNr).prev;if(previous)renderEpisodeDetail(previous.nr);break;}case'detail-next':{const next=detailNeighbors(appState.detailNr).next;if(next)renderEpisodeDetail(next.nr);break;}
    }
  });
}
function bindStaticEvents() {
  bindDelegatedEvents(); $('profileButton').addEventListener('click',renderProfile); $('findRecommendation').addEventListener('click',pickRecommendation); $('anotherRecommendation').addEventListener('click',pickRecommendation); $('recommendationFeedback').addEventListener('click',renderFeedback); $('quickRateHome').addEventListener('click',openQuickRate);
  $('recommendationTime').addEventListener('change',(event)=>{appState.time=event.target.value;}); $('recommendationMood').addEventListener('change',(event)=>{appState.mood=event.target.value;});
  $('episodeSearch').addEventListener('input',(event)=>{appState.search=event.target.value;appState.episodeRenderLimit=40;renderEpisodes();}); $('clearSearch').addEventListener('click',()=>{appState.search='';$('episodeSearch').value='';renderEpisodes();});
  $('statusFilters').addEventListener('click',(event)=>{const button=event.target.closest('[data-filter]');if(!button)return;appState.filter=button.dataset.filter;appState.episodeRenderLimit=40;persistFilters();renderEpisodes();});
  for(const [id,key] of [['authorFilter','authorFilter'],['eraFilter','eraFilter'],['yearFilter','yearFilter'],['episodeSort','sort']])$(id).addEventListener('change',(event)=>{appState[key]=event.target.value;appState.episodeRenderLimit=40;persistFilters();renderEpisodes();});
  $('loadMoreEpisodes').addEventListener('click',()=>{appState.episodeRenderLimit+=40;renderEpisodes();});
  $('rankingMode').addEventListener('click',(event)=>{const button=event.target.closest('[data-ranking]');if(!button)return;appState.ranking=button.dataset.ranking;renderRanking();});
  $('playlistTabs').addEventListener('click',(event)=>{const button=event.target.closest('[data-playlist-tab]');if(!button)return;appState.playlistTab=button.dataset.playlistTab;appState.user.settings.playlistTab=appState.playlistTab;saveUser();renderPlaylists();});
  $('newPlaylistButton').addEventListener('click',()=>openPlaylistEditor()); $('playlistEditorForm').addEventListener('submit',(event)=>{event.preventDefault();const id=$('playlistEditorId').value,seedNr=Number($('playlistEditorSeedNr').value),name=$('playlistName').value,description=$('playlistDescription').value;if(id)updatePlaylist(id,{name,description});else createPlaylist({name,description,episodeNrs:Number.isFinite(seedNr)&&seedNr?[seedNr]:[]});closeDialog('playlistEditorDialog');renderPlaylists();toast(id?'Playlist aktualisiert.':'Playlist erstellt.');});
  $('createSmartPlaylist').addEventListener('click',()=>createSmartPlaylistPreview());
  $('clearQueue').addEventListener('click',async()=>{if(!appState.user.settings.queue.length)return;if(await confirmAction({title:'Warteschlange leeren?',text:'Bewertungen und Playlists bleiben erhalten.',accept:'Leeren'})){appState.user.settings.queue=[];saveUser();renderPlaylists();renderHome();}});
  $('episodeDialogBody').addEventListener('input',(event)=>{if(event.target.id!=='episodeNote')return;$('noteSaveState').textContent='Speichert …';clearTimeout(noteTimer);noteTimer=setTimeout(()=>{setNote(appState.detailNr,event.target.value);$('noteSaveState').textContent='Gespeichert';},450);});
  $('episodeDialogBody').addEventListener('change',(event)=>{const box=event.target.closest('[data-playlist-check]');if(!box)return;if(box.checked)addEpisodeToPlaylist(box.dataset.playlistCheck,Number(box.dataset.nr));else removeEpisodeFromPlaylist(box.dataset.playlistCheck,Number(box.dataset.nr));renderPlaylists();toast(box.checked?'Zur Playlist hinzugefügt.':'Aus Playlist entfernt.');});
  $('exportBackup').addEventListener('click',async()=>{await exportBackup();renderHome();renderSettings();toast('Backup wurde bereitgestellt.');}); $('backupNow').addEventListener('click',async()=>{await exportBackup();renderHome();toast('Backup wurde bereitgestellt.');}); $('dismissBackupReminder').addEventListener('click',()=>{appState.user.settings.backupReminderDismissedAt=nowIso();saveUser();renderHome();}); $('importBackup').addEventListener('click',()=>$('backupFile').click()); $('backupFile').addEventListener('change',async(event)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{renderImportPreview(parseBackupText(await file.text()));}catch(error){toast(error.message,'error');}});
  $('refreshMetadata').addEventListener('click',async()=>{const button=$('refreshMetadata');button.disabled=true;try{const result=await refreshMetadata({force:true});populateSelects();renderAll();toast(result.updated?'Folgenwissen wurde aktualisiert.':'Folgenwissen ist aktuell.');}catch(error){toast(`Aktualisierung fehlgeschlagen: ${error.message}`,'error');}finally{button.disabled=false;}});
  $('resetCatalog').addEventListener('click',async()=>{if(await confirmAction({title:'Katalog-Cache zurücksetzen?',text:'Persönliche Daten bleiben erhalten.',accept:'Katalog neu laden',danger:false})){await clearCatalogCache();populateSelects();renderAll();toast('Eingebauter Katalog wurde neu geladen.');}});
  $('restoreRecommendations').addEventListener('click',()=>{restoreHiddenRecommendations();toast('Ausgeblendete Empfehlungen wurden zurückgesetzt.');renderSettings();});
  $('resetPersonalData').addEventListener('click',async()=>{if(await confirmAction({title:'Alle persönlichen Daten löschen?',text:'Hörstatus, Bewertungen, Notizen, Playlists, Verlauf und Einstellungen werden dauerhaft entfernt.',accept:'Alles löschen'})){appState.user=emptyPersonalData();resetRuntimeState();await saveUser(true);setStoredFilters();populateSelects();renderAll();navigate('home',{restore:false});toast('Persönliche Daten wurden gelöscht.');}});
  $('startTutorial').addEventListener('click',()=>renderTutorial(0)); $('openHelp').addEventListener('click',()=>openDialog('helpDialog')); $('copyDiagnostics').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(diagnosticsText());toast('Diagnose kopiert.');}catch{toast('Kopieren nicht möglich.','error');}}); $('validateCatalog').addEventListener('click',()=>{const result=catalogValidation();if(result.ok)toast(`Katalogprüfung erfolgreich: ${result.count} Folgen.`);else{console.table(result.issues.map((issue)=>({issue})));toast(`${result.issues.length} Kataloghinweise gefunden.`,'warning');}});
  $('streamingService').addEventListener('click',(event)=>{const button=event.target.closest('[data-service]');if(!button)return;appState.user.settings.preferredService=button.dataset.service;saveUser();renderSettings();}); document.addEventListener('click',(event)=>{const button=event.target.closest('[data-episode-view]');if(!button)return;appState.user.settings.episodeView=button.dataset.episodeView;saveUser();renderEpisodes();renderSettings();});
  $('confirmCancel').addEventListener('click',()=>{closeDialog('confirmDialog');confirmResolver?.(false);confirmResolver=null;}); $('confirmAccept').addEventListener('click',()=>{closeDialog('confirmDialog');confirmResolver?.(true);confirmResolver=null;}); $('confirmDialog').addEventListener('cancel',(event)=>{event.preventDefault();closeDialog('confirmDialog');confirmResolver?.(false);confirmResolver=null;}); $('applyUpdate').addEventListener('click',()=>pendingWorker?.postMessage({type:'SKIP_WAITING'}));
}
function registerServiceWorker() {
  if(!('serviceWorker'in navigator))return; navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadingForUpdate)return;reloadingForUpdate=true;location.reload();});
  navigator.serviceWorker.register('./sw.js').then((registration)=>{const show=(worker)=>{pendingWorker=worker;$('updateBanner').classList.remove('hidden');};if(registration.waiting)show(registration.waiting);registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)show(worker);});});registration.update();}).catch((error)=>console.warn('Service Worker konnte nicht registriert werden.',error));
}
function renderAll(){renderHome();renderEpisodes();renderRanking();renderPlaylists();renderSettings();}
export async function startApp() {
  $('loadingText').textContent='Lade Folgenkatalog …';await loadCatalog();$('loadingText').textContent='Lade persönliche Daten …';await loadUser();setStoredFilters();appState.playlistTab=appState.user.settings.playlistTab||'essentials';populateSelects();bindStaticEvents();renderAll();
  const hash=location.hash.slice(1);navigate(['episodes','ranking','playlists','settings'].includes(hash)?hash:'home',{restore:false});$('loadingScreen').classList.add('hidden');setTimeout(()=>$('loadingScreen')?.remove(),500);
  if(!appState.user.settings.tutorialCompleted)setTimeout(()=>renderTutorial(0),350);refreshMetadata().then((result)=>{if(result.updated){populateSelects();renderAll();}}).catch((error)=>console.warn('Metadaten konnten nicht aktualisiert werden.',error));registerServiceWorker();
}
