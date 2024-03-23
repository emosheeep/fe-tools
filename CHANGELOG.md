# vite-plugin-lib-inject-css

## 2.0.1

### Patch Changes

- fix: Multiple entry mode, when multiple files are import the same css file, inject css will not work. closed [#18](https://github.com/emosheeep/vite-plugin-lib-inject-css/issues/18)
- chore: upgrade dependencies.

# 2.0.0

### Major Changes

- refactor!: remove unnecessary plugin params and `scanEntries` function, make it simple and focus on code injection.
- fix: error occurs when uses with storybook builder vite, closed [#15](https://github.com/emosheeep/vite-plugin-lib-inject-css/issues/15).
- chore: upgrade ecosystem dependencies(vite v5 & rollup v4).

# 1.3.0

- feat: emit css files on SSR build. Closed [#12](https://github.com/emosheeep/vite-plugin-lib-inject-css/issues/12).
- docs: improve documentation.

# 1.2.1

- fix: cross-platform path handling. Closes [#9](https://github.com/emosheeep/vite-plugin-lib-inject-css/issues/9).
- docs: add more details about `preserveModules` option in README.
- chore: upgrade dependencies.

# 1.2.0

- chore: show warnings for `preserveModules` also for deprecated `rollupOptions.preserveModules`. closed [#5](https://github.com/emosheeep/vite-plugin-lib-inject-css/issues/5).

# 1.1.0

- fix: set `hoistTransitiveImports` internally by default to prevent tree-shaking from failure.
- docs: improve documentation.
- feat: add `build` option to simplify configurations further.
- chore: add some validations for `resolvedConfig` and print prompts when appropriate.

# 1.0.1

## Chore

- chore(scanEntries): use index to distinguish file that has a same name from each other

# 1.0.0

## Feature

- feat: first release.
