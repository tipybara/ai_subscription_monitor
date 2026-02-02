import fs from 'fs';
import path from 'path';
import os from 'os';
import { execCommand } from './utils.js';

interface CacheEntry {
  value: string | null;
  timestamp: number;
}

interface CacheData {
  [serviceName: string]: CacheEntry;
}

const DEFAULT_TTL = 30 * 60 * 1000;

function getTmpDir(): string {
  return os.tmpdir();
}

function getCachePath(): string {
  const uid = process.getuid ? process.getuid() : os.userInfo().uid;
  return path.join(getTmpDir(), `ai-sub-keychain-cache-${uid}.json`);
}

function loadCache(): CacheData {
  try {
    const cachePath = getCachePath();
    if (!fs.existsSync(cachePath)) return {};
    const content = fs.readFileSync(cachePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function saveCache(cache: CacheData): void {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch {
  }
}

export async function getKeychainPassword(serviceName: string, ttl: number = DEFAULT_TTL): Promise<string | null> {
  const now = Date.now();
  const cache = loadCache();
  const cached = cache[serviceName];
  
  if (cached && (now - cached.timestamp) < ttl) {
    return cached.value;
  }
  
  const { stdout } = await execCommand(`security find-generic-password -s "${serviceName}" -w`, 5000);
  const value = stdout || null;
  
  cache[serviceName] = { value, timestamp: now };
  saveCache(cache);
  
  return value;
}

export function clearCache(serviceName?: string): void {
  const cache = loadCache();
  if (serviceName) {
    delete cache[serviceName];
  } else {
    const cachePath = getCachePath();
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
    return;
  }
  saveCache(cache);
}
