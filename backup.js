import { APP_VERSION, activityCount, appState, defaultUser, downloadBlob, normalizeUser, nowIso, saveUser, uid } from './core.js';

function payload() { return { app:'ddf-tracker',version:APP_VERSION,exportedAt:nowIso(),data:appState.user }; }
export async function exportBackup({forceDownload=false} = {}) {
  const body = JSON.stringify(payload(),null,2); const filename = `ddf-tracker-backup-${new Date().toISOString().slice(0,10)}.json`; const blob = new Blob([body],{type:'application/json'}); const file = typeof File === 'function' ? new File([blob],filename,{type:'application/json'}) : blob; let shared = false;
  if (!forceDownload && navigator.share && navigator.canShare?.({files:[file]})) {
    try { await navigator.share({title:'Die drei ??? Tracker Backup',files:[file]}); shared = true; } catch (error) { if (error?.name !== 'AbortError') console.warn(error); }
  }
  if (!shared) downloadBlob(blob,filename);
  appState.user.settings.lastBackupAt = nowIso(); appState.user.settings.lastBackupActivityCount = activityCount(); appState.user.settings.backupReminderDismissedAt = null; await saveUser(true); return filename;
}
export function parseBackupText(text) { let raw; try { raw = JSON.parse(text); } catch { throw new Error('Die Datei enthält kein gültiges JSON.'); } const candidate = raw?.data && typeof raw.data === 'object' ? raw.data : raw; return { raw, user:normalizeUser(candidate), exportedAt:raw.exportedAt || raw.createdAt || null, version:raw.version || candidate.version || 'unbekannt' }; }
function episodeConflict(a,b) { return Boolean(a && b && JSON.stringify(a) !== JSON.stringify(b)); }
export function backupPreview(candidate) {
  const incoming = candidate.user; const current = appState.user; let conflicts = 0;
  for (const [nr,status] of Object.entries(incoming.episodes)) if (episodeConflict(current.episodes[nr],status)) conflicts += 1;
  const meaningful = Object.values(incoming.episodes).filter((status) => status.heard || status.rating || status.note).length;
  return { exportedAt:candidate.exportedAt,version:candidate.version,episodeStates:meaningful,playlists:incoming.playlists.length,pinned:incoming.pinned.length,history:incoming.history.length,conflicts };
}
function newer(a,b) { const ta = new Date(a?.updatedAt || a?.heardAt || 0).getTime(); const tb = new Date(b?.updatedAt || b?.heardAt || 0).getTime(); return tb >= ta ? b : a; }
function mergeUsers(current,incoming) {
  const merged = normalizeUser(current); for (const [nr,status] of Object.entries(incoming.episodes)) merged.episodes[nr] = merged.episodes[nr] ? newer(merged.episodes[nr],status) : status;
  const playlists = new Map(merged.playlists.map((item) => [item.id,item])); for (const item of incoming.playlists) { const existing = playlists.get(item.id); playlists.set(item.id,existing ? newer(existing,item) : item); } merged.playlists = [...playlists.values()];
  merged.pinned = [...new Set([...merged.pinned,...incoming.pinned])];
  const queue = [...new Set([...merged.settings.queue,...incoming.settings.queue])];
  const hiddenRecommendations = [...new Set([...merged.settings.hiddenRecommendations,...incoming.settings.hiddenRecommendations])];
  const snoozedRecommendations = { ...merged.settings.snoozedRecommendations,...incoming.settings.snoozedRecommendations };
  const featureFeedback = { ...merged.settings.featureFeedback };
  for (const [key,value] of Object.entries(incoming.settings.featureFeedback || {})) featureFeedback[key] = Number(value) || featureFeedback[key] || 0;
  const history = new Map(); for (const item of [...merged.history,...incoming.history]) history.set(`${item.nr}|${item.at}`,{...item,id:item.id || uid('listen')}); merged.history = [...history.values()].sort((a,b) => new Date(b.at)-new Date(a.at));
  merged.settings = { ...merged.settings,...incoming.settings,queue,hiddenRecommendations,snoozedRecommendations,featureFeedback,filters:{...merged.settings.filters,...incoming.settings.filters} }; merged.updatedAt = nowIso(); return normalizeUser(merged);
}
export async function applyImport(candidate,mode='merge') { appState.user = mode === 'replace' ? normalizeUser(candidate.user) : mergeUsers(appState.user,candidate.user); appState.user.settings.lastBackupAt = nowIso(); appState.user.settings.lastBackupActivityCount = activityCount(); await saveUser(true); return appState.user; }
export function emptyPersonalData() { return defaultUser(); }
