/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  findBareNpmSpecifiersInCode,
  readPackageVersion,
  uniquePreserve,
} from '../src/component/compile';
import { compileComponentGraph, topoLeavesFirst } from '../src/component/graph';
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
  resolveComponentVisibility,
  unsupportedPackageError,
  visibilityForPublish,
} from '../src/component/publish';
import { Visibility } from '../src/types';

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
};

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
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('root with a local child rewrites react to poly:vendor and orders the leaf first', async () => {
    const appSource = `import React from 'react';
import { Button } from './Button';

export const App = () => {
  const label = React.useMemo(() => 'hello', []);
  return <Button label={label} />;
};
`;
    const buttonSource = `import React from 'react';

export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
`;
    writeComponents({
      'src/App.tsx': appSource,
      'src/Button.tsx': buttonSource,
    });

    const graph = await compileComponentGraph({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    const ordered = topoLeavesFirst(graph.nodes);
    const leaf = ordered.find((node) => node.name === 'Button');
    const root = ordered.find((node) => node.name === 'App');

    expect(ordered.map((node) => node.name)).toEqual(['Button', 'App']);
    expect(leaf).toMatchObject({
      context: 'myapp',
      kind: 'leaf',
      sourceCode: buttonSource,
    });
    expect(root).toMatchObject({
      context: 'myapp',
      kind: 'root',
      sourceCode: appSource,
      imports: ['myapp.Button'],
    });
    expect(root?.sourceCode).toContain("from 'react'");
    expect(root?.sourceCode).toContain("from './Button'");
    expect(extraPackages(graph.nodes.flatMap((node) => node.npmSpecifiers))).toEqual(
      [],
    );

    for (const node of graph.nodes) {
      expect(node.code).toContain('poly:vendor');
      expect(node.code).not.toContain('poly:app-vendor');
      expect(node.code).not.toMatch(npmImportPattern('react'));
      expect(findBareNpmSpecifiersInCode(node.code)).toEqual([]);
    }
    expect(root?.code).toContain('poly:myapp.Button');
    expect(graph.manifest['myapp.App']).toMatchObject({
      file: 'src/App.tsx',
      kind: 'root',
    });
    expect(graph.manifest['myapp.Button']).toMatchObject({
      file: 'src/Button.tsx',
      kind: 'leaf',
    });
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
    const extra = extraPackages(graph.nodes.flatMap((node) => node.npmSpecifiers));

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
    const extra = extraPackages(graph.nodes.flatMap((node) => node.npmSpecifiers));

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
      assertComponentIdentifiers([{ name: 'App', context: 'my-app', file: 'src/App.tsx' }]),
    ).toThrow(/my-app/);
  });
});

describe('component visibility', () => {
  test('leaves visibility unset when there is no flag and no manifest entry', () => {
    expect(
      resolveComponentVisibility({
        nodePolyPath: 'myapp.Button',
        startPolyPath: 'myapp.App',
        publishKind: 'root',
      }),
    ).toBeUndefined();
  });

  test('keeps the manifest visibility when no flag is passed', () => {
    expect(
      resolveComponentVisibility({
        nodePolyPath: 'myapp.Button',
        startPolyPath: 'myapp.App',
        publishKind: 'root',
        manifestVisibility: Visibility.Public,
      }),
    ).toBe(Visibility.Public);
  });

  test('an explicit root visibility applies to every node', () => {
    expect(
      resolveComponentVisibility({
        nodePolyPath: 'myapp.Button',
        startPolyPath: 'myapp.App',
        publishKind: 'root',
        commandVisibility: Visibility.Public,
        manifestVisibility: Visibility.Environment,
      }),
    ).toBe(Visibility.Public);
  });

  test('an explicit leaf visibility applies only to that leaf', () => {
    expect(
      resolveComponentVisibility({
        nodePolyPath: 'myapp.Button',
        startPolyPath: 'myapp.Button',
        publishKind: 'leaf',
        commandVisibility: Visibility.Public,
      }),
    ).toBe(Visibility.Public);
    expect(
      resolveComponentVisibility({
        nodePolyPath: 'myapp.App',
        startPolyPath: 'myapp.Button',
        publishKind: 'leaf',
        commandVisibility: Visibility.Public,
        manifestVisibility: Visibility.Environment,
      }),
    ).toBe(Visibility.Environment);
  });

  test('keeps the server visibility when nothing local chooses one', () => {
    expect(visibilityForPublish(undefined, Visibility.Public)).toBe(Visibility.Public);
    expect(visibilityForPublish(undefined, undefined)).toBe(Visibility.Environment);
    expect(visibilityForPublish(Visibility.Environment, Visibility.Public)).toBe(
      Visibility.Environment,
    );
  });
});

describe('reactFamilyMismatchWarnings', () => {
  let npmResolveDir: string;

  beforeEach(() => {
    npmResolveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-react-versions-'));
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
