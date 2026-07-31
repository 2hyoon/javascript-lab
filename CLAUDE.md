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

CI (`.github/workflows/ci.yml`) runs `lint`, `test`, and `prod` on Node 22 for **every** push, on any branch. Warnings do not fail it; errors do.

## Architecture

**Single bundle, many pages.** `src/scripts/app.js` imports *every* component, and `src/styles/app.scss` `@use`s *every* component stylesheet. Webpack emits one `dist/scripts/app.js` and one `dist/styles/app.css`, and each page loads both.

**Page-scoping is by `data-component`.** Since all code ships to all pages, every component is scoped by a marker on `<body data-component="accordion">`. Stylesheets scope page-level layout the same way (`body[data-component="counter"] .container { ... }`). Without the guard, a component's DOM queries run on unrelated pages.

Two shapes exist, and the repo is mid-migration between them:

```js
// Older shape (12 of 13 components): the file starts itself on import.
document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="counter"]')) return;
  // ...
});

// Newer shape (Accordion): export an init, wire it in app.js.
export function initAccordion(root = document) {
  root.querySelectorAll('.accordion').forEach((el) => {
    if (el.dataset.enhanced === 'true') return; // idempotent
    // ...
  });
  return () => controller.abort(); // listeners registered with { signal }
}
```

Prefer the newer shape for anything you touch. Importing a module should not have side effects: the old shape cannot be re-run on markup added after load, offers no handle for cleanup, forces the test-only workaround below, and **dies silently if the bundle ever gains `defer` or `type="module"`**, since it subscribes to an event that has already fired.

**HTML is built by `html-webpack-plugin`.** `webpack.config.js` reads `src/html/*.html` at config time and creates one plugin instance per page, emitting `dist/[name].html` flat with `inject: false` (pages link `app.css` / `app.js` themselves). Templates go through the default lodash template loader, so partials are pulled in as `<%= require('./partials/header.html') %>`; `html-loader` is scoped to `src/html/partials` only. New pages are picked up automatically — but adding one means restarting the build (the directory is read once) and they are only reachable if you add a link to the list in `src/html/index.html`.

**Adding a demo touches four places:**
1. `src/html/<page>.html` — `<body data-component="x">`, `<link rel="stylesheet" href="styles/app.css">`, `<script src="scripts/app.js">`
2. `src/scripts/components/<Name>.js` (PascalCase) exporting an init + a named `import` and a wiring line in `src/scripts/app.js`
3. `src/styles/components/<name>.scss` (camelCase) + an `@use` line in `src/styles/app.scss`
4. a `<li><a>` entry in `src/html/index.html`

**Testing:** Vitest with a `jsdom` environment (`vitest.config.mjs`, collecting `src/scripts/**/*.test.js`). Tests sit next to the component as `<Name>.test.js`. `Accordion.js` and `Tab.js` are covered. Two things bite when writing more:

- A component in the older shape exports nothing and subscribes to `DOMContentLoaded` at import time. `vi.resetModules()` clears the module cache but *not* the listeners already on `document`, so dispatching the event re-runs every previously imported copy against the current DOM — a toggle then fires once per past test, and only the even-numbered ones look broken. The `mount` helper in `src/scripts/testUtils.js` works around it by spying on `document.addEventListener` during the import and calling the captured callback directly; `Tab.test.js` still needs it. A component in the newer shape needs none of this: set `document.body.innerHTML`, call the exported init, assert (see `Accordion.test.js`).
- jsdom has no layout, so `scrollHeight` / `offsetWidth` and everything derived from them are always 0. Assert on ARIA state and attributes instead. Anything genuinely about size — that a panel grows when the viewport narrows, say — needs a real browser, not this test suite.

**Styles:** SCSS → postcss (autoprefixer only) → extracted CSS. All of it is hand-written; there is no utility framework. The reset is `base/reset.scss` (vendored normalize.css v8, left untouched) plus one project-owned rule at the top of `base/site.scss`: `box-sizing: border-box` on everything. Normalize does not set that and several components (`.aclock`, the calculator, fieldsets) size themselves assuming it.

Tailwind v4 used to be loaded for its preflight alone and was removed in `chore/drop-tailwind`. Two habits it left behind:

- Preflight zeroed every margin and flattened `h1`–`h6` to `font-size: inherit`. Headings and paragraphs now render at browser defaults, so a component that wants tight spacing has to say so (see `p { margin: 0 }` in `calculator.scss`).
- Preflight also forced `color: inherit` / `background-color: transparent` on form controls, which caused four contrast failures here. Controls now fall back to native colours instead — but the rule still holds: **style a button or input and set both `color` and `background-color`**, because a control with only a background will otherwise pick up the browser's black `buttontext`, which disappears on the dark demos (carousel arrows, tictactoe squares).

## Conventions

- ESLint uses flat config (`eslint.config.mjs`): `@eslint/js` recommended, browser globals for `src/scripts/**`, node + CommonJS for root `*.js`, `no-console` as a warning. Prettier is a separate task, not an ESLint plugin. `src/scripts/study/**` is ignored.
- You will see DOM nodes aliased before mutation (`const buttonEl = button;`). That is a leftover from the airbnb-base era and its `no-param-reassign`; the rule is no longer enforced. Match it in files that already do it, but it is not required in new code.
- Stylelint extends `stylelint-config-sass-guidelines`, with `max-nesting-depth` downgraded to a warning at 2, `selector-no-qualifying-type` off (the demos style `body[data-component]` and bare elements), and `src/styles/base/reset.scss` left alone as vendored normalize.
- Prettier: 2 spaces, single quotes in JS, semicolons, `es5` trailing commas. Its glob covers `src/{html,scripts,styles}` and root `*.{js,json}` only — Markdown is not formatted, so don't reformat `README.md` wholesale.
- Accessibility is a first-class concern in these demos: components drive `aria-expanded` / `aria-hidden` / `aria-controls`, use semantic roles, and are built as progressive enhancement (markup works without JS; JS sets `data-enhanced="true"` and takes over state).
- Event handling favors delegation on the container plus `event.target.closest(...)` over per-element listeners.
- Commit messages and PR titles/descriptions in English.
- Scratch work stays local: `src/html/study-*.html` and `src/scripts/study/` are gitignored (and skipped by ESLint and Prettier). They still build into `dist/`, so keep them out of the `index.html` link list.
