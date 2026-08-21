'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { analyzeCrash } = require('./crash-analyzer');
const { compareVersions } = require('../shared/version');

const SAFE_VERSION = /^[0-9A-Za-z._+\-]{1,80}$/;
function validateVersion(value) { const v = String(value || ''); if (!SAFE_VERSION.test(v)) throw new Error('Geçersiz Minecraft sürüm kimliği.'); return v; }
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function formatBytes(value) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${Math.round(n)} B`;
}

class MinecraftService {
  constructor(app, configStore, githubService, javaManager, authService, clientConfig, rpc, logger, notify) {
    this.app = app; this.configStore = configStore; this.githubService = githubService; this.javaManager = javaManager; this.authService = authService; this.clientConfig = clientConfig; this.rpc = rpc; this.logger = logger; this.notify = notify;
    this.root = path.join(app.getPath('userData'), 'minecraft'); this.resources = path.join(this.root, 'resources'); this.instances = path.join(this.root, 'instances');
    this.running = null; this.runningVersion = ''; this.preparing = false; this.prepareAbort = null; this.activeInstallController = null;
  }
  instanceDir(version) { return path.join(this.instances, validateVersion(version)); }
  progress(payload) { this.notify('launch-progress', payload); }
  state() { return { running: !!this.running, preparing: this.preparing, pid: this.running?.pid || null, version: this.runningVersion || '' }; }
  cancelPrepare() {
    let cancelled = false;
    if (this.prepareAbort) { this.prepareAbort.abort(); cancelled = true; }
    if (this.activeInstallController && !this.activeInstallController.signal.aborted) { this.activeInstallController.abort(); cancelled = true; }
    return cancelled;
  }

  trackerObject(event) {
    const payload = event?.payload || {};
    const tracker = payload.download || payload.progress;
    return tracker && typeof tracker === 'object' ? tracker : null;
  }

  trackerStage(event, fallbackPhase) {
    const p = String(event?.phase || '').toLowerCase();
    if (p === 'version.json') return { start: 0.18, end: 0.21, phase: 'minecraft', label: 'Minecraft sürüm bilgisi indiriliyor' };
    if (p === 'version.jar') return { start: 0.21, end: 0.30, phase: 'minecraft', label: 'Minecraft istemcisi indiriliyor' };
    if (p.includes('libraries')) return fallbackPhase === 'fabric'
      ? { start: 0.68, end: 0.80, phase: 'fabric', label: 'Fabric kütüphaneleri indiriliyor' }
      : { start: 0.30, end: 0.43, phase: 'minecraft', label: 'Minecraft kütüphaneleri indiriliyor' };
    if (p.includes('assets.assets')) return { start: 0.46, end: 0.59, phase: 'minecraft', label: 'Minecraft varlıkları indiriliyor' };
    if (p.includes('assets')) return { start: 0.43, end: 0.46, phase: 'minecraft', label: 'Minecraft varlık indeksi hazırlanıyor' };
    if (p.includes('profile')) return { start: 0.59, end: 0.61, phase: fallbackPhase, label: 'Minecraft profili hazırlanıyor' };
    return fallbackPhase === 'fabric'
      ? { start: 0.68, end: 0.84, phase: 'fabric', label: 'Fabric bağımlılıkları hazırlanıyor' }
      : { start: 0.18, end: 0.61, phase: 'minecraft', label: 'Minecraft dosyaları hazırlanıyor' };
  }

  emitTrackedProgress(state, fallbackPhase) {
    const stage = this.trackerStage(state.event, fallbackPhase);
    const t = state.tracker;
    const done = Number(t?.progress);
    const total = Number(t?.total);
    const speed = Number(t?.speed);
    const ratio = Number.isFinite(done) && Number.isFinite(total) && total > 0 ? clamp01(done / total) : 0;
    let message = stage.label;
    if (Number.isFinite(done) && Number.isFinite(total) && total > 0) {
      message += ` • ${formatBytes(done)} / ${formatBytes(total)}`;
      if (Number.isFinite(speed) && speed > 0) message += ` • ${formatBytes(speed)}/s`;
    }
    this.progress({ phase: stage.phase, progress: stage.start + (stage.end - stage.start) * ratio, message });
  }

  async trackedInstall(operation, fallbackPhase, signal, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal?.aborted) throw Object.assign(new Error('Hazırlama işlemi iptal edildi.'), { name: 'AbortError' });
      const controller = new AbortController();
      this.activeInstallController = controller;
      const abortFromParent = () => controller.abort();
      signal?.addEventListener('abort', abortFromParent, { once: true });
      const state = { event: null, tracker: null, lastBytes: -1, lastAdvance: Date.now(), stalled: false };
      const tracker = (event) => {
        state.event = event;
        const t = this.trackerObject(event);
        if (t) state.tracker = t;
        this.emitTrackedProgress(state, fallbackPhase);
        const bytes = Number(state.tracker?.progress);
        if (Number.isFinite(bytes) && bytes > state.lastBytes) { state.lastBytes = bytes; state.lastAdvance = Date.now(); }
      };
      const poll = setInterval(() => {
        if (!state.tracker) return;
        this.emitTrackedProgress(state, fallbackPhase);
        const bytes = Number(state.tracker.progress);
        const total = Number(state.tracker.total);
        if (Number.isFinite(bytes) && bytes > state.lastBytes) { state.lastBytes = bytes; state.lastAdvance = Date.now(); }
        const downloading = Number.isFinite(total) && total > 0 && Number.isFinite(bytes) && bytes < total;
        if (downloading && Date.now() - state.lastAdvance >= 60000 && !state.stalled) {
          state.stalled = true;
          this.logger.warn('XMCL indirmesi 60 saniye ilerlemedi; yeniden denenecek', state.event?.phase || fallbackPhase);
          controller.abort();
        }
      }, 400);
      try {
        const result = await operation({ tracker, signal: controller.signal });
        return result;
      } catch (e) {
        lastError = e;
        if (signal?.aborted) throw Object.assign(new Error('Hazırlama işlemi iptal edildi.'), { name: 'AbortError' });
        if (attempt >= maxAttempts || !state.stalled) throw e;
        this.progress({ phase: fallbackPhase, progress: fallbackPhase === 'fabric' ? 0.68 : 0.30, message: `İndirme durdu, yeniden deneniyor (${attempt + 1}/${maxAttempts})` });
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
      } finally {
        clearInterval(poll);
        signal?.removeEventListener('abort', abortFromParent);
        if (this.activeInstallController === controller) this.activeInstallController = null;
      }
    }
    throw lastError || new Error('Minecraft kurulumu tamamlanamadı.');
  }

  async ensureMinecraftAndFabric(mcVersion, signal) {
    const installer = await import('@xmcl/installer');
    const core = await import('@xmcl/core');
    await fsp.mkdir(this.resources, { recursive: true });
    const location = core.MinecraftFolder.from(this.resources);

    this.progress({ phase: 'minecraft', progress: 0.05, message: `Minecraft ${mcVersion} doğrulanıyor` });
    const list = await installer.getVersionList();
    const meta = list.versions.find((v) => v.id === mcVersion);
    if (!meta) throw new Error(`Mojang sürüm listesinde ${mcVersion} bulunamadı.`);

    this.progress({ phase: 'minecraft', progress: 0.18, message: `Minecraft ${mcVersion} hazırlanıyor` });
    const vanillaResolved = await this.trackedInstall(
      (options) => installer.installMinecraft(meta, location, { side: 'client', ...options }),
      'minecraft', signal
    );
    await this.trackedInstall(
      (options) => installer.completeInstallation(vanillaResolved, options),
      'minecraft', signal
    );
    this.progress({ phase: 'minecraft', progress: 0.61, message: 'Minecraft dosyaları hazır' });

    const loaders = await installer.getLoaderArtifactListFor(mcVersion);
    const loaderArtifact = loaders.find((x) => x?.loader?.stable) || loaders[0];
    const loaderVersion = loaderArtifact?.loader?.version || loaderArtifact?.version;
    if (!loaderArtifact || !loaderVersion) throw new Error(`Fabric Loader bulunamadı: ${mcVersion}`);

    this.progress({ phase: 'fabric', progress: 0.63, message: `Fabric Loader ${loaderVersion} kuruluyor` });
    const fabricId = await installer.installFabricByLoaderArtifact(loaderArtifact, location, { inheritsFrom: mcVersion });
    if (!fabricId || typeof fabricId !== 'string') throw new Error('Fabric profil kimliği oluşturulamadı.');

    const fabricResolved = await core.Version.parse(location, fabricId);
    await this.trackedInstall(
      (options) => installer.completeInstallation(fabricResolved, options),
      'fabric', signal
    );
    this.progress({ phase: 'fabric', progress: 0.84, message: 'Fabric hazır' });
    return { fabricId, fabricVersion: loaderVersion };
  }

  async prepare(version, force = false) {
    version = validateVersion(version); if (this.running) throw new Error('Minecraft zaten çalışıyor.'); if (this.preparing) throw new Error('Başka bir hazırlama işlemi zaten devam ediyor.');
    this.preparing = true; this.runningVersion = version; this.prepareAbort = new AbortController(); this.notify('game-state', this.state());
    try {
      const instance = this.instanceDir(version); await fsp.mkdir(instance, { recursive: true });
      this.progress({ phase: 'github', progress: 0.01, message: 'Dih profili hazırlanıyor' });
      const manifest = await this.githubService.syncVersionFiles(version, instance, (p) => this.progress(p), force, this.prepareAbort.signal);
      const meta = manifest.meta || {};
      if (meta.minLauncherVersion && compareVersions(this.app.getVersion(), meta.minLauncherVersion) < 0) throw new Error(`Bu profil Dih ${meta.minLauncherVersion}+ gerektiriyor.`);
      if (meta.requireDihClient === true && !manifest.mods.some((m) => /(^|\/)dih-client[^/]*\.jar$/i.test(m.path || m.name || ''))) throw new Error('Bu profil Dih Client gerektiriyor ancak mods klasöründe dih-client JAR bulunamadı.');
      await this.clientConfig.writeForInstance(instance, version);
      const javaPath = await this.javaManager.resolve(version, (p) => this.progress(p), this.prepareAbort.signal);
      const fabric = await this.ensureMinecraftAndFabric(version, this.prepareAbort.signal);
      await fsp.mkdir(path.join(instance, '.dih'), { recursive: true });
      const record = { schema: 3, version, minecraftVersion: version, loader: 'fabric', loaderVersion: fabric.fabricVersion, fabricId: fabric.fabricId, javaPath, updatedAt: new Date().toISOString(), managed: Object.fromEntries(['mods','config','resourcepacks','shaderpacks'].map((key) => [key, manifest[key].map((m) => m.path || m.name)])), meta };
      await fsp.writeFile(path.join(instance, '.dih', 'instance.json'), JSON.stringify(record, null, 2));
      return { instance, javaPath, manifest, ...fabric };
    } catch (e) {
      if (e?.name === 'AbortError' || this.prepareAbort?.signal.aborted) throw new Error('Hazırlama işlemi iptal edildi.');
      throw e;
    } finally { this.preparing = false; this.prepareAbort = null; this.activeInstallController = null; if (!this.running) this.runningVersion = ''; this.notify('game-state', this.state()); }
  }

  async launch(version) {
    version = validateVersion(version); if (this.running || this.preparing) throw new Error('Oyun veya hazırlama işlemi zaten devam ediyor.');
    const cfg = this.configStore.get(); const session = await this.authService.ensureSession(); const prepared = await this.prepare(version, false); const { launch } = await import('@xmcl/core'); const meta = prepared.manifest.meta || {};
    const maxMemory = Math.max(Number(cfg.maxMemoryMb) || 4096, Number(meta.recommendedRamMb) || 0);
    const offline = session.type === 'offline';
    this.logger.resetGameLog(); this.progress({ phase: 'launch', progress: 0.94, message: offline ? `Minecraft offline olarak başlatılıyor (${session.name})` : 'Minecraft başlatılıyor' });
    const child = await launch({
      gamePath: prepared.instance,
      resourcePath: this.resources,
      version: prepared.fabricId,
      javaPath: prepared.javaPath,
      gameProfile: { name: session.name, id: session.id },
      accessToken: offline ? '0' : session.accessToken,
      userType: offline ? 'legacy' : 'msa',
      launcherName: 'Dih',
      launcherBrand: this.app.getVersion(),
      minMemory: Number(cfg.minMemoryMb) || 1024,
      maxMemory,
      resolution: cfg.fullscreen ? { fullscreen: true } : { width: Number(cfg.width) || 1280, height: Number(cfg.height) || 720 },
      extraJVMArgs: [...(Array.isArray(cfg.javaArgs) ? cfg.javaArgs : []), ...(Array.isArray(meta.javaArgs) ? meta.javaArgs : [])],
      extraMCArgs: [...(Array.isArray(cfg.gameArgs) ? cfg.gameArgs : []), ...(Array.isArray(meta.gameArgs) ? meta.gameArgs : [])]
    });
    this.running = child; this.runningVersion = version; this.notify('game-state', this.state()); this.progress({ phase: 'launch', progress: 1, message: `Minecraft çalışıyor • ${offline ? 'Offline' : 'Microsoft'} • ${session.name}` }); await this.rpc.start(version);
    child.stdout?.on('data', (b) => { this.logger.game('OUT', b.toString()); this.notify('game-log', b.toString()); }); child.stderr?.on('data', (b) => { this.logger.game('ERR', b.toString()); this.notify('game-log', b.toString()); });
    child.once('exit', async (code, signal) => { this.logger.info('Minecraft kapandı', `code=${code} signal=${signal || ''}`); await this.rpc.stop(); const crash = analyzeCrash(this.logger.recentGameLines(600), code); this.running = null; this.runningVersion = ''; this.notify('game-state', { ...this.state(), code, signal, ...crash }); });
    child.once('error', async (e) => { this.logger.error('Minecraft process hatası', e); await this.rpc.stop(); this.running = null; this.runningVersion = ''; this.notify('game-state', { ...this.state(), error: e.message, crashed: true, reason: e.message }); });
    return { pid: child.pid, version, accountType: session.type, username: session.name };
  }

  async repair(version) { if (this.running || this.preparing) throw new Error('Oyun/hazırlama çalışırken repair yapılamaz.'); const instance = this.instanceDir(version); this.progress({ phase: 'repair', progress: 0.01, message: 'Yönetilen dosyalar temizleniyor' }); await this.githubService.removeManagedFiles(instance); await this.prepare(version, true); this.progress({ phase: 'repair', progress: 1, message: 'Repair tamamlandı' }); return true; }
  async resetInstance(version) { if (this.running || this.preparing) throw new Error('Oyun/hazırlama çalışırken instance sıfırlanamaz.'); await fsp.rm(this.instanceDir(version), { recursive: true, force: true }); return true; }
  async kill() { if (!this.running) return false; if (process.platform === 'win32') { const { spawn } = require('child_process'); spawn('taskkill', ['/PID', String(this.running.pid), '/T', '/F'], { windowsHide: true }); } else this.running.kill('SIGTERM'); return true; }
}
module.exports = { MinecraftService, validateVersion };
