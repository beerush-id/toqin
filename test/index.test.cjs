const { css, Toqin } = require('../dist/cjs/index.cjs');

const toqin = new Toqin({ outDir: './output' });

const cssConfig = {
  outDir: '.'
};

toqin.use(css(cssConfig));
toqin.run();
