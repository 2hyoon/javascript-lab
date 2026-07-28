# The JavaScript Lab

A personal sandbox for continuous learning and focused experimentation.

**[Live demo →](https://javascript-lab.netlify.app/)**

Each demo — accordion, carousel, tabs, modal, clocks, calculator, tic-tac-toe,
and more — is a self-contained vanilla-JS component on its own static page.
No framework. Webpack bundles every component into a single `app.js` / `app.css`
that all pages share, so each component scopes itself to its page through a
`data-component` marker on `<body>` and enhances markup that already works
without JavaScript.

## Getting Started

### Installation

Prerequisites: Make sure you have [**Node**](https://nodejs.org/en/) and **NPM** installed on your computer.

**Install NPM packages.**

```bash
$ npm install
```

### Running tasks

**Start the dev build.** Runs `webpack --watch` alongside
[BrowserSync](https://browsersync.io/), which serves **dist** at
<http://localhost:3000> and reloads the page whenever a file changes.
`npm run dev` is an alias for the same task.

```bash
$ npm start
```

**Build production files.** This task will generate production files and emit them into the **dist** folder.

```bash
$ npm run prod
```

**Run tests.** [Vitest](https://vitest.dev/) with a `jsdom` environment. Test
files live next to the component they cover, as `<Name>.test.js`.

```bash
$ npm test
```
Watch mode.
```bash
$ npm run test:watch
```

**Run Lint** You can run [ESLint](https://eslint.org/) and [Stylelint](https://stylelint.io/) in CLI.

Run Javascript and Sass lint.
```bash
$ npm run lint
```
Run Javascript Lint.
```bash
$ npm run lint:js
```
Run Sass Lint.
```bash
$ npm run lint:sass
```

**Run [Prettier](https://prettier.io/).** You can check or write formatting in CLI.

```bash
$ npm run prettier:check
```
```bash
$ npm run prettier:write
```

### Folder Structure

```bash
├── .editorconfig # https://editorconfig.org/
├── .gitignore
├── .prettierignore
├── .prettierrc.json # https://prettier.io/
├── .stylelintrc.json # https://stylelint.io/
├── LICENSE
├── README.md
├── dist # compiled files go here
├── eslint.config.mjs # https://eslint.org/ (flat config)
├── package-lock.json
├── package.json
├── postcss.config.js
├── src # app's source files
│   ├── fonts
│   ├── html # one file per page, compiled by html-webpack-plugin
│   │   ├── accordion.html
│   │   ├── index.html # links to every demo
│   │   ├── partials
│   │   │   └── header.html
│   │   └── ... # one .html per demo
│   ├── images
│   ├── scripts
│   │   ├── app.js # imports every component
│   │   └── components
│   │       ├── Accordion.js
│   │       ├── Accordion.test.js
│   │       └── ... # one PascalCase file per component
│   └── styles
│       ├── app.scss # @use's every component stylesheet
│       ├── base
│       │   ├── reset.scss
│       │   └── site.scss
│       └── components
│           ├── accordion.scss
│           └── ... # one camelCase file per component
├── vitest.config.mjs # https://vitest.dev/
└── webpack.config.js # webpack entry
```

Adding a demo touches four places: a page in `src/html`, a component in
`src/scripts/components` plus its `import` in `app.js`, a stylesheet in
`src/styles/components` plus its `@use` in `app.scss`, and a link in
`src/html/index.html`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
