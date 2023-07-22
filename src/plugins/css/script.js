export const script = (themes = {}, mode, scheme) => {
  if (typeof window !== 'undefined') {
    const applyTheme = (name) => {
      for (const [, s] of Object.entries(themes)) {
        if (mode === 'class') {
          document.documentElement.classList.remove(s);
        } else if (mode === 'attribute') {
          document.documentElement.removeAttribute(s);
        } else if (mode === 'id') {
          document.documentElement.removeAttribute('id');
        }
      }

      const theme = themes[`@${name.replace('@', '')}`];

      if (theme) {
        if (mode === 'class') {
          document.documentElement.classList.add(theme);
        } else if (mode === 'attribute') {
          document.documentElement.setAttribute(theme, '');
        } else if (mode === 'id') {
          document.documentElement.setAttribute('id', theme);
        }
      }
    };

    const applySystemTheme = () => {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(dark ? 'dark' : 'light');
    };

    const setTheme = (name) => {
      localStorage.setItem('toqin-color-scheme', name);

      if (name === 'system') {
        applySystemTheme();
      } else {
        applyTheme(name);
      }
    };

    const content = `--CONTENT--`;
    const theme = localStorage.getItem('toqin-color-scheme') || scheme || 'system';

    if (theme === 'system') {
      applySystemTheme();
    } else {
      applyTheme(theme);
    }

    let style = document.querySelector('style#toqin');

    if (style) {
      style.innerHTML = content;
    } else {
      style = document.createElement('style');
      style.id = 'toqin';
      style.type = 'text/css';
      style.innerHTML = content;

      document.head.appendChild(style);
    }

    if (import.meta.hot) {
      import.meta.hot.on('toqin-change', (data) => {
        if (typeof data === 'string') {
          style.innerHTML = data;
        }
      });
    }

    window.setTheme = setTheme;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (localStorage.getItem('toqin-color-scheme') === 'system') {
        applySystemTheme();
      }
    });
    window.addEventListener('storage', (e) => {
      if (e.key === 'toqin-color-scheme') {
        if (e.newValue === 'system') {
          applySystemTheme();
        } else {
          applyTheme(e.newValue);
        }
      }
    });
  }
};
