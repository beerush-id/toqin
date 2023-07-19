import { css, Toqin } from '../dist/esm/index.js';

const toqin = new Toqin({
  writeFile: true,
  outDir: './variables',
  watch: true,
});

toqin.use(css({
  mode: 'css',
  extension: 'scss',
  addOverride: true,
}));

toqin.run();
