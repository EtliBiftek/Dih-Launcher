'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const pkg = require('../package.json');
const defaults = require('../src/shared/defaults');
const { validateVersion } = require('../src/main/minecraft-service');

assert.match(pkg.version, /^\d+\.\d+\.\d+(?:[-+].+)?$/);
assert.equal(validateVersion('1.21.11'), '1.21.11');
assert.throws(() => validateVersion('../evil'));
assert.equal(defaults.updates.requireChecksum, true);

for (const file of ['dih.config.example.json', 'examples/version-dih.json', 'client-mod/reference-1.21.11/src/main/resources/fabric.mod.json', 'client-mod/reference-1.21.11/src/main/resources/dih.client.mixins.json']) {
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
}
const props = fs.readFileSync(path.join(__dirname, '..', 'client-mod/reference-1.21.11/gradle.properties'), 'utf8');
assert.match(props, /minecraft_version=1\.21\.11/);
assert.match(props, /fabric_api_version=0\.141\.6\+1\.21\.11/);
assert.match(props, /loom_version=1\.17\.19/);

const auth = fs.readFileSync(path.join(__dirname, '..', 'src/main/auth-service.js'), 'utf8');
assert(!auth.includes('return `plain:'));
const main = fs.readFileSync(path.join(__dirname, '..', 'src/main/main.js'), 'utf8');
assert.match(main, /sandbox:\s*true/);
console.log('Dih release-check: OK');
