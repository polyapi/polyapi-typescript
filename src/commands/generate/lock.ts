import fs from 'fs';
import { EOL } from 'node:os';
import { templateUrl } from '../../utils';
import { LockSpecification } from '../../types';
import { ws, printResourceSpecs } from './shared';


const printLockInterface = (_lock: LockSpecification, depth: number): string => {
  const _ws = ws(depth);
  return [
    `${_ws}acquire(): Promise<Lock>;`,
    `${_ws}isLocked(): Promise<boolean>;`,
    `${_ws}getLockStatus(): Promise<LockStatus>;`,
    `${_ws}renew(sessionId: string): Promise<Lock>;`,
    `${_ws}release(sessionId: string): Promise<void>;`,
    `${_ws}withLock<T>(fn: (lock: Lock) => T | Promise<T>): Promise<T>;`,
  ].join(`${EOL}${ws(depth + 1)}`);
};

const printLockNamespace = (_lock: LockSpecification, _depth: number): string => {
  return '';
};

export const generateLockTSDeclarationFiles = async (
  libPath: string,
  specs: LockSpecification[],
) => {
  const files = printResourceSpecs(specs, {
    namespace: 'loxi',
    interfaceName: 'Loxi',
    type: 'lock',
    printResourceInterface: printLockInterface,
    printResourceNamespace: printLockNamespace,
  });
  await Promise.all(
    Object.entries(files).map(
      ([file, contents]) =>
        new Promise<void>((resolve, reject) =>
          fs.writeFile(`${libPath}/loxi/${file}`, contents, (err) =>
            err ? reject(err) : resolve(),
          ),
        ),
    ),
  );
  fs.copyFileSync(templateUrl('loxi/types.d.ts'), `${libPath}/loxi/types.d.ts`);
};
