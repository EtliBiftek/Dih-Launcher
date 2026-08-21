'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');
const crypto = require('crypto');

function enc(value) { return String(value || '').split('/').filter(Boolean).map(encodeURIComponent).join('/'); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

class GitHubService {
  constructor(configStore, logger) {
    this.configStore = configStore;
    this.logger = logger;
    this.manifestCache = new Map();
  }

  cfg() { return this.configStore.get().github; }
  validateConfig() {
    const cfg = this.cfg();
    if (!cfg.owner || !cfg.repo) throw new Error('GitHub kullanıcı/organizasyon ve repo adı Ayarlar bölümünden girilmeli.');
    return cfg;
  }

  headers() {
    return {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Dih-Launcher'
    };
  }

  async request(url, options = {}, retries = 3) {
    let last;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, { ...options, headers: { ...this.headers(), ...(options.headers || {}) } });
        if (response.ok || response.status === 404) return response;
        const body = await response.text();
        const rateRemaining = response.headers.get('x-ratelimit-remaining');
        if (response.status === 403 && rateRemaining === '0') throw new Error('GitHub API limiti doldu. Birkaç dakika sonra tekrar dene.');
        last = new Error(`GitHub API hatası (${response.status}): ${body.slice(0, 300)}`);
        if (response.status < 500) throw last;
      } catch (e) { if (e?.name === 'AbortError') throw e; last = e; }
      if (attempt < retries) await sleep(400 * (2 ** (attempt - 1)));
    }
    throw last || new Error('GitHub isteği başarısız.');
  }

  async contents(remotePath) {
    const cfg = this.validateConfig();
    const suffix = enc(remotePath);
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents${suffix ? `/${suffix}` : ''}?ref=${encodeURIComponent(cfg.branch || 'main')}`;
    const response = await this.request(url);
    if (response.status === 404) return [];
    const json = await response.json();
    return Array.isArray(json) ? json : [json];
  }

  async listVersions() {
    const cfg = this.validateConfig();
    const items = await this.contents(cfg.versionsRoot || 'sürümler');
    const versions = [];
    for (const item of items.filter((x) => x.type === 'dir')) {
      const meta = await this.readVersionMeta(item.name).catch(() => ({}));
      versions.push({ id: item.name, minecraftVersion: item.name, loader: 'fabric', path: item.path, sha: item.sha, title: meta.title || `Minecraft ${item.name}`, description: meta.description || 'Dih PvP profili', recommendedRamMb: Number(meta.recommendedRamMb || 0) || null, changelog: Array.isArray(meta.changelog) ? meta.changelog.map(String) : (meta.changelog ? [String(meta.changelog)] : []), publishedAt: meta.publishedAt || '', badge: meta.badge || '', hidden: meta.hidden === true });
    }
    return versions.filter((x) => !x.hidden).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
  }

  async listFilesRecursive(remotePath) { const out = []; const walk = async (dir) => { const items = await this.contents(dir); for (const item of items) { if (item.type === 'dir') await walk(item.path); else if (item.type === 'file') out.push(item); } }; await walk(remotePath); return out; }
  async readJsonFile(remotePath) { const items = await this.contents(remotePath); const item = items[0]; if (!item?.download_url) return null; const response = await this.request(item.download_url, { headers: { Accept: 'application/octet-stream' } }); if (!response.ok) return null; return response.json(); }
  validateVersion(version) { const value = String(version || ''); if (!/^[0-9A-Za-z._+\-]{1,80}$/.test(value)) throw new Error('Geçersiz Minecraft sürüm kimliği.'); return value; }
  async readVersionMeta(version) { version = this.validateVersion(version); const cfg = this.validateConfig(); return await this.readJsonFile(`${cfg.versionsRoot}/${version}/dih.json`) || {}; }
  async getVersionManifest(version, force = false) { version = this.validateVersion(version); const cacheKey = String(version); const cached = this.manifestCache.get(cacheKey); if (!force && cached && Date.now() - cached.time < 30_000) return cached.value; const cfg = this.validateConfig(); const base = `${cfg.versionsRoot}/${version}`; const exists = await this.contents(base); if (!exists.length) throw new Error(`GitHub'da ${base} bulunamadı.`); const folders = {}; for (const folder of ['mods','config','resourcepacks','shaderpacks']) folders[folder] = (await this.listFilesRecursive(`${base}/${folder}`).catch(() => [])).filter((x) => folder !== 'mods' || x.name.toLowerCase().endsWith('.jar')); const meta = await this.readVersionMeta(version).catch(() => ({})); const value = { version, minecraftVersion: version, loader: 'fabric', meta, ...folders }; this.manifestCache.set(cacheKey, { time: Date.now(), value }); return value; }

  async downloadFile(item, destination, onProgress = () => {}, signal) {
    if (!item.download_url) throw new Error(`İndirme adresi yok: ${item.path}`);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    const tmp = `${destination}.dih-part`; await fsp.rm(tmp, { force: true }).catch(() => {}); let last;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { const response = await this.request(item.download_url, { signal, headers: { Accept: 'application/octet-stream' } }, 1); if (!response.ok || !response.body) throw new Error(`İndirme başarısız (${response.status}): ${item.path}`); const total = Number(response.headers.get('content-length') || item.size || 0); let current = 0; const gitHash = item.sha && /^[a-f0-9]{40}$/i.test(item.sha) && Number(item.size) >= 0 ? crypto.createHash('sha1').update(Buffer.from(`blob ${Number(item.size)}\0`)) : null; const meter = new Transform({ transform(chunk, _enc, cb) { current += chunk.length; gitHash?.update(chunk); onProgress({ current, total }); cb(null, chunk); } }); await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(tmp)); if (item.size && (await fsp.stat(tmp)).size !== Number(item.size)) throw new Error(`Dosya boyutu doğrulanamadı: ${item.path}`); if (gitHash && gitHash.digest('hex').toLowerCase() !== String(item.sha).toLowerCase()) throw new Error(`Git blob SHA doğrulaması başarısız: ${item.path}`); await fsp.rm(destination, { force: true }).catch(() => {}); await fsp.rename(tmp, destination); return; } catch (e) { last = e; await fsp.rm(tmp, { force: true }).catch(() => {}); if (attempt < 3) await sleep(500 * attempt); }
    }
    throw last;
  }
  safeRelative(item, remoteBase) { const rel = item.path.startsWith(`${remoteBase}/`) ? item.path.slice(remoteBase.length + 1) : item.name; const safe = rel.replace(/\\/g, '/').replace(/^\/+/, ''); if (!safe || safe.split('/').some((part) => part === '..' || part === '.')) throw new Error('Geçersiz GitHub dosya yolu.'); return safe; }
  async syncManagedFolder({ items, remoteBase, localDir, stateFile, force = false, onProgress = () => {}, signal }) { await fsp.mkdir(localDir, { recursive: true }); let oldState = { files: [] }; try { oldState = JSON.parse(await fsp.readFile(stateFile, 'utf8')); } catch {} const previousMap = new Map((oldState.files || []).map((x) => [x.path, x])); const next = []; const keep = new Set(); const totalBytes = items.reduce((sum, x) => sum + Number(x.size || 0), 0); let completedBytes = 0; for (let i=0;i<items.length;i+=1) { const item=items[i]; const safeRel=this.safeRelative(item, remoteBase); const dest=path.join(localDir,...safeRel.split('/')); const resolvedRoot=path.resolve(localDir)+path.sep; const resolvedDest=path.resolve(dest); if (!resolvedDest.startsWith(resolvedRoot) && resolvedDest !== path.resolve(localDir)) throw new Error('Dosya yolu instance dışına çıkıyor.'); keep.add(resolvedDest); const previous=previousMap.get(safeRel); let needsDownload=force || !fs.existsSync(dest) || previous?.sha !== item.sha; if (!needsDownload && item.size) { try { needsDownload=(await fsp.stat(dest)).size !== Number(item.size); } catch { needsDownload=true; } } if (needsDownload) { this.logger.info('GitHub dosyası indiriliyor', item.path); await this.downloadFile(item,dest,({current,total})=>{ const denom=totalBytes||items.length||1; const base=totalBytes?completedBytes:i; const add=totalBytes?current:(total?current/total:0); onProgress(Math.min(0.999,(base+add)/denom),safeRel); },signal); } completedBytes += Number(item.size || 0); next.push({ path:safeRel, sha:item.sha, size:Number(item.size||0) }); onProgress((i+1)/Math.max(1,items.length),safeRel); } for (const old of oldState.files || []) { const oldPath=path.resolve(path.join(localDir,...String(old.path).split('/'))); const oldRoot=path.resolve(localDir)+path.sep; if (!keep.has(oldPath)&&oldPath.startsWith(oldRoot)) await fsp.rm(oldPath,{force:true}).catch(()=>{}); } await fsp.mkdir(path.dirname(stateFile),{recursive:true}); const tmpState=`${stateFile}.tmp`; await fsp.writeFile(tmpState,JSON.stringify({files:next,updatedAt:new Date().toISOString()},null,2)); await fsp.rename(tmpState,stateFile); return next; }
  async syncVersionFiles(version, instanceDir, onProgress=()=>{}, force=false, signal) { version=this.validateVersion(version); const cfg=this.validateConfig(); const manifest=await this.getVersionManifest(version,force); const base=`${cfg.versionsRoot}/${version}`; const jobs=['mods','config','resourcepacks','shaderpacks'].map((key)=>({key,items:manifest[key]||[],remote:`${base}/${key}`,local:path.join(instanceDir,key)})); for (let index=0;index<jobs.length;index+=1) { const job=jobs[index]; await this.syncManagedFolder({items:job.items,remoteBase:job.remote,localDir:job.local,stateFile:path.join(instanceDir,'.dih',`${job.key}.json`),force,signal,onProgress:(inner,file)=>onProgress({phase:'github',progress:(index+inner)/jobs.length,message:`${job.key}: ${file||'senkronize ediliyor'}`})}); } return manifest; }
  async removeManagedFiles(instanceDir) { for (const key of ['mods','config','resourcepacks','shaderpacks']) { const stateFile=path.join(instanceDir,'.dih',`${key}.json`); let state={files:[]}; try { state=JSON.parse(await fsp.readFile(stateFile,'utf8')); } catch {} for (const file of state.files||[]) { const target=path.resolve(path.join(instanceDir,key,...String(file.path).split('/'))); const managedRoot=path.resolve(path.join(instanceDir,key))+path.sep; if (target.startsWith(managedRoot)) await fsp.rm(target,{force:true}).catch(()=>{}); } await fsp.rm(stateFile,{force:true}).catch(()=>{}); } }
}
module.exports = { GitHubService };
