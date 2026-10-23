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
import { createYtdlp, youtubeId } from './ytdlp.js';
import { createVoz } from './voz.js';

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
const whisperDir = app.isPackaged ? path.join(process.resourcesPath, 'whisper') : path.join(__dirname, '..', 'resources', 'whisper');
const WHISPER = path.join(whisperDir, 'whisper-cli.exe');
const FFPROBE = exe('ffprobe');
const userDir = app.getPath('userData');
const cacheDir = path.join(userDir, 'cache');
const logsDir = path.join(userDir, 'logs');
const AUTOTEST = (!app.isPackaged && process.env.MC_AUTOTEST) || null;
const docsRoot = AUTOTEST ? path.join(os.tmpdir(), 'munnin-cut-testdocs') : path.join(app.getPath('documents'), 'Munnin Cut');
const draftsDir = path.join(docsRoot, 'Projetos');
const recordingsDir = path.join(docsRoot, 'Gravações');
const jobsRoot = path.join(os.tmpdir(), 'munnin-cut-jobs');
const modelsDir = path.join(userDir, 'models');
for (const d of [cacheDir, logsDir, draftsDir, recordingsDir, jobsRoot, modelsDir]) fs.mkdirSync(d, { recursive: true });

const media = createMedia({ ffmpeg: FFMPEG, ffprobe: FFPROBE, cacheDir });
// processador da voz: o mesmo arquivo do AudioWorklet da prévia (public/ no código, dist/ no pacote)
const vozWorklet = path.join(__dirname, '..', app.isPackaged ? 'dist' : 'public', 'voz-worklet.js');
const voz = createVoz({ ffmpeg: FFMPEG, cacheDir, workletPath: vozWorklet });

// Teste automático: MC_AUTOTEST=<script.js> roda o script dentro da interface e salva capturas.
const TEST_OUT = process.env.MC_TEST_OUT || path.join(os.tmpdir(), 'munnin-cut-shots');

// ---------- Instância única + abrir .mcut pelo Explorer ----------
let win = null;
let pendingFile = process.argv.find((a) => a.toLowerCase().endsWith('.mcut')) || null;
// (nos testes automáticos roda ao lado do app aberto do usuário, sem disputar a instância única)
if (!AUTOTEST && !app.requestSingleInstanceLock()) app.quit();
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

let currentProjectId = null;
function logError(msg) {
  try { fs.appendFileSync(path.join(logsDir, 'erros.txt'), `[${new Date().toISOString()}] ${msg}

`); } catch { /* ignore */ }
}

function loadUi(query) {
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), query ? { query } : undefined);
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
      webviewTag: true, // só para o player do YouTube na prévia da busca (travado em web-contents-created)
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
  // Se o processo da interface cair, recarrega e reabre o projeto aberto.
  win.webContents.on('render-process-gone', (_e, details) => {
    logError(`interface encerrada: ${details.reason} (código ${details.exitCode})`);
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) loadUi(currentProjectId ? { reopen: currentProjectId } : null);
  });
  win.on('unresponsive', () => logError('a interface parou de responder'));
  app.on('child-process-gone', (_e, details) => { if (details.type === 'GPU') logError(`processo da GPU encerrado: ${details.reason}`); });
  loadUi();
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
  tempDir: jobsRoot,
}));

let nvencCache = null;
ipcMain.handle('app:nvenc', async () => {
  if (nvencCache === null) nvencCache = await media.hasEncoder('h264_nvenc');
  return nvencCache;
});
ipcMain.handle('app:currentProject', (_e, id) => { currentProjectId = id || null; return true; });
ipcMain.handle('app:logError', (_e, msg) => { logError(String(msg).slice(0, 20000)); return true; });
ipcMain.handle('app:errorLogPath', () => path.join(logsDir, 'erros.txt'));
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
ipcMain.handle('media:reverse', (e, p, kind, jobId) =>
  media.reverse(p, kind, (pct) => { if (!e.sender.isDestroyed()) e.sender.send('media:proxyProgress', { jobId, pct }); }));

const fxCacheRoot = path.join(cacheDir, 'fx');
function scopeDir(scope) {
  if (scope === 'cache') return cacheDir;
  if (typeof scope === 'string' && scope.startsWith('fxcache:')) {
    const d = path.join(fxCacheRoot, scope.slice(8).replace(/[^a-z0-9_-]/gi, ''));
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
  if (scope === 'recordings') return recordingsDir;
  if (scope === 'capas') { const d = path.join(docsRoot, 'Capas'); fs.mkdirSync(d, { recursive: true }); return d; }
  if (scope === 'voz') return voz.dir;
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
// Cache dos quadros das camadas de efeito: reaproveitado quando o efeito não muda entre exportações.
ipcMain.handle('fxcache:status', (_e, key) => {
  const dir = scopeDir(`fxcache:${key}`);
  return { dir, done: fs.existsSync(path.join(dir, 'done')) };
});
ipcMain.handle('fxcache:done', (_e, key) => {
  const dir = scopeDir(`fxcache:${key}`);
  fs.writeFileSync(path.join(dir, 'done'), String(Date.now()));
  // mantém só os 40 conjuntos mais recentes
  try {
    const all = fs.readdirSync(fxCacheRoot).map((d) => ({ d, t: fs.statSync(path.join(fxCacheRoot, d)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of all.slice(40)) fs.rmSync(path.join(fxCacheRoot, x.d), { recursive: true, force: true });
  } catch { /* ignore */ }
  return true;
});
// ---------- Voz (limpeza e realce da fala) ----------
ipcMain.handle('voz:analisar', (_e, p, duracao) => voz.analisar(p, duracao));
ipcMain.handle('voz:extrair', (_e, p, ss, t, jobId) => {
  const d = scopeDir(`job:${jobId}`);
  return voz.extrair(p, ss, t, path.join(d, `voz_src_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`));
});
ipcMain.handle('fs:exists', (_e, paths) => (paths || []).map((p) => { try { return fs.existsSync(p); } catch { return false; } }));


// ---------- Resiliência das mídias ----------
ipcMain.handle('media:stat', (_e, paths) => (paths || []).map((p) => {
  try { const st = fs.statSync(p); return { exists: st.isFile(), size: st.size, mtimeMs: Math.round(st.mtimeMs) }; }
  catch { return { exists: false }; }
}));

// Procura um arquivo com o mesmo nome (sem diferenciar maiúsculas) em pastas prováveis.
const SKIP_DIRS = new Set(['node_modules', '.git', 'appdata', '$recycle.bin', 'windows', 'program files', 'program files (x86)', '.cache']);
ipcMain.handle('media:findByName', async (_e, name, hints = []) => {
  const target = String(name || '').toLowerCase();
  if (!target) return [];
  const home = app.getPath('home');
  // 1º perto das pastas que o projeto já usa (rápido); só depois nas pastas do usuário
  const near = [];
  for (const h of hints) if (h) near.push([h, 2], [path.dirname(h), 2]);
  const wide = [[app.getPath('downloads'), 4], [app.getPath('desktop'), 3], [app.getPath('documents'), 3],
    [app.getPath('videos'), 3], [app.getPath('pictures'), 3], [app.getPath('music'), 3], [path.join(home, 'OneDrive'), 3]];
  const seen = new Set();
  const found = new Map();
  const t0 = Date.now();
  let scanned = 0;
  const scan = async (roots) => { for (const [root, depth] of roots) {
    const queue = [[root, 0]];
    while (queue.length) {
      if (Date.now() - t0 > 5000 || scanned > 120000) break;
      const [dir, d] = queue.shift();
      const key = dir.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
      for (const ent of entries) {
        scanned++;
        const full = path.join(dir, ent.name);
        if (ent.isFile() && ent.name.toLowerCase() === target && !found.has(full.toLowerCase())) {
          try { const st = fs.statSync(full); found.set(full.toLowerCase(), { path: full, size: st.size, mtimeMs: Math.round(st.mtimeMs) }); } catch { /* ignore */ }
        } else if (ent.isDirectory() && d < depth && !SKIP_DIRS.has(ent.name.toLowerCase()) && !ent.name.startsWith('.')) {
          queue.push([full, d + 1]);
        }
      }
    }
  } };
  await scan(near);
  if (!found.size) await scan(wide);
  return [...found.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
});

ipcMain.handle('dialog:replace', async (_e, name) => {
  const r = await dialog.showOpenDialog(win, { title: `Substituir "${name}" por…`, properties: ['openFile'], filters: MEDIA_FILTER });
  return r.canceled ? null : r.filePaths[0];
});

// ---------- Efeitos sonoros (sintetizados no build: resources/sfx) ----------
const sfxDir = app.isPackaged ? path.join(process.resourcesPath, 'sfx') : path.join(__dirname, '..', 'resources', 'sfx');
const sfxUserDir = path.join(docsRoot, 'Efeitos sonoros');
ipcMain.handle('sfx:list', () => {
  let index = {};
  try { index = JSON.parse(fs.readFileSync(path.join(sfxDir, 'index.json'), 'utf8')); } catch { /* sem biblioteca */ }
  return { dir: sfxDir, index };
});
// copia o som para Documentos\Munnin Cut\Efeitos sonoros (caminho estável para o projeto) e devolve o caminho
ipcMain.handle('sfx:materialize', async (_e, id, fileName) => {
  if (!/^[A-Za-z0-9]+$/.test(String(id))) throw new Error('som inválido');
  const src = path.join(sfxDir, `${id}.wav`);
  if (!fs.existsSync(src)) throw new Error('som não encontrado na biblioteca');
  let safe = path.basename(String(fileName || `${id}.wav`)).replace(/[<>:"|?*]/g, '_');
  if (!safe.toLowerCase().endsWith('.wav')) safe += '.wav';
  await fsp.mkdir(sfxUserDir, { recursive: true });
  const dst = path.join(sfxUserDir, safe);
  let same = false;
  try { same = fs.statSync(dst).size === fs.statSync(src).size; } catch { /* ainda não existe */ }
  if (!same) await fsp.copyFile(src, dst);
  return dst;
});

// ---------- Meus sons: biblioteca pessoal (uma pasta por categoria em Documentos\Munnin Cut\Meus sons) ----------
// Sons baixados de sites que não permitem redistribuir (ficam só no computador de quem baixou).
const meusSonsDir = path.join(docsRoot, 'Meus sons');
const SOM_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wma', '.aiff', '.aif', '.amr', '.weba', '.webm']);
const durSom = new Map(); // caminho|tamanho|data → duração
const dentroDeMeusSons = (p) => {
  const r = path.relative(meusSonsDir, path.resolve(String(p || '')));
  return !!r && !r.startsWith('..') && !path.isAbsolute(r);
};
const nomeSeguro = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80);
async function lerSons(dir) {
  let ents = [];
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const sons = [];
  for (const e of ents) {
    if (!e.isFile() || !SOM_EXT.has(path.extname(e.name).toLowerCase())) continue;
    const p = path.join(dir, e.name);
    let st;
    try { st = await fsp.stat(p); } catch { continue; }
    const k = `${p}|${st.size}|${st.mtimeMs}`;
    if (!durSom.has(k)) durSom.set(k, media.probe(p).then((i) => i.duration || 0).catch(() => 0));
    sons.push({ path: p, name: e.name.replace(/\.[^.]+$/, ''), k });
  }
  for (const s of sons) { s.dur = await durSom.get(s.k); delete s.k; }
  return sons.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}
ipcMain.handle('meussons:list', async () => {
  await fsp.mkdir(meusSonsDir, { recursive: true });
  const ents = await fsp.readdir(meusSonsDir, { withFileTypes: true });
  const cats = [];
  for (const e of ents) if (e.isDirectory()) cats.push({ name: e.name, dir: path.join(meusSonsDir, e.name), sons: await lerSons(path.join(meusSonsDir, e.name)) });
  cats.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const soltos = await lerSons(meusSonsDir);
  if (soltos.length) cats.unshift({ name: 'Geral', dir: meusSonsDir, sons: soltos });
  return { dir: meusSonsDir, cats };
});
ipcMain.handle('meussons:categoria', async (_e, nome) => {
  const n = nomeSeguro(nome);
  if (!n) throw new Error('Nome de categoria inválido.');
  const d = path.join(meusSonsDir, n);
  await fsp.mkdir(d, { recursive: true });
  return d;
});
// copia arquivos de áudio escolhidos pelo usuário para a categoria (nome repetido com conteúdo diferente ganha " (2)")
ipcMain.handle('meussons:adicionar', async (_e, catDir, files) => {
  const dest = path.resolve(String(catDir || meusSonsDir));
  if (dest !== meusSonsDir && !dentroDeMeusSons(dest)) throw new Error('Categoria inválida.');
  await fsp.mkdir(dest, { recursive: true });
  let n = 0;
  for (const f of Array.isArray(files) ? files : []) {
    const src = String(f || '');
    if (!SOM_EXT.has(path.extname(src).toLowerCase())) continue;
    let st;
    try { st = await fsp.stat(src); } catch { continue; }
    if (!st.isFile()) continue;
    const ext = path.extname(src), base = nomeSeguro(path.basename(src, ext)) || 'som';
    let dst = path.join(dest, base + ext);
    for (let i = 2; fs.existsSync(dst); i++) {
      if (fs.statSync(dst).size === st.size) { dst = null; break; } // já está lá
      dst = path.join(dest, `${base} (${i})${ext}`);
    }
    if (dst) { await fsp.copyFile(src, dst); n++; }
  }
  return n;
});
// remove para a Lixeira (dá para recuperar)
ipcMain.handle('meussons:remover', async (_e, p) => {
  if (!dentroDeMeusSons(p)) throw new Error('Só dá para remover itens de Meus sons.');
  await shell.trashItem(path.resolve(p));
  return true;
});
ipcMain.handle('meussons:escolher', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Adicionar sons', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Áudio', extensions: [...SOM_EXT].map((x) => x.slice(1)) }],
  });
  return r.canceled ? [] : r.filePaths;
});

// ---------- Áudio do YouTube (yt-dlp, sempre atualizado) ----------
const youtubeDir = path.join(docsRoot, 'Áudios do YouTube');
const youtubeVideoDir = path.join(docsRoot, 'Vídeos baixados');
const yt = createYtdlp({
  binDir: path.join(userDir, 'bin'), ffmpegDir: binDir, nodeExe: process.execPath, outDir: youtubeDir, videoDir: youtubeVideoDir,
  log: (m) => fs.appendFile(path.join(logsDir, 'youtube.txt'), `${new Date().toISOString()} ${m}\n`, () => {}),
});
const ytSend = (e) => (p) => { if (!e.sender.isDestroyed()) e.sender.send('yt:progress', p); };
ipcMain.handle('yt:status', () => yt.status());
ipcMain.handle('yt:update', (e) => yt.update({ onStage: ytSend(e) }));
ipcMain.handle('yt:download', (e, opts) => yt.download(opts || {}, ytSend(e)));
ipcMain.handle('yt:cancel', () => { yt.cancel(); return true; });
ipcMain.handle('yt:folder', (_e, kind) => (kind === 'video' ? youtubeVideoDir : youtubeDir));
ipcMain.handle('yt:search', (_e, q) => yt.search(q));
// título e canal de um link colado (oEmbed: rápido, sem abrir o vídeo)
ipcMain.handle('yt:titulo', async (_e, url) => {
  const id = youtubeId(url);
  if (!id) return null;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json() : {};
    return { id, title: j.title || '', channel: j.author_name || '' };
  } catch { return { id, title: '', channel: '' }; }
});

// O player do YouTube (prévia da busca) roda num <webview> isolado: sem preload, sem Node, sessão própria
// sem permissões, só páginas do YouTube; links para fora abrem no navegador.
const YT_PAGINA = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\//;
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (ev, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.autoplayPolicy = 'no-user-gesture-required';
    params.partition = 'yt';
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(params.src || '')) ev.preventDefault();
  });
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (ev, url) => { if (!YT_PAGINA.test(url)) ev.preventDefault(); });
  }
});
app.whenReady().then(() => {
  const ytSessao = session.fromPartition('yt');
  ytSessao.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'fullscreen'));
  ytSessao.setPermissionCheckHandler((_wc, perm) => perm === 'fullscreen');
});
// verificação diária em segundo plano — só se o baixador já foi usado alguma vez
app.whenReady().then(() => setTimeout(() => { if (!AUTOTEST && yt.isInstalled()) yt.ensure(() => {}).catch(() => {}); }, 20000));

// ---------- Legendas automáticas (whisper.cpp) ----------
const CAPTION_MODELS = [
  { id: 'base', file: 'ggml-base-q5_1.bin', size: 59707625, name: 'Rápido' },
  { id: 'small', file: 'ggml-small-q5_1.bin', size: 190085487, name: 'Equilibrado' },
  { id: 'turbo', file: 'ggml-large-v3-turbo-q5_0.bin', size: 574041195, name: 'Máxima precisão' },
];
const modelPath = (m) => path.join(modelsDir, m.file);
ipcMain.handle('captions:models', () => CAPTION_MODELS.map((m) => ({ ...m, downloaded: fs.existsSync(modelPath(m)), available: fs.existsSync(WHISPER) })));

let captionAbort = null;
ipcMain.handle('captions:download', async (e, id) => {
  const m = CAPTION_MODELS.find((x) => x.id === id);
  if (!m) throw new Error('modelo desconhecido');
  if (fs.existsSync(modelPath(m))) return true;
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${m.file}`;
  const part = `${modelPath(m)}.part`;
  captionAbort = new AbortController();
  const res = await fetch(url, { signal: captionAbort.signal });
  if (!res.ok || !res.body) throw new Error(`falha ao baixar o modelo (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || m.size;
  const out = fs.createWriteStream(part);
  let got = 0, last = 0;
  try {
    for await (const chunk of Readable.fromWeb(res.body)) {
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      const now = Date.now();
      if (now - last > 200) { last = now; if (!e.sender.isDestroyed()) e.sender.send('captions:progress', { stage: 'download', pct: got / total }); }
    }
    await new Promise((r, j) => out.end((err) => (err ? j(err) : r())));
  } catch (err) {
    out.destroy();
    fs.rm(part, { force: true }, () => {});
    throw err;
  } finally { captionAbort = null; }
  fs.renameSync(part, modelPath(m));
  return true;
});

let captionProc = null;
ipcMain.handle('captions:cancel', () => {
  captionAbort?.abort();
  if (captionProc) { captionProc.kill('SIGKILL'); captionProc = null; }
  return true;
});

ipcMain.handle('captions:transcribe', async (e, { audioPath, model, language, prompt, duration }) => {
  const m = CAPTION_MODELS.find((x) => x.id === model) || CAPTION_MODELS[1];
  if (!fs.existsSync(WHISPER)) throw new Error('componente de legendas não encontrado (whisper-cli.exe)');
  if (!fs.existsSync(modelPath(m))) throw new Error('modelo de legendas não baixado');
  const dir = path.join(jobsRoot, `cap_${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const wav = path.join(dir, 'audio16k.wav');
  await media.run(FFMPEG, ['-v', 'error', '-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  const outBase = path.join(dir, 'legendas');
  const threads = String(Math.max(2, Math.min(16, os.cpus().length - 2)));
  const args = ['-m', modelPath(m), '-f', wav, '-l', language || 'pt', '-t', threads, '-ml', '1', '-sow', '-oj', '-of', outBase, '-pp', '-np'];
  if (prompt) args.push('--prompt', String(prompt).slice(0, 400));
  await new Promise((resolve, reject) => {
    const p = spawn(WHISPER, args, { windowsHide: true, cwd: whisperDir });
    captionProc = p;
    let err = '';
    const onData = (d) => {
      const txt = d.toString();
      err += txt;
      if (err.length > 20000) err = err.slice(-20000);
      const mm = /progress\s*=\s*(\d+)%/g;
      let x, pct = null;
      while ((x = mm.exec(txt))) pct = Number(x[1]);
      if (pct !== null && !e.sender.isDestroyed()) e.sender.send('captions:progress', { stage: 'transcribe', pct: pct / 100 });
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', (code) => { captionProc = null; code === 0 ? resolve() : reject(new Error(err.trim().split('\n').slice(-3).join('\n') || `whisper terminou com código ${code}`)); });
  });
  const j = JSON.parse(fs.readFileSync(`${outBase}.json`, 'utf8'));
  fs.rm(dir, { recursive: true, force: true }, () => {});
  return (j.transcription || []).map((sg) => ({ t0: sg.offsets.from / 1000, t1: sg.offsets.to / 1000, text: sg.text }));
});

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
ipcMain.handle('drafts:duplicate', async (_e, id) => {
  const src = path.dirname(draftPath(id, 'x'));
  const nid = `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const dst = path.join(draftsDir, nid);
  await fsp.cp(src, dst, { recursive: true });
  const proj = JSON.parse(await fsp.readFile(path.join(dst, 'project.json'), 'utf8'));
  const meta = JSON.parse(await fsp.readFile(path.join(dst, 'meta.json'), 'utf8'));
  proj.id = nid; meta.id = nid;
  proj.name = meta.name = `${proj.name} (cópia)`;
  meta.updatedAt = Date.now();
  await fsp.writeFile(path.join(dst, 'project.json'), JSON.stringify(proj));
  await fsp.writeFile(path.join(dst, 'meta.json'), JSON.stringify(meta));
  return nid;
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
    if (code === 0) { let size = null; try { size = fs.statSync(partPath).size; } catch { /* ignore */ } resolve({ ok: true, outPath: partPath, size }); }
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
// Operações de arquivo só para os testes automáticos (MC_AUTOTEST).
ipcMain.handle('test:fs', async (_e, op, a, b) => {
  if (!AUTOTEST) return false;
  if (op === 'copy') fs.copyFileSync(a, b);
  else if (op === 'move') fs.renameSync(a, b);
  else if (op === 'delete') fs.rmSync(a, { force: true });
  else if (op === 'replaceWithVideoFrame') await media.run(FFMPEG, ['-v', 'error', '-y', '-ss', '1', '-i', a, '-frames:v', '1', b]);
  return true;
});
ipcMain.handle('test:log', (_e, msg) => { if (AUTOTEST) console.log('[teste]', msg); return true; });
// Só nos testes: roda um trecho como se fosse um clique do usuário (ex.: entrar em tela cheia).
ipcMain.handle('test:gesture', (_e, code) => (AUTOTEST ? win.webContents.executeJavaScript(String(code), true) : null));

ipcMain.handle('shell:showItem', (_e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
