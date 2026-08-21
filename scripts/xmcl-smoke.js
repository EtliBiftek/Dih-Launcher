'use strict';

(async () => {
  const core = await import('@xmcl/core');
  const installer = await import('@xmcl/installer');
  const user = await import('@xmcl/user');

  const requiredCore = ['launch', 'Version', 'MinecraftFolder'];
  const requiredInstaller = ['getVersionList', 'installMinecraft', 'completeInstallation', 'getLoaderArtifactListFor', 'installFabricByLoaderArtifact'];
  const requiredUser = ['MicrosoftAuthenticator', 'MojangClient'];

  for (const name of requiredCore) {
    if (!core[name]) throw new Error(`@xmcl/core export missing: ${name}`);
  }
  for (const name of requiredInstaller) {
    if (typeof installer[name] !== 'function') throw new Error(`@xmcl/installer export missing: ${name}`);
  }
  for (const name of requiredUser) {
    if (!user[name]) throw new Error(`@xmcl/user export missing: ${name}`);
  }

  console.log('XMCL runtime API smoke-test: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
