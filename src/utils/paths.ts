const rawBase = import.meta.env.BASE_URL;
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export function withBase(path = '') {
  return `${base}${path.replace(/^\/+/, '')}`;
}
