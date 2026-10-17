import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addCandidate, db, listCandidates, listFamilies, register, reviewCandidate, settings } from '../src/core.ts';
import { discover } from '../src/scanner.ts';

const scratch = mkdtempSync(join(tmpdir(), 'project-gallery-test-'));
db.exec('DELETE FROM services; DELETE FROM instances; DELETE FROM families; DELETE FROM candidates;');
test.after(() => { db.close(); rmSync(scratch, { recursive: true, force: true }); });

test('discovery queues candidates without registering or starting them', () => {
  const workspace = join(scratch, 'workspace'); const project = join(workspace, 'legacy-app'); const ambiguous = join(workspace, 'ambiguous-folder');
  mkdirSync(project, { recursive: true }); mkdirSync(ambiguous); writeFileSync(join(project, 'Makefile'), 'start:\n\t@true\n');
  settings.workspaces = [workspace];
  assert.equal(discover(), 2);
  assert.equal(listCandidates().length, 2);
  assert.equal(listFamilies().length, 0);
  assert.equal((listCandidates()[0] as any).status, 'pending');
  assert.deepEqual(JSON.parse((listCandidates().find((candidate: any) => candidate.name === 'ambiguous-folder') as any).evidence), []);
});

test('valid registration is idempotent and keeps stable unique ports', () => {
  const first = join(scratch, 'app-one'); const second = join(scratch, 'app-two');
  mkdirSync(first); mkdirSync(second);
  const a = register({ name: 'App one', path: first, familyName: 'Shared family', source: 'https://example.test/repo.git', services: [{ id: 'web', name: 'Web', portEnv: 'WEB_PORT' }] });
  const again = register({ name: 'App one', path: first, familyName: 'Shared family', source: 'https://example.test/repo.git', services: [{ id: 'web', name: 'Web', portEnv: 'WEB_PORT' }] });
  const b = register({ name: 'App two', path: second, familyName: 'Different suggested title', source: 'https://example.test/repo.git', services: [{ id: 'api', name: 'API', portEnv: 'API_PORT' }] });
  assert.equal(a.id, again.id);
  assert.equal(a.services[0].port, again.services[0].port);
  assert.notEqual(a.services[0].port, b.services[0].port);
  assert.equal(a.familyId, b.familyId);
  assert.equal(listFamilies().filter((item: any) => item.id === a.familyId).length, 2);
  assert.equal((db.prepare('SELECT name FROM families WHERE id=?').get(a.familyId) as any).name, 'Shared family');
  const changed = register({ name: 'App one', path: first, familyName: 'Shared family', source: 'https://example.test/repo.git', services: [
    { id: 'worker', name: 'Worker', portEnv: 'WORKER_PORT' },
    { id: 'web', name: 'Web renamed', portEnv: 'WEB_PORT' },
  ] });
  assert.equal(changed.services.find((service: any) => service.id === 'web')?.port, a.services[0].port);
  assert.notEqual(changed.services.find((service: any) => service.id === 'worker')?.port, b.services[0].port);
});

test('invalid registration makes no partial database change', () => {
  const path = join(scratch, 'invalid'); mkdirSync(path);
  const before = (db.prepare('SELECT COUNT(*) count FROM instances').get() as any).count;
  assert.throws(() => register({ name: 'Bad', path, services: [] }), /ao menos um service/);
  const after = (db.prepare('SELECT COUNT(*) count FROM instances').get() as any).count;
  assert.equal(after, before);
});

test('review approval requires an explicit review decision', () => {
  const path = join(scratch, 'reviewed-app'); mkdirSync(path);
  addCandidate({ path, name: 'Reviewed app', source: null, evidence: ['Makefile'] });
  assert.equal(listCandidates().some((candidate: any) => candidate.path === path), true);
  const registered = reviewCandidate(path, 'approve', { name: 'Reviewed app', path, familyName: 'Manual family', services: [{ id: 'api', name: 'API', portEnv: 'API_PORT' }] });
  assert.equal(registered.path, path);
  assert.equal(listCandidates().some((candidate: any) => candidate.path === path), false);
});

test('versioned local API authenticates and services survive a gallery restart', async () => {
  const { spawn } = await import('node:child_process');
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { createServer } = await import('node:net');
  const freePort = () => new Promise<number>((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') return reject(new Error('No port')); server.close(() => resolve(address.port)); }); });
  const apiDir = join(scratch, 'api-data'); mkdirSync(apiDir);
  const token = 'test-token-not-a-real-secret'; const galleryPort = await freePort(); const servicePort = await freePort();
  writeFileSync(join(apiDir, 'config.json'), JSON.stringify({ token, workspaces: [], portMin: servicePort, portMax: servicePort, serverPort: galleryPort }), { mode: 0o600 });
  const projectPath = join(scratch, 'api-project'); mkdirSync(projectPath);
  writeFileSync(join(projectPath, 'Makefile'), 'start:\n\tnode service.cjs start\nstop:\n\tnode service.cjs stop\n');
  writeFileSync(join(projectPath, 'service.cjs'), `const{spawn}=require('node:child_process');const{createServer}=require('node:http');const{readFileSync,writeFileSync,unlinkSync,existsSync}=require('node:fs');const path=require('node:path');const pid=path.join(process.cwd(),'.pid');if(process.argv[2]==='start'){const c=spawn(process.execPath,[__filename,'serve'],{detached:true,stdio:'ignore',env:process.env});c.unref();writeFileSync(pid,String(c.pid));}else if(process.argv[2]==='serve'){createServer((q,r)=>r.end('ok')).listen(Number(process.env.WEB_PORT),'127.0.0.1')}else if(existsSync(pid)){try{process.kill(Number(readFileSync(pid,'utf8')),'SIGTERM')}catch{}unlinkSync(pid)}`);
  const serverPath = fileURLToPath(new URL('../src/server.ts', import.meta.url));
  const launch = () => spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', serverPath], { cwd: process.cwd(), env: { ...process.env, GALLERY_DATA_DIR: apiDir }, stdio: 'ignore' });
  const waitReady = async (child: any) => {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${galleryPort}/api/v1/health`)).ok) return; } catch {} if (child.exitCode !== null) throw new Error('Gallery server exited before ready'); await new Promise((resolve) => setTimeout(resolve, 100)); }
    throw new Error('Gallery server did not become ready');
  };
  let child = launch(); let instanceId = ''; let serviceStarted = false;
  const stopGallery = async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise<void>((resolve) => child.once('exit', () => resolve())); } };
  try {
    await waitReady(child);
    const registration = { version: 1, project: { name: 'API fixture', path: projectPath }, services: [{ id: 'web', name: 'Web', portEnv: 'WEB_PORT' }] };
    const denied = await fetch(`http://127.0.0.1:${galleryPort}/api/v1/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(registration) });
    assert.equal(denied.status, 401);
    const invalid = await fetch(`http://127.0.0.1:${galleryPort}/api/v1/register`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ version: 0 }) });
    assert.equal(invalid.status, 400);
    const accepted = await fetch(`http://127.0.0.1:${galleryPort}/api/v1/register`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(registration) });
    assert.equal(accepted.status, 201);
    const result: any = await accepted.json(); instanceId = result.instance.id;
    writeFileSync(join(projectPath, 'project-gallery.json'), JSON.stringify(registration));
    const { execFileSync } = await import('node:child_process');
    const cliOutput = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--experimental-strip-types', fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'register'], { cwd: projectPath, env: { ...process.env, GALLERY_DATA_DIR: apiDir }, encoding: 'utf8' });
    assert.match(cliOutput, /Projeto registrado/); assert.equal(cliOutput.includes(token), false, 'CLI must not print the local token');
    const catalog = await fetch(`http://127.0.0.1:${galleryPort}/api/v1/catalog`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(catalog.status, 200); assert.match(await catalog.text(), /API fixture/);
    for (const page of ['/', '/gallery', '/approvals']) {
      const response = await fetch(`http://127.0.0.1:${galleryPort}${page}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /id="nav-approvals"/);
    }
    const interfaceEndpoint = `http://127.0.0.1:${galleryPort}/ui/services/${encodeURIComponent(`${instanceId}:web`)}/interface`;
    const updateInterface = (interfaceUrl: string) => fetch(interfaceEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ interfaceUrl }) });
    for (const address of ['https://example.com/', 'javascript:alert(1)', 'http://user:secret@localhost/']) assert.equal((await updateInterface(address)).status, 400);
    const updated = await updateInterface('http://127.0.0.1:1234/dashboard');
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as any).interfaceUrl, `http://127.0.0.1:${servicePort}/dashboard`);
    const uiState: any = await (await fetch(`http://127.0.0.1:${galleryPort}/ui/state`)).json();
    assert.equal(JSON.parse(uiState.families[0].services)[0].interfaceUrl, `http://127.0.0.1:${servicePort}/dashboard`);
    const start = await fetch(`http://127.0.0.1:${galleryPort}/ui/instances/${instanceId}/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(start.status, 202); serviceStarted = true;
    for (let i = 0; i < 100; i++) {
      const current: any = await (await fetch(`http://127.0.0.1:${galleryPort}/ui/state`)).json();
      if (current.families.find((family: any) => family.instance_id === instanceId)?.status === 'active') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal((await fetch(`http://127.0.0.1:${servicePort}`)).status, 200);
    await stopGallery();
    assert.equal((await fetch(`http://127.0.0.1:${servicePort}`)).status, 200, 'project service should outlive gallery shutdown');
    child = launch(); await waitReady(child);
    const state: any = await (await fetch(`http://127.0.0.1:${galleryPort}/ui/state`)).json();
    assert.equal(state.families.find((family: any) => family.instance_id === instanceId).status, 'active');
    const stop = await fetch(`http://127.0.0.1:${galleryPort}/ui/instances/${instanceId}/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(stop.status, 200); serviceStarted = false;
  } finally {
    await stopGallery();
    if (serviceStarted) { const { execFileSync } = await import('node:child_process'); try { execFileSync('make', ['stop'], { cwd: projectPath, stdio: 'ignore' }); } catch {} }
  }
});

test('gallery passes allocated service ports to both start and stop commands', async () => {
  const { createServer } = await import('node:net');
  const { startInstance, stopInstance, reconcile } = await import('../src/runner.ts');
  const project = join(scratch, 'runner-fixture'); mkdirSync(project);
  const available = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') return reject(new Error('No port')); server.close(() => resolve(address.port)); }); });
  const secondPort = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') return reject(new Error('No port')); server.close(() => resolve(address.port)); }); });
  const previousMin = settings.portMin; const previousMax = settings.portMax; settings.portMin = Math.min(available, secondPort); settings.portMax = Math.max(available, secondPort);
  writeFileSync(join(project, 'Makefile'), 'start:\n\tnode lifecycle.cjs start\nstop:\n\tnode lifecycle.cjs stop\n');
  const fixture = join(project, 'lifecycle.cjs');
  writeFileSync(fixture, `const {spawn}=require('node:child_process');const {createServer}=require('node:http');const {readFileSync,writeFileSync,unlinkSync,existsSync}=require('node:fs');const path=require('node:path');const pid=path.join(process.cwd(),'.pid');if(process.argv[2]==='start'){const c=spawn(process.execPath,[__filename,'serve'],{detached:true,stdio:'ignore',env:process.env});c.unref();writeFileSync(pid,String(c.pid));}else if(process.argv[2]==='serve'){createServer((q,r)=>{r.end('ok')}).listen(Number(process.env.WEB_PORT),'127.0.0.1')}else {writeFileSync(path.join(process.cwd(),'.stop-port'),String(process.env.WEB_PORT||''));if(existsSync(pid)){try{process.kill(Number(readFileSync(pid,'utf8')),'SIGTERM')}catch{}unlinkSync(pid)}}`);
  const registered = register({ name: 'Runner fixture', path: project, services: [{ id: 'web', name: 'Web', portEnv: 'WEB_PORT' }] });
  try {
    const allocatedPort = registered.services[0].port;
    assert.match(readFileSync(join(project, '.project-gallery.mk'), 'utf8'), new RegExp(`WEB_PORT := ${allocatedPort}`));
    const alternatePort = allocatedPort === available ? secondPort : available;
    const blocker = createServer(); await new Promise<void>((resolve, reject) => { blocker.once('error', reject); blocker.listen(allocatedPort, '127.0.0.1', () => resolve()); });
    await assert.rejects(startInstance(registered.id), /já está ocupada/);
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    const { reassign } = await import('../src/runner.ts'); await reassign(`${registered.id}:web`, alternatePort);
    assert.match(readFileSync(join(project, '.project-gallery.mk'), 'utf8'), new RegExp(`WEB_PORT := ${alternatePort}`));
    assert.equal((db.prepare('SELECT port FROM services WHERE instance_id=?').get(registered.id) as any).port, alternatePort);
    const started = await startInstance(registered.id);
    assert.equal(started.status, 'active');
    assert.equal((await fetch(`http://127.0.0.1:${alternatePort}`)).status, 200);
    assert.equal((db.prepare('SELECT status FROM instances WHERE id=?').get(registered.id) as any).status, 'active');
    assert.equal((await stopInstance(registered.id)).status, 'stopped');
    assert.equal(readFileSync(join(project, '.stop-port'), 'utf8'), String(alternatePort), 'stop command must receive the allocated port');
    let closed = false; for (let i = 0; i < 20; i++) { try { await fetch(`http://127.0.0.1:${alternatePort}`, { signal: AbortSignal.timeout(100) }); await new Promise((resolve) => setTimeout(resolve, 50)); } catch { closed = true; break; } }
    assert.equal(closed, true, 'service should stop after explicit request');
    const external = createServer(); await new Promise<void>((resolve, reject) => { external.once('error', reject); external.listen(alternatePort, '127.0.0.1', () => resolve()); });
    try {
      await reconcile();
      assert.equal((db.prepare('SELECT status FROM instances WHERE id=?').get(registered.id) as any).status, 'active', 'occupied assigned port should reveal a service started outside the gallery');
      assert.equal((await stopInstance(registered.id)).status, 'stopped', 'the stop action should be available for the detected external service');
    } finally { await new Promise<void>((resolve) => external.close(() => resolve())); }
  } finally { settings.portMin = previousMin; settings.portMax = previousMax; }
});
