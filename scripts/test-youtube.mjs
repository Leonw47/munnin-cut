// Testa o baixador de áudio do YouTube (electron/ytdlp.js) fora da interface, com rede de verdade:
// instalação do zero (com SHA-256), atualização diária, download de um trecho, erros e cancelamento.
// Vídeo de teste: "Big Buck Bunny" (Blender Foundation, licença CC-BY).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createYtdlp, friendlyError, isYoutubeUrl } from '../electron/ytdlp.js';

const ROOT = path.join(os.tmpdir(), 'munnin-cut-test', 'youtube');
fs.rmSync(ROOT, { recursive: true, force: true });
const FFPROBE = path.resolve('resources/bin/ffprobe.exe');
const yt = createYtdlp({
  binDir: path.join(ROOT, 'bin'), ffmpegDir: path.resolve('resources/bin'),
  nodeExe: path.resolve('node_modules/electron/dist/electron.exe'), outDir: path.join(ROOT, 'audios'),
  log: (m) => console.log('   [log]', m.slice(0, 200)),
});
const VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const res = {};
const check = (n, ok, info) => { res[n] = ok ? 'OK' : `FALHOU ${info ?? ''}`; console.log(ok ? 'OK ' : 'XX ', n, ok ? '' : info ?? ''); };
const stages = new Set();
const prog = (p) => { stages.add(p.stage); };

check('reconhece links', isYoutubeUrl('https://youtu.be/aqz-KE-bpKQ') && isYoutubeUrl('https://music.youtube.com/watch?v=x') && !isYoutubeUrl('https://vimeo.com/1') && !isYoutubeUrl('youtube.com/watch'));

let st = await yt.status();
check('começa sem yt-dlp', !st.installed);

let t = Date.now();
const r1 = await yt.download({ url: VIDEO, start: 10, end: 22 }, prog);
const dur = Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r1.path]).toString());
check('instala na primeira vez (SHA-256) e baixa um trecho', stages.has('install') && fs.existsSync(r1.path) && Math.abs(dur - 12) < 1.2, JSON.stringify({ stages: [...stages], dur, path: r1.path }));
console.log(`   ${((Date.now() - t) / 1000).toFixed(1)} s · ${path.basename(r1.path)} · ${dur.toFixed(2)} s`);
check('arquivo m4a com o título no nome', /Big Buck Bunny.*\[0\.00\.10-0\.00\.22\]\.m4a$/i.test(r1.path), r1.path);

st = await yt.status();
check('status com versão', st.installed && /^\d{4}\.\d{2}\.\d{2}/.test(st.version || ''), JSON.stringify(st));

// verificação diária: com a data antiga, o próximo download procura atualização antes
const sp = path.join(ROOT, 'bin', 'yt-dlp.json');
fs.writeFileSync(sp, JSON.stringify({ ...JSON.parse(fs.readFileSync(sp, 'utf8')), checkedAt: Date.now() - 2 * 24 * 3600e3 }));
stages.clear();
const r2 = await yt.download({ url: 'https://youtu.be/aqz-KE-bpKQ', start: 0, end: 5 }, prog);
check('verificação diária roda antes de baixar', stages.has('update') && JSON.parse(fs.readFileSync(sp, 'utf8')).checkedAt > Date.now() - 600e3 && fs.existsSync(r2.path), [...stages].join(','));

const up = await yt.update({});
check('atualizar agora', up.installed && up.ok !== false, JSON.stringify(up));

for (const [nome, url, re] of [
  ['link inválido', 'https://www.youtube.com/watch?v=xxxxxxxxxxx', /indisponível|Não foi possível/],
  ['não é YouTube', 'https://vimeo.com/76979871', /link do YouTube/],
]) {
  try { await yt.download({ url }, prog); check(`erro: ${nome}`, false, 'não deu erro'); } catch (e) { check(`erro: ${nome}`, re.test(e.message), e.message); }
}
check('mensagens amigáveis', /privado/.test(friendlyError('ERROR: [youtube] abc: Private video')) && /internet/.test(friendlyError('ERROR: getaddrinfo failed')) && /idade/.test(friendlyError('Sign in to confirm your age')));

// cancelar no meio de um download completo
let cancelled = false;
const pr = yt.download({ url: VIDEO }, (p) => { if (p.stage === 'download' && p.pct > 0.02 && !cancelled) { cancelled = true; yt.cancel(); } });
try { await pr; check('cancelar', false, 'terminou sem cancelar'); } catch (e) { check('cancelar', cancelled && /cancelado/i.test(e.message), e.message); }

const falhas = Object.values(res).filter((v) => v !== 'OK').length;
console.log(falhas ? `${falhas} falha(s)` : 'todos OK');
process.exitCode = falhas ? 1 : 0;
