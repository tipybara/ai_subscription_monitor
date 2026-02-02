import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface ManualConfig {
  usage_text?: string;
  reset_time?: string;
  limit_note?: string;
}

export interface Config {
  manual?: Record<string, ManualConfig>;
  api_keys?: Record<string, string>; // Legacy support, though not used much now
}

export function loadConfig(configDir: string = '.'): Config {
  const configPath = path.resolve(configDir, 'config.yaml');
  const examplePath = path.resolve(configDir, 'config.example.yaml');
  
  let targetPath = '';
  if (fs.existsSync(configPath)) {
    targetPath = configPath;
  } else if (fs.existsSync(examplePath)) {
    targetPath = examplePath;
  } else {
    return {};
  }

  try {
    const content = fs.readFileSync(targetPath, 'utf8');
    return (yaml.load(content) as Config) || {};
  } catch (e) {
    console.warn('Failed to load config:', e);
    return {};
  }
}
