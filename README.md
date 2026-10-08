# Yixiong Sun — personal website

A dark, compact portfolio built with Astro and designed for GitHub Pages.

## Content structure

- `src/data/portfolio.ts` contains the experience, project, and research records.
- The homepage shows selected experience and project highlights.
- `/experience/` and `/projects/` contain the complete experience and project indexes.
- `/research/` holds the complete publication, poster, and talk archive.
- Every project and research record receives its own detail page automatically.

## Editing project pages

All projects share the same structure: title and summary, optional status, overview,
project-specific sections, then tools and source links.

- Edit titles, summaries, years, tools, source URLs, and status notices in
  `src/data/portfolio.ts`.
- Overview text also lives in that project record. By default it uses `description`;
  an optional `overview: { heading, text }` supplies a longer introduction while
  leaving the search/social description concise.
- The shared page structure is in `src/pages/projects/[slug].astro`; the overview
  markup and styling are in `src/components/projects/ProjectOverview.astro`.
- Each detailed project has a folder under `src/components/projects/<slug>/`
  with a `CaseStudy.astro` entry file. Start there to edit its sections or their order.
  Larger sections and interactive figures can be separate components in that same folder.
- The three folders are `evidneuro`, `neural-event-classification`, and
  `spwr-network-simulation`. Neural classification's entry file lists its section
  components; SPW-R's folder also holds `NetworkSimulation.astro` and
  `NetworkComparison.astro`.
- `src/components/projects/index.ts` connects a project slug to its case-study entry.
  Register new detailed projects there without adding special cases to the page template.
- Shared size and color controls remain at the top of `src/styles/global.css`.

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

## Brian2 network visualization data

The interactive SPW-R project uses compact, browser-safe exports rather than loading Brian2,
pickle, or NumPy files in the website. The version 2 catalog includes spikes, three separate model
current channels, six population firing rates, offline SPW-R detections, and lazy voltage groups.
Regenerate the committed baseline and experience data from trusted simulation runs with:

```sh
python scripts/export_network_catalog.py \
  --source-root /path/to/final_run_v2 \
  --output-root public/data/pfc-hpc \
  --detector-module /path/to/ripple_detection.py
```

The exporter requires NumPy and SciPy. It validates population sizes, timestamps, neuron IDs,
signal dimensions, voltage mappings, and detector output before writing the versioned payloads.
`spikes.bin` preserves the original NSV1 encoding; channel-major Float32 signals use the NSG2
header. See `docs/spwr-network-visualization-implementation-plan.md` for the data contract and
`docs/brian2-connectivity-export.md` for the model-side, seed-specific connectivity hook. Exact
connectivity is accepted only from live constructed Brian2 synapses whose run ID and seed match the
published run; it is never regenerated from the seed after the simulation.

For interface development without a regenerated simulation, create a clearly labeled synthetic bundle:

```sh
python scripts/generate_sample_connectivity.py \
  --run-root public/data/pfc-hpc/default_sv0 \
  --run-id default_sv0 \
  --seed 0
```

This deterministic fixture is marked `synthetic-ui-fixture` in the manifest and is never presented as
simulation-derived connectivity.

## GitHub Pages

Push the project to a GitHub repository, enable **Settings → Pages → GitHub Actions**, and push to `main`. The included workflow builds and deploys both user and project sites.
