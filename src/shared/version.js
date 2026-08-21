'use strict';

function parseVersion(value) {
  const clean = String(value || '0.0.0').trim().replace(/^v/i, '');
  const [core, pre = ''] = clean.split('-', 2);
  const nums = core.split('.').map((x) => Number.parseInt(x, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums: nums.slice(0, 3), pre };
}

function compareVersions(a, b) {
  const aa = parseVersion(a); const bb = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (aa.nums[i] !== bb.nums[i]) return aa.nums[i] > bb.nums[i] ? 1 : -1;
  }
  if (aa.pre === bb.pre) return 0;
  if (!aa.pre) return 1;
  if (!bb.pre) return -1;
  return aa.pre.localeCompare(bb.pre, undefined, { numeric: true, sensitivity: 'base' });
}

function newer(a, b) { return compareVersions(a, b) > 0; }
module.exports = { parseVersion, compareVersions, newer };
