'use strict';

const crypto = require('crypto');

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function validateOfflineUsername(value) {
  const name = String(value || '').trim();
  if (!USERNAME_RE.test(name)) {
    throw new Error('Offline kullanıcı adı 3-16 karakter olmalı ve yalnızca harf, rakam veya _ içermeli.');
  }
  return name;
}

function offlineUuid(username) {
  const name = validateOfflineUsername(username);
  const bytes = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x30;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString('hex');
}

module.exports = { validateOfflineUsername, offlineUuid };
