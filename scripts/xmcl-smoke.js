'use strict';

(async () => {
  const core = await import('@xmcl/core');
  const installer = await import('@xmcl/installer');
  const user = await import('@xmcl/user');

  const requiredCore = ['launch', 'Version', 'MinecraftFolder'];
  const requiredInstaller = ['getVersionList', 'install', 'installDependencies', 'getLoaderArtifactListFor', 'installFabricByLoaderArtifact'];
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

  const versions = await installer.getVersionList();
  if (!Array.isArray(versions?.versions) || !versions.versions.some((v) => v.id === '1.21.11')) {
    throw new Error('XMCL/Mojang metadata smoke-test failed for Minecraft 1.21.11');
  }
  const loaders = await installer.getLoaderArtifactListFor('1.21.11');
  if (!Array.isArray(loaders) || !loaders.length) throw new Error('XMCL Fabric metadata smoke-test failed for 1.21.11');
  const loaderVersion = loaders[0]?.loader?.version || loaders[0]?.version;
  if (!loaderVersion) throw new Error('XMCL Fabric loader metadata is invalid');

  console.log(`XMCL runtime API smoke-test: OK (Fabric ${loaderVersion})`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
