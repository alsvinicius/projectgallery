import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorized, db, dataDir, ensureFamily, familyOptions, listCandidates, listFamilies, register, reviewCandidate, settings } from './core.ts';
import { discover } from './scanner.ts';
import { reconcile, reassign, startInstance, stopInstance } from './runner.ts';
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const html = readFileSync(join(root, 'public/index.html'));
function send(res: any, status: number, body: unknown) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req: any) { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Corpo da requisição muito grande.'); } return raw ? JSON.parse(raw) : {}; }
function safeUiPost(req: any) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host && new URL(origin).hostname === '127.0.0.1'; } catch { return false; }
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (url.pathname === '/api/v1/health' && req.method === 'GET') return send(res, 200, { status: 'ok', version: 1 });
  if (url.pathname.startsWith('/api/v1/')) {
    if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') return send(res, 403, { error: 'API aceita apenas conexões locais.' });
    if (!authorized(req)) return send(res, 401, { error: 'Bearer token ausente ou inválido.' });
    try {
      if (url.pathname === '/api/v1/register' && req.method === 'POST') { const input = await body(req); if (input.version !== 1 || !input.project || typeof input.project !== 'object') throw new Error('Manifesto incompatível; esperado contrato v1 com project e services.'); return send(res, 201, { instance: register({ ...input.project, services: input.services }) }); }
      if (url.pathname === '/api/v1/catalog' && req.method === 'GET') return send(res, 200, { families: listFamilies() });
      return send(res, 404, { error: 'Rota não encontrada.' });
    } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Requisição inválida.' }); }
  }
  if (['/', '/gallery', '/approvals'].includes(url.pathname) && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'" }); return res.end(html); }
  if (url.pathname.startsWith('/ui/')) {
    if (!safeUiPost(req) && req.method !== 'GET') return send(res, 403, { error: 'Origem não permitida.' });
    try {
      if (url.pathname === '/ui/state' && req.method === 'GET') return send(res, 200, { families: listFamilies(), candidates: listCandidates(), familyOptions: familyOptions() });
      if (url.pathname === '/ui/discover' && req.method === 'POST') return send(res, 200, { discovered: discover() });
      if (url.pathname === '/ui/review' && req.method === 'POST') {
        const input = await body(req);
        if (input.action === 'approve') {
          const familyName = String(input.familyName || input.name || 'Projeto').trim();
          const startTarget = String(input.startTarget || 'start'); const stopTarget = String(input.stopTarget || 'stop');
          if (!/^[A-Za-z0-9_.-]+$/.test(startTarget) || !/^[A-Za-z0-9_.-]+$/.test(stopTarget)) throw new Error('Alvos Make inválidos. Use um único nome de alvo.');
          let services;
          try { services = JSON.parse(String(input.services || '[]')); } catch { throw new Error('A lista de serviços precisa estar em JSON válido.'); }
          if (!Array.isArray(services) || services.length === 0) throw new Error('Declare ao menos um serviço com nome, id e portEnv.');
          const instance = { name: String(input.name || ''), path: String(input.path || ''), source: input.source || undefined, familyName, familyId: input.familyId || undefined,
            services: services.map((s: any) => ({ id: String(s.id), name: String(s.name), portEnv: String(s.portEnv), interfaceUrl: s.interfaceUrl || undefined, healthPath: s.healthPath || undefined })),
            startCommand: ['make', startTarget], stopCommand: ['make', stopTarget] };
          return send(res, 200, { instance: reviewCandidate(instance.path, 'approve', instance) });
        }
        return send(res, 200, reviewCandidate(String(input.path), 'ignore'));
      }
      if (url.pathname === '/ui/family' && req.method === 'POST') { const input = await body(req); return send(res, 200, { familyId: ensureFamily(String(input.name || '').trim()) }); }
      const startMatch = url.pathname.match(/^\/ui\/instances\/([^/]+)\/start$/);
      if (startMatch && req.method === 'POST') return send(res, 200, await startInstance(decodeURIComponent(startMatch[1])));
      const stopMatch = url.pathname.match(/^\/ui\/instances\/([^/]+)\/stop$/);
      if (stopMatch && req.method === 'POST') return send(res, 200, await stopInstance(decodeURIComponent(stopMatch[1])));
      const portMatch = url.pathname.match(/^\/ui\/services\/([^/]+)\/port$/);
      if (portMatch && req.method === 'POST') { const input = await body(req); await reassign(decodeURIComponent(portMatch[1]), Number(input.port)); return send(res, 200, { ok: true }); }
      const interfaceMatch = url.pathname.match(/^\/ui\/services\/([^/]+)\/interface$/);
      if (interfaceMatch && req.method === 'POST') {
        const id = decodeURIComponent(interfaceMatch[1]);
        const service = db.prepare('SELECT id,port FROM services WHERE id=?').get(id) as any;
        if (!service) throw new Error('Serviço não encontrado.');
        const input = await body(req);
        let address: string | null = null;
        if (String(input.interfaceUrl || '').trim()) {
          const target = new URL(String(input.interfaceUrl).trim());
          if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Use uma URL HTTP local, sem credenciais.');
          target.port = String(service.port);
          address = target.href;
        }
        db.prepare('UPDATE services SET interface_url=? WHERE id=?').run(address, id);
        return send(res, 200, { interfaceUrl: address });
      }
      return send(res, 404, { error: 'Rota não encontrada.' });
    } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Operação inválida.' }); }
  }
  send(res, 404, { error: 'Não encontrado.' });
});
await reconcile();
discover();
server.listen(settings.serverPort, '127.0.0.1', () => console.log(`Galeria local em http://127.0.0.1:${settings.serverPort}; dados em ${dataDir}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { try { db.close(); } finally { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); } });
