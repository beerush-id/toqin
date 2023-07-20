import fs from 'fs-extra';
import * as glob from 'glob';

export function rename(file, ext = 'cjs') {
  const content = fs.readFileSync(file, 'utf-8');
  const path = file.replace('.js', `.${ext}`);
  const text = content.replace(/\.js/g, `.${ext}`);

  fs.writeFileSync(path, text, 'utf-8');
  fs.removeSync(file);
}

if (process.argv.includes('--cjs')) {
  const files = glob.sync('./dist/cjs/**/*.js');

  for (const file of files) {
    rename(file, 'cjs');
  }
}
