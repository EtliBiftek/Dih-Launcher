'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STALL_MS = 90_000;
const CONCURRENCY = 4;

function fmt(n) {
  n = Number(n) || 0;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

async function runTask(factory, label) {
  const task = factory();
  if (!task || typeof task.startAndWait !== 'function') throw new Error(`${label}: task API missing`);
  let lastAdvance = Date.now();
  let lastRoot = Number(task.progress) || 0;
  let lastLog = 0;
  let rejectStall;
  const stalled = new Promise((_, reject) => { rejectStall = reject; });
  const context = {
    onStart(t) { console.log(`[${label}] start ${t?.path || t?.name || ''}`); lastAdvance = Date.now(); },
    onUpdate(t, chunk) {
      if ((Number(chunk) || 0) > 0) lastAdvance = Date.now();
      const root = Number(task.progress) || 0;
      if (root > lastRoot) { lastRoot = root; lastAdvance = Date.now(); }
      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        console.log(`[${label}] ${fmt(task.progress)} / ${fmt(task.total)} • child=${t?.path || t?.name || ''}`);
      }
    },
    onFailed(t, e) { console.error(`[${label}] failed ${t?.path || t?.name || ''}`, e); },
    onSucceed(t) { console.log(`[${label}] success ${t?.path || t?.name || ''}`); lastAdvance = Date.now(); },
    onCancelled(t) { console.warn(`[${label}] cancelled ${t?.path || t?.name || ''}`); }
  };
  const timer = setInterval(() => {
    const root = Number(task.progress) || 0;
    if (root > lastRoot) { lastRoot = root; lastAdvance = Date.now(); }
    if (Number(task.total) > 0 && root < Number(task.total) && Date.now() - lastAdvance >= STALL_MS) {
      clearInterval(timer);
      Promise.resolve(task.cancel?.(5000)).catch(() => {});
      rejectStall(Object.assign(new Error(`${label} stalled at ${fmt(root)} / ${fmt(task.total)}`), { code: 'E2E_STALL' }));
    }
  }, 1000);
  try {
    return await Promise.race([task.startAndWait(context), stalled]);
  } finally {
    clearInterval(timer);
  }
}

async function check() {
  const installer = await import('@xmcl/installer');
  const core = await import('@xmcl/core');
  const versions = await installer.getVersionList();
  const meta = versions?.versions?.find((v) => v.id === '26.2');
  if (!meta) throw new Error('Mojang metadata does not contain Minecraft 26.2');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dih-mc-26.2-e2e-'));
  console.log(`E2E root: ${root}`);
  try {
    const location = core.MinecraftFolder.from(root);
    const common = {
      side: 'client',
      assetsDownloadConcurrency: CONCURRENCY,
      librariesDownloadConcurrency: CONCURRENCY,
      throwErrorImmediately: true
    };

    const resolved = await runTask(
      () => installer.installVersionTask(meta, location, common),
      'vanilla-version'
    );
    await runTask(
      () => installer.installLibrariesTask(resolved, { ...common, librariesDownloadConcurrency: CONCURRENCY }),
      'vanilla-libraries'
    );
    await runTask(
      () => installer.installAssetsTask(resolved, { ...common, assetsDownloadConcurrency: CONCURRENCY, prevalidSizeOnly: true }),
      'vanilla-assets'
    );

    const loaders = await installer.getLoaderArtifactListFor('26.2');
    const loaderArtifact = loaders.find((x) => x?.loader?.stable) || loaders[0];
    if (!loaderArtifact) throw new Error('Fabric loader metadata is empty for 26.2');
    const fabricId = await installer.installFabricByLoaderArtifact(loaderArtifact, location, { inheritsFrom: '26.2' });
    const fabricResolved = await core.Version.parse(location, fabricId);
    await runTask(
      () => installer.installLibrariesTask(fabricResolved, { librariesDownloadConcurrency: CONCURRENCY, throwErrorImmediately: true }),
      'fabric-libraries'
    );

    console.log(`XMCL full install E2E: OK (Minecraft 26.2 + Fabric ${loaderArtifact?.loader?.version || loaderArtifact?.version || ''})`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

check().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
