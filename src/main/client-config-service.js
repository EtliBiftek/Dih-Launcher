'use strict';
const fsp = require('fs').promises;
const path = require('path');
class ClientConfigService {
  constructor(configStore) { this.configStore = configStore; }
  get() { return this.configStore.get().client; }
  set(patch) { return this.configStore.set({ client: patch }).client; }
  async readInstance(instanceDir) { const target = path.join(instanceDir, 'config', 'dih-client.json'); try { return JSON.parse(await fsp.readFile(target, 'utf8')); } catch { return null; } }
  async writeForInstance(instanceDir, version) { const client = this.get(); const target = path.join(instanceDir, 'config', 'dih-client.json'); await fsp.mkdir(path.dirname(target), { recursive: true }); const existing = await this.readInstance(instanceDir) || {}; const launcherPositions = client.positions && Object.keys(client.positions).length ? client.positions : null; const payload = { ...existing, schema: 1, launcherManaged: true, minecraftVersion: version, enabled: client.enabled !== false, scale: Number(client.scale) || 1, zoomFactor: Number(client.zoomFactor) || 4, lowFireOffset: Number(client.lowFireOffset) || 0.45, hitColor: Number.isInteger(Number(client.hitColor)) ? (Number(client.hitColor) | 0) : -43691, timeOfDay: Number.isFinite(Number(client.timeOfDay)) ? Math.max(0, Math.min(23999, Math.round(Number(client.timeOfDay)))) : 6000, modules: { ...(existing.modules || {}), ...(client.modules || {}) }, positions: launcherPositions || existing.positions || {} }; const tmp = `${target}.tmp`; await fsp.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8'); await fsp.rm(target, { force: true }).catch(() => {}); await fsp.rename(tmp, target); return payload; }
}
module.exports = { ClientConfigService };
