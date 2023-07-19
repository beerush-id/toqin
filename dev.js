import { spawn } from 'node:child_process';

spawn('tsc', [ '-w', '-p', './tsconfig.json' ], { stdio: 'inherit', shell: true });
spawn('tsc', [ '-w', '-p', './tsconfig-cjs.json' ], { stdio: 'inherit', shell: true });
