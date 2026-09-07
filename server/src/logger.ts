import { config } from './config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(config.logLevel as Level) in LEVELS ? (config.logLevel as Level) : 'info'];

function fmt(level: Level, args: unknown[]): string {
  const time = new Date().toISOString();
  let meta = '';
  let msg = '';
  for (const a of args) {
    if (typeof a === 'string') msg += (msg ? ' ' : '') + a;
    else if (a instanceof Error) meta += ` ${a.stack ?? a.message}`;
    else if (a && typeof a === 'object') {
      const o = { ...(a as Record<string, unknown>) };
      if (o.err instanceof Error) o.err = o.err.message;
      meta += ' ' + JSON.stringify(o);
    }
  }
  return `${time} [${level.toUpperCase().padEnd(5)}] ${msg}${meta}`;
}

function make(level: Level) {
  return (...args: unknown[]) => {
    if (LEVELS[level] < threshold) return;
    const line = fmt(level, args);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
}

export const logger = { debug: make('debug'), info: make('info'), warn: make('warn'), error: make('error') };
