'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { analyzeCrash } = require('./crash-analyzer');
const { compareVersions } = require('../shared/version');

const SAFE_VERSION = /^[0-9A-Za-z._+\-]{1,80}$/;
function validateVersion(value) { const v = String(value || ''); if (!SAFE_VERSION.test(v)) throw new Error('Geçersiz Minecraft sürüm kimliği.'); return v; }

class MinecraftService {
  constructor(app, configStore, githubService, javaManager, authService, clientConfig, rpc, logger, notify) {
    this.app = app; this.configStore = configStore; this.githubService = githubService; this.javaManager = javaManager; this.authService = authService; this.clientConfig = clientConfig; this.rpc = rpc; this.logger = logger; this.notify = notify;
    this.root = path.join(app.getPath('userData'), 'minecraft'); this.resources = path.join(this.root, 'resources'); this.instances = path.join(this.root, 'instances');
    this.running = null; this.runningVersion = ''; this.preparing = false; this.prepareAbort = null; this.activeInstallTask = null;
  }
  instanceDir(version) { return path.join(this.instances, validateVersion(version)); }
  progress(payload) { this.notify('launch-progress', payload); }
  state() { return { running: !!this.running, preparing: this.preparing, pid: this.running?.pid || null, version: this.runningVersion || '' }; }
  cancelPrepare() {
    let cancelled = false;
    if (this.prepareAbort) { this.prepareAbort.abort(); cancelled = true; }
    if (this.activeInstallTask?.cancel) {
      cancelled = true;
      this.activeInstallTask.cancel(5000).catch((e) => this.logger.warn('XMCL kurulum görevi iptal edilemedi', e?.message || e));
    }
    return cancelled;
  }

  xmclTaskMessage(task, fallback) {
    const p = String(task?.path || task?.name || '').toLowerCase();
    if (p.includes('asset')) return 'Minecraft varlıkları indiriliyor';
    if (p.includes('librar')) return 'Minecraft kütüphaneleri indiriliyor';
    if (p.includes('jar')) return 'Minecraft istemcisi indiriliyor';
    if (p.includes('json') || p.includes('version')) return 'Minecraft sürüm bilgisi hazırlanıyor';
    if (p.includes('depend')) return 'Minecraft bağımlılıkları doğrulanıyor';
    return fallback;
  }

  xmclFallbackProgress(task, start, end) {
    const p = String(task?.path || task?.name || '').toLowerCase();
    if (p.includes('json') || p.includes('version')) return start + (end - start) * 0.10;
    if (p.includes('jar')) return start + (end - start) * 0.28;
    if (p.includes('librar')) return start + (end - start) * 0.58;
    if (p.includes('asset')) return start + (end - start) * 0.78;
    if (p.includes('depend')) return start + (end - start) * 0.46;
    return start;
  }

  async runXmclTask(task, start, end, phase, fallback, signal) {
    if (!task || typeof task.startAndWait !== 'function') throw new Error('XMCL kurulum görevi oluşturulamadı.');
    this.activeInstallTask = task;
    let lastEmit = 0;
    const emit = (currentTask, force = false) => {
      const now = Date.now();
      if (!force && now - lastEmit < 100) return;
      lastEmit = now;
      const total = Number(task.total);
      const done = Number(task.progress);
      const ratio = Number.isFinite(total) && total > 0 && Number.isFinite(done) ? Math.max(0, Math.min(1, done / total)) : null;
      const value = ratio === null ? this.xmclFallbackProgress(currentTask, start, end) : start + (end - start) * ratio;
      this.progress({ phase, progress: Math.max(start, Math.min(end, value)), message: this.xmclTaskMessage(currentTask, fallback) });
    };
    const context = {
      onStart: (currentTask) => { this.logger.info('XMCL görev başladı', currentTask?.path || currentTask?.name || 'task'); emit(currentTask, true); },
      onUpdate: (currentTask) => emit(currentTask),
      onFailed: (currentTask, error) => this.logger.error(`XMCL görev başarısız: ${currentTask?.path || currentTask?.name || 'task'}`, error),
      onSucceed: (currentTask) => emit(currentTask, true),
      onCancelled: (currentTask) => this.logger.warn('XMCL görev iptal edildi', currentTask?.path || currentTask?.name || 'task')
    };
    const abort = () => task.cancel?.(5000).catch(() => {});
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const result = await task.startAndWait(context);
      this.progress({ phase, progress: end, message: fallback });
      return result;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (this.activeInstallTask === task) this.activeInstallTask = null;
    }
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

    this.progress({ phase: 'minecraft', progress: 0.18, message: `Minecraft ${mcVersion} kuruluyor` });
    // @xmcl/installer 5+ API: installTask(versionMeta, minecraft, { side: 'client' }).
    // Eski install('client', meta, location) imzası 6.1.2 ile uyumlu değildir ve kurulumun %18'de kalmasına yol açar.
    const vanillaTask = installer.installTask(meta, location, { side: 'client' });
    await this.runXmclTask(vanillaTask, 0.18, 0.50, 'minecraft', 'Minecraft dosyaları hazır', signal);

    const loaders = await installer.getLoaderArtifactListFor(mcVersion);
    const loaderArtifact = loaders.find((x) => x?.loader?.stable) || loaders[0];
    const loaderVersion = loaderArtifact?.loader?.version || loaderArtifact?.version;
    if (!loaderArtifact || !loaderVersion) throw new Error(`Fabric Loader bulunamadı: ${mcVersion}`);

    this.progress({ phase: 'fabric', progress: 0.60, message: `Fabric Loader ${loaderVersion} kuruluyor` });
    const fabricId = await installer.installFabricByLoaderArtifact(loaderArtifact, location, { inheritsFrom: mcVersion });
    if (!fabricId || typeof fabricId !== 'string') throw new Error('Fabric profil kimliği oluşturulamadı.');

    this.progress({ phase: 'fabric', progress: 0.72, message: 'Fabric bağımlılıkları tamamlanıyor' });
    const fabricResolved = await core.Version.parse(location, fabricId);
    const fabricDepsTask = installer.installDependenciesTask(fabricResolved);
    await this.runXmclTask(fabricDepsTask, 0.72, 0.84, 'fabric', 'Fabric hazır', signal);
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
    } finally { this.preparing = false; this.prepareAbort = null; this.activeInstallTask = null; if (!this.running) this.runningVersion = ''; this.notify('game-state', this.state()); }
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
