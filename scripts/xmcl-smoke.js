'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const core = await import('@xmcl/core');
  const installer = await import('@xmcl/installer');
  const user = await import('@xmcl/user');

  const requiredCore = ['launch', 'Version', 'MinecraftFolder'];
  const requiredInstaller = [
    'getVersionList',
    'installVersionTask',
    'installLibrariesTask',
    'installAssetsTask',
    'getLoaderArtifactListFor',
    'installFabricByLoaderArtifact'
  ];
  const requiredUser = ['MicrosoftAuthenticator', 'MojangClient'];

  for (const name of requiredCore) if (!core[name]) throw new Error(`@xmcl/core export missing: ${name}`);
  for (const name of requiredInstaller) if (typeof installer[name] !== 'function') throw new Error(`@xmcl/installer export missing: ${name}`);
  for (const name of requiredUser) if (!user[name]) throw new Error(`@xmcl/user export missing: ${name}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dih-xmcl-smoke-'));
  try {
    const location = core.MinecraftFolder.from(tmp);
    const task = installer.installVersionTask({ id: 'dih-smoke', url: 'https://example.invalid/version.json' }, location, { side: 'client' });
    if (!task || typeof task.startAndWait !== 'function' || typeof task.cancel !== 'function') throw new Error('XMCL split task API shape mismatch');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('XMCL runtime API smoke-test: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
