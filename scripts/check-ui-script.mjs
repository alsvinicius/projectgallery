import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) throw new Error(`Esperado um script inline, encontrados ${scripts.length}.`);
const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: scripts[0][1], encoding: 'utf8' });
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status || 1); }
