'use strict';

const $ = (id) => document.getElementById(id);
const state = { versions: [], selected: '', account: null, accounts: [], gameRunning: false, preparing: false, logMode: 'game', updateDownloaded: false };
const moduleLabels = {
  keystrokes: ['Keystrokes', 'WASD ve mouse tuşlarını HUD üzerinde gösterir.'],
  cps: ['CPS', 'Sol/sağ tık saniyelik tıklama hızını gösterir.'],
  fps: ['FPS', 'Anlık kare hızını gösterir.'],
  ping: ['Ping', 'Sunucu gecikmesini gösterir.'],
  armorHud: ['Armor HUD', 'Zırh ve dayanıklılık bilgisini gösterir.'],
  potionHud: ['Potion HUD', 'Aktif efektleri ve sürelerini gösterir.'],
  toggleSprint: ['Toggle Sprint', 'Sprint tuşuna bir kez basarak sprinti kilitler.'],
  toggleSneak: ['Toggle Sneak', 'Vanilla crouch davranışını toggle moduna geçirir.'],
  backview: ['Backview', 'B basılıyken önden üçüncü şahıs görünümüne geçer.'],
  perspective: ['Perspective', 'Sol Alt basılıyken oyuncuyu döndürmeden etrafına bakar.'],
  reachDisplay: ['Reach Display', 'Hedeflediğin entity ile arandaki mesafeyi gösterir.'],
  tntTime: ['TNT Time', 'Yakındaki TNT için patlama süresini gösterir.'],
  timer: ['Timer', 'Bulunduğun dünya/sunucu oturum süresini HUD’da gösterir.'],
  timeChanger: ['Time Changer', 'Yalnız istemcide görünen gün saatini sabitler.'],
  zoom: ['Zoom', 'Basılı tutma ile görüş alanını daraltır.'],
  fullbright: ['Fullbright', 'İstemci parlaklığını artırır.'],
  lowFire: ['Low Fire', 'Birinci şahıs ateş overlayini küçültür.'],
  crosshair: ['Crosshair', 'Dih özel nişangâhını etkinleştirir.'],
  hitColor: ['Hit Color', 'Hasar alan entity render rengini özelleştirir.']
};

function toast(message, error = false) {
  const t = $('toast'); t.textContent = String(message); t.classList.toggle('error', error); t.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('hidden'), 3600);
}
function page(name) {
  document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.nav').forEach((x) => x.classList.toggle('active', x.dataset.page === name));
  $(`page-${name}`).classList.add('active');
  if (name === 'logs') loadLogs();
}
document.querySelectorAll('.nav').forEach((b) => b.addEventListener('click', () => page(b.dataset.page)));

function accountTypeLabel(type) { return type === 'offline' ? 'Offline hesap' : 'Microsoft'; }
function renderAccount() {
  const b = $('accountBtn'); const avatar = b.querySelector('.avatar'); const name = b.querySelector('b'); const sub = b.querySelector('small');
  avatar.classList.remove('has-skin'); avatar.style.backgroundImage = '';
  if (state.account) {
    avatar.textContent = state.account.name.slice(0, 1).toUpperCase();
    const skinUrl = state.account.type === 'microsoft' ? state.account.skins?.[0]?.url : '';
    if (skinUrl) { avatar.classList.add('has-skin'); avatar.style.backgroundImage = `url(${JSON.stringify(skinUrl).slice(1, -1)})`; }
    name.textContent = state.account.name; sub.textContent = accountTypeLabel(state.account.type); $('logoutBtn').classList.remove('hidden');
  } else { avatar.textContent = '?'; name.textContent = 'Giriş yapılmadı'; sub.textContent = 'Microsoft veya Offline'; $('logoutBtn').classList.add('hidden'); }
  updatePlayButton();
}
function renderAccounts() {
  const root = $('accountsList'); root.innerHTML = '';
  if (!state.accounts.length) { root.innerHTML = '<div class="empty compact">Kayıtlı hesap yok.</div>'; return; }
  for (const a of state.accounts) {
    const row = document.createElement('div'); row.className = `account-row ${a.active ? 'active' : ''}`;
    const typeText = a.type === 'offline' ? 'Offline hesap' : 'Microsoft hesabı';
    row.innerHTML = `<div><b>${escapeHtml(a.name)}</b><small>${a.active ? `Aktif • ${typeText}` : typeText}</small></div><div class="mini-actions"><button data-use class="ghost">Kullan</button><button data-remove class="danger">Sil</button></div>`;
    row.querySelector('[data-use]').addEventListener('click', async () => { try { state.account = await window.dih.selectAccount(a.id); state.accounts = await window.dih.listAccounts(); renderAccount(); renderAccounts(); toast(`${a.name} aktif hesap yapıldı.`); } catch (e) { toast(e.message || e, true); } });
    row.querySelector('[data-remove]').addEventListener('click', async () => { try { state.accounts = await window.dih.removeAccount(a.id); state.account = await window.dih.getAccount(); renderAccount(); renderAccounts(); } catch (e) { toast(e.message || e, true); } });
    root.appendChild(row);
  }
}
function escapeHtml(v) { return String(v).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function signedArgbToHex(value) { const u = Number(value) >>> 0; return `#${(u & 0xFFFFFF).toString(16).padStart(6, '0')}`; }
function hexToSignedArgb(value) { return ((0xFF000000 | (parseInt(String(value).replace('#', ''), 16) & 0xFFFFFF)) | 0); }

function updatePlayButton() {
  $('playBtn').disabled = state.gameRunning || state.preparing || !state.account || !state.selected;
  $('playBtn').textContent = state.gameRunning ? 'ÇALIŞIYOR' : (state.preparing ? 'HAZIRLANIYOR' : 'OYNA');
  $('cancelPrepareBtn').classList.toggle('hidden', !state.preparing);
  $('stopBtn').classList.toggle('hidden', !state.gameRunning);
}
function renderVersions() {
  const select = $('versionSelect'); const list = $('versionsList');
  select.innerHTML = ''; list.innerHTML = '';
  if (!state.versions.length) {
    select.disabled = true; select.innerHTML = '<option>Sürüm yok</option>'; list.innerHTML = '<div class="empty">GitHub sürümler klasöründe profil bulunamadı.</div>';
    state.selected = ''; $('selectedTitle').textContent = 'Henüz sürüm yok'; $('changelogCard').classList.add('hidden'); updatePlayButton(); return;
  }
  if (!state.versions.some((x) => x.id === state.selected)) state.selected = state.versions[0].id;
  for (const v of state.versions) {
    const o = document.createElement('option'); o.value = v.id; o.textContent = v.title || v.id; o.selected = v.id === state.selected; select.appendChild(o);
    const row = document.createElement('article'); row.className = 'version-row';
    row.innerHTML = `<div><span class="pill">FABRIC</span><b>${escapeHtml(v.title || v.id)}</b><small>${escapeHtml(v.description || '')}${v.recommendedRamMb ? ` • ${v.recommendedRamMb} MB RAM önerilir` : ''}</small></div><div class="version-actions"><button data-open class="ghost">Klasör</button><button data-repair class="ghost">Repair</button><button data-reset class="danger">Sıfırla</button></div>`;
    row.addEventListener('click', (e) => { if (e.target.closest('button')) return; selectVersion(v.id); page('home'); });
    row.querySelector('[data-open]').addEventListener('click', () => window.dih.openInstanceFolder(v.id));
    row.querySelector('[data-repair]').addEventListener('click', () => repair(v.id));
    row.querySelector('[data-reset]').addEventListener('click', async () => { const ok = await window.dih.confirm({ danger: true, title: 'Instance sıfırlama', message: `${v.id} instance klasörü tamamen silinecek. Kişisel modlar/configler de silinir.` }); if (ok) { await window.dih.resetInstance(v.id); toast('Instance sıfırlandı.'); } });
    list.appendChild(row);
  }
  select.disabled = false; selectVersion(state.selected, false); updatePlayButton();
}
async function selectVersion(id, save = true) {
  state.selected = id;
  const v = state.versions.find((x) => x.id === id);
  $('selectedTitle').textContent = v?.title || `Minecraft ${id}`;
  $('selectedDesc').textContent = v?.description || `Fabric otomatik kurulur; sürümler/${id} içeriği senkronize edilir.`;
  $('versionSelect').value = id;
  const changes = Array.isArray(v?.changelog) ? v.changelog : [];
  $('changelogCard').classList.toggle('hidden', !changes.length);
  $('changelogTitle').textContent = v?.publishedAt ? `${v.title || id} • ${v.publishedAt}` : (v?.title || id);
  $('changelogList').innerHTML = '';
  for (const change of changes) { const item = document.createElement('div'); item.className = 'change-item'; item.textContent = change; $('changelogList').appendChild(item); }
  if (save) await window.dih.saveConfig({ selectedVersion: id });
  updatePlayButton();
}
async function refreshVersions(silent = false) {
  try { state.versions = await window.dih.listVersions(); renderVersions(); if (!silent) toast(`${state.versions.length} sürüm bulundu.`); }
  catch (e) { state.versions = []; renderVersions(); if (!silent) toast(e.message || e, true); }
}

async function loadSettings() {
  const c = await window.dih.getConfig();
  $('ghOwner').value = c.github.owner || ''; $('ghRepo').value = c.github.repo || ''; $('ghBranch').value = c.github.branch || 'main'; $('ghRoot').value = c.github.versionsRoot || 'sürümler';
  $('minRam').value = c.minMemoryMb; $('maxRam').value = c.maxMemoryMb; $('gameWidth').value = c.width; $('gameHeight').value = c.height; $('fullscreen').checked = !!c.fullscreen;
  $('javaPath').value = c.javaPath || ''; $('autoJava').checked = c.autoJava !== false; $('hideWhilePlaying').checked = c.keepLauncherHiddenWhilePlaying !== false;
  $('discordRpc').checked = !!c.discordRpc; $('discordAppId').value = c.discordAppId || ''; $('autoCheckUpdates').checked = c.autoCheckUpdates !== false;
  $('upOwner').value = c.updates?.owner || ''; $('upRepo').value = c.updates?.repo || ''; $('msClientId').value = c.microsoftClientId || '';
  $('javaArgs').value = (c.javaArgs || []).join(' '); $('gameArgs').value = (c.gameArgs || []).join(' '); state.selected = c.selectedVersion || '';
}
function splitArgs(value) { return String(value || '').match(/(?:[^\s"]+|"[^"]*")+/g)?.map((x) => x.replace(/^"|"$/g, '')) || []; }

async function loadClient() {
  const c = await window.dih.getClientConfig();
  $('clientEnabled').checked = c.enabled !== false; $('clientScale').value = c.scale || 1;
  $('zoomFactor').value = c.zoomFactor || 4; $('lowFireOffset').value = c.lowFireOffset ?? 0.45; $('hitColor').value = signedArgbToHex(c.hitColor ?? -43691); $('timeOfDay').value = String(c.timeOfDay ?? 6000);
  const grid = $('modulesGrid'); grid.innerHTML = '';
  for (const [key, [title, desc]] of Object.entries(moduleLabels)) {
    const card = document.createElement('article'); card.className = 'card module-card';
    card.innerHTML = `<div><b>${title}</b><p>${desc}</p></div><input type="checkbox" data-module="${key}" ${c.modules?.[key] ? 'checked' : ''}>`;
    grid.appendChild(card);
  }
}

async function repair(version) {
  try { $('progressPanel').classList.remove('hidden'); await window.dih.repair(version); toast(`${version} repair tamamlandı.`); }
  catch (e) { toast(e.message || e, true); }
}
async function loadLogs() {
  const lines = state.logMode === 'game' ? await window.dih.getGameLogs(500) : await window.dih.getLauncherLogs(500);
  $('logView').textContent = lines.length ? lines.join('\n') : 'Henüz log yok.'; $('logView').scrollTop = $('logView').scrollHeight;
}
async function checkUpdate(showNoUpdate = true) {
  try {
    const u = await window.dih.checkUpdate();
    if (u.available) { $('updateBox').classList.remove('hidden'); $('updateTitle').textContent = `Dih ${u.version} hazır`; $('updateText').textContent = u.name || 'Yeni sürüm'; state.updateDownloaded = false; $('updateBtn').textContent = 'İndir'; }
    else if (showNoUpdate) toast('Dih güncel.');
  } catch (e) { toast(e.message || e, true); }
}

$('saveSettingsBtn').addEventListener('click', async () => {
  try {
    await window.dih.saveConfig({
      github: { owner: $('ghOwner').value.trim(), repo: $('ghRepo').value.trim(), branch: $('ghBranch').value.trim() || 'main', versionsRoot: $('ghRoot').value.trim() || 'sürümler' },
      updates: { enabled: true, owner: $('upOwner').value.trim(), repo: $('upRepo').value.trim() }, microsoftClientId: $('msClientId').value.trim(),
      minMemoryMb: Number($('minRam').value), maxMemoryMb: Number($('maxRam').value), width: Number($('gameWidth').value), height: Number($('gameHeight').value), fullscreen: $('fullscreen').checked,
      javaPath: $('javaPath').value.trim(), autoJava: $('autoJava').checked, keepLauncherHiddenWhilePlaying: $('hideWhilePlaying').checked,
      discordRpc: $('discordRpc').checked, discordAppId: $('discordAppId').value.trim(), autoCheckUpdates: $('autoCheckUpdates').checked,
      javaArgs: splitArgs($('javaArgs').value), gameArgs: splitArgs($('gameArgs').value)
    });
    toast('Ayarlar kaydedildi.'); await refreshVersions(true);
  } catch (e) { toast(e.message || e, true); }
});
$('saveClientBtn').addEventListener('click', async () => {
  const modules = {}; document.querySelectorAll('[data-module]').forEach((el) => { modules[el.dataset.module] = el.checked; });
  await window.dih.saveClientConfig({
    enabled: $('clientEnabled').checked, scale: Number($('clientScale').value) || 1,
    zoomFactor: Number($('zoomFactor').value) || 4, lowFireOffset: Number($('lowFireOffset').value) || 0.45,
    hitColor: hexToSignedArgb($('hitColor').value), timeOfDay: Number($('timeOfDay').value) || 6000, modules
  });
  toast('Dih Client ayarları kaydedildi.');
});
$('versionSelect').addEventListener('change', (e) => selectVersion(e.target.value));
$('refreshBtn').addEventListener('click', () => refreshVersions());
$('dataFolderBtn').addEventListener('click', () => window.dih.openDataFolder());
$('accountBtn').addEventListener('click', async () => { state.accounts = await window.dih.listAccounts(); renderAccounts(); $('authModal').classList.remove('hidden'); setTimeout(() => $('offlineName').focus(), 50); });
$('modalClose').addEventListener('click', () => $('authModal').classList.add('hidden'));
$('loginBtn').addEventListener('click', async () => { try { $('loginBtn').disabled = true; state.account = await window.dih.loginMicrosoft(); state.accounts = await window.dih.listAccounts(); renderAccount(); renderAccounts(); $('deviceCodeBox').classList.add('hidden'); toast('Microsoft hesabı eklendi.'); } catch (e) { toast(e.message || e, true); } finally { $('loginBtn').disabled = false; } });
async function loginOffline() {
  try {
    const username = $('offlineName').value.trim();
    $('offlineLoginBtn').disabled = true;
    state.account = await window.dih.loginOffline(username);
    state.accounts = await window.dih.listAccounts();
    renderAccount(); renderAccounts();
    $('authModal').classList.add('hidden');
    toast(`${state.account.name} ile offline hesap aktif.`);
  } catch (e) { toast(e.message || e, true); }
  finally { $('offlineLoginBtn').disabled = false; }
}
$('offlineLoginBtn').addEventListener('click', loginOffline);
$('offlineName').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginOffline(); });
$('logoutBtn').addEventListener('click', async () => { await window.dih.logout(); state.account = null; state.accounts = await window.dih.listAccounts(); renderAccount(); renderAccounts(); });
$('playBtn').addEventListener('click', async () => { if (!state.selected) return; try { $('crashBox').classList.add('hidden'); $('progressPanel').classList.remove('hidden'); $('playBtn').disabled = true; await window.dih.launch(state.selected); } catch (e) { toast(e.message || e, true); updatePlayButton(); } });
$('stopBtn').addEventListener('click', () => window.dih.killGame());
$('cancelPrepareBtn').addEventListener('click', async () => { try { if (await window.dih.cancelPrepare()) toast('Hazırlama iptal ediliyor.'); } catch (e) { toast(e.message || e, true); } });
$('showGameLogs').addEventListener('click', () => { state.logMode = 'game'; loadLogs(); });
$('showLauncherLogs').addEventListener('click', () => { state.logMode = 'launcher'; loadLogs(); });
$('reloadLogs').addEventListener('click', loadLogs);
$('checkUpdateBtn').addEventListener('click', () => checkUpdate(true));
$('updateBtn').addEventListener('click', async () => { try { if (!state.updateDownloaded) { $('updateBtn').disabled = true; await window.dih.downloadUpdate(); state.updateDownloaded = true; $('updateBtn').disabled = false; $('updateBtn').textContent = 'Kur ve yeniden başlat'; } else await window.dih.installUpdate(); } catch (e) { $('updateBtn').disabled = false; toast(e.message || e, true); } });

window.dih.on('launch-progress', (p) => { $('progressPanel').classList.remove('hidden'); const pct = Math.max(0, Math.min(100, Math.round((Number(p.progress) || 0) * 100))); $('progressText').textContent = p.message || p.phase || 'Hazırlanıyor'; $('progressPct').textContent = `${pct}%`; $('progressBar').style.width = `${pct}%`; });
window.dih.on('game-state', (s) => { state.gameRunning = !!s.running; state.preparing = !!s.preparing; updatePlayButton(); if (!s.running && s.crashed) { $('crashReason').textContent = s.reason || s.error || 'Bilinmeyen hata'; $('crashBox').classList.remove('hidden'); } if (!s.running) loadLogs(); });
window.dih.on('game-log', () => { if ($('page-logs').classList.contains('active') && state.logMode === 'game') loadLogs(); });
window.dih.on('auth-device-code', (d) => { $('deviceCodeBox').classList.remove('hidden'); $('deviceCode').textContent = d.userCode; $('authText').textContent = 'Tarayıcı açıldı. Bu kodu Microsoft sayfasına gir.'; });
window.dih.on('auth-changed', async (a) => { state.account = a; state.accounts = await window.dih.listAccounts(); renderAccount(); renderAccounts(); });
window.dih.on('update-available', (u) => { $('updateBox').classList.remove('hidden'); $('updateTitle').textContent = `Dih ${u.version} hazır`; $('updateText').textContent = u.name || 'Yeni sürüm'; });
window.dih.on('update-progress', (u) => { const pct = Math.round((u.progress || 0) * 100); $('updateBtn').textContent = `İndiriliyor %${pct}`; });

(async function init() {
  await loadSettings(); await loadClient();
  state.account = await window.dih.getAccount(); state.accounts = await window.dih.listAccounts(); renderAccount();
  const gs = await window.dih.getGameState(); state.gameRunning = !!gs.running; state.preparing = !!gs.preparing; updatePlayButton();
  $('appVersion').textContent = `Dih ${await window.dih.appVersion()}`;
  await refreshVersions(true);
})();