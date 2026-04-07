import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const botDir = path.resolve(appDir, '..', 'food_detection_bot');

function resolveBotPython() {
  const candidates = process.platform === 'win32'
    ? [
        path.join(botDir, '.venv', 'Scripts', 'python.exe'),
        path.join(botDir, '.venv311', 'Scripts', 'python.exe'),
      ]
    : [
        path.join(botDir, '.venv', 'bin', 'python'),
        path.join(botDir, '.venv311', 'bin', 'python'),
      ];

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (existing) {
    return { command: existing, args: ['-m', 'uvicorn', 'src.main:app', '--host', '127.0.0.1', '--port', '8001', '--reload'] };
  }

  if (process.platform === 'win32') {
    return { command: 'py', args: ['-m', 'uvicorn', 'src.main:app', '--host', '127.0.0.1', '--port', '8001', '--reload'] };
  }
  return { command: 'python3', args: ['-m', 'uvicorn', 'src.main:app', '--host', '127.0.0.1', '--port', '8001', '--reload'] };
}

function spawnTaggedProcess(tag, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
  });

  const prefix = `[${tag}] `;
  child.stdout.on('data', (chunk) => process.stdout.write(prefix + chunk.toString().replace(/\n/g, `\n${prefix}`).replace(`${prefix}$`, '')));
  child.stderr.on('data', (chunk) => process.stderr.write(prefix + chunk.toString().replace(/\n/g, `\n${prefix}`).replace(`${prefix}$`, '')));

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`${prefix}stopped (${reason})`);
    shutdown(code ?? 0);
  });

  return child;
}

const children = [];
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (!fs.existsSync(botDir)) {
  console.error(`food_detection_bot directory not found: ${botDir}`);
  process.exit(1);
}

const bot = resolveBotPython();
children.push(spawnTaggedProcess('bot', bot.command, bot.args, botDir));
children.push(spawnTaggedProcess('api', process.execPath, ['server/index.js'], appDir));
children.push(
  spawnTaggedProcess(
    'web',
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev:client'],
    appDir,
  ),
);
