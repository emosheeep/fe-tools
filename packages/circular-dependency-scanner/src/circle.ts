import { Listr } from 'listr2';
import { chalk, path } from 'zx';
import { type Edge, type FullAnalysisResult } from 'graph-cycles';
import { logger } from './logger';
import { extensions } from './utils';
import { callWorker } from './worker';

export interface DetectOptions {
  /**
   * Base path to execute command.
   * @default process.cwd()
   */
  cwd: string;
  /**
   * Whether to use absolute path.
   * @default false
   */
  absolute: boolean;
  /**
   * Glob patterns to exclude from matches.
   * @default ['node_modules']
   */
  ignore: string[];
  /**
   * Path alias to resolve.
   * @default { '@': 'src' }
   */
  alias: Record<string, string>;
}

interface TaskCtx {
  files: string[];
  entries: Edge[];
  result: FullAnalysisResult['cycles'];
}

/**
 * Detect circles among dependencies.
 */
export async function circularDepsDetect(options: DetectOptions): Promise<string[][]> {
  let { cwd = process.cwd(), ignore = [], absolute = false, alias } = options;

  /* ----------- Parameters pre-handle start ----------- */

  ignore = [...new Set([...ignore, '**/node_modules/**'])];

  // convert alias to absolute path
  alias = Object.fromEntries(
    Object.entries(Object.assign({ '@': 'src' }, alias))
      .map(([from, to]) => [from, path.resolve(cwd, to)]),
  );

  /* ------------ Parameters pre-handle end ------------ */

  const globPattern = `**/*.{${extensions.join(',')}}`;

  logger.info(`Working directory is ${chalk.underline.cyan(cwd)}`);
  logger.info(`Ignored paths: ${ignore.map(v => chalk.yellow(v)).join(',')}`);

  const ctx: TaskCtx = { entries: [], result: [], files: [] };

  const runner = new Listr<TaskCtx>([
    {
      title: `Globbing files with ${chalk.underline.cyan(globPattern)}`,
      task: async (_, task) => task.newListr([{
        title: 'Wait a moment...',
        task: async (ctx, task) => {
          const files = await callWorker({
            exec: 'glob-files',
            pattern: globPattern,
            cwd,
            ignore,
          });
          task.title = `${chalk.cyan(files.length)} files were detected.`;
          ctx.files = files;
        },
      }]),
    },
    {
      title: 'Pulling out import specifiers from files...',
      options: { bottomBar: 1 },
      task: async (ctx, task) => {
        ctx.entries = await callWorker({
          exec: 'pull-out',
          cwd,
          absolute,
          alias,
          files: ctx.files,
        }, {
          onProgress(filename, index, total) {
            task.output = `${index + 1}/${total} - ${filename}`;
          },
        });
      },
    },
    {
      title: 'Analyzing circular dependencies...',
      task: async (_, task) => task.newListr([{
        title: 'Wait a moment...',
        task: async (ctx, task) => {
          ctx.result = await callWorker({
            exec: 'analyze',
            entries: ctx.entries,
          });
          task.title = `${chalk.cyan(ctx.result.length)} circles were found.`;
        },
      }]),
    },
  ], {
    rendererOptions: {
      showTimer: true,
      collapse: false,
    },
  });

  await runner.run(ctx);

  return ctx.result;
}
