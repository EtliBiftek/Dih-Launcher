'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const allowedEvents = new Set(['launch-progress', 'game-state', 'game-log', 'auth-device-code', 'auth-changed', 'update-available', 'update-progress']);
contextBridge.exposeInMainWorld('dih', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  getClientConfig: () => ipcRenderer.invoke('client:get'),
  saveClientConfig: (patch) => ipcRenderer.invoke('client:set', patch),
  listVersions: () => ipcRenderer.invoke('versions:list'),
  getVersionManifest: (version) => ipcRenderer.invoke('versions:manifest', version),
  loginMicrosoft: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  cancelLogin: () => ipcRenderer.invoke('auth:cancel-login'),
  getAccount: () => ipcRenderer.invoke('auth:get'),
  listAccounts: () => ipcRenderer.invoke('auth:list'),
  selectAccount: (id) => ipcRenderer.invoke('auth:select', id),
  removeAccount: (id) => ipcRenderer.invoke('auth:remove', id),
  getGameState: () => ipcRenderer.invoke('game:state'),
  launch: (version) => ipcRenderer.invoke('game:launch', version),
  killGame: () => ipcRenderer.invoke('game:kill'),
  cancelPrepare: () => ipcRenderer.invoke('game:cancel-prepare'),
  repair: (version) => ipcRenderer.invoke('game:repair', version),
  resetInstance: (version) => ipcRenderer.invoke('game:reset', version),
  getGameLogs: (limit) => ipcRenderer.invoke('logs:game', limit),
  getLauncherLogs: (limit) => ipcRenderer.invoke('logs:launcher', limit),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  openInstanceFolder: (version) => ipcRenderer.invoke('app:open-instance-folder', version),
  appVersion: () => ipcRenderer.invoke('app:version'),
  confirm: (options) => ipcRenderer.invoke('app:confirm', options),
  on: (channel, callback) => {
    if (!allowedEvents.has(channel) || typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
