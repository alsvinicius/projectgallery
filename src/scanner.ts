import { readdirSync, existsSync, realpathSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { addCandidate, settings } from './core.ts';
const SIGNALS = ['.git', 'Makefile', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'docker-compose.yml', 'compose.yaml'];
export function discover() {
  let found = 0;
  for (const workspace of settings.workspaces) {
    if (!existsSync(workspace)) continue;
    for (const entry of readdirSync(workspace, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'project-gallery') continue;
      const candidatePath = join(workspace, entry.name);
      const evidence = SIGNALS.filter((signal) => existsSync(join(candidatePath, signal)));
      let source: string | null = null;
      try { source = execFileSync('git', ['-C', candidatePath, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }).trim() || null; } catch { /* candidate remains reviewable without origin */ }
      addCandidate({ path: realpathSync(candidatePath), name: basename(candidatePath), source, evidence });
      found++;
    }
  }
  return found;
}
