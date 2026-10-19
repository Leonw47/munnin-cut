// Áudio do YouTube via yt-dlp (executável oficial do GitHub), sempre atualizado:
// - primeira vez: baixa o yt-dlp.exe e confere o SHA-256 publicado no próprio release;
// - uma vez por dia (antes de baixar e alguns segundos depois de abrir o app): `yt-dlp -U`;
// - se o download falhar por mudança do YouTube (403, assinatura, formatos sumidos…): atualiza e tenta de
//   novo; se ainda falhar, tenta a versão noturna (nightly), que costuma corrigir antes.
// O YouTube exige um runtime de JavaScript: usamos o próprio Electron como Node (ELECTRON_RUN_AS_NODE),
// então nada precisa estar instalado no computador.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const DAY = 24 * 3600 * 1000;

// falhas que normalmente somem atualizando o yt-dlp (o YouTube muda e o yt-dlp acompanha)
const UPDATABLE = /HTTP Error 403|HTTP Error 400|nsig|n challenge|signature|Unable to extract|Requested format is not available|PO Token|JavaScript runtime|jsc|Precondition check failed|Failed to extract any player response|unable to download video data|Some formats may be missing|Only images are available/i;

export const isYoutubeUrl = (u) => /^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(String(u || '').trim());

export function friendlyError(raw) {
  const e = String(raw || '');
  if (/Private video/i.test(e)) return 'Esse vídeo é privado.';
  if (/confirm your age|age-restricted|inappropriate for some users/i.test(e)) return 'Vídeo com restrição de idade: o YouTube só libera com login.';
  if (/members-only|Join this channel/i.test(e)) return 'Vídeo exclusivo para membros do canal.';
  if (/live event will begin|Premieres in|This live event|is_live/i.test(e)) return 'É uma transmissão ao vivo ou estreia que ainda não terminou.';
  if (/Video unavailable|This video is unavailable|has been removed|not available in your country/i.test(e)) return 'Vídeo indisponível (removido, bloqueado ou não liberado no Brasil).';
  if (/Unsupported URL|is not a valid URL|Incomplete YouTube ID/i.test(e)) return 'Link não reconhecido. Copie o endereço do vídeo no YouTube (barra do navegador ou "Compartilhar").';
  if (/confirm you.re not a bot/i.test(e)) return 'O YouTube pediu uma verificação anti-robô. Espere alguns minutos e tente de novo.';
  if (/getaddrinfo|Failed to resolve|timed out|Connection refused|network is unreachable|Temporary failure|No connection/i.test(e)) return 'Sem conexão com a internet (ou o YouTube não respondeu). Confira a rede e tente de novo.';
  const last = (e.match(/ERROR:[^\r\n]*/g) || []).pop();
  return last ? `Não foi possível baixar: ${last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([A-Za-z0-9_-]{11}:\s*)?/, '')}` : 'Não foi possível baixar o áudio.';
}

const hhmmss = (s) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function createYtdlp({ binDir, ffmpegDir, nodeExe, outDir, log = () => {} }) {
  const exe = path.join(binDir, 'yt-dlp.exe');
  const statePath = path.join(binDir, 'yt-dlp.json');
  let proc = null, abortCtl = null, cancelled = false, busy = null;

  const readState = () => { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; } };
  const writeState = (p) => { fs.mkdirSync(binDir, { recursive: true }); fs.writeFileSync(statePath, JSON.stringify({ ...readState(), ...p })); };

  function run(args, { onLine, timeout = 0 } = {}) {
    return new Promise((resolve) => {
      let out = '', err = '', bufO = '', bufE = '';
      const p = spawn(exe, args, {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });
      proc = p;
      const feed = (chunk, which) => {
        const txt = chunk.toString('utf8');
        if (which === 'out') { out += txt; bufO += txt; } else { err += txt; bufE += txt; }
        let buf = which === 'out' ? bufO : bufE;
        let i;
        while ((i = buf.search(/\r|\n/)) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLine?.(line, which); }
        if (which === 'out') bufO = buf; else bufE = buf;
      };
      p.stdout.on('data', (c) => feed(c, 'out'));
      p.stderr.on('data', (c) => feed(c, 'err'));
      const to = timeout ? setTimeout(() => killTree(p), timeout) : null;
      p.on('error', (e) => { clearTimeout(to); if (proc === p) proc = null; resolve({ code: -1, out, err: err + String(e.message || e) }); });
      p.on('close', (code) => { clearTimeout(to); if (proc === p) proc = null; resolve({ code, out, err }); });
    });
  }
  function killTree(p) {
    if (!p || p.exitCode !== null) return;
    try { spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }); } catch { p.kill(); }
  }

  async function fetchTo(url, dest, onPct) {
    abortCtl = new AbortController();
    const res = await fetch(url, { signal: abortCtl.signal, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const out = fs.createWriteStream(dest);
    let got = 0, last = 0;
    try {
      for await (const chunk of Readable.fromWeb(res.body)) {
        got += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        if (total && Date.now() - last > 200) { last = Date.now(); onPct?.(got / total); }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    } catch (e) { out.destroy(); fs.rmSync(dest, { force: true }); throw e; } finally { abortCtl = null; }
  }

  async function install(onStage) {
    fs.mkdirSync(binDir, { recursive: true });
    onStage?.({ stage: 'install', text: 'Instalando o baixador do YouTube (só na primeira vez)…', pct: 0 });
    const sumsRes = await fetch(`${RELEASE}/SHA2-256SUMS`, { redirect: 'follow' });
    if (!sumsRes.ok) throw new Error(`não foi possível consultar o yt-dlp no GitHub (HTTP ${sumsRes.status})`);
    const sums = await sumsRes.text();
    const expected = (sums.split(/\r?\n/).find((l) => /\syt-dlp\.exe$/.test(l.trim())) || '').trim().split(/\s+/)[0];
    if (!/^[0-9a-f]{64}$/i.test(expected)) throw new Error('lista de verificação do yt-dlp inválida');
    const tmp = `${exe}.download`;
    await fetchTo(`${RELEASE}/yt-dlp.exe`, tmp, (pct) => onStage?.({ stage: 'install', text: 'Instalando o baixador do YouTube (só na primeira vez)…', pct }));
    const hash = crypto.createHash('sha256').update(fs.readFileSync(tmp)).digest('hex');
    if (hash.toLowerCase() !== expected.toLowerCase()) { fs.rmSync(tmp, { force: true }); throw new Error('o arquivo baixado do yt-dlp não confere com o publicado (SHA-256); tente de novo'); }
    fs.renameSync(tmp, exe);
    writeState({ checkedAt: Date.now(), version: await version(), channel: 'stable', installedAt: Date.now() });
    log(`yt-dlp instalado: ${readState().version}`);
  }

  async function version() {
    const r = await run(['--version'], { timeout: 30000 });
    return r.out.trim().split(/\r?\n/).pop() || '';
  }

  /** channel: 'stable' (padrão do -U) ou 'nightly' */
  async function update({ channel, onStage } = {}) {
    if (!fs.existsSync(exe)) { await install(onStage); return status(); }
    const ch = channel || readState().channel || 'stable';
    onStage?.({ stage: 'update', text: ch === 'nightly' ? 'Atualizando o yt-dlp (versão noturna)…' : 'Procurando atualização do yt-dlp…' });
    const before = readState().version || await version();
    const r = await run(ch === 'nightly' ? ['--update-to', 'nightly'] : ['--update-to', 'stable'], { timeout: 180000 });
    const after = await version();
    writeState({ checkedAt: Date.now(), version: after, channel: ch, lastUpdateOk: r.code === 0 });
    log(`yt-dlp ${before} → ${after} (${ch}, código ${r.code})${r.code ? `: ${(r.err || r.out).slice(-400)}` : ''}`);
    return { ...(await status()), updated: before !== after, ok: r.code === 0 };
  }

  async function ensure(onStage) {
    if (!fs.existsSync(exe)) { await install(onStage); return; }
    if (Date.now() - (readState().checkedAt || 0) > DAY) {
      try { await update({ onStage }); } catch (e) { log(`verificação diária do yt-dlp falhou: ${e.message}`); }
    }
  }

  async function status() {
    const st = readState();
    const installed = fs.existsSync(exe);
    return { installed, version: installed ? st.version || await version() : null, checkedAt: st.checkedAt || null, channel: st.channel || 'stable' };
  }

  async function once({ url, start, end }, onProgress) {
    fs.mkdirSync(outDir, { recursive: true });
    const printFile = path.join(os.tmpdir(), `munnin-yt-${crypto.randomUUID()}.txt`);
    const sect = Number.isFinite(start) && Number.isFinite(end) && end > start;
    const suffix = sect ? ` [${hhmmss(start).replace(/:/g, '.')}-${hhmmss(end).replace(/:/g, '.')}]` : '';
    const args = [
      '--ignore-config', '--no-playlist', '--no-mtime', '--newline', '--progress',
      '--progress-template', 'download:MCPROG %(progress._percent_str)s',
      '--js-runtimes', `node:${nodeExe}`,
      '--ffmpeg-location', ffmpegDir,
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '-x', '--audio-format', 'm4a', '--audio-quality', '0',
      '--windows-filenames', '--trim-filenames', '150',
      '-o', path.join(outDir, `%(title)s${suffix}.%(ext)s`),
      '--print-to-file', 'after_move:filepath', printFile,
    ];
    if (sect) args.push('--download-sections', `*${start}-${end}`, '--force-keyframes-at-cuts');
    args.push('--', url.trim());
    let lastErr = '';
    const r = await run(args, {
      onLine: (line, which) => {
        const m = /^MCPROG\s+([\d.]+)%/.exec(line);
        if (m) onProgress?.({ stage: 'download', text: 'Baixando o áudio…', pct: Math.min(1, Number(m[1]) / 100) });
        else if (/^\[(ExtractAudio|FixupM4a|ffmpeg|Merger)\]/.test(line)) onProgress?.({ stage: 'convert', text: 'Preparando o arquivo de áudio…' });
        else if (/^\[youtube\]/.test(line)) onProgress?.({ stage: 'info', text: 'Lendo o vídeo no YouTube…' });
        if (which === 'err' && /^ERROR:/.test(line)) lastErr = line;
      },
    });
    let file = '';
    try { file = fs.readFileSync(printFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop() || ''; } catch { /* sem arquivo */ }
    fs.rmSync(printFile, { force: true });
    if (r.code === 0 && file && fs.existsSync(file)) return { ok: true, path: file, title: path.basename(file).replace(/\.[^.]+$/, '') };
    return { ok: false, err: `${lastErr}\n${r.err}`.trim(), code: r.code };
  }

  /** baixa o áudio de um link do YouTube; start/end (s) opcionais para baixar só um trecho */
  async function download({ url, start, end }, onProgress) {
    if (busy) throw new Error('Já existe um download em andamento.');
    if (!isYoutubeUrl(url)) throw new Error('Cole um link do YouTube (youtube.com ou youtu.be).');
    cancelled = false;
    busy = true;
    try {
      await ensure(onProgress);
      if (cancelled) throw new Error('Download cancelado.');
      for (let attempt = 0; ; attempt++) {
        onProgress?.({ stage: 'info', text: 'Lendo o vídeo no YouTube…' });
        const r = await once({ url, start, end }, onProgress);
        if (r.ok) return r;
        if (cancelled) throw new Error('Download cancelado.');
        log(`falha no download (tentativa ${attempt + 1}): ${r.err.slice(-600)}`);
        if (UPDATABLE.test(r.err) && attempt < 2) {
          onProgress?.({ stage: 'update', text: attempt === 0 ? 'O YouTube mudou algo — atualizando o yt-dlp e tentando de novo…' : 'Ainda não deu — tentando a versão mais nova (noturna) do yt-dlp…' });
          await update({ channel: attempt === 0 ? 'stable' : 'nightly', onStage: onProgress });
          continue;
        }
        throw new Error(friendlyError(r.err));
      }
    } finally { busy = null; }
  }

  function cancel() {
    cancelled = true;
    abortCtl?.abort();
    killTree(proc);
  }

  return { status, update, ensure, download, cancel, isInstalled: () => fs.existsSync(exe) };
}
