import fs from 'fs';
import { EOL } from 'node:os';
import { templateUrl, toPascalCase } from '../../utils';
import { QueueSpecification } from '../../types';
import { ws, printResourceSpecs } from './shared';
import { printSchemaAsType } from './schemaTypes';


const printQueueInterface = (queue: QueueSpecification, depth: number): string => {
  const _ws = ws(depth);
  const formattedName = queue.contextName
    .split('.')
    .map((v) => toPascalCase(v))
    .join('.');
  return [
    `${_ws}publish(payload: Publishable, headers?: Record<string, string>): Promise<PublishResult>;`,
    `${_ws}list(pagination?: ListEventsPagination, fromDLQ?: boolean): Promise<ListEventsResult<${formattedName}.${queue.schema.title || 'Payload'}>>;`,
    `${_ws}get(eventId: string, fromDLQ?: boolean): Promise<QueueEvent<${formattedName}.${queue.schema.title || 'Payload'}>>;`,
    `${_ws}delete(eventId: string): Promise<void>;`,
    `${_ws}deleteAll(): Promise<void>;`,
    `${_ws}skip(eventId: string): Promise<void>;`,
    `${_ws}retry(eventId: string, fromDLQ?: boolean): Promise<void>;`,
    `${_ws}subscribe(handler: (event: QueueEvent<${formattedName}.${queue.schema.title || 'Payload'}>) => any, concurrency?: number): Promise<Subscription>;`,
    `${_ws}status(): Promise<QueueStatus>;`,
  ].join(`${EOL}${ws(depth + 1)}`);
};

const printQueueNamespace = (queue: QueueSpecification, depth: number): string => {
  if (queue.schema) {
    return `${printSchemaAsType(queue.schema, 'Payload', depth)}${EOL}`;
  }
  return `${ws(depth)}type Payload = EventPayload;`
};

export const generateQueueTSDeclarationFiles = async (
  libPath: string,
  specs: QueueSpecification[],
) => {
  const files = printResourceSpecs(specs, {
    namespace: 'que',
    interfaceName: 'Que',
    type: 'queue',
    printResourceInterface: printQueueInterface,
    printResourceNamespace: printQueueNamespace,
  });
  await Promise.all(
    Object.entries(files).map(
      ([file, contents]) =>
        new Promise<void>((resolve, reject) =>
          fs.writeFile(`${libPath}/que/${file}`, contents, (err) =>
            err ? reject(err) : resolve(),
          ),
        ),
    ),
  );
  fs.copyFileSync(templateUrl('que/types.d.ts'), `${libPath}/que/types.d.ts`);
};
