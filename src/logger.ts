export const logger = {
  info: (...args: unknown[]) => {
    console.log(...args.map(arg => {
      if (typeof arg === 'string') {
        return `ℹ️ \x1b[32m${ arg }\x1b[0m`;
      }

      return arg;
    }));
  },
  warn: (...args: unknown[]) => {
    console.warn(...args.map(arg => {
      if (typeof arg === 'string') {
        return `⚠️ \x1b[33m${ arg }\x1b[0m`;
      }

      return arg;
    }));
  },
  error: (...args: unknown[]) => {
    console.error(...args.map(arg => {
      if (typeof arg === 'string') {
        return `❌  \x1b[31m${ arg }\x1b[0m`;
      }

      return arg;
    }));
  },
  debug: (...args: unknown[]) => {
    log(...args.map(arg => {
      if (typeof arg === 'string') {
        return `🆗 \x1b[35m${ arg }\x1b[0m`;
      }

      return arg;
    }));
  }
};

function log(...args: unknown[]) {
  if (process.argv.includes('--verbose')) {
    console.log(...args);
  }
}
