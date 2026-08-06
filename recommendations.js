import { appState, availableEpisode, clamp, normalizeText, RATING_VALUES, saveUser, unique } from './core.js';

function rockyQuality(episode) {
  const value = Number(episode.rockyRanking); if (!Number.isFinite(value)) return 0;
  return clamp((3.15 - value) / 1.8,-0.25,1.15);
}
function episodeFeatures(episode) {
  const out = [];
  for (const label of episode.featuredCharacters || []) out.push({ key:`character:${normalizeText(label)}`,label,type:'character',weight:1.55 });
  if (episode.author) out.push({ key:`author:${normalizeText(episode.author)}`,label:episode.author,type:'author',weight:.82 });
  for (const label of episode.tags || []) out.push({ key:`tag:${normalizeText(label)}`,label,type:'tag',weight:.72 });
  if (episode.era) out.push({ key:`era:${normalizeText(episode.era)}`,label:episode.era,type:'era',weight:.34 });
  if (episode.scriptAuthor) out.push({ key:`script:${normalizeText(episode.scriptAuthor)}`,label:episode.scriptAuthor,type:'script',weight:.28 });
  return out;
}
export function buildTasteProfile() {
  const aggregate = new Map(); let ratingCount = 0;
  for (const episode of appState.catalog) {
    const rating = appState.user.episodes?.[episode.nr]?.rating; if (!rating) continue; ratingCount += 1;
    const value = RATING_VALUES[rating];
    for (const feature of episodeFeatures(episode)) {
      const entry = aggregate.get(feature.key) || { ...feature,total:0,count:0 };
      entry.total += value * feature.weight; entry.count += 1; aggregate.set(feature.key,entry);
    }
  }
  const feedback = appState.user.settings.featureFeedback || {};
  for (const [key,value] of Object.entries(feedback)) {
    const existing = aggregate.get(key) || { key,label:key.split(':').slice(1).join(':') || key,type:key.split(':')[0],total:0,count:0,weight:1 };
    existing.total += Number(value) * .55; existing.count += Math.abs(Number(value)); aggregate.set(key,existing);
  }
  const features = [...aggregate.values()].map((item) => ({ ...item,score:item.total / Math.sqrt(Math.max(1,item.count * 1.25)) })).sort((a,b) => Math.abs(b.score)-Math.abs(a.score));
  return { ratingCount,confidence:clamp(ratingCount / 18,0,1),features,featureMap:new Map(features.map((item) => [item.key,item])) };
}
function recencyDiversityPenalty(episode) {
  const history = appState.user.settings.recommendationHistory || []; if (!history.length) return 0;
  const recent = history.slice(-6).map((nr) => appState.catalog.find((item) => item.nr === nr)).filter(Boolean);
  let penalty = 0;
  for (const [index,item] of recent.entries()) {
    const decay = (recent.length - index) / recent.length;
    if (item.author && item.author === episode.author) penalty += .19 * decay;
    if (item.era && item.era === episode.era) penalty += .07 * decay;
    if (item.featuredCharacters?.some((name) => episode.featuredCharacters?.includes(name))) penalty += .15 * decay;
    if (item.tags?.some((tag) => episode.tags?.includes(tag))) penalty += .05 * decay;
  }
  return penalty;
}
export function recommendationScore(episode,profile = buildTasteProfile(),{useDiversity=true} = {}) {
  let personal = 0; const matches = [];
  for (const feature of episodeFeatures(episode)) {
    const preference = profile.featureMap.get(feature.key)?.score || 0;
    if (preference) { const value = preference * feature.weight; personal += value; matches.push({ ...feature,value }); }
  }
  const quality = rockyQuality(episode) * 1.65;
  const metadata = (episode.durationMin ? .05 : 0) + (episode.beschreibung ? .04 : 0) + (episode.spotifyUrl || episode.appleMusicUrl ? .04 : 0);
  const diversity = useDiversity ? recencyDiversityPenalty(episode) : 0;
  return { total:personal * 1.55 + quality + metadata - diversity,personal,quality,metadata,diversity,matches:matches.sort((a,b) => b.value-a.value) };
}
function isSuppressed(nr) {
  if (appState.user.settings.hiddenRecommendations.includes(Number(nr))) return true;
  const until = appState.user.settings.snoozedRecommendations?.[nr]; return Boolean(until && new Date(until) > new Date());
}
export function recommendationCandidates({ time='any',mood='any',includeHeard=false,timeMatcher,moodMatcher } = {}) {
  const profile = buildTasteProfile();
  return appState.catalog.filter((episode) => availableEpisode(episode) && !isSuppressed(episode.nr))
    .filter((episode) => includeHeard || !appState.user.episodes?.[episode.nr]?.heard)
    .filter((episode) => !timeMatcher || timeMatcher(episode,time)).filter((episode) => !moodMatcher || moodMatcher(episode,mood))
    .map((episode) => ({ episode,score:recommendationScore(episode,profile) })).sort((a,b) => b.score.total-a.score.total);
}
export function chooseRecommendation(options = {}) {
  let candidates = recommendationCandidates(options); if (!candidates.length && !options.includeHeard) candidates = recommendationCandidates({ ...options,includeHeard:true });
  if (!candidates.length) return null;
  const pool = candidates.slice(0,Math.min(12,candidates.length));
  const min = Math.min(...pool.map((entry) => entry.score.total)); const weights = pool.map((entry) => Math.max(.12,entry.score.total-min+.45));
  let roll = Math.random() * weights.reduce((sum,value) => sum+value,0); let selected = pool[0];
  for (let i=0;i<pool.length;i++) { roll -= weights[i]; if (roll <= 0) { selected = pool[i]; break; } }
  const history = appState.user.settings.recommendationHistory.filter((nr) => nr !== selected.episode.nr); history.push(selected.episode.nr);
  appState.user.settings.recommendationHistory = history.slice(-30); saveUser(); return { ...selected,profile:buildTasteProfile() };
}
export function matchPresentation(episode,profile = buildTasteProfile(),score = recommendationScore(episode,profile)) {
  const count = profile.ratingCount; let level = 'Allgemeiner Tipp'; let scoreValue = Math.round(clamp(52 + score.total * 13,38,91));
  if (count >= 2) {
    scoreValue = Math.round(clamp(58 + score.total * 12 + profile.confidence * 8,24,96));
    level = scoreValue >= 88 ? 'Sehr hohe Passung' : scoreValue >= 78 ? 'Hohe Passung' : scoreValue >= 66 ? 'Gute Passung' : 'Unsichere Passung';
  }
  const strength = count >= 18 ? 'Hoch' : count >= 7 ? 'Mittel' : count >= 2 ? 'Im Aufbau' : 'Noch allgemein';
  const reasons = score.matches.filter((item) => item.value > .05).slice(0,4).map((item) => item.label);
  if (!reasons.length) { if (Number.isFinite(episode.rockyRanking)) reasons.push('starke Community-Wertung'); if (episode.featuredCharacters?.[0]) reasons.push(episode.featuredCharacters[0]); if (episode.tags?.[0]) reasons.push(episode.tags[0]); }
  return { level,scoreValue,strength,reasons:unique(reasons).slice(0,4),ratingCount:count };
}
export function snoozeRecommendation(nr,days=7) { const until = new Date(Date.now()+days*86400000).toISOString(); appState.user.settings.snoozedRecommendations[nr] = until; saveUser(); return until; }
export function hideRecommendation(nr) { const list = appState.user.settings.hiddenRecommendations; if (!list.includes(Number(nr))) list.push(Number(nr)); saveUser(); }
export function restoreHiddenRecommendations() { appState.user.settings.hiddenRecommendations = []; appState.user.settings.snoozedRecommendations = {}; saveUser(); }
export function adjustFeatureFeedback(featureKey,direction) {
  const feedback = appState.user.settings.featureFeedback; feedback[featureKey] = clamp((Number(feedback[featureKey]) || 0) + Math.sign(direction),-5,5); if (!feedback[featureKey]) delete feedback[featureKey]; saveUser();
}
export function feedbackOptions(episode) { return episodeFeatures(episode).filter((item,index,all) => all.findIndex((candidate) => candidate.key === item.key) === index).slice(0,8); }
export function similarEpisodes(episode,limit=6) {
  const base = new Set(episodeFeatures(episode).map((item) => item.key));
  return appState.catalog.filter((candidate) => candidate.nr !== episode.nr && availableEpisode(candidate)).map((candidate) => {
    const overlap = episodeFeatures(candidate).filter((item) => base.has(item.key)); let score = overlap.reduce((sum,item) => sum + item.weight,0);
    if (candidate.author && candidate.author === episode.author) score += .8; if (candidate.era && candidate.era === episode.era) score += .18; score += rockyQuality(candidate) * .35;
    return { episode:candidate,score,reasons:overlap.map((item) => item.label).slice(0,3) };
  }).filter((entry) => entry.score > .2).sort((a,b) => b.score-a.score).slice(0,limit);
}
export function topProfileInsights(profile = buildTasteProfile()) {
  const positive = profile.features.filter((item) => item.score > .12); const negative = profile.features.filter((item) => item.score < -.12);
  const byType = (items,type,limit=4) => items.filter((item) => item.type === type).slice(0,limit);
  return { positive,negative,characters:byType(positive,'character'),tags:byType(positive,'tag'),authors:byType(positive,'author'),eras:byType(positive,'era',2),negativeTags:byType(negative,'tag'),negativeAuthors:byType(negative,'author') };
}
