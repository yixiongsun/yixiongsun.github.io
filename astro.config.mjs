import { defineConfig } from 'astro/config';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const isProjectSite = Boolean(repository && !repository.endsWith('.github.io'));
const base = process.env.GITHUB_ACTIONS && isProjectSite ? `/${repository}` : '/';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://yixiongsun.github.io',
  base,
});
