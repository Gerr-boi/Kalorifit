import { spawn } from 'node:child_process';
import path from 'node:path';

const esbuildBinaryPath = path.resolve('node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'sh';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npx vite --configLoader native']
  : ['-lc', 'npx vite --configLoader native'];

const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
  windowsHide: false,
  env: {
    ...process.env,
    ESBUILD_BINARY_PATH: esbuildBinaryPath,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
