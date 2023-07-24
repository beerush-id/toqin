import { css, Toqin } from '../dist/esm/index.js';

const toqin = new Toqin({
  tokenPath: './extend.toqin',
  outDir: './output',
});

const cssConfig = {
  outDir: '.',
};

toqin.use(css(cssConfig));
toqin.run();
