'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');

const { newer } = require('../shared/version');

class UpdaterService {
  constructor(app, configStore, logger, notify) {
    this.app = app; this.configStore = configStore; this.logger = logger; this.notify = notify;
    this.latest = null; this.downloaded = '';
    this.dir = path.join(app.getPath('userData'), 'updates');
  }

  config() {
    const c = this.configStore.get();
    const owner = c.updates.owner || c.github.owner;
    const repo = c.updates.repo || c.github.repo;
    return { ...c.updates, owner, repo };
  }

  async check() {
    const c = this.config();
    if (!c.enabled || !c.owner || !c.repo) return { available: false, current: this.app.getVersion(), reason: 'disabled-or-unconfigured' };
    const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/releases`;
    const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Dih-Launcher' } });
    if (!response.ok) throw new Error(`Güncelleme kontrolü başarısız (${response.status}).`);
    const releases = await response.json();
    const release = releases.find((r) => !r.draft && (c.prerelease || !r.prerelease));
    if (!release) return { available: false, current: this.app.getVersion() };
    const version = String(release.tag_name || '').replace(/^v/i, '');
    const asset = release.assets?.find((a) => /Dih.*Setup.*\.exe$/i.test(a.name)) || release.assets?.find((a) => /\.exe$/i.test(a.name));
    const checksumAsset = asset ? (release.assets?.find((a) => a.name === `${asset.name}.sha256`) || release.assets?.find((a) => /sha256sums|checksums/i.test(a.name))) : null;
    this.latest = { version, name: release.name || release.tag_name, body: release.body || '', htmlUrl: release.html_url, asset, checksumAsset };
    return { available: newer(version, this.app.getVersion()), current: this.app.getVersion(), ...this.latest, asset: asset ? { name: asset.name, size: asset.size } : null };
  }

  async download() {
    if (!this.latest?.asset?.browser_download_url) throw new Error('İndirilebilir Windows kurulum dosyası bulunamadı.');
    await fsp.mkdir(this.dir, { recursive: true });
    const target = path.join(this.dir, this.latest.asset.name.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const tmp = `${target}.part`;
    const response = await fetch(this.latest.asset.browser_download_url, { headers: { 'User-Agent': 'Dih-Launcher' }, redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`Güncelleme indirilemedi (${response.status}).`);
    const total = Number(response.headers.get('content-length') || this.latest.asset.size || 0);
    let current = 0;
    const meter = new Transform({ transform(chunk, _enc, cb) { current += chunk.length; cb(null, chunk); } });
    meter.on('data', () => this.notify('update-progress', { current, total, progress: total ? current / total : 0 }));
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(tmp));
    await fsp.rm(target, { force: true }).catch(() => {});
    await fsp.rename(tmp, target);
    if (this.latest.asset.size && (await fsp.stat(target)).size !== Number(this.latest.asset.size)) {
      await fsp.rm(target, { force: true });
      throw new Error('Güncelleme dosya boyutu doğrulaması başarısız.');
    }

    if (!this.latest.checksumAsset?.browser_download_url && this.config().requireChecksum !== false) {
      await fsp.rm(target, { force: true }).catch(() => {});
      throw new Error('Güncelleme release’i SHA-256 checksum içermiyor; güvenlik nedeniyle kurulmadı.');
    }

    if (this.latest.checksumAsset?.browser_download_url) {
      const checksumResponse = await fetch(this.latest.checksumAsset.browser_download_url, { headers: { 'User-Agent': 'Dih-Launcher' }, redirect: 'follow' });
      if (!checksumResponse.ok) throw new Error('Güncelleme checksum dosyası indirilemedi.');
      const checksumText = await checksumResponse.text();
      const escapedName = this.latest.asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const named = checksumText.match(new RegExp(`([a-fA-F0-9]{64})\\s+\\*?${escapedName}(?:\\s|$)`, 'i'));
      const expected = (named?.[1] || (/^[a-fA-F0-9]{64}\s*$/i.test(checksumText.trim()) ? checksumText.trim() : '')).toLowerCase();
      if (!expected) throw new Error('Güncelleme checksum dosyasında bu installer için SHA-256 bulunamadı.');
      const hash = crypto.createHash('sha256');
      const input = fs.createReadStream(target);
      for await (const chunk of input) hash.update(chunk);
      const actual = hash.digest('hex');
      if (actual !== expected) {
        await fsp.rm(target, { force: true });
        throw new Error('Güncelleme SHA-256 doğrulaması başarısız.');
      }
      this.logger.info('Güncelleme SHA-256 doğrulandı', actual);
    } else {
      this.logger.warn('Release checksum asset içermiyor; requireChecksum kapalı olduğu için devam ediliyor.');
    }

    this.downloaded = target;
    return { path: target, version: this.latest.version };
  }

  install() {
    if (!this.downloaded || !fs.existsSync(this.downloaded)) throw new Error('İndirilmiş güncelleme bulunamadı.');
    if (process.platform !== 'win32') throw new Error('Otomatik kurulum şu anda yalnız Windows için etkin.');
    spawn(this.downloaded, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    setTimeout(() => this.app.quit(), 250);
    return true;
  }
}

module.exports = { UpdaterService, newer };
