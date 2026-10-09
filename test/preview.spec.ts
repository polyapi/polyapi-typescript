/// <reference types="jest" />
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { request as undiciRequest } from 'undici';
import { resetHttpDispatchers } from '../src/http';
import {
  fetchDeployedApp,
  rewritePreviewHtml,
  startApplicationPreview,
  type DeployedAppAssets,
} from '../src/component/preview';
import { Visibility } from '../src/types';

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

const deployedHtml = (imports: Record<string, string>, manifest: object) =>
  `<!DOCTYPE html>
<html>
  <head>
    <script type="importmap">${JSON.stringify({ imports })}</script>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__POLY_V2_MANIFEST__ = ${JSON.stringify(manifest)};
    </script>
  </body>
</html>
`;

const getText = (url: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: string[] = [];
        res.on('data', (chunk) => chunks.push(String(chunk)));
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            body: chunks.join(''),
          }),
        );
      })
      .on('error', reject);
  });

describe('application preview', () => {
  test('rewrites deployed import map to local component URLs and remote vendor proxies', () => {
    const imports = {
      'poly:vendor': 'http://instance.test/canopy/v2/vendor/abc/poly-vendor.js',
      'poly:app-vendor':
        'http://instance.test/canopy/v2/public/myapp.App2/v/vendor.js',
      'poly:myapp.App2':
        'http://instance.test/canopy/v2/public/myapp.App2/h/code.js',
      'poly:myapp.Button':
        'http://instance.test/canopy/v2/public/myapp.Button/h/code.js',
    };
    const manifest = {
      subpath: 'welcome',
      unauthenticatedRoot: 'myapp.App2',
      authenticatedRoot: 'myapp.AuthenticatedApp',
      vendorHash: 'abc',
      imports,
    };
    const { html, manifest: next } = rewritePreviewHtml(
      deployedHtml(imports, manifest),
      manifest,
      ['myapp.App2', 'myapp.Button', 'myapp.AuthenticatedApp'],
    );

    expect(next.imports['poly:vendor']).toBe('/__remote/poly-vendor.js');
    expect(next.imports['poly:app-vendor']).toBe('/__remote/app-vendor.js');
    expect(next.imports['poly:myapp.App2']).toBe('/__poly/myapp.App2.js');
    expect(next.imports['poly:myapp.AuthenticatedApp']).toBe(
      '/__poly/myapp.AuthenticatedApp.js',
    );
    expect(html).toContain('/__poly/myapp.App2.js');
    expect(html).toContain('/__remote/poly-vendor.js');
    expect(html).toContain('poly application preview');
    expect(html).not.toContain(
      'http://instance.test/canopy/v2/public/myapp.App2/h/code.js',
    );
  });

  test('serves compiled local components with the deployed bootstrap', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-preview-'));
    const npmResolveDir = path.resolve(__dirname, '..');
    fs.mkdirSync(path.join(tmp, '.poly'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'src', 'App.tsx'),
      `import React from 'react';
import { Button } from './Button';
export const App = () => <Button label="local-preview" />;
`,
    );
    fs.writeFileSync(
      path.join(tmp, 'src', 'Button.tsx'),
      `import React from 'react';
export const Button = ({ label }: { label: string }) => <button>{label}</button>;
`,
    );
    fs.writeFileSync(
      path.join(tmp, '.poly', 'components.json'),
      JSON.stringify(
        {
          'myapp.App': {
            file: 'src/App.tsx',
            kind: 'root',
            visibility: Visibility.Public,
            imports: ['myapp.Button'],
          },
          'myapp.Button': {
            file: 'src/Button.tsx',
            kind: 'leaf',
            visibility: Visibility.Public,
            imports: [],
          },
        },
        null,
        2,
      ),
    );

    const imports = {
      'poly:vendor': 'http://instance.test/canopy/v2/vendor/abc/poly-vendor.js',
      'poly:myapp.App':
        'http://instance.test/canopy/v2/public/myapp.App/h/code.js',
    };
    const manifest = {
      subpath: 'welcome',
      unauthenticatedRoot: 'myapp.App',
      authenticatedRoot: null,
      vendorHash: 'abc',
      imports,
    };
    const assets: DeployedAppAssets = {
      manifest,
      indexHtml: deployedHtml(imports, manifest),
    };

    const server = await startApplicationPreview({
      subpath: 'welcome',
      port: 0,
      projectRoot: tmp,
      npmResolveDir,
      watch: false,
      assets,
    });

    try {
      const index = await getText(server.url);
      expect(index.status).toBe(200);
      expect(index.body).toContain('/__poly/myapp.App.js');
      expect(index.body).toContain('/__poly/myapp.Button.js');
      expect(index.body).toContain('/__remote/poly-vendor.js');

      const app = await getText(`${server.url}__poly/myapp.App.js`);
      expect(app.status).toBe(200);
      expect(app.body).toContain('poly:myapp.Button');
      expect(app.body).toContain('poly:vendor');
      expect(app.body).toContain('local-preview');

      const meta = await getText(
        `${server.url}functions/component/myapp.App?usePathId=true`,
      );
      expect(meta.status).toBe(200);
      expect(JSON.parse(meta.body)).toMatchObject({
        id: 'myapp.App',
        contextName: 'myapp.App',
        imports: ['myapp.Button'],
      });

      const manifestRes = await getText(`${server.url}canopy/v2/manifest`);
      expect(manifestRes.status).toBe(200);
      expect(JSON.parse(manifestRes.body).imports['poly:myapp.App']).toBe(
        '/__poly/myapp.App.js',
      );
      expect(JSON.parse(manifestRes.body).imports['poly:vendor']).toBe(
        '/__remote/poly-vendor.js',
      );
    } finally {
      await server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('loads the live manifest and shared bootstrap', async () => {
    const prevBaseUrl = process.env.POLY_API_BASE_URL;
    process.env.POLY_API_BASE_URL = 'https://poly.example.test';
    resetHttpDispatchers();
    const manifest = {
      subpath: 'welcome',
      unauthenticatedRoot: 'myapp.App2',
      authenticatedRoot: null,
      vendorHash: 'abc',
      imports: {
        'poly:vendor': 'https://poly.example.test/canopy/v2/vendor/abc/poly-vendor.js',
        'poly:myapp.App2':
          'https://poly.example.test/canopy/v2/public/myapp.App2/h/code.js',
      },
    };
    undiciRequestMock.mockImplementation(async (url) => {
      const href = String(url);
      const text = href.includes('/canopy/v2/manifest')
        ? JSON.stringify(manifest)
        : '<!DOCTYPE html><html><body><script>window.__POLY_API_BASE__ = "https://poly.example.test";</script></body></html>';
      const bytes = new TextEncoder().encode(text);
      return {
        statusCode: 200,
        headers: {
          'content-type': href.includes('/canopy/v2/manifest')
            ? 'application/json'
            : 'text/html',
        },
        body: {
          text: async () => text,
          arrayBuffer: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        },
      } as any;
    });

    try {
      const deployed = await fetchDeployedApp({ subpath: 'welcome' });
      expect(deployed.manifest.unauthenticatedRoot).toBe('myapp.App2');
      const urls = undiciRequestMock.mock.calls.map(([url]) => String(url));
      expect(urls).toContain(
        'https://poly.example.test/canopy/v2/manifest?subpath=welcome',
      );
      expect(urls).toContain('https://poly.example.test/canopy/v2/');
      expect(urls.some((url) => url.includes('/canopy/v2/welcome/'))).toBe(
        false,
      );

      undiciRequestMock.mockClear();
      await fetchDeployedApp({ app: 'demo', env: 'develop' });
      expect(String(undiciRequestMock.mock.calls[0][0])).toBe(
        'https://poly.example.test/canopy/v2/manifest?app=demo&env=develop',
      );

      const rewritten = rewritePreviewHtml(deployed.indexHtml, deployed.manifest, [
        'myapp.App2',
      ]);
      expect(rewritten.html).toContain('window.__POLY_API_BASE__ = ""');
      expect(rewritten.manifest.imports['poly:myapp.App2']).toBe(
        '/__poly/myapp.App2.js',
      );
    } finally {
      resetHttpDispatchers();
      if (prevBaseUrl === undefined) delete process.env.POLY_API_BASE_URL;
      else process.env.POLY_API_BASE_URL = prevBaseUrl;
    }
  });
});
