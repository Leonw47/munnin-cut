// Processo principal do Munnin Cut.
import { app, BrowserWindow, ipcMain, dialog, protocol, shell, session, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createMedia } from './media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

// ---------- Caminhos ----------
const binDir = app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(__dirname, '..', 'resources', 'bin');
const exe = (n) => {
  const p = path.join(binDir, `${n}.exe`);
  return fs.existsSync(p) ? p : n;
};
const FFMPEG = exe('ffmpeg');
const FFPROBE = exe('ffprobe');
const userDir = app.getPath('userData');
const cacheDir = path.join(userDir, 'cache');
const logsDir = path.join(userDir, 'logs');
const AUTOTEST = (!app.isPackaged && process.env.MC_AUTOTEST) || null;
const docsRoot = AUTOTEST ? path.join(os.tmpdir(), 'munnin-cut-testdocs') : path.join(app.getPath('documents'), 'Munnin Cut');
const draftsDir = path.join(docsRoot, 'Projetos');
const recordingsDir = path.join(docsRoot, 'Gravações');
const jobsRoot = path.join(os.tmpdir(), 'munnin-cut-jobs');
for (const d of [cacheDir, logsDir, draftsDir, recordingsDir, jobsRoot]) fs.mkdirSync(d, { recursive: true });

const media = createMedia({ ffmpeg: FFMPEG, ffprobe: FFPROBE, cacheDir });

// Teste automático: MC_AUTOTEST=<script.js> roda o script dentro da interface e salva capturas.
const TEST_OUT = process.env.MC_TEST_OUT || path.join(os.tmpdir(), 'munnin-cut-shots');

// ---------- Instância única + abrir .mcut pelo Explorer ----------
let win = null;
let pendingFile = process.argv.find((a) => a.toLowerCase().endsWith('.mcut')) || null;
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  const f = argv.find((a) => a.toLowerCase().endsWith('.mcut'));
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    if (f) win.webContents.send('app:openFile', f);
  }
});

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.ogv': 'video/ogg', '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bin': 'application/octet-stream',
};

function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      const file = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const st = await fsp.stat(file);
      const size = st.size;
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
      const range = request.headers.get('Range');
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m && m[1] ? parseInt(m[1], 10) : 0;
        let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
        end = Math.min(end, size - 1);
        if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
        const stream = fs.createReadStream(file, { start, end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
        });
      }
      return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
    } catch (e) {
      return new Response(String(e.message || e), { status: 404 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0e0e10',
    title: 'Munnin Cut',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#141416', symbolColor: '#cfcfd4', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (AUTOTEST) {
    win.webContents.on('console-message', (e) => {
      const lvl = e.level ?? '';
      if (lvl === 'error' || lvl === 'warning' || lvl === 3 || lvl === 2) console.log(`[console ${lvl}] ${e.message}`);
    });
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const code = fs.readFileSync(AUTOTEST, 'utf8');
        const r = await win.webContents.executeJavaScript(`(async () => { try {
${code}
 } catch (e) { await window.api.testLog('EXCECAO ' + (e && e.stack)); throw e; } })()`);
        console.log('AUTOTEST FIM', JSON.stringify(r));
      } catch (e) { console.log('AUTOTEST ERRO', e.message); }
      if (process.env.MC_TEST_KEEP !== '1') app.exit(0);
    });
  }
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerMediaProtocol();
  const allow = new Set(['media', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allow.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allow.has(perm));
  createWindow();
});
app.on('window-all-closed', () => app.quit());

// ---------- IPC ----------
const MEDIA_FILTER = [
  { name: 'Mídia', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv', 'gif', 'jpg', 'jpeg', 'jfif', 'png', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'avif', 'svg', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'flac', 'wma', 'aiff', 'aif', 'amr', 'ac3'] },
  { name: 'Todos os arquivos', extensions: ['*'] },
];

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  videosDir: app.getPath('videos'),
  documentsDir: app.getPath('documents'),
  draftsDir,
  recordingsDir,
}));

let nvencCache = null;
ipcMain.handle('app:nvenc', async () => {
  if (nvencCache === null) nvencCache = await media.hasEncoder('h264_nvenc');
  return nvencCache;
});
ipcMain.handle('app:pendingFile', () => { const f = pendingFile; pendingFile = null; return f; });

ipcMain.handle('dialog:openMedia', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Importar mídia', properties: ['openFile', 'multiSelections'], filters: MEDIA_FILTER });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:relink', async (_e, name) => {
  const r = await dialog.showOpenDialog(win, { title: `Localizar "${name}"`, properties: ['openFile'], filters: MEDIA_FILTER });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('media:probe', (_e, p) => media.probe(p));
ipcMain.handle('media:thumbs', (_e, p, info) => media.thumbs(p, info));
ipcMain.handle('media:waveform', (_e, p) => media.waveform(p));
ipcMain.handle('media:proxy', (e, p, kind, jobId) =>
  media.proxy(p, kind, (pct) => { if (!e.sender.isDestroyed()) e.sender.send('media:proxyProgress', { jobId, pct }); }));

function scopeDir(scope) {
  if (scope === 'cache') return cacheDir;
  if (scope === 'recordings') return recordingsDir;
  if (typeof scope === 'string' && scope.startsWith('job:')) {
    const id = scope.slice(4).replace(/[^a-z0-9_-]/gi, '');
    const d = path.join(jobsRoot, id);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
  throw new Error('escopo inválido');
}
ipcMain.handle('fs:write', async (_e, scope, name, bytes) => {
  const safe = path.basename(String(name)).replace(/[<>:"|?*]/g, '_');
  const file = path.join(scopeDir(scope), safe);
  await fsp.writeFile(file, Buffer.from(bytes));
  return file;
});
ipcMain.handle('fs:exists', (_e, paths) => (paths || []).map((p) => { try { return fs.existsSync(p); } catch { return false; } }));

// ---------- Rascunhos (projetos salvos automaticamente) ----------
const draftPath = (id, f) => path.join(draftsDir, String(id).replace(/[^a-z0-9_-]/gi, ''), f);

ipcMain.handle('drafts:list', async () => {
  const out = [];
  for (const d of await fsp.readdir(draftsDir).catch(() => [])) {
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(draftsDir, d, 'meta.json'), 'utf8'));
      const cover = path.join(draftsDir, d, 'cover.jpg');
      out.push({ ...meta, cover: fs.existsSync(cover) ? cover : null });
    } catch { /* pasta sem meta */ }
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
});
ipcMain.handle('drafts:load', async (_e, id) => JSON.parse(await fsp.readFile(draftPath(id, 'project.json'), 'utf8')));
ipcMain.handle('drafts:save', async (_e, id, json, meta, coverBytes) => {
  const dir = path.dirname(draftPath(id, 'x'));
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, 'project.json.tmp');
  await fsp.writeFile(tmp, json);
  await fsp.rename(tmp, path.join(dir, 'project.json'));
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta));
  if (coverBytes) await fsp.writeFile(path.join(dir, 'cover.jpg'), Buffer.from(coverBytes));
  return true;
});
ipcMain.handle('drafts:delete', async (_e, id) => {
  await fsp.rm(path.dirname(draftPath(id, 'x')), { recursive: true, force: true });
  return true;
});
ipcMain.handle('drafts:rename', async (_e, id, name) => {
  const mp = draftPath(id, 'meta.json'), pp = draftPath(id, 'project.json');
  const meta = JSON.parse(await fsp.readFile(mp, 'utf8'));
  const proj = JSON.parse(await fsp.readFile(pp, 'utf8'));
  meta.name = name; proj.name = name;
  await fsp.writeFile(mp, JSON.stringify(meta));
  await fsp.writeFile(pp, JSON.stringify(proj));
  return true;
});

ipcMain.handle('project:saveFile', async (_e, json, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Salvar projeto como',
    defaultPath: path.join(app.getPath('documents'), `${suggested || 'Projeto'}.mcut`),
    filters: [{ name: 'Projeto Munnin Cut', extensions: ['mcut'] }],
  });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, json);
  return r.filePath;
});
ipcMain.handle('project:openFile', async (_e, given) => {
  let file = given;
  if (!file) {
    const r = await dialog.showOpenDialog(win, { title: 'Abrir projeto', properties: ['openFile'], filters: [{ name: 'Projeto Munnin Cut', extensions: ['mcut'] }] });
    if (r.canceled) return null;
    file = r.filePaths[0];
  }
  return JSON.parse(await fsp.readFile(file, 'utf8'));
});

// ---------- Exportação ----------
ipcMain.handle('export:pickPath', async (_e, defaultName, ext, label) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Exportar',
    defaultPath: path.join(app.getPath('videos'), `${defaultName}.${ext}`),
    filters: [{ name: label || ext.toUpperCase(), extensions: [ext] }],
  });
  return r.canceled ? null : r.filePath;
});

const jobs = new Map();
ipcMain.handle('export:start', (e, job) => new Promise((resolve) => {
  const { jobId, args, graph, duration, outPath } = job;
  const dir = scopeDir(`job:${jobId}`);
  const graphPath = path.join(dir, 'graph.txt');
  fs.writeFileSync(graphPath, graph);
  const finalArgs = args.map((a) => (a === '__GRAPH__' ? graphPath : a));
  const partPath = `${outPath}`;
  fs.writeFileSync(path.join(logsDir, 'ultima-exportacao.txt'),
    `${new Date().toISOString()}\n${FFMPEG}\n${JSON.stringify(finalArgs, null, 1)}\n\n--- filter_complex ---\n${graph}\n`);
  const p = spawn(FFMPEG, finalArgs, { windowsHide: true });
  jobs.set(jobId, p);
  let err = '';
  let last = 0;
  p.stdout.on('data', (d) => {
    const s = d.toString();
    const m = /out_time_us=(\d+)/g;
    let mm, us = null;
    while ((mm = m.exec(s))) us = parseInt(mm[1], 10);
    const sp = /speed=\s*([\d.]+)x/.exec(s);
    if (us !== null && duration > 0) {
      const pct = Math.max(0, Math.min(0.999, us / 1e6 / duration));
      const now = Date.now();
      if (now - last > 150) {
        last = now;
        if (!e.sender.isDestroyed()) e.sender.send('export:progress', { jobId, pct, speed: sp ? parseFloat(sp[1]) : null });
      }
    }
  });
  p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 30000) err = err.slice(-30000); });
  p.on('error', (er) => { jobs.delete(jobId); resolve({ ok: false, error: String(er.message || er) }); });
  p.on('close', (code, signal) => {
    const cancelled = !jobs.has(jobId) || signal === 'SIGKILL';
    jobs.delete(jobId);
    fs.appendFileSync(path.join(logsDir, 'ultima-exportacao.txt'), `\n--- saída (código ${code}) ---\n${err}\n`);
    if (!(AUTOTEST && process.env.MC_KEEP_JOB === '1')) fs.rm(dir, { recursive: true, force: true }, () => {});
    if (code === 0) resolve({ ok: true, outPath: partPath });
    else {
      fs.rm(partPath, { force: true }, () => {});
      resolve({ ok: false, cancelled, error: err.trim().split('\n').slice(-6).join('\n') || `FFmpeg terminou com código ${code}` });
    }
  });
}));
ipcMain.handle('export:cancel', (_e, jobId) => {
  const p = jobs.get(jobId);
  if (p) { jobs.delete(jobId); p.kill('SIGKILL'); }
  return true;
});
ipcMain.handle('export:logPath', () => path.join(logsDir, 'ultima-exportacao.txt'));

ipcMain.handle('test:capture', async (_e, name) => {
  if (!AUTOTEST) return null;
  const img = await win.webContents.capturePage();
  fs.mkdirSync(TEST_OUT, { recursive: true });
  const p = path.join(TEST_OUT, `${name}.png`);
  fs.writeFileSync(p, img.toPNG());
  return p;
});
ipcMain.handle('test:log', (_e, msg) => { if (AUTOTEST) console.log('[teste]', msg); return true; });

ipcMain.handle('shell:showItem', (_e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
