// Runs the API (node --watch) and Vite together; Ctrl-C stops both.
import { spawn } from 'node:child_process';
import process from 'node:process';

const children = [
  spawn('node', ['--watch', 'src/server/node.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];

function stop() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
