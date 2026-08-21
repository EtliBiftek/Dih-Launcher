'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { ConfigStore } = require('./config-store');
const { Logger } = require('./logger');
const { GitHubService } = require('./github-service');
const { JavaManager } = require('./java-manager');
const { AuthService } = require('./auth-service');
const { ClientConfigService } = require('./client-config-service');
const { RpcService } = require('./rpc-service');
const { UpdaterService } = require('./updater-service');
const { MinecraftService } = require('./minecraft-service');

let mainWindow;
let services;
const SAFE_VERSION = /^[0-9A-Za-z._+\-]{1,80}$/;
function versionArg(value) { const v = String(value || ''); if (!SAFE_VERSION.test(v)) throw new Error('Geçersiz sürüm kimliği.'); return v; }

function send(channel, payload) {
  if (channel === 'game-state' && mainWindow && !mainWindow.isDestroyed()) {
    const cfg = services?.config?.get?.() || {};
    if (payload?.running && (cfg.closeLauncherOnGameStart || cfg.keepLauncherHiddenWhilePlaying)) mainWindow.hide();
    if (!payload?.running && cfg.keepLauncherHiddenWhilePlaying) { mainWindow.show(); mainWindow.focus(); }
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 660,
    backgroundColor: '#08090b',
    title: 'Dih',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
}

function registerIpc() {
  const { config, github, auth, minecraft, logger, updater, clientConfig } = services;
  ipcMain.handle('config:get', () => config.get());
  ipcMain.handle('config:set', (_e, patch) => config.set(patch || {}));
  ipcMain.handle('client:get', () => clientConfig.get());
  ipcMain.handle('client:set', (_e, patch) => clientConfig.set(patch || {}));

  ipcMain.handle('versions:list', () => github.listVersions());
  ipcMain.handle('versions:manifest', (_e, version) => github.getVersionManifest(versionArg(version), true));

  ipcMain.handle('auth:get', () => auth.publicAccount());
  ipcMain.handle('auth:list', () => auth.listAccounts());
  ipcMain.handle('auth:login', async () => {
    try { return await auth.login(); }
    catch (e) { logger.error('Microsoft giriş hatası', e); throw e; }
  });
  ipcMain.handle('auth:select', (_e, id) => auth.select(String(id)));
  ipcMain.handle('auth:remove', (_e, id) => auth.remove(String(id)));
  ipcMain.handle('auth:logout', () => auth.logout());
  ipcMain.handle('auth:cancel-login', () => auth.cancelLogin());

  ipcMain.handle('game:state', () => minecraft.state());
  ipcMain.handle('game:launch', async (_e, version) => {
    try { return await minecraft.launch(versionArg(version)); }
    catch (e) { logger.error('Oyun başlatılamadı', e); send('game-state', { running: false, error: e.message }); throw e; }
  });
  ipcMain.handle('game:kill', () => minecraft.kill());
  ipcMain.handle('game:cancel-prepare', () => minecraft.cancelPrepare());
  ipcMain.handle('game:repair', (_e, version) => minecraft.repair(versionArg(version)));
  ipcMain.handle('game:reset', (_e, version) => minecraft.resetInstance(versionArg(version)));
  ipcMain.handle('logs:game', (_e, limit) => logger.recentGameLines(limit));
  ipcMain.handle('logs:launcher', (_e, limit) => logger.readLauncherTail(limit));

  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:download', () => updater.download());
  ipcMain.handle('update:install', () => updater.install());

  ipcMain.handle('app:open-data-folder', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:open-instance-folder', (_e, version) => shell.openPath(minecraft.instanceDir(versionArg(version))));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:confirm', async (_e, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: options?.danger ? 'warning' : 'question',
      buttons: ['İptal', 'Devam et'], defaultId: 0, cancelId: 0,
      title: options?.title || 'Dih', message: options?.message || 'Devam etmek istiyor musun?'
    });
    return result.response === 1;
  });
}

app.whenReady().then(async () => {
  const config = new ConfigStore(app);
  const logger = new Logger(app);
  const github = new GitHubService(config, logger);
  const javaManager = new JavaManager(app, config, logger);
  const auth = new AuthService(app, config, logger, send);
  const clientConfig = new ClientConfigService(config);
  const rpc = new RpcService(config, logger);
  const updater = new UpdaterService(app, config, logger, send);
  const minecraft = new MinecraftService(app, config, github, javaManager, auth, clientConfig, rpc, logger, send);
  services = { config, logger, github, javaManager, auth, clientConfig, rpc, updater, minecraft };
  registerIpc();
  await createWindow();
  await auth.loadStored().catch(() => null);

  if (config.get().autoCheckUpdates) {
    updater.check().then((result) => { if (result.available) send('update-available', result); }).catch((e) => logger.warn('Güncelleme kontrolü', e.message));
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
