import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Toqin: The Source of Truth of Design System Engine',
  description: 'Build Design System once, use it everywhere!',

  cleanUrls: true,

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    search: {
      provider: 'local',
    },
    nav: [
      {
        text: 'Home',
        link: '/',
      },
      {
        text: 'Guide',
        items: [
          {
            text: 'Getting Started',
            link: '/guide/getting-started',
          },
          {
            text: 'Why Toqin?',
            link: '/guide/why-toqin',
          },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Guides',
        items: [
          {
            text: 'Getting Started',
            link: '/guide/getting-started',
          },
          {
            text: 'Why Toqin?',
            link: '/guide/why-toqin',
          },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/beerush-id/toqin' },
    ],

    footer: {
      copyright: 'Copyright &copy; 2023 PT. Beerush Teknologi Indonesia. All rights reserved.',
    },
  },
});
