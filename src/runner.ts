import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getInstance, getServices, updateInstance, settings, reassignPort } from './core.ts';
type StartOperation = { id: string; status: string; stage: string; startedAt: number; services: { id: string; name: string; port: number; status: string }[]; logPath: string; error: string | null; cancelRequested: boolean; child?: any; task?: Promise<void> };
const operations = new Map<string, StartOperation>();
const logDir = join(process.env.GALLERY_DATA_DIR || join(process.env.HOME || '.', '.local', 'share', 'project-gallery'), 'logs');
mkdirSync(logDir, { recursive: true, mode: 0o700 });
function portFree(port: number) {
  return new Promise<boolean>((resolve) => { const server = createServer(); server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true))); });
}
async function serviceReady(service: any, timeout = 30000, op?: StartOperation) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (op?.cancelRequested) return false;
    if (!(await portFree(service.port))) {
      if (!service.health_path) return true;
      try { const response = await fetch(`http://127.0.0.1:${service.port}${service.health_path}`, { signal: AbortSignal.timeout(500) }); if (response.ok) return true; } catch { /* continue until timeout */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}
function instanceEnvironment(services: any[]) {
  const env = { ...process.env };
  for (const service of services) env[service.port_env] = String(service.port);
  return env;
}
function runLifecycleCommand(command: string[], cwd: string, env: NodeJS.ProcessEnv, detached: boolean, op?: StartOperation, timeout = 15 * 60_000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, detached, stdio: ['ignore', 'pipe', 'pipe'] });
    if (op) op.child = child;
    const log = (chunk: Buffer) => { appendFileSync(op?.logPath || join(logDir, 'lifecycle.log'), chunk); };
    child.stdout.on('data', log); child.stderr.on('data', log);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      if (detached && child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* process may have exited */ } }
      else child.kill('SIGTERM');
      finish(new Error('O comando de ciclo excedeu o tempo limite.'));
    }, timeout);
    child.once('error', (error: Error) => finish(error));
    child.once('exit', (code, signal) => finish(code === 0 ? undefined : new Error(`O comando terminou com código ${code ?? signal}.`)));
    if (detached) child.unref();
  });
}
async function stopCommand(instance: any, services: any[]) {
  const command = JSON.parse(instance.stop_command) as string[];
  await runLifecycleCommand(command, instance.path, instanceEnvironment(services), false, undefined, 30_000);
}
function snapshot(op: StartOperation) {
  let log = ''; try { log = readFileSync(op.logPath, 'utf8').slice(-12000); } catch { /* log is created by the command */ }
  return { id: op.id, status: op.status, stage: op.stage, elapsedMs: Date.now() - op.startedAt, services: op.services, log, error: op.error };
}
export function startOperation(id: string) { const op = operations.get(id); return op ? snapshot(op) : null; }
export async function beginStartInstance(id: string) {
  const existing = operations.get(id); if (existing && existing.status === 'starting') return snapshot(existing);
  const instance = getInstance(id); if (!instance) throw new Error('Instância não encontrada.');
  if (instance.status === 'active') return { id, status: 'active', alreadyRunning: true };
  const services = getServices(id);
  writeFileSync(join(logDir, `${id}.log`), '', { mode: 0o600 });
  const op: StartOperation = { id, status: 'starting', stage: 'Preparando serviços', startedAt: Date.now(), services: services.map((s) => ({ id: s.service_key, name: s.name, port: s.port, status: 'Aguardando' })), logPath: join(logDir, `${id}.log`), error: null, cancelRequested: false };
  operations.set(id, op);
  for (const service of services) if (!(await portFree(service.port))) { operations.delete(id); throw new Error(`Porta ${service.port} (${service.name}) já está ocupada. Reatribua a porta antes de iniciar.`); }
  updateInstance(id, { status: 'starting', last_error: null });
  const command = JSON.parse(instance.start_command) as string[];
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== 'string')) { operations.delete(id); throw new Error('Comando de início inválido.'); }
  updateInstance(id, { status: 'starting', pid: null });
  op.task = (async () => {
    try {
      op.stage = `Executando ${command.join(' ')}`;
      await runLifecycleCommand(command, instance.path, instanceEnvironment(services), true, op);
      if (op.cancelRequested) throw new Error('Inicialização cancelada.');
      op.stage = 'Aguardando serviços nas portas atribuídas';
      const results = await Promise.all(services.map(async (service, index) => {
        op.services[index].status = 'Verificando';
        const ready = await serviceReady(service, 120000, op);
        op.services[index].status = ready ? 'Disponível' : 'Sem resposta';
        return ready;
      }));
      if (!results.every(Boolean)) throw new Error(`Serviços sem resposta nas portas atribuídas: ${op.services.filter((s) => s.status !== 'Disponível').map((s) => `${s.name} (${s.port})`).join(', ')}.`);
      op.status = 'active'; op.stage = 'Todos os serviços estão disponíveis';
      updateInstance(id, { status: 'active', pid: null });
    } catch (error) {
      try { await stopCommand(instance, services); } catch { /* preserve the startup failure */ }
      op.status = op.cancelRequested ? 'stopped' : 'failed'; op.error = error instanceof Error ? error.message : 'Falha ao iniciar a instância.'; op.stage = op.cancelRequested ? 'Inicialização cancelada' : 'Falha na inicialização';
      updateInstance(id, { status: op.status, pid: null, last_error: op.status === 'failed' ? op.error : null });
    }
  })();
  return snapshot(op);
}
export async function startInstance(id: string) { const initial = await beginStartInstance(id); const op = operations.get(id); if (op?.task) await op.task; return op ? snapshot(op) : initial; }
export async function cancelStartInstance(id: string) { const op = operations.get(id); if (!op || op.status !== 'starting') throw new Error('Não há inicialização em andamento.'); op.cancelRequested = true; op.stage = 'Cancelando e encerrando serviços'; if (op.child?.pid) { try { process.kill(-op.child.pid, 'SIGTERM'); } catch { /* command may have exited */ } } return snapshot(op); }
export async function stopInstance(id: string) {
  const instance = getInstance(id); if (!instance) throw new Error('Instância não encontrada.');
  try { await stopCommand(instance, getServices(id)); }
  catch (error) { updateInstance(id, { last_error: error instanceof Error ? error.message : 'Falha ao parar a instância.' }); throw error; }
  updateInstance(id, { status: 'stopped', pid: null, last_error: null });
  operations.delete(id);
  return { status: 'stopped' };
}
export async function reassign(serviceId: string, port: number) { if (!(await portFree(port))) throw new Error(`Porta ${port} está ocupada no sistema.`); reassignPort(serviceId, port); }
let reconciliation: Promise<void> | null = null;
export function reconcile() {
  if (reconciliation) return reconciliation;
  reconciliation = reconcileInstances().finally(() => { reconciliation = null; });
  return reconciliation;
}
export function isReconciling() { return reconciliation !== null; }
async function reconcileInstances() {
  const families = (await import('./core.ts')).listFamilies() as any[];
  const ids = [...new Set(families.map((row) => row.instance_id).filter(Boolean))] as string[];
  await Promise.all(ids.map(async (id) => {
    const instance = getInstance(id);
    const services = getServices(instance.id);
    const active = services.length > 0 && (await Promise.all(services.map((service) => serviceReady(service, 1000)))).every(Boolean);
    if (active) {
      updateInstance(instance.id, { status: 'active', pid: null, last_error: null });
    } else if (instance.status === 'active' || instance.status === 'starting' || instance.status === 'unknown') {
      let pidAlive = false;
      if (instance.pid) { try { process.kill(instance.pid, 0); pidAlive = true; } catch { pidAlive = false; } }
      updateInstance(instance.id, pidAlive
        ? { status: 'unknown', last_error: 'Processo existe, mas os serviços não foram confirmados nas portas registradas.' }
        : { status: 'stopped', pid: null, last_error: null });
    }
  }));
}
