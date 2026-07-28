# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A personal sandbox of self-contained vanilla-JS UI demos (accordion, carousel, tabs, modal, clocks, calculator, etc.), each on its own static HTML page, bundled by Webpack. No framework. Deployed to https://javascript-lab.netlify.app/ — the site is wired to this repo (there is no `netlify.toml`; the build is configured on Netlify's side), so pushing publishes. Treat pushes as user-visible.

## Commands

```bash
npm start          # or `npm run dev` — identical: webpack --watch + BrowserSync on http://localhost:3000 (serves ./dist)
npm run prod       # production build into ./dist
npm test           # Vitest (jsdom), single run; `npm run test:watch` for watch mode
npm run lint       # lint:js (ESLint, src/scripts + root *.js) then lint:sass (Stylelint, src/styles)
npm run prettier:check / prettier:write
```

`dist/` is generated and gitignored — never edit it; edit `src/` and let watch rebuild.

## Architecture

**Single bundle, many pages.** `src/scripts/app.js` imports *every* component, and `src/styles/app.scss` `@use`s *every* component stylesheet. Webpack emits one `dist/scripts/app.js` and one `dist/styles/app.css`, and each page loads both.

**Page-scoping is by `data-component`.** Since all code ships to all pages, each component file must self-guard:

```js
document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="accordion"]')) return;
  // ...
});
```

The marker lives on `<body data-component="accordion">` in the page's HTML. Stylesheets scope page-level layout the same way (`body[data-component="counter"] .container { ... }`). Without the guard, a component's DOM queries run on unrelated pages.

**HTML is built by `html-webpack-plugin`.** `webpack.config.js` reads `src/html/*.html` at config time and creates one plugin instance per page, emitting `dist/[name].html` flat with `inject: false` (pages link `app.css` / `app.js` themselves). Templates go through the default lodash template loader, so partials are pulled in as `<%= require('./partials/header.html') %>`; `html-loader` is scoped to `src/html/partials` only. New pages are picked up automatically — but adding one means restarting the build (the directory is read once) and they are only reachable if you add a link to the list in `src/html/index.html`.

**Adding a demo touches four places:**
1. `src/html/<page>.html` — `<body data-component="x">`, `<link rel="stylesheet" href="styles/app.css">`, `<script src="scripts/app.js">`
2. `src/scripts/components/<Name>.js` (PascalCase) + an `import` line in `src/scripts/app.js`
3. `src/styles/components/<name>.scss` (camelCase) + an `@use` line in `src/styles/app.scss`
4. a `<li><a>` entry in `src/html/index.html`

**Testing:** Vitest with a `jsdom` environment (`vitest.config.mjs`, collecting `src/scripts/**/*.test.js`). Tests sit next to the component as `<Name>.test.js`. Only `Accordion.js` is covered so far. Two things bite when writing more:

- Components export nothing and subscribe to `DOMContentLoaded` at import time. `vi.resetModules()` clears the module cache but *not* the listeners already on `document`, so dispatching the event re-runs every previously imported copy against the current DOM. Capture the callback instead — spy on `document.addEventListener` during the import, then call it directly. See the `mount` helper in `Accordion.test.js`.
- jsdom has no layout, so `scrollHeight` / `offsetWidth` are always 0 and anything derived from them (the accordion's `max-height`, for one) carries no signal. Assert on ARIA state instead.

**Styles:** SCSS → postcss (Tailwind v4 `@tailwindcss/postcss` + autoprefixer) → extracted CSS. Tailwind is pulled in via `@use "tailwindcss"` at the end of `app.scss`; `tailwind.config.js` is a v3-style leftover with empty `content` and is not what drives v4. Most demos are hand-written SCSS, not Tailwind.

## Conventions

- ESLint uses flat config (`eslint.config.mjs`): `@eslint/js` recommended, browser globals for `src/scripts/**`, node + CommonJS for root `*.js`, `no-console` as a warning. Prettier is a separate task, not an ESLint plugin. `src/scripts/study/**` is ignored.
- You will see DOM nodes aliased before mutation (`const buttonEl = button;`). That is a leftover from the airbnb-base era and its `no-param-reassign`; the rule is no longer enforced. Match it in files that already do it, but it is not required in new code.
- Stylelint extends `stylelint-config-sass-guidelines`, with `max-nesting-depth` downgraded to a warning at 2, `selector-no-qualifying-type` off (the demos style `body[data-component]` and bare elements), and `src/styles/base/reset.scss` left alone as vendored normalize.
- Prettier: 2 spaces, single quotes in JS, semicolons, `es5` trailing commas. Its glob covers `src/{html,scripts,styles}` and root `*.{js,json}` only — Markdown is not formatted, so don't reformat `README.md` wholesale.
- Accessibility is a first-class concern in these demos: components drive `aria-expanded` / `aria-hidden` / `aria-controls`, use semantic roles, and are built as progressive enhancement (markup works without JS; JS sets `data-enhanced="true"` and takes over state).
- Event handling favors delegation on the container plus `event.target.closest(...)` over per-element listeners.
- Commit messages and PR titles/descriptions in English.
- Scratch work stays local: `src/html/study-*.html` and `src/scripts/study/` are gitignored (and skipped by ESLint and Prettier). They still build into `dist/`, so keep them out of the `index.html` link list.
