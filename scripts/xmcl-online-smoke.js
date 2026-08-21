'use strict';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function check() {
  const installer = await import('@xmcl/installer');
  const versions = await installer.getVersionList();
  if (!Array.isArray(versions?.versions) || !versions.versions.some((v) => v.id === '1.21.11')) {
    throw new Error('Mojang metadata does not contain Minecraft 1.21.11');
  }
  const loaders = await installer.getLoaderArtifactListFor('1.21.11');
  if (!Array.isArray(loaders) || !loaders.length) throw new Error('Fabric loader metadata is empty for 1.21.11');
  const loaderVersion = loaders[0]?.loader?.version || loaders[0]?.version;
  if (!loaderVersion) throw new Error('Fabric loader metadata is invalid');
  console.log(`XMCL online metadata smoke-test: OK (Fabric ${loaderVersion})`);
}

(async () => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Online smoke attempt ${attempt}/3 failed: ${error.message}`);
      if (attempt < 3) await delay(attempt * 3000);
    }
  }
  throw lastError;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
