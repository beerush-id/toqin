import { expect, test } from 'vitest';
import { css, Store } from '../../dist/esm';
import * as path from 'node:path';

const ROOT_PATH = __dirname;
const resolve = (target: string) => path.join(ROOT_PATH, target);

test('Compile CSS with encapsulated tag', async () => {
  const store = new Store(resolve('./compiler.toqin'));
  store.use(
    css({
      encapsulateTag: ':not(.reset)',
    })
  );

  await store.load();
  const result = await store.compile();

  expect(result[0]?.content?.includes(', .button {')).toBe(true);
  expect(result[0]?.content?.includes(', .button.primary {')).toBe(true);
  expect(result[0]?.content?.includes('button:not(.reset)')).toBe(true);
  expect(result[0]?.content?.includes('button.primary:not(.reset)')).toBe(true);
  expect(result[0]?.content?.includes('.button:not(.reset)')).toBe(false);
  expect(result[0]?.content?.includes('.button.primary:not(.reset)')).toBe(false);

  expect(result[0]?.content?.includes('button:not(.reset) span:not(.reset)')).toBe(true);
  expect(result[0]?.content?.includes('.button span:not(.reset)')).toBe(true);
});

test('Compile CSS with encapsulated tag and prefixed class and attribute selectors', async () => {
  const store = new Store(resolve('./compiler.toqin'));
  store.use(
    css({
      encapsulateTag: ':not(.reset)',
      prefix: 'tst',
      prefixSelectors: true,
    })
  );

  await store.load();
  const result = await store.compile();

  expect(result[0]?.content?.includes(', .tst-button {')).toBe(true);
  expect(result[0]?.content?.includes(', .tst-button.tst-primary {')).toBe(true);
  expect(result[0]?.content?.includes('button:not(.tst-reset)')).toBe(true);
  expect(result[0]?.content?.includes('button.tst-primary:not(.tst-reset)')).toBe(true);
  expect(result[0]?.content?.includes('.tst-button:not(.reset)')).toBe(false);
  expect(result[0]?.content?.includes('.tst-button.tst-primary:not(.tst-reset)')).toBe(false);

  expect(result[0]?.content?.includes('button:not(.tst-reset) span:not(.tst-reset)')).toBe(true);
  expect(result[0]?.content?.includes('.tst-button span:not(.tst-reset)')).toBe(true);
});
