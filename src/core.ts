import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { homedir } from 'node:os';

export type ServiceInput = { id: string; name: string; portEnv: string; interfaceUrl?: string; healthPath?: string };
export type InstanceInput = { name: string; path: string; services: ServiceInput[]; startCommand?: string[]; stopCommand?: string[]; source?: string; familyName?: string; familyId?: string };
export const dataDir = process.env.GALLERY_DATA_DIR || join(homedir(), '.local', 'share', 'project-gallery');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
chmodSync(dataDir, 0o700);
const configPath = join(dataDir, 'config.json');
let config: { token: string; workspaces: string[]; portMin: number; portMax: number; serverPort: number };
if (existsSync(configPath)) { config = JSON.parse(readFileSync(configPath, 'utf8')); chmodSync(configPath, 0o600); }
else {
  config = { token: randomBytes(32).toString('hex'), workspaces: [join(homedir(), 'Workspace')], portMin: 30000, portMax: 39999, serverPort: Number(process.env.GALLERY_PORT || 4173) };
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  chmodSync(configPath, 0o600);
}
export const settings = config;
export const db = new DatabaseSync(join(dataDir, 'gallery.sqlite'));
chmodSync(join(dataDir, 'gallery.sqlite'), 0o600);
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS instances(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, start_command TEXT NOT NULL, stop_command TEXT NOT NULL, interface_url TEXT, status TEXT NOT NULL DEFAULT 'stopped', pid INTEGER, last_error TEXT, origin TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY, instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE, service_key TEXT NOT NULL, name TEXT NOT NULL, port INTEGER NOT NULL UNIQUE, port_env TEXT NOT NULL, interface_url TEXT, health_path TEXT, UNIQUE(instance_id, service_key));
CREATE TABLE IF NOT EXISTS candidates(path TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT, evidence TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', family_id TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
PRAGMA user_version=1;`);
if (!(db.prepare('PRAGMA table_info(families)').all() as any[]).some((column) => column.name === 'favorite')) {
  db.exec('ALTER TABLE families ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
}
db.exec('PRAGMA foreign_keys=ON');
export function canonicalPath(path: string): string {
  const real = realpathSync(path);
  if (!existsSync(real)) throw new Error('O caminho não existe.');
  return real;
}
export function listFamilies() {
  return db.prepare(`SELECT f.id,f.name,f.source,f.favorite,i.id instance_id,i.name instance_name,i.path,i.status,i.pid,i.last_error,i.interface_url,
    (SELECT json_group_array(json_object('id',s.id,'key',s.service_key,'name',s.name,'port',s.port,'interfaceUrl',s.interface_url)) FROM services s WHERE s.instance_id=i.id) services
    FROM families f LEFT JOIN instances i ON i.family_id=f.id ORDER BY f.name,i.name`).all();
}
export function setFavorite(id: string, favorite: boolean) {
  const result = db.prepare('UPDATE families SET favorite=? WHERE id=?').run(favorite ? 1 : 0, id);
  if (!result.changes) throw new Error('Projeto não encontrado.');
  return { id, favorite };
}
export function listCandidates() { return db.prepare("SELECT path,name,source,evidence,status,family_id FROM candidates WHERE status='pending' ORDER BY name").all(); }
function normalizedSource(source?: string) { return source?.trim().replace(/\.git$/, '').replace(/\/$/, '').toLowerCase() || null; }
export function register(input: InstanceInput) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || !Array.isArray(input.services) || !input.services.length) throw new Error('name e ao menos um service são obrigatórios.');
  const path = canonicalPath(input.path);
  const services = input.services;
  const portEnvs = new Set<string>();
  for (const s of services) {
    if (!/^[a-zA-Z][\w-]*$/.test(s.id) || !/^[A-Z_][A-Z0-9_]*$/.test(s.portEnv)) throw new Error(`Serviço inválido: ${s.id || '(sem id)'}.`);
    if (portEnvs.has(s.portEnv)) throw new Error(`Cada serviço precisa de uma variável portEnv própria: ${s.portEnv}.`);
    portEnvs.add(s.portEnv);
    if (s.interfaceUrl) { const url = new URL(s.interfaceUrl); if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('A interface deve usar uma URL HTTP local.'); }
    if (s.healthPath && (!s.healthPath.startsWith('/') || /\s/.test(s.healthPath))) throw new Error(`healthPath inválido para ${s.id}.`);
  }
  const source = normalizedSource(input.source);
  const requestedFamilyName = input.familyName?.trim() || input.name.trim();
  const id = `instance-${createHash('sha256').update(path).digest('hex').slice(0, 24)}`;
  const current = db.prepare('SELECT * FROM instances WHERE path=?').get(path) as any;
  if (current && current.status !== 'stopped') {
    const storedServices = getServices(current.id).map((s) => ({ id: s.service_key, name: s.name, portEnv: s.port_env, interfaceUrl: s.interface_url, healthPath: s.health_path }));
    const requestedServices = services.map((s) => ({ id: s.id, name: s.name || s.id, portEnv: s.portEnv, interfaceUrl: s.interfaceUrl || null, healthPath: s.healthPath || null }));
    const sort = (items: any[]) => items.sort((a, b) => a.id.localeCompare(b.id));
    const sameConfig = current.name === input.name.trim()
      && normalizedSource(current.origin || undefined) === normalizedSource(input.source)
      && current.start_command === JSON.stringify(input.startCommand || ['make', 'start'])
      && current.stop_command === JSON.stringify(input.stopCommand || ['make', 'stop'])
      && JSON.stringify(sort(storedServices)) === JSON.stringify(sort(requestedServices));
    if (sameConfig) return { id: current.id, familyId: current.family_id, name: current.name, path, services: getServices(current.id).map((s) => ({ id: s.service_key, name: s.name, portEnv: s.port_env, interfaceUrl: s.interface_url, healthPath: s.health_path, port: s.port })) };
    throw new Error('Pare a instância antes de alterar sua configuração.');
  }
  const family = source ? db.prepare('SELECT id,name FROM families WHERE source=?').get(source) as any : null;
  const manualFamily = !source ? db.prepare('SELECT id,name FROM families WHERE name=? AND source IS NULL').get(requestedFamilyName) as any : null;
  const selectedFamily = input.familyId ? db.prepare('SELECT id FROM families WHERE id=?').get(input.familyId) as any : null;
  if (input.familyId && !selectedFamily) throw new Error('A família selecionada não existe.');
  const familyId = current?.family_id || selectedFamily?.id || family?.id || manualFamily?.id || (source ? `family-${createHash('sha256').update(source).digest('hex').slice(0, 24)}` : `family-${randomBytes(8).toString('hex')}`);
  const currentFamily = current ? db.prepare('SELECT name FROM families WHERE id=?').get(current.family_id) as any : null;
  const selectedFamilyDetails = selectedFamily ? db.prepare('SELECT name FROM families WHERE id=?').get(selectedFamily.id) as any : null;
  const familyName = currentFamily?.name || selectedFamilyDetails?.name || family?.name || manualFamily?.name || requestedFamilyName;
  const existingPorts = new Set((db.prepare('SELECT port FROM services WHERE instance_id<>?').all(id) as any[]).map((x) => x.port));
  const previousPorts = new Map(current ? getServices(id).map((service) => [service.service_key, service.port]) : []);
  const reusablePorts = new Map([...previousPorts].filter(([, previous]) => previous >= settings.portMin && previous <= settings.portMax && previous !== settings.serverPort && !existingPorts.has(previous)));
  for (const previous of reusablePorts.values()) existingPorts.add(previous);
  let port = settings.portMin;
  const assigned = services.map((service) => {
    const previous = reusablePorts.get(service.id);
    if (previous) return { ...service, port: previous };
    while (existingPorts.has(port) || port === settings.serverPort) port++;
    if (port > settings.portMax) throw new Error('A faixa de portas configurada está esgotada.');
    const row = { ...service, port: port++ }; existingPorts.add(row.port); return row;
  });
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO families(id,name,source) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=CASE WHEN ? THEN families.name ELSE excluded.name END').run(familyId, familyName, source, input.familyId ? 1 : 0);
    const start = JSON.stringify(input.startCommand || ['make', 'start']);
    const stop = JSON.stringify(input.stopCommand || ['make', 'stop']);
    if (current) db.prepare('UPDATE instances SET family_id=?,name=?,start_command=?,stop_command=?,origin=?,last_error=NULL WHERE id=?').run(familyId, input.name.trim(), start, stop, source, id);
    else db.prepare('INSERT INTO instances(id,family_id,name,path,start_command,stop_command,origin) VALUES(?,?,?,?,?,?,?)').run(id, familyId, input.name.trim(), path, start, stop, source);
    db.prepare('DELETE FROM services WHERE instance_id=?').run(id);
    const insert = db.prepare('INSERT INTO services(id,instance_id,service_key,name,port,port_env,interface_url,health_path) VALUES(?,?,?,?,?,?,?,?)');
    assigned.forEach((s) => insert.run(`${id}:${s.id}`, id, s.id, s.name || s.id, s.port, s.portEnv, s.interfaceUrl || null, s.healthPath || null));
    if (input.interfaceUrl) db.prepare('UPDATE instances SET interface_url=? WHERE id=?').run(input.interfaceUrl, id);
    db.prepare("UPDATE candidates SET status='approved',family_id=?,updated_at=CURRENT_TIMESTAMP WHERE path=?").run(familyId, path);
    db.exec('COMMIT');
    writePortMakefile(path, assigned);
    return { id, familyId, name: input.name, path, services: assigned };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function writePortMakefile(path: string, services: { portEnv: string; port: number }[]) {
  const content = `# Generated by Project Gallery. Do not edit; reassign ports in the catalogue.\n${services.map((service) => `override export ${service.portEnv} := ${service.port}`).join('\n')}\n`;
  const target = join(path, '.project-gallery.mk');
  const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, content, { mode: 0o600 });
  renameSync(temp, target);
}
export function syncPortMakefiles() {
  for (const instance of db.prepare('SELECT id,path FROM instances').all() as any[]) {
    if (!existsSync(instance.path)) continue;
    writePortMakefile(instance.path, getServices(instance.id).map((service) => ({ portEnv: service.port_env, port: service.port })));
  }
}
export function reviewCandidate(path: string, action: 'ignore' | 'approve', data?: InstanceInput) {
  const candidate = db.prepare("SELECT * FROM candidates WHERE path=? AND status='pending'").get(path) as any;
  if (!candidate) throw new Error('Candidato pendente não encontrado.');
  if (action === 'ignore') { db.prepare("UPDATE candidates SET status='ignored',updated_at=CURRENT_TIMESTAMP WHERE path=?").run(path); return { ignored: path }; }
  if (!data) throw new Error('Dados de instância são necessários para aprovar.');
  return register({ ...data, path: candidate.path, source: data.source ?? candidate.source });
}
export function authorized(req: any) { return req.headers.authorization === `Bearer ${settings.token}`; }
export function getInstance(id: string) { return db.prepare('SELECT * FROM instances WHERE id=?').get(id) as any; }
export function getServices(id: string) { return db.prepare('SELECT * FROM services WHERE instance_id=? ORDER BY service_key').all(id) as any[]; }
export function updateInstance(id: string, values: Record<string, unknown>) {
  db.prepare(`UPDATE instances SET status=COALESCE(?,status),pid=CASE WHEN ?=1 THEN ? ELSE pid END,last_error=? WHERE id=?`)
    .run(values.status ?? null, Object.hasOwn(values, 'pid') ? 1 : 0, values.pid ?? null, values.last_error ?? null, id);
}
export function reassignPort(serviceId: string, port: number) {
  if (!Number.isInteger(port) || port < settings.portMin || port > settings.portMax || port === settings.serverPort) throw new Error('Porta fora da faixa disponível.');
  const collision = db.prepare('SELECT id FROM services WHERE port=? AND id<>?').get(port, serviceId);
  if (collision) throw new Error('Essa porta já está reservada por outro serviço.');
  const service = db.prepare('SELECT instance_id FROM services WHERE id=?').get(serviceId) as any;
  if (!service) throw new Error('Serviço não encontrado.');
  if (getInstance(service.instance_id).status !== 'stopped') throw new Error('Pare a instância antes de reatribuir a porta.');
  db.prepare('UPDATE services SET port=? WHERE id=?').run(port, serviceId);
  const instance = getInstance(service.instance_id);
  writePortMakefile(instance.path, getServices(instance.id).map((item) => ({ portEnv: item.port_env, port: item.port })));
}
export function addCandidate(candidate: { path: string; name: string; source: string | null; evidence: string[] }) {
  db.prepare("INSERT INTO candidates(path,name,source,evidence,status) VALUES(?,?,?,?,'pending') ON CONFLICT(path) DO UPDATE SET name=excluded.name,source=COALESCE(candidates.source,excluded.source),evidence=excluded.evidence,updated_at=CURRENT_TIMESTAMP WHERE candidates.status='pending'")
    .run(candidate.path, candidate.name, candidate.source, JSON.stringify(candidate.evidence));
}
export function familyOptions() { return db.prepare('SELECT id,name,source FROM families ORDER BY name').all(); }
export function ensureFamily(name: string) {
  const id = `family-manual-${Buffer.from(name.toLowerCase()).toString('base64url').slice(0, 18)}`;
  db.prepare('INSERT INTO families(id,name) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(id, name);
  return id;
}
