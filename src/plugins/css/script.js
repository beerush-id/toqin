export const script = (id, version) => {
  const bootstrap = () => {
    const text = `/* TOQIN-CSS */`;
    const link = document.querySelector(`link[href="${id}"]`);
    let style = document.querySelector(`style[data-href="${id}"]`);

    if (!style) {
      style = document.createElement('style');
      style.type = 'text/css';
      style.innerHTML = text;
      style.setAttribute('data-href', id);
      document.head.appendChild(style);
    }

    /** HMR START */
    const socket = new WebSocket(`ws://${window.location.host}`, 'vite-hmr');
    socket.addEventListener('message', ({ data }) => {
      const { event, data: spec } = JSON.parse(data);

      if (event === 'toqin-change' && spec.id === id && spec.version === version) {
        link?.remove();
        style.innerHTML = spec.content;
      }
    });
    /** HMR END */
  };

  if (typeof window !== 'undefined') {
    bootstrap();
  }
};
