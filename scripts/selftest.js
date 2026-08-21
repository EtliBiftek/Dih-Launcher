'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { newer } = require('../src/main/updater-service');
const { analyzeCrash } = require('../src/main/crash-analyzer');
const { ConfigStore } = require('../src/main/config-store');
const { GitHubService } = require('../src/main/github-service');

assert.equal(newer('0.5.1', '0.5.0'), true);
assert.equal(newer('0.5.0', '0.5.0'), false);
assert.equal(newer('1.0.0', '0.99.99'), true);

const oom = analyzeCrash(['java.lang.OutOfMemoryError: Java heap space'], 1);
assert.equal(oom.crashed, true);
assert.match(String(oom.reason), /RAM|bellek|memory/i);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dih-test-'));
const app = { getPath: () => tmp };
const store = new ConfigStore(app);
const saved = store.set({ minMemoryMb: 2048, maxMemoryMb: 1024, client: { scale: 99, timeOfDay: -1 } });
assert.equal(saved.minMemoryMb, 2048);
assert.equal(saved.maxMemoryMb, 2048);
assert.equal(saved.client.scale, 2);
assert.equal(saved.client.timeOfDay, 0);

const ghStore = { get: () => ({ github: { owner: 'x', repo: 'y', branch: 'main', versionsRoot: 'sürümler' } }) };
const gh = new GitHubService(ghStore, { info() {}, warn() {} });
assert.equal(gh.safeRelative({ path: 'sürümler/1.21.11/mods/a.jar', name: 'a.jar' }, 'sürümler/1.21.11/mods'), 'a.jar');
assert.throws(() => gh.safeRelative({ path: 'x/../evil.jar', name: '../evil.jar' }, 'x'), /Geçersiz/);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Dih self-test: OK');
