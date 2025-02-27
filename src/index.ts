import type JavaScriptTypes from '@ast-grep/napi/lang/JavaScript';
import type { Kinds } from '@ast-grep/napi/types/staticTypes';
import type { Plugin, ResolvedConfig } from 'vite';
import path from 'node:path';
import { Lang, parse } from '@ast-grep/napi';
import MagicString from 'magic-string';
import color from 'picocolors';

const excludeTokens: Kinds<JavaScriptTypes>[] = [
  'import_statement',
  'expression_statement',
];

const pluginName = 'vite:lib-inject-css';

/**
 * Inject css at the top of each generated chunk file, only works with library mode.
 */
export function libInjectCss(): Plugin {
  let skipInject = false;

  let resolvedConfig: ResolvedConfig;

  return {
    name: pluginName,
    apply: 'build',
    enforce: 'post',
    config({ build }) {
      for (const item of [build?.rollupOptions?.output].flat()) {
        /**
         * By default, when creating multiple chunks, transitive imports of entry chunks will be added as empty imports to the entry chunks.
         * @see https://rollupjs.org/faqs/#why-do-additional-imports-turn-up-in-my-entry-chunks-when-code-splitting
         * But as a library, this option may cause tree-shaking fails, so we set `false` here as default behavior.
         */
        if (item && typeof item.hoistTransitiveImports !== 'boolean') {
          item.hoistTransitiveImports = false;
        }
      }

      return {
        build: {
          /**
           * Must enable css code split, otherwise there's only one `style.css` and `chunk.viteMetadata.importedCss` will be empty.
           * @see https://vite.dev/config/build-options.html#build-csscodesplit
           */
          cssCodeSplit: true,
          /**
           * Must emit assets on SSR, otherwise there won't be any CSS files generated and the import statements
           * injected by this plugin will refer to an undefined module.
           * @see https://vite.dev/config/build-options.html#build-ssremitassets
           */
          ssrEmitAssets: true,
        },
      };
    },
    configResolved(config) {
      resolvedConfig = config;
    },
    options() {
      const { build, command } = resolvedConfig;
      const messages: string[] = [];

      if (!build.lib || command !== 'build') {
        skipInject = true;
        messages.push(
          'Current is not in library mode or building process, skip code injection.',
        );
      }

      if (build.ssr && build.ssrEmitAssets === false) {
        messages.push(
          '`config.build.ssrEmitAssets` is set to `true` by the plugin internally in library mode, '
          + 'but it seems to be `false` now. This may cause style code injection to fail on SSR, '
          + 'please check the configuration to prevent this option from being modified.',
        );
      }

      messages.forEach((msg) =>
        console.log(
          `\n${color.cyan(`[${pluginName}]`)} ${color.yellow(msg)}\n`,
        ),
      );
    },
    generateBundle({ format }, bundle) {
      if (skipInject)
        return;

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.viteMetadata?.importedCss.size) {
          continue;
        }

        const node = parse<JavaScriptTypes>(Lang.JavaScript, chunk.code)
          .root()
          .children()
          // find the first element that don't be included.
          .find((node) => !excludeTokens.includes(node.kind()));

        const position = node?.range().start.index ?? 0;

        /**
         * Inject the referenced style files at the top of the chunk.
         * Delegate the task of how to handle these files to the user's build tool.
         */
        let code = chunk.code;
        for (const cssFileName of chunk.viteMetadata.importedCss) {
          let cssFilePath = path
            .relative(path.dirname(chunk.fileName), cssFileName)
            .replaceAll(/[\\/]+/g, '/'); // Replace all backslash or multiple slashes, fixed #9
          cssFilePath = cssFilePath.startsWith('.')
            ? cssFilePath
            : `./${cssFilePath}`;

          const injection
            = format === 'es'
              ? `import '${cssFilePath}';`
              : `require('${cssFilePath}');`;

          code = code.slice(0, position) + injection + code.slice(position);
        }

        // update code and sourcemap
        chunk.code = code;
        if (resolvedConfig.build.sourcemap) {
          const ms = new MagicString(code);
          chunk.map = ms.generateMap({ hires: 'boundary' });
        }
      }
    },
  };
}
