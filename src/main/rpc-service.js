'use strict';

class RpcService {
  constructor(configStore, logger) { this.configStore = configStore; this.logger = logger; this.client = null; this.started = 0; }

  async start(version) {
    const cfg = this.configStore.get();
    if (!cfg.discordRpc || !cfg.discordAppId) return;
    try {
      const RPC = require('discord-rpc');
      this.client = new RPC.Client({ transport: 'ipc' });
      await this.client.login({ clientId: cfg.discordAppId });
      this.started = Date.now();
      await this.client.setActivity({ details: `Minecraft ${version}`, state: 'Dih PvP Client', startTimestamp: this.started, instance: false });
    } catch (e) { this.logger.warn('Discord RPC başlatılamadı', e?.message || ''); this.client = null; }
  }

  async stop() {
    try { await this.client?.clearActivity(); this.client?.destroy(); } catch {}
    this.client = null;
  }
}

module.exports = { RpcService };
