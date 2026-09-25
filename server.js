import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const serverEntry = new URL('./dist-server/index.js', import.meta.url);
const webEntry = new URL('./dist/index.html', import.meta.url);

if (!existsSync(serverEntry) || !existsSync(webEntry)) {
  console.log('[DG神手] Build output not found; running npm run build...');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await import('./dist-server/index.js');
