import { css, Toqin } from '../dist/esm/index.js';

const toqin = new Toqin({ outDir: './output' });

toqin.use(css({
  mode: 'css',
  addOverride: true,
}));

toqin.run();
