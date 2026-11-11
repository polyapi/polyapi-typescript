import fs from 'fs';
import { groupBy } from 'lodash';
import {
  DeployableRecord,
  DeployableTypes,
  SyncDeployment,
  Deployment,
  loadDeployableRecords,
  saveDeployableRecords,
  writeUpdatedDeployable,
  getCacheDeploymentsRevision,
  removeDeployableRecords,
  prepareDeployableDirectory,
  getDeployableFileRevision,
  getRandomString,
} from '../deployables';
import {
  createOrUpdateClientFunction,
  createOrUpdateServerFunction,
  createOrUpdateWebhook,
  deleteClientFunction,
  deleteServerFunction,
  deleteWebhook,
  getClientFunctionById,
  getClientFunctionByName,
  getServerFunctionById,
  getServerFunctionByName,
  getWebhookById,
  getWebhookByName,
} from '../api';
import { FunctionDetailsDto, WebhookHandleDto } from '../types';
import {
  functionDeployFields,
  getDependencies,
  getTSBaseUrl,
  transpileFunction,
} from '../transpiler';

const DEPLOY_ORDER: DeployableTypes[] = [
  'client-function',
  'server-function',
  'webhook',
];

const removeDeployable = async (
  deployable: SyncDeployment | Deployment,
): Promise<boolean> => {
  switch (deployable.type) {
    case 'server-function': {
      const instance = await getServerFunctionByName(
        deployable.context,
        deployable.name,
      );
      if (!instance) return false;
      await deleteServerFunction(instance.id);
      return true;
    }
    case 'client-function': {
      const instance = await getClientFunctionByName(
        deployable.context,
        deployable.name,
      );
      if (!instance) return false;
      await deleteClientFunction(instance.id);
      return true;
    }
    case 'webhook': {
      const webhook = await getWebhookByName(
        deployable.context,
        deployable.name,
      );
      if (!webhook) return false;
      await deleteWebhook(webhook.id);
      return true;
    }

    default:
      return false;
  }
};

/**
 * Compile a prepared function and build the create body.
 * Missing poly resources do not abort the sync; unresolved schema types are
 * generated from the source instead of sent as `x-poly-ref`.
 */
export const syncedFunctionUpdate = async (
  deployable: {
    file: string;
    name: string;
    context: string;
    config?: Record<string, unknown>;
  },
  code: string,
) => {
  const [, , schemaRefs] = await getDependencies(
    code,
    deployable.file,
    getTSBaseUrl(),
    true,
  );
  const referencedSchemas = Object.keys(schemaRefs).length ? schemaRefs : null;
  const deployed = functionDeployFields(
    transpileFunction(deployable.file, deployable.name, referencedSchemas),
    deployable.context,
  );
  return {
    context: deployed.context,
    code: deployed.code,
    other: { ...(deployable.config ?? {}), ...deployed.payload },
  };
};

const syncDeployableAndGetId = async (
  deployable,
  code,
  apiKey,
): Promise<{ id: string; context: string | null }> => {
  if (deployable.type === 'webhook') {
    return {
      id: (
        await createOrUpdateWebhook(
          deployable.context,
          deployable.name,
          deployable.description,
          deployable.config,
        )
      ).id,
      context: deployable.context,
    };
  }
  let { externalDependencies, dependencies } = deployable;
  if (Array.isArray(dependencies) && !externalDependencies) {
    externalDependencies = Object.fromEntries(
      dependencies.map((d) => [d, 'latest']),
    );
  }
  const synced = await syncedFunctionUpdate(deployable, code);
  if (deployable.type === 'server-function') {
    return {
      id: (
        await createOrUpdateServerFunction(
          synced.context,
          deployable.name,
          deployable.description,
          synced.code,
          deployable.config.visibility,
          externalDependencies,
          deployable.internalDependencies,
          synced.other,
          apiKey,
        )
      ).id,
      context: synced.context,
    };
  } else if (deployable.type === 'client-function') {
    return {
      id: (
        await createOrUpdateClientFunction(
          synced.context,
          deployable.name,
          deployable.description,
          synced.code,
          deployable.config.visibility,
          externalDependencies,
          deployable.internalDependencies,
          synced.other,
        )
      ).id,
      context: synced.context,
    };
  }
  throw new Error(`Unsupported deployable type: '${deployable.type}'`);
};

const getDeployableFromServer = async <
  T = FunctionDetailsDto | WebhookHandleDto,
>(
  deployable: SyncDeployment,
): Promise<T | null | undefined> => {
  try {
    switch (deployable.type) {
      case 'server-function': {
        return deployable.id
          ? (getServerFunctionById(deployable.id) as T)
          : (getServerFunctionByName(
              deployable.context,
              deployable.name,
              true,
            ) as T);
      }
      case 'client-function': {
        return deployable.id
          ? (getClientFunctionById(deployable.id) as T)
          : (getClientFunctionByName(
              deployable.context,
              deployable.name,
              true,
            ) as T);
      }
      case 'webhook': {
        return deployable.id
          ? (getWebhookById(deployable.id) as T)
          : (getWebhookByName(deployable.context, deployable.name, true) as T);
      }
    }
  } catch (err) {
    return null;
  }
};

const syncDeployable = async (
  deployable: SyncDeployment,
  apiKey: string | null | undefined,
): Promise<Deployment> => {
  const code = fs.readFileSync(deployable.file, 'utf8');
  const { id, context } = await syncDeployableAndGetId(
    deployable,
    code,
    apiKey,
  );
  return {
    name: deployable.name,
    context: context ?? deployable.context,
    instance: deployable.instance,
    type: deployable.type,
    id,
    deployed: new Date().toISOString(),
    fileRevision: deployable.fileRevision,
  };
};

type GroupedDeployables = Record<DeployableTypes, DeployableRecord[]>;

export const syncDeployables = async (
  dryRun: boolean,
  apiKey: string | null | undefined,
  instance = process.env.POLY_API_BASE_URL,
) => {
  await prepareDeployableDirectory();
  const gitRevision = await getCacheDeploymentsRevision();
  const allDeployables = await loadDeployableRecords();
  const toRemove: DeployableRecord[] = [];
  if (!allDeployables.length) {
    console.log('No deployables found. Skipping sync.');
    return;
  }
  // TODO: Improve our deploy ordering.
  // Right now we're doing rudimentary ordering by type
  // But this does not safely handle cases where one server function may reference another
  // We should parse the functions bodies for references to other Poly deployables and work them into a DAG
  const groupedDeployables = groupBy(
    allDeployables,
    'type',
  ) as unknown as GroupedDeployables;
  for (const type of DEPLOY_ORDER) {
    const deployables = groupedDeployables[type] || [];
    for (const deployable of deployables) {
      const previousDeployment = deployable.deployments.find(
        (i) => i.instance === instance,
      );
      // Any deployable may be deployed to multiple instances/environments at the same time
      // So we reduce the deployable record down to a single instance we want to deploy to
      const syncDeployment: SyncDeployment = {
        ...deployable,
        ...previousDeployment, // flatten to grab name & context
        type: deployable.type, // but make sure we use the latest type
        description: deployable.description ?? deployable.types?.description,
        instance,
      };
      const deployed = await getDeployableFromServer(syncDeployment);
      const gitRevisionChanged = gitRevision !== deployable.gitRevision;
      const serverFileRevision = !deployed
        ? ''
        : type === 'webhook'
          ? // TODO: Actually calculate real revision on webhook
            getRandomString(8)
          : (deployed as FunctionDetailsDto).hash ||
            getDeployableFileRevision((deployed as FunctionDetailsDto).code);
      const fileRevisionChanged =
        serverFileRevision !== deployable.fileRevision;
      // TODO: If deployed variabnt exists AND was deployed after timestamp on previousDeployment then sync it back to the repo
      let action = gitRevisionChanged
        ? 'REMOVED'
        : !previousDeployment?.id && !deployed
          ? 'ADDED'
          : fileRevisionChanged
            ? 'UPDATED'
            : 'SKIPPED';

      if (!dryRun && action !== 'SKIPPED') {
        try {
          // if user is changing type, ex. server -> client function or vice versa
          // then try to cleanup the old type first
          if (
            previousDeployment &&
            deployable.type !== previousDeployment.type
          ) {
            await removeDeployable(previousDeployment);
          }
          if (gitRevisionChanged) {
            // This deployable no longer exists so let's remove it
            const found = await removeDeployable(syncDeployment);
            if (!found) action = 'NOT FOUND';
            const removeIndex = allDeployables.findIndex(
              (d) =>
                d.name === deployable.name &&
                d.context === deployable.context &&
                d.file === deployable.file,
            );
            toRemove.push(...allDeployables.splice(removeIndex, 1));
          } else {
            const deployment = await syncDeployable(syncDeployment, apiKey);
            if (previousDeployment) {
              previousDeployment.id = deployment.id;
              previousDeployment.context = deployment.context;
              previousDeployment.name = deployment.name;
              previousDeployment.type = deployment.type;
              previousDeployment.deployed = deployment.deployed;
              previousDeployment.fileRevision = deployment.fileRevision;
            } else {
              deployable.deployments.unshift(deployment);
            }
          }
        } catch (err: any) {
          // One failed function must not abort the batch or record a deployment.
          action = 'ERROR';
          console.error(err?.message ?? err);
        }
      }

      console.log(
        `${dryRun ? 'Would sync' : 'Synced'} ${deployable.type.replaceAll(
          '-',
          ' ',
        )} ${deployable.context}.${deployable.name}: ${
          dryRun ? 'TO BE ' : ''
        }${action}`,
      );
    }
  }
  if (dryRun) return;
  await Promise.all(
    allDeployables.map((deployable) =>
      writeUpdatedDeployable(deployable, true),
    ),
  );
  await saveDeployableRecords(allDeployables);
  if (toRemove.length) await removeDeployableRecords(toRemove);
};
