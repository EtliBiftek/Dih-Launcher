'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { analyzeCrash } = require('./crash-analyzer');
const { compareVersions } = require('../shared/version');

const SAFE_VERSION = /^[0-9A-Za-z._+\-]{1,80}$/;
function validateVersion(value) { const v = String(value || ''); if (!SAFE_VERSION.test(v)) throw new Error('Geçersiz Minecraft sürüm kimliği.'); return v; }
function trackerMessage(e, fallback) { return e?.phase ? String(e.phase) : fallback; }

class MinecraftService {
  constructor(app, configStore, githubService, javaManager, authService, clientConfig, rpc, logger, notify) {
    this.app = app; this.configStore = configStore; this.githubService = githubService; this.javaManager = javaManager; this.authService = authService; this.clientConfig = clientConfig; this.rpc = rpc; this.logger = logger; this.notify = notify;
    this.root = path.join(app.getPath('userData'), 'minecraft'); this.resources = path.join(this.root, 'resources'); this.instances = path.join(this.root, 'instances');
    this.running = null; this.runningVersion = ''; this.preparing = false; this.prepareAbort = null;
  }
  instanceDir(version) { return path.join(this.instances, validateVersion(version)); }
  progress(payload) { this.notify('launch-progress', payload); }
  state() { return { running: !!this.running, preparing: this.preparing, pid: this.running?.pid || null, version: this.runningVersion || '' }; }
  cancelPrepare() { if (!this.prepareAbort) return false; this.prepareAbort.abort(); return true; }

  async ensureMinecraftAndFabric(mcVersion) {
    const installer = await import('@xmcl/installer'); const core = await import('@xmcl/core');
    await fsp.mkdir(this.resources, { recursive: true }); const location = core.MinecraftFolder.from(this.resources); const signal = this.prepareAbort?.signal;
    this.progress({ phase: 'minecraft', progress: 0.05, message: `Minecraft ${mcVersion} doğrulanıyor` });
    const list = await installer.getVersionList(); const meta = list.versions.find((v) => v.id === mcVersion); if (!meta) throw new Error(`Mojang sürüm listesinde ${mcVersion} bulunamadı.`);
    const baseResolved = await installer.installMinecraft(meta, location, { abortSignal: signal, tracker: (e) => this.progress({ phase: 'minecraft', progress: 0.18, message: trackerMessage(e, 'Minecraft indiriliyor') }) });
    await installer.completeInstallation(baseResolved, { abortSignal: signal, tracker: (e) => this.progress({ phase: 'minecraft', progress: 0.42, message: trackerMessage(e, 'Minecraft dosyaları tamamlanıyor') }) });

    const loaderArtifact = await installer.getFabricLoaderArtifact(); const loaderVersion = loaderArtifact?.version; if (!loaderVersion) throw new Error(`Fabric Loader bulunamadı: ${mcVersion}`);
    this.progress({ phase: 'fabric', progress: 0.56, message: `Fabric Loader ${loaderVersion} kuruluyor` });
    const result = await installer.installFabric({ minecraft: mcVersion, loader: loaderVersion }, location);
    const fabricId = typeof result === 'string' ? result : (result?.id || `fabric-loader-${loaderVersion}-${mcVersion}`);
    const fabricResolved = await core.Version.parse(this.resources, fabricId);
    await installer.completeInstallation(fabricResolved, { abortSignal: signal, tracker: (e) => this.progress({ phase: 'fabric', progress: 0.78, message: trackerMessage(e, 'Fabric bağımlılıkları tamamlanıyor') }) });
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
      const fabric = await this.ensureMinecraftAndFabric(version);
      await fsp.mkdir(path.join(instance, '.dih'), { recursive: true });
      const record = { schema: 3, version, minecraftVersion: version, loader: 'fabric', loaderVersion: fabric.fabricVersion, fabricId: fabric.fabricId, javaPath, updatedAt: new Date().toISOString(), managed: Object.fromEntries(['mods','config','resourcepacks','shaderpacks'].map((key) => [key, manifest[key].map((m) => m.path || m.name)])), meta };
      await fsp.writeFile(path.join(instance, '.dih', 'instance.json'), JSON.stringify(record, null, 2));
      return { instance, javaPath, manifest, ...fabric };
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Hazırlama işlemi iptal edildi.');
      throw e;
    } finally { this.preparing = false; this.prepareAbort = null; if (!this.running) this.runningVersion = ''; this.notify('game-state', this.state()); }
  }

  async launch(version) {
    version = validateVersion(version); if (this.running || this.preparing) throw new Error('Oyun veya hazırlama işlemi zaten devam ediyor.');
    const cfg = this.configStore.get(); const session = await this.authService.ensureSession(); const prepared = await this.prepare(version, false); const { launch } = await import('@xmcl/core'); const meta = prepared.manifest.meta || {};
    const maxMemory = Math.max(Number(cfg.maxMemoryMb) || 4096, Number(meta.recommendedRamMb) || 0);
    this.logger.resetGameLog(); this.progress({ phase: 'launch', progress: 0.94, message: 'Minecraft başlatılıyor' });
    const child = await launch({ gamePath: prepared.instance, resourcePath: this.resources, version: prepared.fabricId, javaPath: prepared.javaPath, gameProfile: { name: session.name, id: session.id }, accessToken: session.accessToken, userType: 'msa', launcherName: 'Dih', launcherBrand: this.app.getVersion(), minMemory: Number(cfg.minMemoryMb) || 1024, maxMemory, resolution: cfg.fullscreen ? { fullscreen: true } : { width: Number(cfg.width) || 1280, height: Number(cfg.height) || 720 }, extraJVMArgs: [...(Array.isArray(cfg.javaArgs) ? cfg.javaArgs : []), ...(Array.isArray(meta.javaArgs) ? meta.javaArgs : [])], extraMCArgs: [...(Array.isArray(cfg.gameArgs) ? cfg.gameArgs : []), ...(Array.isArray(meta.gameArgs) ? meta.gameArgs : [])] });
    this.running = child; this.runningVersion = version; this.notify('game-state', this.state()); this.progress({ phase: 'launch', progress: 1, message: 'Minecraft çalışıyor' }); await this.rpc.start(version);
    child.stdout?.on('data', (b) => { this.logger.game('OUT', b.toString()); this.notify('game-log', b.toString()); }); child.stderr?.on('data', (b) => { this.logger.game('ERR', b.toString()); this.notify('game-log', b.toString()); });
    child.once('exit', async (code, signal) => { this.logger.info('Minecraft kapandı', `code=${code} signal=${signal || ''}`); await this.rpc.stop(); const crash = analyzeCrash(this.logger.recentGameLines(600), code); this.running = null; this.runningVersion = ''; this.notify('game-state', { ...this.state(), code, signal, ...crash }); });
    child.once('error', async (e) => { this.logger.error('Minecraft process hatası', e); await this.rpc.stop(); this.running = null; this.runningVersion = ''; this.notify('game-state', { ...this.state(), error: e.message, crashed: true, reason: e.message }); });
    return { pid: child.pid, version };
  }

  async repair(version) { if (this.running || this.preparing) throw new Error('Oyun/hazırlama çalışırken repair yapılamaz.'); const instance = this.instanceDir(version); this.progress({ phase: 'repair', progress: 0.01, message: 'Yönetilen dosyalar temizleniyor' }); await this.githubService.removeManagedFiles(instance); await this.prepare(version, true); this.progress({ phase: 'repair', progress: 1, message: 'Repair tamamlandı' }); return true; }
  async resetInstance(version) { if (this.running || this.preparing) throw new Error('Oyun/hazırlama çalışırken instance sıfırlanamaz.'); await fsp.rm(this.instanceDir(version), { recursive: true, force: true }); return true; }
  async kill() { if (!this.running) return false; if (process.platform === 'win32') { const { spawn } = require('child_process'); spawn('taskkill', ['/PID', String(this.running.pid), '/T', '/F'], { windowsHide: true }); } else this.running.kill('SIGTERM'); return true; }
}
module.exports = { MinecraftService, validateVersion };
