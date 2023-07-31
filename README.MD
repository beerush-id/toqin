# Toqin

Tokin is a Design Token Library for UI Development.

Sharing design tokens across platforms and keeping them in sync is a challenge. Toqin is a tool that helps you to manage
your design tokens in a single source of truth and generate the code for your favorite platforms.

## 🎨 Design Token

Design tokens are the visual design atoms of the design system — specifically, they are named entities that store
visual design attributes. We use them in place of hard-coded values (such as hex values for color or pixel values for
spacing) in order to maintain a scalable and consistent visual system for UI development.

## 🖇️ The Problem

In a big company with multiple teams that working on different platforms and frameworks, keeping the design tokens in
sync is hard.

It's easy to create a design token for a single platform, but when you want to use a different platform/framework,
you need to create a new design token for that platform. It's hard to keep them in sync. You need to update the design
token in multiple places.

For example, one project is using pure CSS, and another project is using Tailwind CSS. You need to create a design
token for each platform. When you want to change the primary color, you need to update the design token in multiple
places. 🤮

## 💡 The Solution

Toqin is a tool that helps you to manage your design tokens in a single source of truth and generate the code for your
favorite platforms. You can create a design token for multiple platforms in a single file and Toqin will generate the
code for you.

## Example

### Design Token

```json
{
  "name": "design-system",
  "description": "My Design System",
  "tokens": [
    {
      "name": "color",
      "type": "color",
      "tokens": [
        {
          "name": "blue",
          "value": "#0000ff"
        },
        {
          "name": "black",
          "value": "#000000"
        },
        {
          "name": "white",
          "value": "#ffffff"
        },
        {
          "name": "text",
          "value": {
            "@": "@color.black",
            "@dark": "@color.white"
          }
        },
        {
          "name": "background",
          "value": {
            "@": "@color.white",
            "@dark": "@color.black"
          }
        }
      ]
    }
  ],
  "designs": [
    {
      "name": "anchor",
      "selectors": ["a"],
      "description": "Anchor styles",
      "rules": {
        "color": {
          "@": "@color.blue",
          "@dark": "@color.white"
        },
        "font-size": {
          "@": "14px",
          "@small": "12px"
        }
      }
    }
  ]
}
```

### Generate CSS

```css
:root {
  --color-blue: #0000ff;
  --color-black: #000000;
  --color-white: #ffffff;
  --color-text: var(--color-black);
  --color-background: var(--color-white);
}

a {
  color: var(--color-blue);
  font-size: 14px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text: var(--color-white);
    --color-background: var(--color-black);
  }

  a {
    color: var(--color-white);
  }
}

@media (max-width: 640px) {
  a {
    font-size: 12px;
  }
}
```

### Generated Tailwind CSS

**`CSS Variable Mode`**

```js (title="tailwind.config.js")
export default {
  theme: {
    colors: {
      blue: '#0000ff',
      black: '#000000',
      white: '#ffffff',
      text: {
        DEFAULT: 'var(--color-black)',
        dark: 'var(--color-white)',
      },
      background: {
        DEFAULT: 'var(--color-white)',
        dark: 'var(--color-black)',
      },
    },
  },
};

```

**`Inline Mode`**

```js (title="tailwind.config.js")
export default {
  theme: {
    colors: {
      blue: '#0000ff',
      black: '#000000',
      white: '#ffffff',
      text: {
        DEFAULT: '#000000',
        dark: '#ffffff',
      },
      background: {
        DEFAULT: '#ffffff',
        dark: '#000000',
      },
    },
  },
};

```

**`Tailwind Classes (WIP)`**

```js (title="tailwind.classes.js")
export const anchor = 'text-blue text-[14px] dark:text-white sm:text-[12px]';
```
