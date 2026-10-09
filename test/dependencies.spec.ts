/// <reference types="jest" />
import { checkTsConfig } from '../src/dependencies';

const steps = (currentConfig: string | undefined) => {
  const saved: string[] = [];
  return {
    saved,
    async getCurrentConfig() {
      return currentConfig;
    },
    async requestUserPermissionToCreateTsConfig() {
      return false;
    },
    async requestUserPermissionToUpdateTsConfig() {
      return true;
    },
    async saveTsConfig(tsConfig: string) {
      saved.push(tsConfig);
    },
  };
};

describe('checkTsConfig', () => {
  test('accepts trailing commas and comments', async () => {
    const config = steps(`{
      // kept by the TypeScript parser
      "compilerOptions": {
        "esModuleInterop": true,
      },
    }
`);
    await checkTsConfig(config);
    expect(config.saved).toEqual([]);
  });

  test('still updates a config that is missing esModuleInterop', async () => {
    const config = steps(`{
      "compilerOptions": {
        "target": "es2021",
      },
    }
`);
    await checkTsConfig(config);
    expect(JSON.parse(config.saved[0]).compilerOptions).toMatchObject({
      target: 'es2021',
      esModuleInterop: true,
    });
  });
});
