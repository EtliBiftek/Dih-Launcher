'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

class Logger {
  constructor(app) {
    this.dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, 'launcher.log');
    this.gameFile = path.join(this.dir, 'minecraft-latest.log');
    this.gameRing = [];
  }

  line(level, message, extra = '') {
    const text = `[${new Date().toISOString()}] [${level}] ${message}${extra ? ` ${extra}` : ''}\n`;
    fs.appendFileSync(this.file, text, 'utf8');
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') console.log(text.trim());
  }

  info(message, extra) { this.line('INFO', message, extra); }
  warn(message, extra) { this.line('WARN', message, extra); }
  error(message, error) { this.line('ERROR', message, error?.stack || error?.message || String(error || '')); }

  resetGameLog() {
    this.gameRing = [];
    fs.writeFileSync(this.gameFile, '', 'utf8');
  }

  game(stream, chunk) {
    const text = String(chunk || '').replace(/\r/g, '');
    if (!text) return;
    const lines = text.split('\n').filter(Boolean).map((x) => `[${stream}] ${x}`);
    this.gameRing.push(...lines);
    if (this.gameRing.length > 1000) this.gameRing.splice(0, this.gameRing.length - 1000);
    fs.appendFileSync(this.gameFile, `${lines.join('\n')}\n`, 'utf8');
  }

  recentGameLines(limit = 250) { return this.gameRing.slice(-Math.max(1, Math.min(1000, Number(limit) || 250))); }
  async readLauncherTail(limit = 250) {
    try {
      const text = await fsp.readFile(this.file, 'utf8');
      return text.split(/\r?\n/).filter(Boolean).slice(-limit);
    } catch { return []; }
  }
}

module.exports = { Logger };
