/// <reference types="jest" />
import fs from 'fs';
import os from 'os';
import path from 'path';
import { request as undiciRequest } from 'undici';
import shell from 'shelljs';
import { resetHttpDispatchers } from '../src/http';
import { publishComponents } from '../src/component/publish';
import { loadManifest } from '../src/component/manifest';
import {
  findBareNpmSpecifiersInCode,
  readPackageVersion,
} from '../src/component/compile';
import { NO_POLY_VENDOR_ERROR } from '../src/api';
import { reactFamilyMismatchWarnings } from '../src/component/instanceVendor';
import { publishInstanceVendor } from '../src/commands/vendor';

jest.mock('undici', () => {
  const actual = jest.requireActual('undici');
  return {
    ...actual,
    request: jest.fn(),
  };
});

const undiciRequestMock = undiciRequest as jest.MockedFunction<
  typeof undiciRequest
>;

const jsonResponse = (
  body: unknown,
  init: { statusCode?: number; headers?: Record<string, string> } = {},
) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const bytes = new TextEncoder().encode(text);
  return {
    statusCode: init.statusCode ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: {
      text: async () => text,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    },
  };
};

const npmImportPattern = (pkg: string) =>
  new RegExp(
    String.raw`(?:from|import)\s*(?:\(\s*)?['"]${pkg.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )}['"]`,
  );

const parseBody = (init?: { body?: unknown }) => {
  if (init?.body == null || init.body === '') return {};
  try {
    return JSON.parse(String(init.body));
  } catch {
    return {};
  }
};

const INSTANCE_VENDOR = {
  hash: 'vendor-hash-1',
  url: 'https://poly.example.test/functions/vendor.js',
  packages: {
    react: '18.3.1',
    'react-dom': '18.3.1',
    'react/jsx-runtime': '18.3.1',
  },
};

const httpCalls = () =>
  undiciRequestMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: String(init?.method || 'GET').toUpperCase(),
    headers: (init?.headers || {}) as Record<string, string>,
    rawBody: init?.body,
    body: parseBody(init),
  }));

const vendorGets = () =>
  httpCalls().filter(
    (call) => call.url.includes('/functions/vendor') && call.method === 'GET',
  );

const vendorPosts = () =>
  httpCalls().filter(
    (call) => call.url.includes('/functions/vendor') && call.method === 'POST',
  );

type ComponentPost = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, any>;
};

const componentPosts = (): ComponentPost[] =>
  undiciRequestMock.mock.calls
    .map(([url, init]) => ({
      url: String(url),
      method: String(init?.method || 'GET'),
      headers: (init?.headers || {}) as Record<string, string>,
      rawBody: init?.body,
    }))
    .filter(
      (call) =>
        call.url.includes('/functions/component') && call.method === 'POST',
    )
    .map((call) => ({
      url: call.url,
      method: call.method,
      headers: call.headers,
      body: JSON.parse(String(call.rawBody || '{}')),
    }));

describe('component function add', () => {
  const npmResolveDir = path.resolve(__dirname, '..');
  let tmp: string;
  const prevBaseUrl = process.env.POLY_API_BASE_URL;
  const prevApiKey = process.env.POLY_API_KEY;

  const writeComponents = (files: Record<string, string>) => {
    for (const [rel, contents] of Object.entries(files)) {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, contents);
    }
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-components-'));
    process.env.POLY_API_BASE_URL = 'https://poly.example.test';
    process.env.POLY_API_KEY = 'test-token';
    undiciRequestMock.mockReset();
    resetHttpDispatchers();
    let seq = 0;
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.includes('/functions/vendor') && method === 'GET') {
        return jsonResponse(INSTANCE_VENDOR) as any;
      }
      if (href.includes('/functions/vendor') && method === 'POST') {
        const posted = parseBody(init);
        return jsonResponse(
          {
            hash: 'posted-vendor-hash',
            url: 'https://poly.example.test/functions/vendor.js',
            packages: posted.packages,
          },
          { statusCode: 201 },
        ) as any;
      }
      if (href.includes('/canopy/v2/uploads') && method === 'POST') {
        const posted = parseBody(init);
        return jsonResponse(
          {
            url: `https://uploads.example.test/canopy/v2/npm/${posted.hash}/package.js`,
            key: `canopy/v2/npm/${posted.hash}/package.js`,
            method: 'PUT',
            headers: { 'Content-Type': 'application/javascript' },
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
          { statusCode: 201 },
        ) as any;
      }
      if (method === 'PUT') {
        return jsonResponse({ ok: true }) as any;
      }
      if (href.includes('/applications') && method === 'GET' && !href.includes('/applications/')) {
        return jsonResponse([]) as any;
      }
      seq += 1;
      const posted = parseBody(init);
      return jsonResponse(
        {
          id: `comp-${seq}`,
          name: posted.name,
          context: posted.context,
          kind: posted.kind,
        },
        { statusCode: seq === 1 ? 201 : 200 },
      ) as any;
    });
  });

  afterEach(() => {
    resetHttpDispatchers();
    fs.rmSync(tmp, { recursive: true, force: true });
    if (prevBaseUrl === undefined) delete process.env.POLY_API_BASE_URL;
    else process.env.POLY_API_BASE_URL = prevBaseUrl;
    if (prevApiKey === undefined) delete process.env.POLY_API_KEY;
    else process.env.POLY_API_KEY = prevApiKey;
  });

  test('root with local child + react + lodash posts leaves then root', async () => {
    const appSource = `import React from 'react';
import _ from 'lodash';
import { Button } from './Button';

export const App = () => {
  const label = React.useMemo(() => _.toUpper('hello'), []);
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

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    const posts = componentPosts();
    expect(posts).toHaveLength(2);
    expect(posts.every((post) => post.method === 'POST')).toBe(true);
    expect(
      undiciRequestMock.mock.calls.every(
        ([url, init]) =>
          String(init?.method) !== 'PATCH' &&
          !String(url).toLowerCase().includes('compile'),
      ),
    ).toBe(true);

    const leaf = posts[0];
    const root = posts[1];

    expect(leaf.url).toBe('https://poly.example.test/functions/component');
    expect(leaf.headers.Authorization).toBe('Bearer test-token');
    expect(leaf.body).toMatchObject({
      name: 'Button',
      context: 'myapp',
      kind: 'leaf',
    });
    expect(leaf.body.sourceCode).toBe(buttonSource);
    expect(leaf.body.code).toContain('poly:vendor');
    expect(leaf.body.code).not.toContain('poly:app-vendor');
    expect(leaf.body.vendorCode).toBeUndefined();
    expect(leaf.body.bundleHash).toBeUndefined();
    expect(leaf.body.vendorHash).toBeUndefined();

    expect(root.body).toMatchObject({
      name: 'App',
      context: 'myapp',
      kind: 'root',
      imports: ['myapp.Button'],
    });
    expect(root.body.sourceCode).toBe(appSource);
    expect(root.body.sourceCode).toContain("from 'react'");
    expect(root.body.sourceCode).toContain("from './Button'");
    expect(root.body.code).toContain('poly:myapp.Button');
    expect(root.body.code).toContain('poly:vendor');
    expect(root.body.code).toContain('poly:app-vendor');
    expect(root.body.code).toMatch(
      /lodash as __poly_lodash[^;]*from "poly:app-vendor"/,
    );
    expect(root.body.code).not.toMatch(
      /lodash as __poly_lodash[^;]*from "poly:vendor"/,
    );
    expect(root.body.vendorCode).toBeUndefined();
    expect(root.body.vendorHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(root.body.externalDependencies).toEqual({
      lodash: expect.any(String),
    });
    expect(root.body.bundleHash).toBeUndefined();
    expect(vendorPosts()).toHaveLength(0);
    expect(vendorGets().length).toBeGreaterThan(0);
    expect(vendorGets()[0].headers.Authorization).not.toBe(
      'Bearer test-token',
    );

    for (const post of posts) {
      expect(post.body.code).not.toMatch(npmImportPattern('react'));
      expect(post.body.code).not.toMatch(npmImportPattern('react-dom'));
      expect(post.body.code).not.toMatch(npmImportPattern('react/jsx-runtime'));
      expect(post.body.code).not.toMatch(npmImportPattern('lodash'));
      expect(findBareNpmSpecifiersInCode(post.body.code)).toEqual([]);
    }

    const manifest = loadManifest(tmp);
    expect(manifest['myapp.App']).toMatchObject({
      file: 'src/App.tsx',
      kind: 'root',
    });
    expect(manifest['myapp.Button']).toMatchObject({
      file: 'src/Button.tsx',
      kind: 'leaf',
    });
  });

  test('leaf update posts once without vendorCode and leaves the root unchanged', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import _ from 'lodash';
import { Button } from './Button';

export const App = () => {
  const label = React.useMemo(() => _.toUpper('hello'), []);
  return <Button label={label} />;
};
`,
      'src/Button.tsx': `import React from 'react';

export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    const afterRoot = componentPosts();
    const rootBody = afterRoot.find((post) => post.body.kind === 'root')?.body;
    expect(rootBody).toBeDefined();
    undiciRequestMock.mockClear();

    const updatedButton = `import React from 'react';

export const Button = ({ label }: { label: string }) => {
  return <button className="updated">{label}</button>;
};
`;
    writeComponents({ 'src/Button.tsx': updatedButton });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'Button',
      file: 'src/Button.tsx',
    });

    const leafPosts = componentPosts();
    expect(leafPosts).toHaveLength(1);
    expect(leafPosts[0].body).toMatchObject({
      name: 'Button',
      context: 'myapp',
      kind: 'leaf',
    });
    expect(leafPosts[0].body.sourceCode).toBe(updatedButton);
    expect(leafPosts[0].body.vendorCode).toBeUndefined();
    expect(leafPosts[0].body.externalDependencies).toBeUndefined();
    expect(leafPosts[0].body.code).toContain('poly:vendor');
    expect(leafPosts[0].body.code).not.toMatch(npmImportPattern('react'));
    expect(leafPosts[0].body.code).not.toMatch(
      npmImportPattern('react/jsx-runtime'),
    );

    const manifest = loadManifest(tmp);
    expect(manifest['myapp.App']).toMatchObject({
      file: 'src/App.tsx',
      kind: 'root',
    });
    expect(manifest['myapp.App'].externalDependencies).toEqual(
      rootBody.externalDependencies,
    );
  });

  test('leaf with a new npm package fails and does not grow vendor', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import { Button } from './Button';

export const App = () => {
  return <Button label={React.useMemo(() => 'hello', [])} />;
};
`,
      'src/Button.tsx': `import React from 'react';

export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    undiciRequestMock.mockClear();

    writeComponents({
      'src/Button.tsx': `import React from 'react';
import _ from 'lodash';

export const Button = ({ label }: { label: string }) => {
  return <button>{_.toUpper(label)}</button>;
};
`,
    });

    await expect(
      publishComponents({
        projectRoot: tmp,
        npmResolveDir,
        context: 'myapp',
        name: 'Button',
        file: 'src/Button.tsx',
      }),
    ).rejects.toThrow(
      'new vendor import lodash; re-publish the root `myapp.App`.',
    );
    expect(componentPosts()).toHaveLength(0);
  });

  test('leaf fails on unused npm imports that esbuild would tree-shake', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import { Button } from './Button';

export const App = () => {
  return <Button label="hello" />;
};
`,
      'src/Button.tsx': `import React from 'react';

export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    undiciRequestMock.mockClear();

    writeComponents({
      'src/Button.tsx': `import React from 'react';
import _ from 'lodash';
import * as chalk from 'chalk';

export const Button = ({ label }: { label: string }) => {
  return <button className="updated">{label}</button>;
};
`,
    });

    await expect(
      publishComponents({
        projectRoot: tmp,
        npmResolveDir,
        context: 'myapp',
        name: 'Button',
        file: 'src/Button.tsx',
      }),
    ).rejects.toThrow(
      'new vendor import lodash; re-publish the root `myapp.App`.',
    );
    expect(componentPosts()).toHaveLength(0);
  });

  test('undeclared identifier fails typecheck and does not upload', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
import { Button } from './Button';

export const App = () => {
  const label = React.useMemo(() => _.toUpper('hello'), []);
  return <Button label={label} />;
};
`,
      'src/Button.tsx': `import React from 'react';

export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
`,
    });

    await expect(
      publishComponents({
        projectRoot: tmp,
        npmResolveDir,
        context: 'myapp',
        name: 'App',
        file: 'src/App.tsx',
        isRoot: true,
      }),
    ).rejects.toThrow(/Cannot find name '_'/);
    expect(componentPosts()).toHaveLength(0);
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
    writeComponents({
      'src/App.tsx': `import React from 'react';

export const App = () => {
  const width = window.innerWidth;
  return <div>{width}</div>;
};
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    expect(componentPosts()).toHaveLength(1);
    expect(componentPosts()[0].body.sourceCode).toContain('window.innerWidth');
  });

  const publicAppSource = `import React from 'react';
import _ from 'lodash';
import { Button } from './Button';

export const App = () => {
  const label = React.useMemo(() => _.toUpper('hello'), []);
  return <Button label={label} />;
};
`;
  const publicButtonSource = `import React from 'react';

export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
`;

  test('root --public posts PUBLIC visibility on root and discovered leaves', async () => {
    writeComponents({
      'src/App.tsx': publicAppSource,
      'src/Button.tsx': publicButtonSource,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
      visibility: 'PUBLIC',
    });

    const posts = componentPosts();
    expect(posts).toHaveLength(2);
    expect(posts.map((post) => post.body.kind).sort()).toEqual(['leaf', 'root']);
    for (const post of posts) {
      expect(post.body.visibility).toBe('PUBLIC');
      expect(post.headers.Authorization).toBe('Bearer test-token');
      expect(post.body.code).toContain('poly:vendor');
      expect(post.body.code).not.toMatch(npmImportPattern('react'));
    }
    const root = posts.find((post) => post.body.kind === 'root')!;
    const leaf = posts.find((post) => post.body.kind === 'leaf')!;
    expect(root.body.code).toContain('poly:myapp.Button');
    expect(root.body.vendorCode).toBeUndefined();
    expect(root.body.vendorHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(leaf.body.vendorCode).toBeUndefined();

    const manifest = loadManifest(tmp);
    expect(manifest['myapp.App'].visibility).toBe('PUBLIC');
    expect(manifest['myapp.Button'].visibility).toBe('PUBLIC');
  });

  test('component add without --public does not post PUBLIC visibility', async () => {
    writeComponents({
      'src/App.tsx': publicAppSource,
      'src/Button.tsx': publicButtonSource,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    const posts = componentPosts();
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.body.visibility).not.toBe('PUBLIC');
      expect(post.body.visibility).toBe('ENVIRONMENT');
      expect(post.body.code).toContain('poly:vendor');
    }

    const manifest = loadManifest(tmp);
    expect(manifest['myapp.App'].visibility).toBe('ENVIRONMENT');
    expect(manifest['myapp.Button'].visibility).toBe('ENVIRONMENT');
  });

  test('leaf --public only marks that leaf PUBLIC and does not upload the root', async () => {
    writeComponents({
      'src/App.tsx': publicAppSource,
      'src/Button.tsx': publicButtonSource,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });
    undiciRequestMock.mockClear();

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'Button',
      file: 'src/Button.tsx',
      visibility: 'PUBLIC',
    });

    const leafPosts = componentPosts();
    expect(leafPosts).toHaveLength(1);
    expect(leafPosts[0].body).toMatchObject({
      name: 'Button',
      kind: 'leaf',
      visibility: 'PUBLIC',
    });
    expect(leafPosts[0].body.vendorCode).toBeUndefined();

    const manifest = loadManifest(tmp);
    expect(manifest['myapp.Button'].visibility).toBe('PUBLIC');
    expect(manifest['myapp.App'].visibility).toBe('ENVIRONMENT');
  });

  test('fails when GET /functions/vendor returns 404', async () => {
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.includes('/functions/vendor') && method === 'GET') {
        return jsonResponse({ message: 'not found' }, { statusCode: 404 }) as any;
      }
      return jsonResponse({ id: 'should-not-post' }) as any;
    });
    writeComponents({
      'src/App.tsx': `import React from 'react';
export const App = () => <div>hello</div>;
`,
    });

    await expect(
      publishComponents({
        projectRoot: tmp,
        npmResolveDir,
        context: 'myapp',
        name: 'App',
        file: 'src/App.tsx',
        isRoot: true,
      }),
    ).rejects.toThrow(NO_POLY_VENDOR_ERROR);
    expect(componentPosts()).toHaveLength(0);
    expect(vendorPosts()).toHaveLength(0);
  });

  test('react-only root omits extra vendor.js and still rewrites react to poly:vendor', async () => {
    writeComponents({
      'src/App.tsx': `import React from 'react';
export const App = () => <div>hello</div>;
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    const posts = componentPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].body.vendorCode).toBeNull();
    expect(posts[0].body.externalDependencies).toBeUndefined();
    expect(posts[0].body.code).toContain('poly:vendor');
    expect(posts[0].body.code).not.toContain('poly:app-vendor');
    expect(posts[0].body.code).not.toMatch(npmImportPattern('react'));
    expect(vendorPosts()).toHaveLength(0);
  });

  test('presigns extra npm then posts vendorHash without vendorCode', async () => {
    const { createHash } = await import('crypto');
    writeComponents({
      'src/App.tsx': `import React from 'react';
import _ from 'lodash';
export const App = () => <div>{_.toUpper('hello')}</div>;
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    const calls = httpCalls();
    const uploadPostIndex = calls.findIndex(
      (call) =>
        call.url.includes('/canopy/v2/uploads') && call.method === 'POST',
    );
    const uploadPutIndex = calls.findIndex((call) => call.method === 'PUT');
    const componentPostIndex = calls.findIndex(
      (call) =>
        call.url.includes('/functions/component') && call.method === 'POST',
    );
    expect(uploadPostIndex).toBeGreaterThanOrEqual(0);
    expect(uploadPutIndex).toBeGreaterThan(uploadPostIndex);
    expect(componentPostIndex).toBeGreaterThan(uploadPutIndex);

    const uploadPost = calls[uploadPostIndex];
    const uploadPut = calls[uploadPutIndex];
    const componentPost = calls[componentPostIndex];
    expect(Buffer.isBuffer(uploadPut.rawBody)).toBe(true);
    const putBytes = uploadPut.rawBody as Buffer;
    const hash = createHash('sha256')
      .update(putBytes.toString('utf8'))
      .digest('hex');

    expect(uploadPost.body).toEqual({
      hash,
      contentType: 'application/javascript',
    });
    expect(uploadPost.headers.Authorization).toBe('Bearer test-token');
    expect(uploadPut.url).toBe(
      `https://uploads.example.test/canopy/v2/npm/${hash}/package.js`,
    );
    expect(uploadPut.headers['Content-Type']).toBe('application/octet-stream');
    expect(uploadPut.headers.Authorization).toBeUndefined();
    expect(putBytes.toString('hex')).toBe(
      Buffer.from(putBytes.toString('utf8'), 'utf8').toString('hex'),
    );
    expect(putBytes.toString('utf8')).toMatch(/lodash/i);
    expect(putBytes.toString('utf8')).not.toMatch(/reactDomClient/);
    expect(putBytes.toString('utf8')).not.toMatch(npmImportPattern('react'));
    expect(componentPost.body.vendorHash).toBe(hash);
    expect(componentPost.body.vendorCode).toBeUndefined();
    expect(JSON.stringify(componentPost.body)).not.toContain(
      putBytes.toString('utf8'),
    );
  });

  test('component publish re-uploads the canopy-v2 application', async () => {
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.includes('/functions/vendor') && method === 'GET') {
        return jsonResponse(INSTANCE_VENDOR) as any;
      }
      if (href.endsWith('/applications') && method === 'GET') {
        return jsonResponse([
          {
            id: 'app-welcome',
            name: 'demo',
            runtime: 'canopy-v2',
            rootComponent: 'myapp.App',
            authenticatedRoot: null,
            subpath: 'welcome',
            config: { subpath: 'welcome' },
          },
          {
            id: 'app-other',
            name: 'other',
            runtime: 'canopy-v2',
            rootComponent: 'other.App',
            subpath: 'other',
            config: { subpath: 'other' },
          },
        ]) as any;
      }
      if (href.includes('/applications/app-welcome') && method === 'PATCH') {
        return jsonResponse({
          id: 'app-welcome',
          name: 'demo',
          runtime: 'canopy-v2',
          config: { subpath: 'welcome' },
        }) as any;
      }
      const posted = parseBody(init);
      return jsonResponse({
        id: 'comp-1',
        name: posted.name,
        context: posted.context,
        kind: posted.kind,
      }) as any;
    });

    writeComponents({
      'src/App.tsx': `import React from 'react';
import { Button } from './Button';
export const App = () => <Button label="hi" />;
`,
      'src/Button.tsx': `import React from 'react';
export const Button = ({ label }: { label: string }) => <button>{label}</button>;
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    const calls = httpCalls();
    const lastComponentPost = calls
      .map((call, index) => ({ call, index }))
      .filter(
        ({ call }) =>
          call.url.includes('/functions/component') && call.method === 'POST',
      )
      .pop();
    const patches = calls.filter(
      (call) => call.url.includes('/applications/') && call.method === 'PATCH',
    );
    expect(lastComponentPost).toBeDefined();
    expect(patches).toHaveLength(1);
    expect(calls.indexOf(patches[0])).toBeGreaterThan(lastComponentPost!.index);
    expect(patches[0].url).toBe(
      'https://poly.example.test/applications/app-welcome',
    );
    expect(patches[0].headers.Authorization).toBe('Bearer test-token');
    expect(patches[0].body).toEqual({
      name: 'demo',
      runtime: 'canopy-v2',
      rootComponent: 'myapp.App',
      config: { subpath: 'welcome' },
    });
    expect(patches[0].body.vendorHash).toBeUndefined();
    expect(patches[0].body.vendorCode).toBeUndefined();
  });

  test('warns when instance react does not match the project', async () => {
    const echo = jest.spyOn(shell, 'echo').mockImplementation(() => '');
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.includes('/functions/vendor') && method === 'GET') {
        return jsonResponse({
          ...INSTANCE_VENDOR,
          packages: {
            react: '16.14.0',
            'react-dom': '16.14.0',
            'react/jsx-runtime': '16.14.0',
          },
        }) as any;
      }
      const posted = parseBody(init);
      return jsonResponse({
        id: 'comp-1',
        name: posted.name,
        context: posted.context,
        kind: posted.kind,
      }) as any;
    });
    writeComponents({
      'src/App.tsx': `import React from 'react';
export const App = () => <div>hello</div>;
`,
    });

    await publishComponents({
      projectRoot: tmp,
      npmResolveDir,
      context: 'myapp',
      name: 'App',
      file: 'src/App.tsx',
      isRoot: true,
    });

    const warningText = echo.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(warningText).toMatch(/WARNING:/);
    expect(warningText).toMatch(/16\.14\.0/);
    expect(warningText).toMatch(/18\.3\.1/);
    echo.mockRestore();
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

describe('reactFamilyMismatchWarnings', () => {
  test('is silent when resolved versions match the instance', () => {
    const npmResolveDir = path.resolve(__dirname, '..');
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
});

describe('instance polyVendor publish', () => {
  const prevBaseUrl = process.env.POLY_API_BASE_URL;
  const prevApiKey = process.env.POLY_API_KEY;
  const npmResolveDir = path.resolve(__dirname, '..');

  beforeEach(() => {
    process.env.POLY_API_BASE_URL = 'https://poly.example.test';
    process.env.POLY_API_KEY = 'test-token';
    undiciRequestMock.mockReset();
    resetHttpDispatchers();
    undiciRequestMock.mockImplementation(async (url, init) => {
      const href = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (href.includes('/functions/vendor') && method === 'POST') {
        const posted = parseBody(init);
        return jsonResponse(
          {
            hash: 'posted-vendor-hash',
            url: 'https://poly.example.test/functions/vendor.js',
            packages: posted.packages,
          },
          { statusCode: 201 },
        ) as any;
      }
      return jsonResponse({ message: 'unexpected' }, { statusCode: 500 }) as any;
    });
  });

  afterEach(() => {
    resetHttpDispatchers();
    if (prevBaseUrl === undefined) delete process.env.POLY_API_BASE_URL;
    else process.env.POLY_API_BASE_URL = prevBaseUrl;
    if (prevApiKey === undefined) delete process.env.POLY_API_KEY;
    else process.env.POLY_API_KEY = prevApiKey;
  });

  test('bundles React-family ESM and POSTs /functions/vendor', async () => {
    const echo = jest.spyOn(shell, 'echo').mockImplementation(() => '');
    await publishInstanceVendor('node_modules/.poly', { npmResolveDir });
    echo.mockRestore();

    const posts = vendorPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].headers.Authorization).toBe('Bearer test-token');
    expect(posts[0].body.packages).toMatchObject({
      react: expect.any(String),
      'react-dom': expect.any(String),
    });
    expect(posts[0].body.code).toEqual(expect.any(String));
    expect(posts[0].body.code).toMatch(/react/i);
    expect(posts[0].body.code).not.toMatch(/react\.development/);
    expect(Buffer.byteLength(posts[0].body.code, 'utf8')).toBeLessThan(
      400_000,
    );
  });

  test('maps 403 to a SuperAdmin-only error', async () => {
    undiciRequestMock.mockImplementation(async () =>
      jsonResponse({ message: 'forbidden' }, { statusCode: 403 }) as any,
    );
    const echo = jest.spyOn(shell, 'echo').mockImplementation(() => '');
    await expect(
      publishInstanceVendor('node_modules/.poly', { npmResolveDir }),
    ).rejects.toThrow('POST /functions/vendor is SuperAdmin only');
    echo.mockRestore();
  });
});
