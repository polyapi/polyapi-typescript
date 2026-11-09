/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as api from '../src/api';
import { generateFunctionsTSDeclarationFile } from '../src/commands/generate/types';
import {
  findBareNpmSpecifiersInCode,
  readPackageVersion,
  uniquePreserve,
} from '../src/component/compile';
import { compileComponentGraph } from '../src/component/graph';
import { Specification } from '../src/types';
import * as utils from '../src/utils';
import {
  assertComponentIdentifiers,
  componentContextError,
  componentNameError,
} from '../src/component/identifiers';
import {
  extraVendorSpecifiers,
  reactFamilyMismatchWarnings,
} from '../src/component/instanceVendor';
import {
  componentIdFromSpecs,
  unsupportedPackageError,
} from '../src/component/publish';

const writePackage = (
  root: string,
  name: string,
  version: string,
  files: Record<string, string>,
) => {
  const pkgDir = path.join(root, 'node_modules', ...name.split('/'));
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name,
      version,
      types: 'index.d.ts',
      exports: {
        '.': { types: './index.d.ts', default: './index.js' },
        './jsx-runtime': {
          types: './jsx-runtime.d.ts',
          default: './jsx-runtime.js',
        },
      },
    }),
  );
  for (const [file, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(pkgDir, file), contents);
  }
};

const installResolveFixtures = (root: string) => {
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      devDependencies: {
        react: '18.3.1',
        'react-dom': '18.3.1',
      },
    }),
  );
  writePackage(root, 'react', '18.3.1', {
    'index.d.ts': `export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
declare const React: { useMemo: typeof useMemo };
export default React;
`,
    'jsx-runtime.d.ts': `export namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
export function jsx(type: any, props: any, key?: string): JSX.Element;
export function jsxs(type: any, props: any, key?: string): JSX.Element;
`,
    'index.js': 'export {};\n',
    'jsx-runtime.js': 'export {};\n',
  });
  writePackage(root, 'react-dom', '18.3.1', {
    'index.d.ts': 'export {};\n',
    'index.js': 'export {};\n',
  });
  writePackage(root, 'lodash', '4.18.1', {
    'index.d.ts': `export function toUpper(value: string): string;
declare const _: { toUpper: typeof toUpper };
export default _;
`,
    'index.js': 'export {};\n',
  });
  writePackage(root, 'chalk', '4.1.2', {
    'index.d.ts': 'export {};\n',
    'index.js': 'export {};\n',
  });
  writePackage(root, 'polyapi', '0.0.0', {
    'index.d.ts': 'declare const poly: any;\nexport default poly;\n',
    'index.js': 'export default {};\n',
  });
};

const ORDERS_CREATE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const LIST_FUNCTIONS_ID = '5ab5cbad-a3fc-4530-997d-ddea0597ae10';

const polySpec = (
  type: Specification['type'],
  contextName: string,
  id = `fn-${contextName.replace(/\./g, '-')}`,
): Specification =>
  ({
    id,
    type,
    name: contextName.split('.').pop() || contextName,
    context: contextName.split('.').slice(0, -1).join('.'),
    contextName,
    visibilityMetadata: { visibility: 'ENVIRONMENT' },
  }) as Specification;

const POLY_SPECS = [
  polySpec('componentFunction', 'myapp.Button'),
  polySpec('componentFunction', 'myapp.polySession'),
  polySpec('serverFunction', 'orders.create', ORDERS_CREATE_ID),
  polySpec('apiFunction', 'OOB.polyapi.serverFunctions.list', LIST_FUNCTIONS_ID),
];

const npmImportPattern = (pkg: string) =>
  new RegExp(
    String.raw`(?:from|import)\s*(?:\(\s*)?['"]${pkg.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}['"]`,
  );

const extraPackages = (specifiers: string[]) =>
  uniquePreserve(extraVendorSpecifiers(uniquePreserve(specifiers)));

describe('component compile', () => {
  let tmp: string;
  let npmResolveDir: string;

  const writeComponents = (files: Record<string, string>) => {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, contents);
    }
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-components-'));
    npmResolveDir = tmp;
    installResolveFixtures(tmp);
    jest.spyOn(utils, 'getCachedSpecs').mockReturnValue(POLY_SPECS);
    jest.spyOn(utils, 'writeCachedSpecs').mockImplementation(() => undefined);
    jest.spyOn(api, 'getSpecs').mockResolvedValue(POLY_SPECS);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('a relative component import is rejected', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import { Button } from './Button';

export const App = () => <Button label="hello" />;
`,
      'src/Button.tsx': `import React from 'react';
export const Button = ({ label }: { label: string }) => <button>{label}</button>;
`,
    });

    await expect(
      compileComponentGraph({
        projectRoot: tmp,
        npmResolveDir,
        context: 'myapp',
        name: 'App',
        file: 'src/App.tsx',
        isRoot: true,
      }),
    ).rejects.toThrow(
      /Import '\.\/Button' via polyapi, not from another file/,
    );
  });

  test('poly.myapp.Button becomes a poly import and does not publish the other file', async () => {
    const appSource = `import React from 'react';
import poly from 'polyapi';

export const App = () => {
  const label = React.useMemo(() => 'hello', []);
  return <poly.myapp.Button label={label} />;
};
`;
    writeComponents({
      'src/App.tsx': appSource,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    const root = graph.nodes[0];

    expect(graph.nodes).toHaveLength(1);
    expect(root).toMatchObject({
      context: 'myapp',
      name: 'App',
      kind: 'root',
      sourceCode: appSource,
      imports: ['myapp.Button'],
    });
    expect(root.sourceCode).toContain("from 'polyapi'");
    expect(extraPackages(root.npmSpecifiers)).toEqual([]);
    expect(root.code).toContain('poly:vendor');
    expect(root.code).toContain('poly:myapp.Button');
    expect(root.code).not.toContain('poly:app-vendor');
    expect(root.code).not.toMatch(npmImportPattern('react'));
    expect(root.code).not.toMatch(npmImportPattern('polyapi'));
    expect(findBareNpmSpecifiersInCode(root.code)).toEqual([]);
  });

  test('a component module member is imported as that module', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import poly from 'polyapi';

export const App = () => {
  const signIn = () => poly.myapp.polySession.createPolySession('key');
  return <button onClick={signIn}>Sign in</button>;
};
`,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    const root = graph.nodes[0];

    expect(root.imports).toEqual(['myapp.polySession']);
    expect(root.code).toContain('poly:myapp.polySession');
    expect(root.code).toContain('createPolySession');
    expect(graph.nodes).toHaveLength(1);
  });

  test('a server function is resolved and is not a downloaded import', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import poly from 'polyapi';

export const App = () => {
  const run = () => poly.orders.create();
  return <poly.myapp.Button label="go" onClick={run} />;
};
`,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    const root = graph.nodes[0];

    expect(root.imports).toEqual(['myapp.Button']);
    expect(root.code).toContain('poly:myapp.Button');
    expect(root.code).toContain('orders.create');
    expect(root.code).toContain(
      `/api/functions/server/${ORDERS_CREATE_ID}/execute`,
    );
    expect(root.code).not.toContain('/api/functions/server/orders.create/');
    expect(root.code).not.toMatch(npmImportPattern('polyapi'));
    expect(root.imports).not.toContain('orders.create');
    expect(extraPackages(root.npmSpecifiers)).toEqual([]);
  });

  test('an api function executes on the current origin', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import poly from 'polyapi';

export const App = () => {
  const run = () => poly.OOB.polyapi.serverFunctions.list('http://localhost:8000', 'key');
  return <button onClick={run}>List</button>;
};
`,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    const root = graph.nodes[0];

    expect(root.imports).toEqual([]);
    expect(root.code).toContain(
      `/api/functions/api/${LIST_FUNCTIONS_ID}/execute`,
    );
    expect(root.code).not.toContain(
      '/api/functions/api/OOB.polyapi.serverFunctions.list/',
    );
    expect(root.code).not.toMatch(npmImportPattern('polyapi'));
    expect(extraPackages(root.npmSpecifiers)).toEqual([]);
  });

  test('an unknown poly path fails compilation', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import poly from 'polyapi';

export const App = () => <poly.missing.Thing />;
`,
    });

    await expect(
      compileComponentGraph({
        projectRoot: tmp,
        npmResolveDir,
        context: 'myapp',
        name: 'App',
        file: 'src/App.tsx',
        isRoot: true,
      }),
    ).rejects.toThrow(/missing\.Thing/);
  });

  test('a react-only file rewrites react to poly:vendor', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
export const App = () => <div>hello</div>;
`,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    const root = graph.nodes[0];

    expect(graph.nodes).toHaveLength(1);
    expect(root.code).toContain('poly:vendor');
    expect(root.code).not.toContain('poly:app-vendor');
    expect(root.code).not.toMatch(npmImportPattern('react'));
    expect(extraPackages(root.npmSpecifiers)).toEqual([]);
  });

  test('reports a third-party package from the compiled specifiers', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import _ from 'lodash';
export const App = () => <div>{_.toUpper('hello')}</div>;
`,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    const extra = extraPackages(
      graph.nodes.flatMap((node) => node.npmSpecifiers),
    );

    expect(extra).toEqual(['lodash']);
    expect(unsupportedPackageError(extra)).toBe(
      'Unsupported package lodash. Only poly vendor libraries can be imported.',
    );
  });

  test('reports unused npm imports that esbuild would tree-shake', async () => {
    writeComponents({
      'src/Button.tsx': `import React from 'react';
import _ from 'lodash';
import * as chalk from 'chalk';

export const Button = ({ label }: { label: string }) => {
  return <button className="updated">{label}</button>;
};
`,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'Button',
      file: 'src/Button.tsx',
    });
    const extra = extraPackages(
      graph.nodes.flatMap((node) => node.npmSpecifiers),
    );

    expect(extra).toEqual(['lodash', 'chalk']);
    expect(unsupportedPackageError(extra)).toBe(
      'Unsupported packages chalk, lodash. Only poly vendor libraries can be imported.',
    );
  });

  test('undeclared identifier fails typecheck', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';

export const App = () => {
  const label = _.toUpper('hello');
  return <div>{label}</div>;
};
`,
    });

    await expect(
      compileComponentGraph({
        projectRoot: tmp,
        npmResolveDir,
        context: 'myapp',
        name: 'App',
        file: 'src/App.tsx',
        isRoot: true,
      }),
    ).rejects.toThrow(/Cannot find name '_'/);
  });

  test('window typechecks even when project tsconfig omits DOM', async () => {
    fs.writeFileSync(
      path.join(tmp, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'es2021',
          lib: ['es2021'],
          jsx: 'react-jsx',
        },
      }),
    );
    const source = `import React from 'react';

export const App = () => {
  const width = window.innerWidth;
  return <div>{width}</div>;
};
`;
    writeComponents({ 'src/App.tsx': source });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].sourceCode).toContain('window.innerWidth');
  });
});

describe('readPackageVersion', () => {
  test('reads version when exports omit package.json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-pkg-version-'));
    try {
      const pkgDir = path.join(dir, 'node_modules', 'blocked-pkg');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({
          name: 'blocked-pkg',
          version: '9.9.9',
          exports: { '.': './index.js' },
        }),
      );
      fs.writeFileSync(path.join(pkgDir, 'index.js'), 'export default {};\n');

      expect(readPackageVersion('blocked-pkg', dir)).toBe('9.9.9');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('component identifiers', () => {
  test('rejects a hyphenated filename the API would reject', () => {
    expect(componentNameError('nav-bar')).toMatch(/nav-bar/);
    expect(componentNameError('navBar')).toBeUndefined();
    expect(componentNameError('nav_bar')).toBeUndefined();
    expect(componentNameError('_nav')).toBeUndefined();
    expect(componentNameError('123nav')).toMatch(/123nav/);
    expect(() =>
      assertComponentIdentifiers([
        { name: 'nav-bar', context: 'myapp', file: 'src/nav-bar.tsx' },
      ]),
    ).toThrow(/src\/nav-bar\.tsx/);
  });

  test('rejects a context the API would reject', () => {
    expect(componentContextError('')).toBeUndefined();
    expect(componentContextError('myapp.nav')).toBeUndefined();
    expect(componentContextError('my-app')).toMatch(/my-app/);
    expect(() =>
      assertComponentIdentifiers([
        { name: 'App', context: 'my-app', file: 'src/App.tsx' },
      ]),
    ).toThrow(/my-app/);
  });
});

describe('component visibility', () => {
  test('reads a component id from specs and ignores other types', () => {
    const specs = [
      polySpec('serverFunction', 'myapp.Button', 'server-id'),
      polySpec('componentFunction', 'myapp.Button', 'component-id'),
    ];
    expect(componentIdFromSpecs(specs, 'myapp.Button')).toBe('component-id');
    expect(componentIdFromSpecs(specs, 'myapp.Missing')).toBeNull();
  });
});

describe('reactFamilyMismatchWarnings', () => {
  let npmResolveDir: string;

  beforeEach(() => {
    npmResolveDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'poly-react-versions-'),
    );
    installResolveFixtures(npmResolveDir);
  });

  afterEach(() => {
    fs.rmSync(npmResolveDir, { recursive: true, force: true });
  });

  test('is silent when resolved versions match the instance', () => {
    expect(
      reactFamilyMismatchWarnings(
        {
          react: '18.3.1',
          'react-dom': '18.3.1',
          'react/jsx-runtime': '18.3.1',
        },
        npmResolveDir,
      ),
    ).toEqual([]);
  });

  test('warns when instance react does not match the project', () => {
    const warnings = reactFamilyMismatchWarnings(
      {
        react: '16.14.0',
        'react-dom': '16.14.0',
        'react/jsx-runtime': '16.14.0',
      },
      npmResolveDir,
    ).join('\n');

    expect(warnings).toMatch(/16\.14\.0/);
    expect(warnings).toMatch(/18\.3\.1/);
  });
});

describe('component sdk types', () => {
  test('emits a component function as a value on its context', async () => {
    const libPath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'poly-component-types-'),
    );
    jest
      .spyOn(utils, 'loadTemplate')
      .mockImplementation((fileName: string) =>
        fs.readFileSync(
          path.join(process.cwd(), 'templates', fileName),
          'utf8',
        ),
      );
    try {
      await generateFunctionsTSDeclarationFile(libPath, [
        polySpec('componentFunction', 'myapp.Button'),
      ]);
      const context = fs.readFileSync(path.join(libPath, 'myapp.d.ts'), 'utf8');
      const root = fs.readFileSync(path.join(libPath, 'default.d.ts'), 'utf8');

      expect(context).toContain('Button: any');
      expect(root).toContain('myapp: Myapp');
      expect(context).not.toContain('Button(');
    } finally {
      jest.restoreAllMocks();
      fs.rmSync(libPath, { recursive: true, force: true });
    }
  });
});
