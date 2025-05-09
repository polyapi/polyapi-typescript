import shell from 'shelljs';
import { input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { createTenantSignUp, resendVerificationCode, verifyTenantSignUp } from '../api';
import { SignUpDto } from '../../../model/src/dto';
import { saveConfig } from '../config';
import { exec as execCommand } from 'child_process';
import { promisify } from 'util';
import isEmail from 'validator/lib/isEmail';

const exec = promisify(execCommand);

export const create = async (instance: string, loadedTenantSignUp: SignUpDto | null = null) => {
  let tenantSignUp: SignUpDto | null = loadedTenantSignUp;

  let credentials: {
    apiKey: string,
    apiBaseUrl: string
  } | null = null;

  let email = '';
  let tenantName: string | null = null;

  const requestEmail = async () => {
    email = await input({
      message: 'Enter your email:',
      transformer: (value) => value.trim(),
      validate: (email) => {
        if (typeof email !== 'string' || !isEmail(email)) {
          return 'Given email is not valid. Enter a valid email.';
        }
        return true;
      },
    });
  };

  const requestTenant = async () => {
    const result = await input({
      message: 'Enter your desired tenant name (optional):',
      transformer: (value) => value.trim(),
    });

    tenantName = result || null;
  };

  const signUp = async (data : 'tenant' | '' = '') => {
    try {
      if (data === 'tenant') {
        await requestTenant();
      } else {
        await requestEmail();
        await requestTenant();
        const acceptedTos = await confirm({
          message: 'Do you agree with our terms of service expressed here: https://polyapi.io/terms-of-service ?',
        });

        if (!acceptedTos) {
          return false;
        }
      }

      shell.echo('-n', '\n\nChecking email and tenant name...\n\n');

      const response = await createTenantSignUp(instance, email, tenantName);

      tenantSignUp = response;
    } catch (error) {
      shell.echo(chalk.red('ERROR\n'));
      if (error.response?.status === 409) {
        if (error.response.data.code === 'TENANT_ALREADY_EXISTS') {
          shell.echo('Tenant already in use.\n');
          return signUp('tenant');
        } else if (error.response.data.code === 'EMAIL_ALREADY_EXISTS') {
          shell.echo('Email already in use.\n');
          return signUp();
        }
      }
      shell.echo('Error during sign up process.\n');
      throw error;
    }

    return true;
  };

  try {
    if (!await signUp()) {
      return;
    }
  } catch (err) {
    return;
  }

  const verifyTenant = async (showDescription = true) => {
    if (showDescription) {
      shell.echo('A verification code has been sent to your email address', chalk.bold(`(${tenantSignUp.email}),`), 'check your email and enter your verification code. \nIf you didn\'t receive your verification code you can enter', chalk.bold('resend'), 'to send it again\n');
    }

    const code = await input({
      message: 'Enter your verification code:',
      transformer: value => value.trim(),
      validate: verificationCode => !!verificationCode.length,
    });

    if (code === 'resend') {
      try {
        shell.echo('\n\nResending your verification code...\n');

        await resendVerificationCode(instance, tenantSignUp.email);
      } catch (error) {
        shell.echo(chalk.red('ERROR\n'));
        shell.echo('Error sending verification code to', `${chalk.bold(tenantSignUp.email)}.`, '\n');
        throw error;
      }

      return verifyTenant(false);
    }

    shell.echo('-n', 'Verifying your code...\n\n');

    try {
      const response = await verifyTenantSignUp(instance, tenantSignUp.email, code);

      shell.echo(chalk.green('Tenant created successfully, details:\n'));
      shell.echo(chalk.bold('Instance url:'), response.apiBaseUrl, '\n');
      shell.echo(chalk.bold('Admin polyApiKey:'), response.apiKey, '\n');

      credentials = {
        apiBaseUrl: response.apiBaseUrl,
        apiKey: response.apiKey,
      };
    } catch (error) {
      shell.echo(chalk.red('ERROR\n'));
      if (error.response?.status === 409) {
        if (error.response?.data?.code === 'INVALID_VERIFICATION_CODE') {
          shell.echo('Wrong verification code. If you didn\'t receive your verification code, you can type', chalk.bold('resend'), 'to send a new one.');
        }

        if (error.response?.data?.code === 'EXPIRED_VERIFICATION_CODE') {
          shell.echo('Verification code has expired.\n');
          return verifyTenant();
        }

        if (error.response?.data?.code === 'TENANT_ALREADY_EXISTS') {
          shell.echo('Tenant already in use.\n');
          await signUp('tenant');
          return verifyTenant();
        }

        return verifyTenant();
      }

      shell.echo('Error during sign up process.\n');
      throw error;
    }

    return true;
  };

  try {
    if (!await verifyTenant()) {
      return;
    }
  } catch (error) {
    return;
  }

  const generate = await confirm({
    message: 'Would you like to generate the poly client library using the new tenant key?',
  });

  if (generate) {
    saveConfig(undefined, {
      POLY_API_BASE_URL: credentials.apiBaseUrl,
      POLY_API_KEY: credentials.apiKey,
    });

    try {
      shell.echo('Generating your poly client library...\n');
      await exec('npx poly generate');

      shell.echo(chalk.green('Poly client library generated.'));
    } catch (error) {
      shell.echo(chalk.red('ERROR\n'));
      shell.echo('Error generating your poly client library.');
    }
  }
};
