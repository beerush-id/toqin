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
[
  {
    "name": "color",
    "type": "color",
    "description": "Base Color Palettes",
    "tokens": [
      {
        "name": "text",
        "description": "Text Color",
        "value": {
          "@light": "#000000",
          "@dark": "#ffffff"
        }
      },
      {
        "name": "background",
        "description": "Background color",
        "value": {
          "@light": "#ffffff",
          "@dark": "#000000"
        }
      }
    ]
  }
]
```

### Generate CSS

```css
:root {
  --color-text: #000000;
  --color-background: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #ffffff;
    --color-background: #000000;
  }
}
```

### Generated SCSS

```scss
:root {
  --color-text: #000000;
  --color-background: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #ffffff;
    --color-background: #000000;
  }
}

$color-text: var(--color-text);
$color-background: var(--color-background);
```
