import { resolve } from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  cookieSecure: boolean;
  logLevel: string;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    host: env.HOST || '0.0.0.0',
    dataDir: resolve(env.DATA_DIR || './data'),
    cookieSecure: env.COOKIE_SECURE === 'true',
    logLevel: env.LOG_LEVEL || 'info',
  };
}
