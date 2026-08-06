import { appState, availableEpisode, clamp, getEpisode, nowIso, saveUser, uid } from './core.js';
import { moodMatches } from './catalog.js';
import { buildTasteProfile, recommendationScore, similarEpisodes } from './recommendations.js';

export const CURATED_PLAYLISTS = [
  { id:'hugenay', icon:'♛', title:'Die Hugenay-Chronik', description:'Die wichtigsten Auftritte des Meisterdiebs.', category:'essentials', type:'numbers', numbers:[1,12,16,103,125], sequence:true },
  { id:'feuriges-auge', icon:'◆', title:'Vom Rubin zum Feurigen Auge', description:'Klassischer Ursprung und Jubiläumsfortsetzung.', category:'essentials', type:'numbers', numbers:[5,200], sequence:true },
  { id:'jubilaeum', icon:'★', title:'Die großen Jubiläen', description:'Die langen Jubiläumsfälle in Reihenfolge.', category:'essentials', type:'numbers', numbers:[100,125,150,175,200,225], sequence:true },
  { id:'halloween', icon:'☾', title:'Halloween in Rocky Beach', description:'Düstere und atmosphärische Fälle.', category:'essentials', type:'mood', mood:'grusel', max:14 },
  { id:'winter', icon:'❄', title:'Advent & Weihnachten', description:'Winterliche Hauptfolgen und Adventsspecials.', category:'essentials', type:'numbers', numbers:[77,142,202,10007,10008,10009,10010,10011,10012] },
  { id:'andre-marx', icon:'✎', title:'André Marx', description:'Fälle eines der prägendsten modernen Autoren.', category:'themes', type:'author', author:'André Marx', max:24 },
  { id:'summer', icon:'≈', title:'Sommer, Meer & Inseln', description:'Küste, Schiffe, Tauchen und Inseln.', category:'themes', type:'mood', mood:'meer', max:18 },
  { id:'skinny', icon:'⚡', title:'Skinny Norris', description:'Folgen mit dem ewigen Rivalen.', category:'themes', type:'mood', mood:'skinny', max:18 },
  { id:'familie', icon:'⌂', title:'Familie & Rocky Beach', description:'Tante Mathilda, Onkel Titus und vertraute Gesichter.', category:'themes', type:'mood', mood:'familie', max:18 },
  { id:'football', icon:'⚽', title:'Fußballfälle', description:'Stadien, Spieler, Fouls und Turniere.', category:'themes', type:'numbers', numbers:[63,81,123,141,153,164,176,245] },
];
export const STORY_BLOCKS = [
  { id:'hugenay', title:'Hugenay-Chronik', numbers:[1,12,16,103,125] },
  { id:'feuriges-auge', title:'Fluch des Rubins → Feuriges Auge', numbers:[5,200] },
  { id:'jubilaeum', title:'Jubiläumsfolgen', numbers:[100,125,150,175,200,225] },
];
export function curatedPlaylists(category='essentials') { return CURATED_PLAYLISTS.filter((item) => item.category === category); }
export function resolveCuratedPlaylist(definition) {
  let episodes = [];
  if (definition.type === 'numbers') episodes = definition.numbers.map(getEpisode).filter(Boolean);
  if (definition.type === 'author') episodes = appState.catalog.filter((episode) => episode.author === definition.author && availableEpisode(episode));
  if (definition.type === 'mood') episodes = appState.catalog.filter((episode) => moodMatches(episode,definition.mood) && availableEpisode(episode));
  if (definition.max) episodes = episodes.slice(0,definition.max);
  return { ...definition,id:`curated:${definition.id}`,name:definition.title,episodes };
}
export function getPlaylist(id) {
  if (String(id).startsWith('curated:')) { const definition = CURATED_PLAYLISTS.find((item) => item.id === String(id).slice(8)); return definition ? resolveCuratedPlaylist(definition) : null; }
  const playlist = appState.user.playlists.find((item) => item.id === id); return playlist ? { ...playlist,episodes:playlist.episodeNrs.map(getEpisode).filter(Boolean) } : null;
}
export function createPlaylist({name,description='',episodeNrs=[],generated=false}) {
  const playlist = { id:uid('playlist'),name:String(name || 'Neue Playlist').trim().slice(0,60),description:String(description).trim().slice(0,240),episodeNrs:[...new Set(episodeNrs.map(Number).filter(Number.isFinite))],createdAt:nowIso(),updatedAt:nowIso(),generated };
  appState.user.playlists.unshift(playlist); saveUser(); return playlist;
}
export function updatePlaylist(id,patch) { const playlist = appState.user.playlists.find((item) => item.id === id); if (!playlist) return null; if (patch.name != null) playlist.name = String(patch.name).trim().slice(0,60); if (patch.description != null) playlist.description = String(patch.description).trim().slice(0,240); playlist.updatedAt = nowIso(); saveUser(); return playlist; }
export function deletePlaylist(id) { appState.user.playlists = appState.user.playlists.filter((item) => item.id !== id); saveUser(); }
export function addEpisodeToPlaylist(id,nr) { const playlist = appState.user.playlists.find((item) => item.id === id); if (!playlist) return; const number = Number(nr); if (!playlist.episodeNrs.includes(number)) playlist.episodeNrs.push(number); playlist.updatedAt = nowIso(); saveUser(); }
export function removeEpisodeFromPlaylist(id,nr) { const playlist = appState.user.playlists.find((item) => item.id === id); if (!playlist) return; playlist.episodeNrs = playlist.episodeNrs.filter((item) => item !== Number(nr)); playlist.updatedAt = nowIso(); saveUser(); }
export function movePlaylistEpisode(id,nr,direction) { const playlist = appState.user.playlists.find((item) => item.id === id); if (!playlist) return; const index = playlist.episodeNrs.indexOf(Number(nr)); const next = clamp(index + direction,0,playlist.episodeNrs.length - 1); if (index < 0 || index === next) return; [playlist.episodeNrs[index],playlist.episodeNrs[next]] = [playlist.episodeNrs[next],playlist.episodeNrs[index]]; playlist.updatedAt = nowIso(); saveUser(); }
export function playlistStats(episodes) {
  const total = episodes.length; const heard = episodes.filter((episode) => appState.user.episodes?.[episode.nr]?.heard).length;
  const duration = episodes.reduce((sum,episode) => sum + (Number(episode.durationMin) || 0),0); const remaining = episodes.filter((episode) => !appState.user.episodes?.[episode.nr]?.heard).reduce((sum,episode) => sum + (Number(episode.durationMin) || 0),0);
  return { total,heard,duration,remaining };
}
function candidateBlocks({status,mood,author,continuity}) {
  let pool = appState.catalog.filter(availableEpisode).filter((episode) => status === 'mixed' || (status === 'heard') === Boolean(appState.user.episodes?.[episode.nr]?.heard)).filter((episode) => mood === 'any' || moodMatches(episode,mood)).filter((episode) => author === 'all' || episode.author === author);
  const used = new Set(); const blocks = [];
  if (continuity) for (const block of STORY_BLOCKS) {
    const episodes = block.numbers.map((nr) => pool.find((episode) => episode.nr === nr)).filter(Boolean);
    if (episodes.length > 1) { blocks.push({episodes,duration:episodes.reduce((sum,item) => sum + (item.durationMin || 0),0),label:block.title}); episodes.forEach((item) => used.add(item.nr)); }
  }
  for (const episode of pool) if (!used.has(episode.nr)) blocks.push({episodes:[episode],duration:episode.durationMin || 55,label:episode.titel});
  return blocks;
}
export function generateSmartPlaylist({name,targetMinutes,mood='any',status='unheard',author='all',continuity=true}) {
  const target = Math.max(20,Number(targetMinutes) || 120); const profile = buildTasteProfile(); const blocks = candidateBlocks({status,mood,author,continuity}); if (!blocks.length) return null;
  let best = null;
  for (let attempt=0;attempt<450;attempt++) {
    const shuffled = blocks.map((block) => ({block,key:Math.random() + recommendationScore(block.episodes[0],profile,{useDiversity:false}).total * .07})).sort((a,b) => b.key-a.key).map((entry) => entry.block);
    const chosen = []; let duration = 0;
    for (const block of shuffled) { const next = duration + block.duration; if (next <= target + 18 && (next <= target || Math.random() < .22)) { chosen.push(block); duration = next; } }
    if (!chosen.length) continue;
    const episodes = chosen.flatMap((block) => block.episodes); const quality = episodes.reduce((sum,episode) => sum + recommendationScore(episode,profile,{useDiversity:false}).total,0) / episodes.length;
    const score = -Math.abs(duration-target) + quality * 7 + Math.min(episodes.length,8) * .5;
    if (!best || score > best.score) best = {episodes,duration,score};
  }
  if (!best) return null;
  return {
    name:String(name || 'Meine Hörsession').trim().slice(0,60) || 'Meine Hörsession',
    description:`Automatisch geplant für ungefähr ${target} Minuten.`,
    targetMinutes:target,
    options:{mood,status,author,continuity},
    episodeNrs:best.episodes.map((episode) => episode.nr),
    ...best,
  };
}
export function playlistSuggestions(id,limit=6) {
  const playlist = getPlaylist(id); if (!playlist?.episodes?.length || String(id).startsWith('curated:')) return [];
  const excluded = new Set(playlist.episodes.map((episode) => episode.nr)); const scores = new Map();
  for (const source of playlist.episodes.slice(-5)) for (const entry of similarEpisodes(source,12)) if (!excluded.has(entry.episode.nr)) {
    const current = scores.get(entry.episode.nr) || {episode:entry.episode,score:0,reasons:[]}; current.score += entry.score; current.reasons.push(...entry.reasons); scores.set(entry.episode.nr,current);
  }
  return [...scores.values()].sort((a,b) => b.score-a.score).slice(0,limit);
}
