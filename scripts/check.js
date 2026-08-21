'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const roots = [path.join(__dirname, '..', 'src'), path.join(__dirname, '..', 'scripts')];
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } }
roots.forEach(walk);
let bad = 0;
for (const file of files) {
  const r = cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error(`FAIL ${file}\n${r.stderr}`); }
  else console.log(`OK   ${path.relative(path.join(__dirname, '..'), file)}`);
}
process.exitCode = bad ? 1 : 0;
