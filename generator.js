import { writeFileSync } from 'fs';
import properties from 'known-css-properties';

function generateCssPropertiesSchema() {
  const valueProps = {};

  for (const name of
    [
      '@',
      '@light',
      '@dark',
      '@sm',
      '@md',
      '@lg',
      '@xl',
      ':hover',
      ':focus',
      ':active',
      ':disabled',
      ':enabled',
      ':visited',
      ':checked',
      ':valid',
      ':invalid',
    ]) {
    valueProps[name] = {
      '$ref': '#/definitions/valueTypes',
    };
  }

  const schema = {
    '$schema': 'http://json-schema.org/draft-07/schema#',
    definitions: {
      valueTypes: {
        type: [ 'string', 'number', 'object' ],
      },
      colorTypes: {
        type: [ 'string', 'object', 'number' ],
        anyOf: [
          {
            type: 'string',
          },
          {
            type: 'number',
          },
          {
            type: 'object',
            properties: valueProps,
            additionalProperties: {
              '$ref': '#/definitions/valueTypes',
            },
          },
        ],
      },
    },
    title: 'CSS Properties',
    type: 'object',
    properties: {},
  };

  for (const name of properties.all.sort((a, b) => a.localeCompare(b))) {
    schema.properties[name] = {
      '$ref': '#/definitions/colorTypes',
    };
  }

  writeFileSync('./tokens/schemas/css-properties.schema.json', JSON.stringify(schema, null, 2));
}

if (process.argv.includes('--css-properties-schema')) {
  generateCssPropertiesSchema();
}
