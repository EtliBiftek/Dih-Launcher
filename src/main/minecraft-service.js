'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { analyzeCrash } = require('./crash-analyzer');
const { compareVersions } = require('../shared/version');

const SAFE_VERSION = /^[0-9A-Za-z._+\-]{1,80}$/;
const DOWNLOAD_STALL_MS = 60_000;
const DOWNLOAD_CONCURRENCY = 4;

function validateVersion(value) { const v = String(value || ''); if (!SAFE_VERSION.test(v)) throw new Error('Geçersiz Minecraft sürüm kimliği.'); return v; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function formatBytes(value) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${Math.round(n)} B`;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
      Promise.resolve(this.activeInstallTask.cancel(5000)).catch((e) => this.logger.warn('XMCL kurulum görevi iptal edilemedi', e?.message || e));
    }
    return cancelled;
  }

  xmclTaskName(task) { return String(task?.path || task?.name || task?.id || '').toLowerCase(); }
  xmclTaskMessage(task, fallback) {
    const p = this.xmclTaskName(task);
    if (p.includes('asset')) return 'Minecraft varlıkları indiriliyor';
    if (p.includes('librar')) return 'Minecraft kütüphaneleri indiriliyor';
    if (p.includes('jar')) return 'Minecraft istemcisi indiriliyor';
    if (p.includes('json') || p.includes('version')) return 'Minecraft sürüm bilgisi hazırlanıyor';
    if (p.includes('depend')) return 'Minecraft bağımlılıkları doğrulanıyor';
    return fallback;
  }
  xmclMetric(task) {
    const total = Number(task?.total);
    const done = Number(task?.progress);
    return Number.isFinite(total) && total > 0 && Number.isFinite(done) && done >= 0 ? { done, total } : null;
  }
  isRetryableInstallError(error) {
    const text = String(error?.code || '') + ' ' + String(error?.name || '') + ' ' + String(error?.message || error || '');
    return /timeout|timedout|etimedout|econnreset|econnrefused|eai_again|enotfound|socket|network|fetch|aborted|cancel/i.test(text);
  }

  async runXmclTask(taskFactory, start, end, phase, fallback, signal, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal?.aborted) throw Object.assign(new Error('Hazırlama işlemi iptal edildi.'), { name: 'AbortError' });
      const task = taskFactory();
      if (!task || typeof task.startAndWait !== 'function') throw new Error('XMCL kurulum görevi oluşturulamadı.');
      this.activeInstallTask = task;

      const state = {
        currentTask: task,
        lastValue: start,
        lastRootProgress: Number(task.progress) || 0,
        lastChildKey: '',
        lastChildProgress: -1,
        lastAdvance: Date.now(),
        speedWindowAt: Date.now(),
        speedWindowBytes: 0,
        speed: 0,
        stalled: false,
        stallReject: null
      };

      const currentMetric = () => this.xmclMetric(state.currentTask) || this.xmclMetric(task);
      const observeAdvance = (chunkSize = 0) => {
        const now = Date.now();
        const rootProgress = Number(task.progress);
        const childProgress = Number(state.currentTask?.progress);
        const childKey = this.xmclTaskName(state.currentTask);
        let advanced = false;

        if (Number.isFinite(rootProgress) && rootProgress > state.lastRootProgress) {
          state.lastRootProgress = rootProgress;
          advanced = true;
        }
        if (childKey !== state.lastChildKey) {
          state.lastChildKey = childKey;
          state.lastChildProgress = Number.isFinite(childProgress) ? childProgress : -1;
          advanced = true;
        } else if (Number.isFinite(childProgress) && childProgress > state.lastChildProgress) {
          state.lastChildProgress = childProgress;
          advanced = true;
        }
        if (Number(chunkSize) > 0) {
          state.speedWindowBytes += Number(chunkSize);
          advanced = true;
        }
        if (advanced) state.lastAdvance = now;

        const speedElapsed = now - state.speedWindowAt;
        if (speedElapsed >= 1000) {
          state.speed = state.speedWindowBytes / (speedElapsed / 1000);
          state.speedWindowBytes = 0;
          state.speedWindowAt = now;
        }
      };

      const emit = (force = false) => {
        const metric = currentMetric();
        const ratio = metric ? clamp01(metric.done / metric.total) : clamp01((Number(task.progress) || 0) / Math.max(1, Number(task.total) || 1));
        state.lastValue = Math.max(state.lastValue, Math.min(end, start + (end - start) * ratio));
        let message = this.xmclTaskMessage(state.currentTask, fallback);
        if (metric && metric.total >= 64 * 1024) {
          message += ` • ${formatBytes(metric.done)} / ${formatBytes(metric.total)}`;
          if (state.speed > 1024) message += ` • ${formatBytes(state.speed)}/s`;
        }
        const idleSec = Math.floor((Date.now() - state.lastAdvance) / 1000);
        if (idleSec >= 10 && metric && metric.done < metric.total) message += ` • bekleniyor ${idleSec}s`;
        this.progress({ phase, progress: state.lastValue, message });
        if (force) this.logger.info('XMCL ilerleme', `${message} (${Math.round(state.lastValue * 100)}%)`);
      };

      const context = {
        onStart: (currentTask) => { state.currentTask = currentTask || task; observeAdvance(); emit(true); },
        onUpdate: (currentTask, chunkSize) => { state.currentTask = currentTask || state.currentTask; observeAdvance(chunkSize); emit(); },
        onFailed: (currentTask, error) => this.logger.error(`XMCL görev başarısız: ${currentTask?.path || currentTask?.name || 'task'}`, error),
        onSucceed: (currentTask) => { state.currentTask = currentTask || state.currentTask; observeAdvance(); emit(true); },
        onCancelled: (currentTask) => this.logger.warn('XMCL görev iptal edildi', currentTask?.path || currentTask?.name || 'task')
      };

      let rejectStall;
      const stallPromise = new Promise((_, reject) => { rejectStall = reject; });
      state.stallReject = rejectStall;
      const poll = setInterval(() => {
        observeAdvance();
        emit();
        const metric = currentMetric();
        const rootMetric = this.xmclMetric(task);
        const incomplete = (metric && metric.done < metric.total) || (rootMetric && rootMetric.done < rootMetric.total);
        if (incomplete && Date.now() - state.lastAdvance >= DOWNLOAD_STALL_MS && !state.stalled) {
          state.stalled = true;
          const taskName = state.currentTask?.path || state.currentTask?.name || phase;
          this.logger.warn('XMCL indirmesi 60 saniye ilerlemedi; görev zorla yeniden başlatılacak', taskName);
          Promise.resolve(task.cancel?.(5000)).catch(() => {});
          rejectStall(Object.assign(new Error(`İndirme 60 saniye ilerlemedi: ${taskName}`), { code: 'DIH_DOWNLOAD_STALL' }));
        }
      }, 400);

      const abort = () => {
        Promise.resolve(task.cancel?.(5000)).catch(() => {});
        rejectStall?.(Object.assign(new Error('Hazırlama işlemi iptal edildi.'), { name: 'AbortError' }));
      };
      signal?.addEventListener('abort', abort, { once: true });

      try {
        const taskPromise = task.startAndWait(context);
        const result = await Promise.race([taskPromise, stallPromise]);
        this.progress({ phase, progress: end, message: fallback });
        return result;
      } catch (e) {
        lastError = e;
        if (signal?.aborted || e?.name === 'AbortError') throw Object.assign(new Error('Hazırlama işlemi iptal edildi.'), { name: 'AbortError' });
        const retryable = state.stalled || e?.code === 'DIH_DOWNLOAD_STALL' || this.isRetryableInstallError(e);
        if (!retryable || attempt >= maxAttempts) throw e;
        this.progress({ phase, progress: state.lastValue, message: `İndirme bağlantısı yenileniyor (${attempt + 1}/${maxAttempts})` });
        await sleep(attempt * 1500);
      } finally {
        clearInterval(poll);
        signal?.removeEventListener('abort', abort);
        if (this.activeInstallTask === task) this.activeInstallTask = null;
      }
    }
    throw lastError || new Error('Minecraft kurulumu tamamlanamadı.');
  }

  async ensureMinecraftAndFabric(mcVersion, signal) {
    const installer = await import('@xmcl/installer');
    const core = await import('@xmcl/core');
    await fsp.mkdir(this.resources, { recursive: true });
    const location = core.MinecraftFolder.from(this.resources);
    const downloadOptions = {
      side: 'client',
      assetsDownloadConcurrency: DOWNLOAD_CONCURRENCY,
      librariesDownloadConcurrency: DOWNLOAD_CONCURRENCY,
      throwErrorImmediately: true
    };

    this.progress({ phase: 'minecraft', progress: 0.05, message: `Minecraft ${mcVersion} doğrulanıyor` });
    const list = await installer.getVersionList();
    const meta = list.versions.find((v) => v.id === mcVersion);
    if (!meta) throw new Error(`Mojang sürüm listesinde ${mcVersion} bulunamadı.`);

    this.progress({ phase: 'minecraft', progress: 0.18, message: 'Minecraft çekirdeği hazırlanıyor' });
    const resolved = await this.runXmclTask(
      () => installer.installVersionTask(meta, location, downloadOptions),
      0.18, 0.28, 'minecraft', 'Minecraft çekirdeği hazır', signal
    );

    await this.runXmclTask(
      () => installer.installLibrariesTask(resolved, { ...downloadOptions, librariesDownloadConcurrency: DOWNLOAD_CONCURRENCY }),
      0.28, 0.42, 'minecraft', 'Minecraft kütüphaneleri hazır', signal
    );

    await this.runXmclTask(
      () => installer.installAssetsTask(resolved, { ...downloadOptions, assetsDownloadConcurrency: DOWNLOAD_CONCURRENCY, prevalidSizeOnly: true }),
      0.42, 0.58, 'minecraft', 'Minecraft varlıkları hazır', signal
    );

    const loaders = await installer.getLoaderArtifactListFor(mcVersion);
    const loaderArtifact = loaders.find((x) => x?.loader?.stable) || loaders[0];
    const loaderVersion = loaderArtifact?.loader?.version || loaderArtifact?.version;
    if (!loaderArtifact || !loaderVersion) throw new Error(`Fabric Loader bulunamadı: ${mcVersion}`);

    this.progress({ phase: 'fabric', progress: 0.62, message: `Fabric Loader ${loaderVersion} kuruluyor` });
    const fabricId = await installer.installFabricByLoaderArtifact(loaderArtifact, location, { inheritsFrom: mcVersion });
    if (!fabricId || typeof fabricId !== 'string') throw new Error('Fabric profil kimliği oluşturulamadı.');

    const fabricResolved = await core.Version.parse(location, fabricId);
    await this.runXmclTask(
      () => installer.installLibrariesTask(fabricResolved, { librariesDownloadConcurrency: DOWNLOAD_CONCURRENCY, throwErrorImmediately: true }),
      0.68, 0.84, 'fabric', 'Fabric hazır', signal
    );
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
