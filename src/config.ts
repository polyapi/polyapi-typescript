import fs from 'fs';
import dotenv from 'dotenv';

const getPolyConfigDirPath = (polyPath: string) =>
  // If path does not start with `./` or `/` then we adjust!
  /^\.?\/.*/.test(polyPath) ? polyPath : `${__dirname}/../../../../../${polyPath}`;

const getPolyConfigFilePath = (polyPath: string) =>
  `${getPolyConfigDirPath(polyPath)}/.config.env`;

export const loadConfig = (polyPath: string) => {
  const configFilePath = getPolyConfigFilePath(polyPath);
  if (fs.existsSync(configFilePath)) {
    dotenv.config({ path: configFilePath, override: process.env.CONFIG_ENV_PATH_PRIORITY === 'true' });
  }
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
