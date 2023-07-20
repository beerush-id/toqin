import { watch } from 'chokidar';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { rename } from './rename.js';

spawn('tsc', [ '-w', '-p', './tsconfig.json' ], { stdio: 'inherit', shell: true });
spawn('tsc', [ '-w', '-p', './tsconfig-cjs.json' ], { stdio: 'inherit', shell: true });

watch('./dist').on('all', (event, file) => {
  if (event === 'add' && file.includes('cjs') && file.endsWith('.js')) {
    rename(join(process.cwd(), file), 'cjs');
  }
});
