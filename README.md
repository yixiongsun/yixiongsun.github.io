# Yixiong Sun — personal website

A dark, compact portfolio built with Astro and designed for GitHub Pages.

## Content structure

- `src/data/portfolio.ts` contains the experience, project, and research records.
- The homepage shows selected experience and project highlights.
- `/experience/` and `/work/` contain the complete experience and project indexes.
- `/research/` holds the complete publication, poster, and talk archive.
- Every project and research record receives its own detail page automatically.

## Adding media

Place images and videos under `public/media/`, then add a `media` field to a project:

```ts
media: {
  type: 'video',
  src: 'media/project-demo.webm',
  poster: 'media/project-demo.jpg',
  alt: 'Short description of the demonstration',
}
```

For a poster, add `image` and optionally `pdf` to its research record. Poster thumbnails are intentionally omitted from the archive and shown only on detail pages.

## Local development

```sh
pnpm install
pnpm dev
```

## GitHub Pages

Push the project to a GitHub repository, enable **Settings → Pages → GitHub Actions**, and push to `main`. The included workflow builds and deploys both user and project sites.
