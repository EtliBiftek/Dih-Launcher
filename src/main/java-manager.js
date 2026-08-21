'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');
const crypto = require('crypto');
const extractZip = require('extract-zip');
const tar = require('tar');

function parseMcVersion(v) {
  const m = String(v).match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return [1, 21, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
}
function compare(a, b) { for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function requiredJavaMajor(mcVersion) {
  const v = parseMcVersion(mcVersion);
  if (compare(v, [1, 20, 5]) >= 0) return 21;
  if (compare(v, [1, 18, 0]) >= 0) return 17;
  if (compare(v, [1, 17, 0]) >= 0) return 16;
  return 8;
}
function platformName() { return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'; }
function archName() { return process.arch === 'arm64' ? 'aarch64' : 'x64'; }

class JavaManager {
  constructor(app, configStore, logger) { this.configStore = configStore; this.logger = logger; this.root = path.join(app.getPath('userData'), 'runtime'); }

  async javaMajor(cmd) {
    return new Promise((resolve) => {
      const p = spawn(cmd, ['-version'], { windowsHide: true });
      let text = '', settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      p.stderr?.on('data', (b) => { text += b.toString(); }); p.stdout?.on('data', (b) => { text += b.toString(); });
      p.once('error', () => finish(0));
      p.once('exit', (code) => {
        if (code !== 0) return finish(0);
        const match = text.match(/version\s+"(?:1\.)?(\d+)/i) || text.match(/openjdk\s+(?:version\s+)?"?(?:1\.)?(\d+)/i);
        finish(match ? Number(match[1]) : 0);
      });
      setTimeout(() => { try { p.kill(); } catch {} finish(0); }, 4500);
    });
  }
  async compatible(cmd, required) { return (await this.javaMajor(cmd)) >= required; }

  async findJavaIn(root, required) {
    const wanted = process.platform === 'win32' ? 'java.exe' : 'java'; const stack = [root];
    while (stack.length) {
      const dir = stack.pop(); let entries = [];
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isFile() && e.name.toLowerCase() === wanted.toLowerCase() && path.basename(path.dirname(p)) === 'bin' && await this.compatible(p, required)) return p;
        if (e.isDirectory() && !e.name.startsWith('.')) stack.push(p);
      }
    }
    return '';
  }

  async resolve(mcVersion, onProgress = () => {}, signal) {
    const cfg = this.configStore.get(); const major = requiredJavaMajor(mcVersion);
    if (cfg.javaPath) {
      if (await this.compatible(cfg.javaPath, major)) return cfg.javaPath;
      throw new Error(`Seçilen Java, Minecraft ${mcVersion} için gereken Java ${major}+ ile uyumlu değil.`);
    }
    const managedRoot = path.join(this.root, `java-${major}`);
    const managedJava = await this.findJavaIn(managedRoot, major);
    if (managedJava) return managedJava;
    if (await this.compatible('java', major)) return 'java';
    if (!cfg.autoJava) throw new Error(`Java ${major}+ bulunamadı. Otomatik Java'yı aç veya uyumlu Java yolu seç.`);
    return this.downloadTemurin(major, managedRoot, onProgress, signal);
  }

  async temurinPackage(major, signal) {
    const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${encodeURIComponent(archName())}&heap_size=normal&image_type=jre&jvm_impl=hotspot&os=${encodeURIComponent(platformName())}&project=jdk&vendor=eclipse`;
    const response = await fetch(url, { signal, headers: { 'User-Agent': 'Dih-Launcher' } });
    if (!response.ok) throw new Error(`Java metadata alınamadı (${response.status}).`);
    const assets = await response.json();
    const pkg = assets?.[0]?.binary?.package;
    if (!pkg?.link || !pkg?.checksum) throw new Error(`Java ${major} için doğrulanabilir Temurin paketi bulunamadı.`);
    return { link: pkg.link, checksum: String(pkg.checksum).toLowerCase(), size: Number(pkg.size || 0), name: pkg.name || '' };
  }

  async downloadTemurin(major, destination, onProgress, signal) {
    await fsp.mkdir(this.root, { recursive: true });
    const pkg = await this.temurinPackage(major, signal);
    const ext = pkg.name.endsWith('.tar.gz') || (!pkg.name && process.platform !== 'win32') ? 'tar.gz' : 'zip';
    const archive = path.join(this.root, `java-${major}.${ext}`); const tmp = `${archive}.part`;
    this.logger.info(`Java ${major} indiriliyor`, pkg.link);
    onProgress({ phase: 'java', progress: 0.03, message: `Java ${major} indiriliyor` });
    const response = await fetch(pkg.link, { signal, redirect: 'follow', headers: { 'User-Agent': 'Dih-Launcher' } });
    if (!response.ok || !response.body) throw new Error(`Java indirilemedi (${response.status}).`);
    const total = Number(response.headers.get('content-length') || pkg.size || 0); let current = 0;
    const hash = crypto.createHash('sha256');
    const meter = new Transform({ transform(chunk, _enc, cb) { current += chunk.length; hash.update(chunk); if (total) onProgress({ phase: 'java', progress: Math.min(0.8, current / total * 0.8), message: `Java ${major} indiriliyor` }); cb(null, chunk); } });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(tmp));
    const actual = hash.digest('hex');
    if (actual !== pkg.checksum) { await fsp.rm(tmp, { force: true }); throw new Error('Java SHA-256 doğrulaması başarısız.'); }
    await fsp.rm(archive, { force: true }).catch(() => {}); await fsp.rename(tmp, archive);
    await fsp.rm(destination, { recursive: true, force: true }); await fsp.mkdir(destination, { recursive: true });
    onProgress({ phase: 'java', progress: 0.86, message: 'Java çıkartılıyor' });
    if (ext === 'zip') await extractZip(archive, { dir: destination }); else await tar.x({ file: archive, cwd: destination });
    await fsp.rm(archive, { force: true });
    const java = await this.findJavaIn(destination, major);
    if (!java) throw new Error('İndirilen Java runtime doğrulanamadı.');
    if (process.platform !== 'win32') await fsp.chmod(java, 0o755).catch(() => {});
    onProgress({ phase: 'java', progress: 1, message: `Java ${major} hazır` });
    return java;
  }
}
module.exports = { JavaManager, requiredJavaMajor };
