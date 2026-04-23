const LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const cur = LEVELS[LEVEL] ?? 1;

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function make(level, color) {
  return (...args) => {
    if (LEVELS[level] < cur) return;
    const prefix = `\x1b[${color}m[${ts()} ${level}]\x1b[0m`;
    console.log(prefix, ...args);
  };
}

export const log = {
  debug: make('debug', '90'),
  info: make('info', '36'),
  warn: make('warn', '33'),
  error: make('error', '31'),
};
