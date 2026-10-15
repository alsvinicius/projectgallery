import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
const dataDir = process.env.GALLERY_DATA_DIR || join(homedir(), '.local', 'share', 'project-gallery');
const configPath = join(dataDir, 'config.json');
function fail(message: string): never { console.error(message); process.exit(1); }
const [action, manifestArg] = process.argv.slice(2);
if (action !== 'register') fail('Uso: node src/cli.ts register [caminho-do-manifesto]');
const manifestPath = resolve(manifestArg || 'project-gallery.json');
if (!existsSync(manifestPath)) fail(`Manifesto não encontrado: ${manifestPath}`);
if (!existsSync(configPath)) fail(`Configuração da galeria não encontrada em ${configPath}. Inicie a galeria primeiro.`);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== 1 || !manifest.project?.name || !Array.isArray(manifest.services)) fail('Manifesto inválido; consulte a referência do contrato v1.');
const payload = { ...manifest, project: { ...manifest.project, path: resolve(manifest.project.path || '.') } };
const response = await fetch(`http://127.0.0.1:${config.serverPort}/api/v1/register`, { method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
const result = await response.json();
if (!response.ok) fail(result.error || `Registro recusado (${response.status}).`);
console.log(`Projeto registrado: ${result.instance.name} (${result.instance.services.length} serviço(s)).`);
