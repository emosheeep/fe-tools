#!/usr/bin/env node
import minimatch from 'minimatch';
import { fs, chalk } from 'zx';
import { createRequire } from 'module';
import { program } from 'commander';
import { circularDepsDetect, printCircles } from '../dist/index.js';

const require = createRequire(import.meta.url);
const { description, version } = require('../package.json');

program
  .version(version)
  .description(description)
  .argument('[path]', 'command execute path. (default: process.cwd())')
  .option('--filter <pattern>', 'glob pattern to match output circles.')
  .option('--alias <pairs...>', 'path alias, follows `<from>:<to>` convention.', ['@:src'])
  .option('--absolute', 'print absolute path instead. usually use with editor which can quickly jump to the file.', false)
  .option('-o, --output <filename>', 'output the analysis into specified json file.')
  .option('-i, --ignore <patterns...>', 'glob patterns to exclude matches.', ['**/node_modules/**'])
  .action(async (cwd, options) => {
    const { filter, alias, output, ...rest } = options;
    let cycles = await circularDepsDetect({
      ...rest,
      cwd,
      alias: Object.fromEntries(alias.map(v => v.split(':'))),
    });

    if (filter) {
      const matcher = minimatch.filter(filter);
      cycles = cycles.filter(v => v.some(matcher));
    }

    if (!cycles.length) return;

    if (output) {
      fs.writeFileSync(output || 'circles.json', JSON.stringify(cycles, null, 2));
      console.log([
        chalk.blue('info'),
        'Output has been redirected to',
        chalk.cyan.underline(output),
      ].join(' '));
    } else {
      printCircles(cycles);
    }
  });

program.parse();
