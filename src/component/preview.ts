import fs from 'fs';
import http from 'http';
import path from 'path';
import chalk from 'chalk';
import shell from 'shelljs';
import * as httpClient from '../http';
import { getPolyVendor } from '../api';
import { reactFamilyMismatchWarnings } from './instanceVendor';
import {
  cloneManifest,
  loadManifest,
  resolveExistingPath,
} from './manifest';
import {
  CompiledComponentNode,
  compileGraphs,
  GraphStart,
} from './graph';
import { ComponentManifest, splitPolyPath } from './types';

export type DeployedAppManifest = {
  subpath: string;
  unauthenticatedRoot: string;
  authenticatedRoot: string | null;
  vendorHash: string;
  imports: Record<string, string>;
  loadingLogoSrc?: string | null;
};

export type DeployedAppAssets = {
  manifest: DeployedAppManifest;
  indexHtml: string;
};

const normalizeSubpath = (subpath: string) =>
  subpath.replace(/^\/+|\/+$/g, '');

const instanceBaseUrl = () =>
  (process.env.POLY_API_BASE_URL || '').replace(/\/+$/, '');

export type DeployedAppQuery = {
  subpath?: string;
  app?: string;
  env?: string;
};

export const canopyV2ManifestUrl = (
  baseUrl: string,
  query: DeployedAppQuery,
) => {
  const base = baseUrl.replace(/\/+$/, '');
  const subpath = query.subpath ? normalizeSubpath(query.subpath) : '';
  if (subpath) {
    return `${base}/canopy/v2/manifest?subpath=${encodeURIComponent(subpath)}`;
  }
  const app = query.app?.trim();
  const env = query.env?.trim();
  if (app && env) {
    return `${base}/canopy/v2/manifest?app=${encodeURIComponent(app)}&env=${encodeURIComponent(env)}`;
  }
  throw new Error(
    'Provide a hosted subpath or both app and env for /canopy/v2/manifest.',
  );
};

const LOCAL_COMPONENT_PREFIX = '/__poly/';
const LOCAL_VENDOR = '/__remote/poly-vendor.js';
const LOCAL_APP_VENDOR = '/__remote/app-vendor.js';

const encodePolyPath = (polyPath: string) => encodeURIComponent(polyPath);

const localComponentUrl = (polyPath: string) =>
  `${LOCAL_COMPONENT_PREFIX}${encodePolyPath(polyPath)}.js`;

export const parseDeployedManifest = (value: unknown): DeployedAppManifest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Deployed application manifest is invalid.');
  }
  const raw = value as Record<string, unknown>;
  const unauthenticatedRoot =
    typeof raw.unauthenticatedRoot === 'string' ? raw.unauthenticatedRoot : '';
  if (!unauthenticatedRoot) {
    throw new Error(
      'Deployed application is missing unauthenticatedRoot. Create the app via POST /applications first.',
    );
  }
  const imports =
    raw.imports && typeof raw.imports === 'object' && !Array.isArray(raw.imports)
      ? (raw.imports as Record<string, string>)
      : {};
  return {
    subpath: typeof raw.subpath === 'string' ? raw.subpath : '',
    unauthenticatedRoot,
    authenticatedRoot:
      typeof raw.authenticatedRoot === 'string' && raw.authenticatedRoot
        ? raw.authenticatedRoot
        : null,
    vendorHash: typeof raw.vendorHash === 'string' ? raw.vendorHash : '',
    imports,
    loadingLogoSrc:
      typeof raw.loadingLogoSrc === 'string' ? raw.loadingLogoSrc : null,
  };
};

export const fetchDeployedApp = async (
  query: DeployedAppQuery,
  baseUrl = instanceBaseUrl(),
): Promise<DeployedAppAssets> => {
  if (!baseUrl) {
    throw new Error(
      'POLY_API_BASE_URL is not set. Run `poly setup` or export POLY_API_BASE_URL.',
    );
  }
  const manifestUrl = canopyV2ManifestUrl(baseUrl, query);
  const indexUrl = `${baseUrl}/canopy/v2/`;
  try {
    const manifestRes = await httpClient.get<unknown>(manifestUrl, {
      responseType: 'json',
    });
    const htmlRes = await httpClient.get<string>(indexUrl, {
      responseType: 'text',
    });
    return {
      manifest: parseDeployedManifest(manifestRes.data),
      indexHtml: htmlRes.data,
    };
  } catch (error) {
    const err = error as { response?: { status?: number }; message?: string };
    if (err?.response?.status === 404) {
      throw new Error(
        `No canopy-v2 application for ${manifestUrl}. Create it with \`poly application create\` first.`,
      );
    }
    throw new Error(
      err?.message || `Failed to load canopy-v2 manifest from ${manifestUrl}`,
    );
  }
};

const replaceJsonLiteral = (html: string, marker: string, value: unknown) => {
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const jsonStart = start + marker.length;
  const slice = html.slice(jsonStart);
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = jsonStart + i + 1;
        break;
      }
    }
  }
  if (end < 0) return html;
  return `${html.slice(0, jsonStart)}${JSON.stringify(value)}${html.slice(end)}`;
};

export const rewritePreviewHtml = (
  html: string,
  manifest: DeployedAppManifest,
  localPaths: string[],
): { html: string; manifest: DeployedAppManifest } => {
  const local = new Set(localPaths);
  const imports: Record<string, string> = { ...manifest.imports };
  if (imports['poly:vendor'] || manifest.vendorHash) {
    imports['poly:vendor'] = LOCAL_VENDOR;
  }
  if (imports['poly:app-vendor']) {
    imports['poly:app-vendor'] = LOCAL_APP_VENDOR;
  }
  for (const polyPath of local) {
    imports[`poly:${polyPath}`] = localComponentUrl(polyPath);
  }

  const nextManifest: DeployedAppManifest = {
    ...manifest,
    imports,
  };

  let next = html;
  next = replaceJsonLiteral(next, 'type="importmap">', { imports });
  next = replaceJsonLiteral(next, 'window.__POLY_V2_MANIFEST__ = ', nextManifest);
  next = next.replace(
    /window\.__POLY_API_BASE__\s*=\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/,
    'window.__POLY_API_BASE__ = ""',
  );
  if (!next.includes('poly application preview')) {
    next = next.replace(
      '<body>',
      '<body>\n    <!-- poly application preview: deployed vendor, local components -->',
    );
  }
  return { html: next, manifest: nextManifest };
};

const requireLocalRoot = (
  manifest: ComponentManifest,
  polyPath: string,
  role: string,
  projectRoot: string,
): GraphStart => {
  const entry = manifest[polyPath];
  if (!entry) {
    throw new Error(
      `Local component \`${polyPath}\` is not in .poly/components.json. Publish it before previewing, or add the file to the manifest.`,
    );
  }
  if (entry.kind !== 'root') {
    throw new Error(`${role} \`${polyPath}\` must be kind=root.`);
  }
  const absFile = resolveExistingPath(path.resolve(projectRoot, entry.file));
  const { context, name } = splitPolyPath(polyPath);
  return { absFile, context, name, kind: 'root' };
};

export const compilePreviewComponents = async (options: {
  projectRoot: string;
  npmResolveDir: string;
  deployed: DeployedAppManifest;
}): Promise<CompiledComponentNode[]> => {
  const originalManifest = loadManifest(options.projectRoot);
  const manifest = cloneManifest(originalManifest);
  const starts = [
    requireLocalRoot(
      originalManifest,
      options.deployed.unauthenticatedRoot,
      'Unauthenticated root',
      options.projectRoot,
    ),
  ];
  if (options.deployed.authenticatedRoot) {
    starts.push(
      requireLocalRoot(
        originalManifest,
        options.deployed.authenticatedRoot,
        'Authenticated root',
        options.projectRoot,
      ),
    );
  }
  const nodes = await compileGraphs(starts, {
    projectRoot: options.projectRoot,
    npmResolveDir: options.npmResolveDir,
    originalManifest,
    manifest,
    walkChildrenFromLeaves: true,
  });
  return [...nodes.values()];
};

const send = (
  res: http.ServerResponse,
  status: number,
  body: string | Buffer,
  contentType: string,
) => {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
};

const readRequestBody = (req: http.IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const proxyToInstance = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetPath: string,
) => {
  const base = instanceBaseUrl();
  const url = `${base}${targetPath}`;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  const method = (req.method || 'GET').toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : await readRequestBody(req);
  const upstream = await httpClient.request({
    url,
    method,
    headers,
    body,
    responseType: 'arraybuffer',
  });
  res.statusCode = upstream.status;
  for (const [key, value] of Object.entries(upstream.headers || {})) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    res.setHeader(key, value);
  }
  res.end(upstream.data as Buffer);
};

const proxyRemoteUrl = async (res: http.ServerResponse, remoteUrl?: string) => {
  if (!remoteUrl) {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    return;
  }
  const upstream = await httpClient.request({
    url: remoteUrl,
    method: 'GET',
    responseType: 'arraybuffer',
  });
  res.statusCode = upstream.status;
  res.setHeader(
    'Content-Type',
    upstream.headers['content-type'] ||
      'application/javascript; charset=utf-8',
  );
  res.setHeader('Cache-Control', 'no-store');
  res.end(upstream.data as Buffer);
};

const matchLocalComponent = (
  pathname: string,
  nodes: Map<string, CompiledComponentNode>,
) => {
  if (
    !pathname.startsWith(LOCAL_COMPONENT_PREFIX) ||
    !pathname.endsWith('.js')
  ) {
    return undefined;
  }
  const encoded = pathname.slice(LOCAL_COMPONENT_PREFIX.length, -3);
  let polyPath = encoded;
  try {
    polyPath = decodeURIComponent(encoded);
  } catch {
    // keep encoded
  }
  return nodes.get(polyPath);
};

const matchComponentApi = (pathname: string) => {
  const match = pathname.match(
    /^\/functions\/component\/([^/]+)(?:\/(code|vendor)\.js)?$/,
  );
  if (!match) return undefined;
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep encoded
  }
  return { id, asset: match[2] as 'code' | 'vendor' | undefined };
};

export type PreviewServer = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

export const startApplicationPreview = async (options: {
  subpath?: string;
  app?: string;
  env?: string;
  port?: number;
  projectRoot?: string;
  npmResolveDir?: string;
  watch?: boolean;
  assets?: DeployedAppAssets;
}): Promise<PreviewServer> => {
  const projectRoot = resolveExistingPath(options.projectRoot ?? process.cwd());
  const npmResolveDir = resolveExistingPath(
    options.npmResolveDir ?? projectRoot,
  );
  const deployed =
    options.assets ||
    (await fetchDeployedApp({
      subpath: options.subpath,
      app: options.app,
      env: options.env,
    }));

  try {
    const instanceVendor = await getPolyVendor();
    for (const warning of reactFamilyMismatchWarnings(
      instanceVendor.packages || {},
      npmResolveDir,
    )) {
      shell.echo(chalk.yellow('WARNING:'), warning);
    }
  } catch {
    // Preview can still run off the deployed vendor URLs.
  }

  let nodes = new Map<string, CompiledComponentNode>();
  let indexHtml = '';
  let previewManifest = deployed.manifest;

  const recompile = async () => {
    const compiled = await compilePreviewComponents({
      projectRoot,
      npmResolveDir,
      deployed: deployed.manifest,
    });
    nodes = new Map(compiled.map((node) => [node.polyPath, node]));
    const rewritten = rewritePreviewHtml(
      deployed.indexHtml,
      deployed.manifest,
      [...nodes.keys()],
    );
    indexHtml = rewritten.html;
    previewManifest = rewritten.manifest;
  };

  await recompile();

  const vendorUrl = deployed.manifest.imports['poly:vendor'];
  const appVendorUrl = deployed.manifest.imports['poly:app-vendor'];

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname;

      if (pathname === '/' || pathname === '/index.html') {
        send(res, 200, indexHtml, 'text/html; charset=utf-8');
        return;
      }

      if (pathname === '/canopy/v2/manifest') {
        send(
          res,
          200,
          JSON.stringify(previewManifest),
          'application/json; charset=utf-8',
        );
        return;
      }

      if (pathname === LOCAL_VENDOR) {
        await proxyRemoteUrl(res, vendorUrl);
        return;
      }
      if (pathname === LOCAL_APP_VENDOR) {
        await proxyRemoteUrl(res, appVendorUrl);
        return;
      }

      const local = matchLocalComponent(pathname, nodes);
      if (local) {
        send(res, 200, local.code, 'application/javascript; charset=utf-8');
        return;
      }

      const api = matchComponentApi(pathname);
      if (api) {
        const node = nodes.get(api.id);
        if (!node) {
          send(
            res,
            404,
            `Unknown local component ${api.id}`,
            'text/plain; charset=utf-8',
          );
          return;
        }
        if (api.asset === 'code') {
          send(res, 200, node.code, 'application/javascript; charset=utf-8');
          return;
        }
        if (api.asset === 'vendor') {
          await proxyRemoteUrl(res, appVendorUrl);
          return;
        }
        send(
          res,
          200,
          JSON.stringify({
            id: node.polyPath,
            name: node.name,
            context: node.context,
            contextName: node.polyPath,
            kind: node.kind,
            imports: node.imports,
            vendorHash:
              node.kind === 'root' && appVendorUrl
                ? previewManifest.vendorHash || 'local'
                : null,
          }),
          'application/json; charset=utf-8',
        );
        return;
      }

      if (
        pathname === '/auth/session' ||
        pathname.startsWith('/auth/') ||
        pathname === '/functions/vendor'
      ) {
        await proxyToInstance(req, res, `${pathname}${url.search}`);
        return;
      }

      send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        send(res, 500, message, 'text/plain; charset=utf-8');
      }
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4173, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        resolve(address.port);
        return;
      }
      resolve(options.port ?? 4173);
    });
  });

  const watchers: fs.FSWatcher[] = [];
  if (options.watch !== false) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watched = new Set(
      [...nodes.values()].map((node) => path.dirname(node.absFile)),
    );
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        recompile()
          .then(() => shell.echo(chalk.green('Recompiled local components.')))
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            shell.echo(chalk.redBright('Compile failed:'), message);
          });
      }, 150);
    };
    for (const dir of watched) {
      try {
        const watcher = fs.watch(dir, { persistent: true }, schedule);
        watchers.push(watcher);
      } catch {
        // ignore unwatchable dirs
      }
    }
  }

  const close = () =>
    new Promise<void>((resolve, reject) => {
      for (const watcher of watchers) watcher.close();
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    close,
  };
};
