import fs from 'fs';
import dotenv from 'dotenv';

const getPolyConfigDirPath = (polyPath: string) =>
  // If path does not start with `./` or `/` then we adjust!
  /^\.?\/.*/.test(polyPath) ? polyPath : `${__dirname}/../../../${polyPath}`;

const getPolyConfigFilePath = (polyPath: string) =>
  `${getPolyConfigDirPath(polyPath)}/.config.env`;

export const loadConfig = (polyPath: string): Record<string, string> | undefined => {
  const configFilePath = getPolyConfigFilePath(polyPath);
  if (fs.existsSync(configFilePath)) {
    const result = dotenv.config({
      path: configFilePath,
      override: process.env.CONFIG_ENV_PATH_PRIORITY === 'true',
    });

    return result.parsed;
  }
  return undefined;
};

export const saveConfig = (polyPath: string, config: Record<string, string>) => {
  fs.mkdirSync(getPolyConfigDirPath(polyPath), { recursive: true });
  fs.writeFileSync(
    getPolyConfigFilePath(polyPath),
    Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
};

export const addOrUpdateConfig = (polyPath: string, key: string, value: string) => {
  const existingConfig = loadConfig(polyPath) ?? {};

  existingConfig[key] = value;

  saveConfig(polyPath, existingConfig);
};