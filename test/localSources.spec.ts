/// <reference types="jest" />
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  discoverLocalSources,
  parseLocalSourceFile,
  planLocalSourceNavigation,
  selectLocalSource,
  toRepoRelativePath,
  LocalSourceEntry,
  LocalSourceIndex,
} from '../src/commands/generate/localSources';

const RECEIPT = '// Poly deployed @ 2024-08-29T22:46:46.791Z - myContext.helloWorld - https://na1.polyapi.io/canopy/polyui/collections/server-functions/f0630f95-eac8-4c7d-9d23-639d39034bb6 - e3b0c442';
const CLIENT_RECEIPT = '// Poly deployed @ 2024-08-29T22:46:46.791Z - myContext.fetchThing - https://na1.polyapi.io/canopy/polyui/collections/client-functions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee - abcdef01';
const WEBHOOK_RECEIPT = '// Poly deployed @ 2024-08-29T22:46:46.791Z - hooks.inbound - https://na1.polyapi.io/canopy/polyui/collections/webhooks/abc123def456 - deadbeef';

const serverSource = (options: { id?: string; receipt?: string } = {}) => {
  const idLine = options.id ? `\n  id: '${options.id}',` : '';
  const receipt = options.receipt ? `${options.receipt}\n` : '';
  return `${receipt}export function helloWorld(name: string): number {
  return name.length;
}

export const polyConfig: PolyServerFunction = {
  context: 'myContext',
  name: 'helloWorld',${idLine}
};
`;
};

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'poly-local-sources-'));

describe('local source index', () => {
  test('polyConfig hit records a repo-relative server function', () => {
    const root = tempRoot();
    const file = path.join(root, 'src', 'hello.ts');
    const entries = parseLocalSourceFile(file, serverSource(), root);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'myContext.helloWorld',
      context: 'myContext',
      name: 'helloWorld',
      kind: 'server-function',
      relativePath: 'src/hello.ts',
      ids: [],
      symbol: {
        startLine: 0,
        startColumn: 16,
        endLine: 0,
        endColumn: 26,
      },
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('jsdoc and satisfies polyConfig markers are hits', () => {
    const root = tempRoot();
    const jsDoc = `/**
 * @type {PolyClientFunction}
 */
const polyConfig = {
  context: 'myContext',
  name: 'fromJsDoc',
};

export function fromJsDoc(): string {
  return 'ok';
}
`;
    const satisfiesSource = `export function fromSatisfies(): string {
  return 'ok';
}

const polyConfig = {
  context: 'myContext',
  name: 'fromSatisfies',
} satisfies PolyServerFunction;
`;
    const jsDocEntries = parseLocalSourceFile(path.join(root, 'src', 'js.ts'), jsDoc, root);
    const satisfiesEntries = parseLocalSourceFile(
      path.join(root, 'src', 'sat.ts'),
      satisfiesSource,
      root,
    );
    expect(jsDocEntries.map((entry) => entry.kind)).toEqual(['client-function']);
    expect(satisfiesEntries.map((entry) => entry.kind)).toEqual(['server-function']);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('polyConfig client function is indexed separately from server functions', () => {
    const root = tempRoot();
    const file = path.join(root, 'src', 'client.ts');
    const contents = `export async function fetchThing(id: string): Promise<string> {
  return id;
}

export const polyConfig: PolyClientFunction = {
  context: 'myContext',
  name: 'fetchThing',
};
`;
    const entries = parseLocalSourceFile(file, contents, root);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('client-function');
    expect(entries[0].key).toBe('myContext.fetchThing');
    expect(selectLocalSource(entries, { id: 'remote', type: 'customFunction' })).toBe(entries[0]);
    expect(selectLocalSource(entries, { id: 'remote', type: 'serverFunction' })).toBeUndefined();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('receipt hit indexes the deployed id without a polyConfig', () => {
    const root = tempRoot();
    const file = path.join(root, 'src', 'hello.ts');
    const contents = `${RECEIPT}

export function helloWorld(name: string): number {
  return name.length;
}
`;
    const entries = parseLocalSourceFile(file, contents, root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'myContext.helloWorld',
      kind: 'server-function',
      relativePath: 'src/hello.ts',
      ids: ['f0630f95-eac8-4c7d-9d23-639d39034bb6'],
    });
    expect(entries[0].symbol.startLine).toBe(2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('poly function add comment links a server or client file without polyConfig', () => {
    const root = tempRoot();
    const file = path.join(root, 'src', 'serverFunctions', 'returnArg.ts');
    const calling = `import poly from 'polyapi';

export async function returnArg(event: any) {
  await poly.aaron.testing.printWebhook(event, {}, {});
  return event;
}
`;
    expect(parseLocalSourceFile(file, calling, root)).toEqual([]);

    const registered = `import poly from 'polyapi';

// npx poly function add --context aaron.test --logs=enabled --server returnArg ./src/serverFunctions/returnArg.ts
export async function returnArg(event: any) {
  await poly.aaron.testing.printWebhook(event, {}, {});
  return event;
}
`;
    const entries = parseLocalSourceFile(file, registered, root);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: 'aaron.test.returnArg',
      kind: 'server-function',
      relativePath: 'src/serverFunctions/returnArg.ts',
      ids: [],
    });
    expect(selectLocalSource(entries, {
      id: '8687419e-8562-4a37-8c94-e78456b32004',
      type: 'serverFunction',
    })).toBe(entries[0]);

    const client = parseLocalSourceFile(
      path.join(root, 'src', 'clientFunctions', 'checkMessage.ts'),
      '// npx poly function add --context aaron.testing --client checkMessage ./src/clientFunctions/checkMessage.ts\nexport async function checkMessage(message: string) { return message; }\n',
      root,
    );
    expect(client[0]).toMatchObject({
      key: 'aaron.testing.checkMessage',
      kind: 'client-function',
    });

    const positional = parseLocalSourceFile(
      path.join(root, 'src', 'throwAnError.ts'),
      '// npx poly function add --server --context test throwAnError src/serverFunctions/throwAnError.ts\nexport async function throwAnError() { return 1; }\n',
      root,
    );
    expect(positional[0]).toMatchObject({
      key: 'test.throwAnError',
      kind: 'server-function',
    });

    const nameFirst = parseLocalSourceFile(
      path.join(root, 'rejectIfInvalidCode.ts'),
      '// npx poly function add rejectIfInvalidCode3 rejectIfInvalidCode.ts --context aaron.test --server --logs=enabled\nexport function rejectIfInvalidCode3() { return 1; }\n',
      root,
    );
    expect(nameFirst[0]).toMatchObject({
      key: 'aaron.test.rejectIfInvalidCode3',
      kind: 'server-function',
    });
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('misses files with no marker and webhook receipts', () => {
    const root = tempRoot();
    const plain = parseLocalSourceFile(
      path.join(root, 'src', 'plain.ts'),
      'export const value = 1;\n',
      root,
    );
    const webhook = parseLocalSourceFile(
      path.join(root, 'src', 'hook.ts'),
      `${WEBHOOK_RECEIPT}\nexport const polyConfig: PolyWebhook = { context: 'hooks', name: 'inbound' };\n`,
      root,
    );
    expect(plain).toEqual([]);
    expect(webhook).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('path relativization keeps repo files and skips paths outside the repo', () => {
    const root = tempRoot();
    expect(toRepoRelativePath(path.join(root, 'src', 'nested', 'a.ts'), root)).toBe(
      'src/nested/a.ts',
    );
    expect(toRepoRelativePath(path.resolve(root, '..', 'outside.ts'), root)).toBeUndefined();
    expect(toRepoRelativePath(root, root)).toBeUndefined();

    const outside = parseLocalSourceFile(
      path.resolve(root, '..', 'outside.ts'),
      serverSource(),
      root,
    );
    expect(outside).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('id mismatch skips the link and a matching id or name-only hit is kept', () => {
    const root = tempRoot();
    const file = path.join(root, 'src', 'hello.ts');
    const mismatched = parseLocalSourceFile(
      file,
      serverSource({ id: 'local-id', receipt: RECEIPT }),
      root,
    );
    expect(mismatched[0].ids.sort()).toEqual([
      'f0630f95-eac8-4c7d-9d23-639d39034bb6',
      'local-id',
    ]);
    expect(selectLocalSource(mismatched, {
      id: 'other-id',
      type: 'serverFunction',
    })).toBeUndefined();
    expect(selectLocalSource(mismatched, {
      id: 'local-id',
      type: 'serverFunction',
    })?.relativePath).toBe('src/hello.ts');
    expect(selectLocalSource(mismatched, {
      id: 'f0630f95-eac8-4c7d-9d23-639d39034bb6',
      type: 'serverFunction',
    })?.relativePath).toBe('src/hello.ts');

    const nameOnly = parseLocalSourceFile(file, serverSource(), root);
    expect(selectLocalSource(nameOnly, {
      id: 'any-remote-id',
      type: 'serverFunction',
    })).toBe(nameOnly[0]);

    const receiptOnly = parseLocalSourceFile(
      file,
      `${RECEIPT}\nexport function helloWorld(): number { return 1; }\n`,
      root,
    );
    expect(selectLocalSource(receiptOnly, {
      id: 'not-the-receipt',
      type: 'serverFunction',
    })).toBeUndefined();
    expect(selectLocalSource(receiptOnly, {
      id: 'f0630f95-eac8-4c7d-9d23-639d39034bb6',
      type: 'serverFunction',
    })).toBe(receiptOnly[0]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('discover walks the repo and ignores node_modules', async () => {
    const root = tempRoot();
    const sourceDir = path.join(root, 'src');
    const ignoredDir = path.join(root, 'node_modules', 'pkg');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(ignoredDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'hello.ts'), serverSource());
    fs.writeFileSync(path.join(sourceDir, 'plain.ts'), 'export const value = 1;\n');
    fs.writeFileSync(path.join(ignoredDir, 'hello.ts'), serverSource());
    fs.writeFileSync(
      path.join(sourceDir, 'client.ts'),
      `${CLIENT_RECEIPT}\nexport function fetchThing(): string { return 'ok'; }\n`,
    );

    const discovery = await discoverLocalSources(root);
    expect([...discovery.index.keys()].sort()).toEqual([
      'myContext.fetchThing',
      'myContext.helloWorld',
    ]);
    expect(discovery.index.get('myContext.helloWorld')?.[0].relativePath).toBe('src/hello.ts');
    expect(discovery.index.get('myContext.fetchThing')?.[0].kind).toBe('client-function');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

const dtsFor = (body: string) => `import poly = require('./index');

declare module './index' {
  interface MyContext {
${body}
  }
  interface Child {}
}
`;

const indexEntry = (entries: LocalSourceEntry[]): LocalSourceIndex => {
  const index: LocalSourceIndex = new Map();
  for (const entry of entries) {
    const existing = index.get(entry.key);
    if (existing) existing.push(entry);
    else index.set(entry.key, [entry]);
  }
  return index;
};

describe('declaration maps', () => {
  test('links a matched function and leaves the generated signature in place', () => {
    const root = tempRoot();
    const sourcePath = path.join(root, 'src', 'hello.ts');
    const dtsPath = path.join(root, 'node_modules', '.poly', 'lib', 'myContext.d.ts');
    const contents = serverSource();
    const entries = parseLocalSourceFile(sourcePath, contents, root);
    const dtsText = dtsFor('    earlier(name: string): Promise<void>;\n    helloWorld(name: string): Promise<string>;\n    child: Child;');
    const plan = planLocalSourceNavigation({
      dtsText,
      dtsPath,
      specifications: [
        {
          id: 'remote-1',
          type: 'serverFunction',
          context: 'myContext',
          name: 'helloWorld',
        },
        {
          id: 'remote-2',
          type: 'serverFunction',
          context: 'myContext',
          name: 'earlier',
        },
      ],
      index: indexEntry(entries),
      repoRoot: root,
    });

    expect(plan.linked).toBe(1);
    expect(plan.dtsText).toContain('helloWorld(name: string): Promise<string>');
    expect(plan.dtsText).not.toContain(': number');
    expect(plan.dtsText.trimEnd().endsWith('//# sourceMappingURL=myContext.d.ts.map')).toBe(true);
    expect(plan.map).toBeDefined();
    const map = JSON.parse(plan.map.text);
    expect(map.sources).toEqual(['src/hello.ts']);
    expect(map.sourceRoot).toBe('../../../');
    expect(map.file).toBe('myContext.d.ts');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('id mismatch emits no declaration map', () => {
    const root = tempRoot();
    const sourcePath = path.join(root, 'src', 'hello.ts');
    const entries = parseLocalSourceFile(
      sourcePath,
      serverSource({ id: 'local-id' }),
      root,
    );
    const plan = planLocalSourceNavigation({
      dtsText: dtsFor('    helloWorld(name: string): Promise<string>;'),
      dtsPath: path.join(root, 'node_modules', '.poly', 'lib', 'myContext.d.ts'),
      specifications: [{
        id: 'different-id',
        type: 'serverFunction',
        context: 'myContext',
        name: 'helloWorld',
      }],
      index: indexEntry(entries),
      repoRoot: root,
    });
    expect(plan.linked).toBe(0);
    expect(plan.map).toBeUndefined();
    expect(plan.dtsText).not.toContain('sourceMappingURL');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('default F12 opens the local file and keeps the generated client signature', async () => {
    const root = tempRoot();
    const sourcePath = path.join(root, 'src', 'hello.ts');
    const libDir = path.join(root, 'node_modules', '.poly', 'lib');
    const dtsPath = path.join(libDir, 'myContext.d.ts');
    const consumerPath = path.join(root, 'consumer.ts');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });

    const source = serverSource();
    fs.writeFileSync(sourcePath, source);
    const entries = parseLocalSourceFile(sourcePath, source, root);
    const dtsText = dtsFor([
      '    child: Child;',
      '    earlier(name: string): Promise<void>;',
      '    helloWorld(name: string): Promise<string>;',
    ].join('\n'));
    const plan = planLocalSourceNavigation({
      dtsText,
      dtsPath,
      specifications: [{
        id: 'remote-1',
        type: 'serverFunction',
        context: 'myContext',
        name: 'helloWorld',
      }],
      index: indexEntry(entries),
      repoRoot: root,
    });
    fs.writeFileSync(dtsPath, plan.dtsText);
    fs.writeFileSync(plan.map.path, plan.map.text);
    fs.writeFileSync(path.join(libDir, 'index.d.ts'), `/// <reference path="./myContext.d.ts" />

export const myContext: MyContext;

declare const poly: Poly;
export default poly;

interface Poly {
  myContext: MyContext;
}
`);
    fs.writeFileSync(consumerPath, `import poly from './node_modules/.poly/lib';

poly.myContext.child;
poly.myContext.earlier('a');
poly.myContext.helloWorld('ada');
`);
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'es2021',
        module: 'commonjs',
        strict: false,
        skipLibCheck: true,
        esModuleInterop: true,
      },
      include: ['consumer.ts', 'src/**/*.ts'],
    }));

    const proc = spawn(
      process.execPath,
      [
        path.join(
          __dirname,
          '..',
          'node_modules',
          'typescript',
          'lib',
          'tsserver.js',
        ),
        '--disableAutomaticTypingAcquisition',
      ],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    try {
      const consumer = fs.readFileSync(consumerPath, 'utf8');
      await openAndDefine(proc, consumerPath);
      const child = await definitionAt(proc, consumerPath, consumer, 'child');
      const earlier = await definitionAt(proc, consumerPath, consumer, 'earlier');
      const hello = await definitionAt(proc, consumerPath, consumer, 'helloWorld');
      const quick = await quickInfoAt(proc, consumerPath, consumer, 'helloWorld');

      expect(child.every((item) => !item.file.endsWith(`${path.sep}hello.ts`))).toBe(true);
      expect(earlier.map((item) => item.file)).toEqual([dtsPath]);
      expect(hello).toHaveLength(1);
      expect(path.normalize(hello[0].file)).toBe(path.normalize(sourcePath));
      const line = fs.readFileSync(hello[0].file, 'utf8').split('\n')[hello[0].start.line - 1];
      expect(line.slice(hello[0].start.offset - 1, hello[0].end.offset - 1)).toBe('helloWorld');
      expect(quick).toContain('Promise<string>');
      expect(quick).not.toContain(': number');
    } finally {
      proc.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20000);
});

type DefinitionBody = {
  file: string;
  start: { line: number; offset: number };
  end: { line: number; offset: number };
};

let requestSeq = 0;
const pending = new Map<number, (message: any) => void>();

const send = (proc: ChildProcess, command: string, args: Record<string, unknown>) => {
  requestSeq += 1;
  const seq = requestSeq;
  proc.stdin.write(`${JSON.stringify({
    seq,
    type: 'request',
    command,
    arguments: args,
  })}\n`);
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${command}`)), 15000);
    pending.set(seq, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
};

const attach = (proc: ChildProcess) => {
  let buffer = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/);
      if (!match) break;
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) break;
      const raw = buffer.slice(start, start + length);
      buffer = buffer.slice(start + length);
      let message: any;
      try {
        message = JSON.parse(raw.trim());
      } catch {
        continue;
      }
      if (message.request_seq && pending.has(message.request_seq)) {
        pending.get(message.request_seq)(message);
        pending.delete(message.request_seq);
      }
    }
  });
};

const positionOf = (text: string, word: string) => {
  const index = text.indexOf(word);
  const lines = text.slice(0, index).split('\n');
  return {
    line: lines.length,
    offset: lines[lines.length - 1].length + 1,
  };
};

const openAndDefine = async (proc: ChildProcess, file: string) => {
  attach(proc);
  const opened = await send(proc, 'open', { file });
  if (!opened.success) throw new Error(opened.message || 'failed to open project');
};

const definitionAt = async (
  proc: ChildProcess,
  file: string,
  text: string,
  word: string,
): Promise<DefinitionBody[]> => {
  const response = await send(proc, 'definition', {
    file,
    ...positionOf(text, word),
  });
  if (!response.success) throw new Error(response.message || `definition failed for ${word}`);
  return response.body || [];
};

const quickInfoAt = async (
  proc: ChildProcess,
  file: string,
  text: string,
  word: string,
): Promise<string> => {
  const response = await send(proc, 'quickinfo', {
    file,
    ...positionOf(text, word),
  });
  if (!response.success) throw new Error(response.message || 'quickinfo failed');
  return response.body?.displayString || '';
};
