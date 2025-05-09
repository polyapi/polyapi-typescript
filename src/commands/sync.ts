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
} from '../deployables';
import {
  createOrUpdateClientFunction,
  createOrUpdateServerFunction,
  createOrUpdateWebhook,
  deleteClientFunction,
  deleteServerFunction,
  deleteWebhook,
  getClientFunctionByName,
  getServerFunctionByName,
  getWebhookByName,
} from '../api';

const DEPLOY_ORDER: DeployableTypes[] = [
  'server-function',
  'client-function',
  'webhook',
];

const removeDeployable = async (deployable: SyncDeployment | Deployment): Promise<boolean> => {
  switch (deployable.type) {
    case 'server-function': {
      const instance = await getServerFunctionByName(deployable.context, deployable.name);
      if (!instance) return false;
      await deleteServerFunction(instance.id);
      return true;
    }
    case 'client-function': {
      const instance = await getClientFunctionByName(deployable.context, deployable.name);
      if (!instance) return false;
      await deleteClientFunction(instance.id);
      return true;
    }
    case 'webhook': {
      const webhook = await getWebhookByName(deployable.context, deployable.name);
      if (!webhook) return false;
      await deleteWebhook(webhook.id);
      return true;
    }

    default:
      return false;
  }
};

const syncDeployableAndGetId = async (deployable, code) => {
  switch (deployable.type) {
    case 'server-function':
      return (
        await createOrUpdateServerFunction(deployable.context, deployable.name, deployable.description, code, deployable.typeSchemas, deployable.dependencies, deployable.config)
      ).id;
    case 'client-function':
      return (
        await createOrUpdateClientFunction(deployable.context, deployable.name, deployable.description, code, deployable.typeSchemas, deployable.config)
      ).id;
    case 'webhook':
      return (
        await createOrUpdateWebhook(deployable.context, deployable.name, deployable.description, deployable.config)
      ).id;
  }
  throw new Error(`Unsupported deployable type: '${deployable.type}'`);
};

const syncDeployable = async (deployable: SyncDeployment): Promise<Deployment> => {
  const code = fs.readFileSync(deployable.file, 'utf8');
  const id = await syncDeployableAndGetId(deployable, code);
  return {
    name: deployable.name,
    context: deployable.context,
    instance: deployable.instance,
    type: deployable.type,
    id,
    deployed: new Date().toISOString(),
    fileRevision: deployable.fileRevision,
  };
};

type GroupedDeployables = Record<DeployableTypes, DeployableRecord[]>;

export const syncDeployables = async (dryRun: boolean, instance = process.env.POLY_API_BASE_URL) => {
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
  const groupedDeployables = groupBy(allDeployables, 'type') as unknown as GroupedDeployables;
  for (const type of DEPLOY_ORDER) {
    const deployables = groupedDeployables[type] || [];
    for (const deployable of deployables) {
      const previousDeployment = deployable.deployments.find(i => i.instance === instance);
      const gitRevisionChanged = gitRevision !== deployable.gitRevision;
      const fileRevisionChanged = previousDeployment?.fileRevision !== deployable.fileRevision;
      let action = gitRevisionChanged
        ? 'REMOVED'
        : !previousDeployment?.id
            ? 'ADDED'
            : fileRevisionChanged
              ? 'UPDATED'
              : 'OK';

      if (!dryRun && (gitRevisionChanged || fileRevisionChanged)) {
        // if user is changing type, ex. server -> client function or vice versa
        // then try to cleanup the old type first
        if (previousDeployment && deployable.type !== previousDeployment.type) {
          await removeDeployable(previousDeployment);
        }
        // Any deployable may be deployed to multiple instances/environments at the same time
        // So we reduce the deployable record down to a single instance we want to deploy to
        const syncDeployment: SyncDeployment = {
          ...deployable,
          ...previousDeployment, // flatten to grab name & context
          type: deployable.type, // but make sure we use the latest type
          description: deployable.description ?? deployable.types?.description,
          instance,
        };
        if (gitRevision === deployable.gitRevision) {
          const deployment = await syncDeployable(syncDeployment);
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
        } else {
          // This deployable no longer exists so let's remove it
          const found = await removeDeployable(syncDeployment);
          if (!found) action = 'NOT FOUND';
          const removeIndex = allDeployables.findIndex(d => d.name === deployable.name && d.context === deployable.context && d.file === deployable.file);
          toRemove.push(...allDeployables.splice(removeIndex, 1));
        }
      }

      console.log(`${dryRun ? 'Would sync' : 'Synced'} ${deployable.type.replaceAll('-', ' ')} ${deployable.context}.${deployable.name}: ${dryRun ? 'TO BE ' : ''}${action}`);
    }
  }
  if (dryRun) return;
  await Promise.all(allDeployables.map(deployable => writeUpdatedDeployable(deployable, true)));
  await saveDeployableRecords(allDeployables);
  if (toRemove.length) await removeDeployableRecords(toRemove);
};
