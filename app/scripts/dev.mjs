import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;
const shellCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'sh';

function start(name, scriptName) {
  const shellArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm run ${scriptName}`]
    : ['-lc', `npm run ${scriptName}`];
  const child = spawn(shellCommand, shellArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const proc of children) {
      if (proc.pid && !proc.killed) {
        proc.kill('SIGTERM');
      }
    }
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`${name} exited with ${reason}`);
    process.exit(code ?? 1);
  });

  children.push(child);
}

start('dev:client', 'dev:client');
start('dev:server', 'dev:server');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (child.pid && !child.killed) {
        child.kill('SIGTERM');
      }
    }
    process.exit(0);
  });
}
