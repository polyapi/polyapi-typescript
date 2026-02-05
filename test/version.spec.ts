import { execSync } from 'child_process';
import fs from 'fs';
import shell from 'shelljs';
import { confirm } from '@inquirer/prompts';
import { loadConfig } from '../src/config';
import { getPackageManager } from '../src/dependencies';

jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('fs', () => ({ existsSync: jest.fn(), readFileSync: jest.fn() }));
jest.mock('@inquirer/prompts', () => ({ confirm: jest.fn() }));
jest.mock('../src/config', () => ({ loadConfig: jest.fn() }));
jest.mock('../src/dependencies', () => ({ getPackageManager: jest.fn() }));
jest.mock('shelljs', () => ({ echo: jest.fn(), exec: jest.fn() }));
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    red: (value: string) => value,
    yellow: (value: string) => value,
  },
}));

const execSyncMock = execSync as jest.MockedFunction<typeof execSync>;
const existsSyncMock = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const readFileSyncMock = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const confirmMock = confirm as jest.MockedFunction<typeof confirm>;
const loadConfigMock = loadConfig as jest.MockedFunction<typeof loadConfig>;
const getPackageManagerMock = getPackageManager as jest.MockedFunction<
  typeof getPackageManager
>;
const shellExecMock = shell.exec as jest.MockedFunction<typeof shell.exec>;
const shellEchoMock = shell.echo as jest.MockedFunction<typeof shell.echo>;

const mockPackageVersion = (version: string) => {
  existsSyncMock.mockImplementation((filePath) =>
    filePath.toString().endsWith('/package.json'),
  );
  readFileSyncMock.mockReturnValue(
    JSON.stringify({ version }),
  );
};

describe('checkForClientVersionUpdate', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockPackageVersion('0.25.0');
    getPackageManagerMock.mockReturnValue('npm');
    shellExecMock.mockReturnValue({ code: 0 } as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('updates when newer tenant tag is available and user confirms', async () => {
    process.env.POLY_TENANT_TAG = 'na1';
    execSyncMock.mockReturnValue(
      JSON.stringify({ na1: '0.25.17', latest: '0.25.17' }),
    );
    confirmMock.mockResolvedValue(true as any);

    const { checkForClientVersionUpdate } = await import('../src/version');
    await checkForClientVersionUpdate('node_modules/.poly');

    expect(confirmMock).toHaveBeenCalled();
    expect(shellExecMock).toHaveBeenCalledWith(
      'npm install -g polyapi@na1',
    );
  });

  test('does not prompt when current version is up to date', async () => {
    process.env.POLY_TENANT_TAG = 'na1';
    mockPackageVersion('0.25.17');
    execSyncMock.mockReturnValue(
      JSON.stringify({ na1: '0.25.17' }),
    );

    const { checkForClientVersionUpdate } = await import('../src/version');
    await checkForClientVersionUpdate('node_modules/.poly');

    expect(confirmMock).not.toHaveBeenCalled();
    expect(shellExecMock).not.toHaveBeenCalled();
  });

  test('derives tenant tag from base URL and continues when user declines', async () => {
    loadConfigMock.mockReturnValue({
      POLY_API_BASE_URL: 'https://na2.polyapi.io',
    } as any);
    execSyncMock.mockReturnValue(
      JSON.stringify({ na2: '0.25.9' }),
    );
    confirmMock.mockResolvedValue(false as any);

    const { checkForClientVersionUpdate } = await import('../src/version');
    await checkForClientVersionUpdate('node_modules/.poly');

    expect(confirmMock).toHaveBeenCalled();
    expect(shellExecMock).not.toHaveBeenCalled();
    expect(shellEchoMock).toHaveBeenCalledWith(
      expect.stringContaining('Continuing with older Poly client version'),
    );
  });

  test('skips check when tenant tag cannot be resolved', async () => {
    loadConfigMock.mockReturnValue({
      POLY_API_BASE_URL: 'https://unknown.polyapi.io',
    } as any);

    const { checkForClientVersionUpdate } = await import('../src/version');
    await checkForClientVersionUpdate('node_modules/.poly');

    expect(execSyncMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });
});