import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { getInstance, getServices, updateInstance, settings, reassignPort } from './core.ts';
function portFree(port: number) {
  return new Promise<boolean>((resolve) => { const server = createServer(); server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true))); });
}
async function serviceReady(service: any, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
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
function runLifecycleCommand(command: string[], cwd: string, env: NodeJS.ProcessEnv, detached: boolean, timeout = 15 * 60_000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, detached, stdio: 'ignore' });
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
  await runLifecycleCommand(command, instance.path, instanceEnvironment(services), false, 30_000);
}
export async function startInstance(id: string) {
  const instance = getInstance(id); if (!instance) throw new Error('Instância não encontrada.');
  if (instance.status === 'active') return { status: 'active', alreadyRunning: true };
  const services = getServices(id);
  for (const service of services) if (!(await portFree(service.port))) throw new Error(`Porta ${service.port} (${service.name}) já está ocupada. Reatribua a porta antes de iniciar.`);
  updateInstance(id, { status: 'starting', last_error: null });
  const command = JSON.parse(instance.start_command) as string[];
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== 'string')) throw new Error('Comando de início inválido.');
  updateInstance(id, { status: 'starting', pid: null });
  try {
    await runLifecycleCommand(command, instance.path, instanceEnvironment(services), true);
  } catch (error) {
    try { await stopCommand(instance, services); } catch { /* keep the start failure as the visible cause */ }
    const message = error instanceof Error ? error.message : 'Falha ao iniciar a instância.';
    updateInstance(id, { status: 'failed', pid: null, last_error: message });
    throw error;
  }
  const ready = (await Promise.all(services.map((service) => serviceReady(service, 120000)))).every(Boolean);
  if (!ready) {
    try { await stopCommand(instance, services); } catch { /* preserve the readiness failure */ }
    updateInstance(id, { status: 'failed', pid: null, last_error: 'Um ou mais serviços não ficaram disponíveis na porta atribuída em 120 segundos.' });
    throw new Error('A inicialização falhou: um ou mais serviços não ficaram disponíveis.');
  }
  updateInstance(id, { status: 'active', pid: null });
  return { status: 'active', services: services.map(({ service_key, port, interface_url }) => ({ id: service_key, port, interfaceUrl: interface_url })) };
}
export async function stopInstance(id: string) {
  const instance = getInstance(id); if (!instance) throw new Error('Instância não encontrada.');
  try { await stopCommand(instance, getServices(id)); }
  catch (error) { updateInstance(id, { last_error: error instanceof Error ? error.message : 'Falha ao parar a instância.' }); throw error; }
  updateInstance(id, { status: 'stopped', pid: null, last_error: null });
  return { status: 'stopped' };
}
export async function reassign(serviceId: string, port: number) { if (!(await portFree(port))) throw new Error(`Porta ${port} está ocupada no sistema.`); reassignPort(serviceId, port); }
export async function reconcile() {
  const families = (await import('./core.ts')).listFamilies() as any[];
  const seen = new Set<string>();
  for (const row of families) if (row.instance_id && !seen.has(row.instance_id)) {
    seen.add(row.instance_id);
    const instance = getInstance(row.instance_id); if (instance.status !== 'active' && instance.status !== 'starting') continue;
    const services = getServices(instance.id);
    const active = services.length > 0 && (await Promise.all(services.map((service) => serviceReady(service, 1000)))).every(Boolean);
    if (!active) {
      let pidAlive = false;
      if (instance.pid) { try { process.kill(instance.pid, 0); pidAlive = true; } catch { pidAlive = false; } }
      updateInstance(instance.id, pidAlive
        ? { status: 'unknown', last_error: 'Processo existe, mas os serviços não foram confirmados nas portas registradas.' }
        : { status: 'stopped', pid: null, last_error: null });
    }
  }
}
