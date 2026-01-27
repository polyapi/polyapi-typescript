import shell from 'shelljs';
import { input, rawlist, confirm } from '@inquirer/prompts';
import fs from 'fs';
import { loadConfig, saveConfig } from '../config';
import chalk from 'chalk';
import axios from 'axios';
import path from 'path';
import AdmZip from 'adm-zip';
import {
  checkNodeVersion,
  checkLibraryVersions,
  getUpdateLibraryVersionMessage,
  checkTsConfig,
  getPackageManager,
} from '../dependencies';
import { getAuthData, getProjectTemplatesConfig } from '../api';
import { handleAxiosError, validateBaseUrl, URL_REGEX } from '../utils';

const setup = async (
  polyPath: string,
  baseUrl?: string,
  apiKey?: string,
  apiVersion = '1',
) => {
  try {
    loadConfig(polyPath);
    process.env.POLY_API_KEY = process.env.POLY_API_KEY || apiVersion;

    const isNonInteractive = baseUrl && apiKey;
    baseUrl = validateBaseUrl(baseUrl);

    if (!process.env.ENVIRONMENT_SETUP_COMPLETE) {
      await setupEnvironment(polyPath);
    }

    let polyApiBaseUrl = baseUrl;
    let polyApiKey = apiKey;

    if (!isNonInteractive) {
      await shell.echo('Please setup your connection to Poly service.');
      polyApiBaseUrl = await input({
        message: 'Poly API Base URL:',
        default: process.env.POLY_API_BASE_URL || 'https://na1.polyapi.io',
        transformer: (value) => value.trim(),
        validate: (url) => {
          if (!URL_REGEX.test(url)) {
            return 'Given URL is not valid. Please enter a valid URL.';
          }
          return true;
        },
      });

      polyApiBaseUrl = validateBaseUrl(polyApiBaseUrl);
      polyApiKey = await input({
        message: 'Poly App Key or User Key:',
        default: process.env.POLY_API_KEY? '*'.repeat(8) + process.env.POLY_API_KEY.slice(-4): '',
        transformer: (value) => value.trim(),
      });
      polyApiKey = polyApiKey[0] === '*'? process.env.POLY_API_KEY: polyApiKey;

      if (process.env.ENVIRONMENT_SETUP_COMPLETE !== 'true') {
        const {
          tenant: { id: tenantId },
          environment: { id: environmentId },
        } = await getAuthData(polyApiBaseUrl, polyApiKey);
        const projectTemplatesConfig = await getProjectTemplatesConfig(
          polyApiBaseUrl,
          polyApiKey,
          tenantId,
          environmentId,
        );
        const templateChoices = [
          { name: 'No (empty project)', value: null },
          ...projectTemplatesConfig.templates
            .filter((template) => template.typescript)
            .map((template) => ({
              name: template.name,
              value: template.typescript,
            })),
        ];

        const projectTemplateFileUrl = await rawlist({
          message: 'Do you want to use a project template?',
          choices: templateChoices,
        });

        if (
          projectTemplateFileUrl &&
          typeof projectTemplateFileUrl === 'string'
        ) {
          await initProjectStructure(projectTemplateFileUrl);
        }
      }
    }

    polyApiBaseUrl = validateBaseUrl(polyApiBaseUrl);
    saveConfig(polyPath, {
      POLY_API_BASE_URL: polyApiBaseUrl,
      POLY_API_KEY: polyApiKey,
      API_VERSION: apiVersion || '1',
      DISABLE_AI: process.env.DISABLE_AI || 'false',
      NO_COLOR: process.env.NO_COLOR || 'false',
      ENVIRONMENT_SETUP_COMPLETE: 'true',
    });

    shell.echo(chalk.green('Poly setup complete.'));
  } catch (error) {
    const errorMessage = handleAxiosError(error, axios);
    shell.echo(chalk.redBright('ERROR:'), errorMessage);
  }
};

const initProjectStructure = async (fileUrl: string) => {
  try {
    shell.echo('-n', 'Downloading project template...');
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
    });

    const fileName = path.basename(fileUrl);
    const filePath = path.join(process.cwd(), fileName);
    fs.writeFileSync(filePath, response.data);
    shell.echo(chalk.green('DONE'));

    shell.echo('-n', 'Extracting project template...');
    const zip = new AdmZip(filePath);
    zip.extractAllTo(process.cwd(), true);
    shell.echo(chalk.green('DONE'));

    const zipBaseName = path.parse(filePath).name;
    const extractedDirPath = path.join(process.cwd(), zipBaseName);

    // Check if single directory with same name as zip file exists
    if (
      fs.existsSync(extractedDirPath) &&
      fs.statSync(extractedDirPath).isDirectory()
    ) {
      // Move all contents to current directory and remove extracted directory
      shell.mv(`${extractedDirPath}/*`, process.cwd());
      fs.rmdirSync(extractedDirPath);
    }

    fs.unlinkSync(filePath);
  } catch (error) {
    shell.echo(chalk.red('ERROR'));
    shell.echo(
      chalk.red(
        'Project template cannot be downloaded or extracted. Continuing...',
      ),
    );
  }
};

const setupEnvironment = async (polyPath: string) => {
  loadConfig(polyPath);

  checkNodeVersion({
    onOldVersion(message) {
      shell.echo(chalk.red(message));
      throw new Error('Node.js version is too old.');
    },
  });

  const packageJson = getPackageJson();

  await checkLibraryVersions(packageJson, {
    async createOrUpdateLib(library, create) {
      await shell.echo(`${create ? 'Installing' : 'Updating'} ${library}...`);
      await shell.exec(`${getPackageManager()} add ${library}@latest`);
    },

    async requestUserPermissionToUpdateLib(library, version, minVersion) {
      const updateVersion = await confirm({
        message: getUpdateLibraryVersionMessage(version, minVersion, library),
        default: true,
      });

      return updateVersion;
    },
  });

  await checkTsConfig({
    async getCurrentConfig() {
      if (!fs.existsSync(`${process.cwd()}/tsconfig.json`)) {
        return undefined;
      }

      return fs.readFileSync(`${process.cwd()}/tsconfig.json`).toString();
    },
    async requestUserPermissionToCreateTsConfig() {
      const createTsConfig = await confirm({
        message: 'tsconfig.json does not exist. Do you want to create it?',
        default: true,
      });

      return createTsConfig;
    },
    async requestUserPermissionToUpdateTsConfig() {
      const updateTsConfig = await confirm({
        message:
          'tsconfig.json does not have esModuleInterop set to true. Do you want to update it?',
        default: true,
      });

      return updateTsConfig;
    },
    async saveTsConfig(tsConfig) {
      fs.writeFileSync(`${process.cwd()}/tsconfig.json`, tsConfig);
    },
  });

  shell.exec(`${getPackageManager()} install`);
};

const getPackageJson = () => {
  let packageJson: Buffer | undefined;

  try {
    packageJson = fs.readFileSync(`${process.cwd()}/package.json`);
  } catch (error) {
    throw new Error(
      `Failed to open package.json file, details: ${error.message}`,
    );
  }

  try {
    const contents = JSON.parse(packageJson.toString());

    return contents;
  } catch (error) {
    throw new Error(
      'package.json file contains JSON syntax errors, please fix and try again.',
    );
  }
};

export default setup;
