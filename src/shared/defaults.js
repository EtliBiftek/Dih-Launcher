'use strict';

module.exports = {
  github: { owner: '', repo: '', branch: 'main', versionsRoot: 'sürümler' },
  updates: { enabled: true, owner: '', repo: '', prerelease: false, requireChecksum: true },
  microsoftClientId: '',
  minMemoryMb: 1024,
  maxMemoryMb: 4096,
  width: 1280,
  height: 720,
  fullscreen: false,
  javaPath: '',
  autoJava: true,
  javaArgs: [],
  gameArgs: [],
  closeLauncherOnGameStart: false,
  keepLauncherHiddenWhilePlaying: true,
  autoCheckUpdates: true,
  discordRpc: false,
  discordAppId: '',
  selectedVersion: '',
  client: {
    enabled: true,
    scale: 1,
    zoomFactor: 4,
    lowFireOffset: 0.45,
    hitColor: -43691,
    timeOfDay: 6000,
    positions: {},
    modules: {
      keystrokes: true, cps: true, fps: true, ping: true, armorHud: true, potionHud: true,
      toggleSprint: true, toggleSneak: true, zoom: true, backview: true, perspective: true,
      reachDisplay: true, tntTime: true, timer: true, timeChanger: false, fullbright: false,
      lowFire: true, crosshair: false, hitColor: false
    }
  }
};
