/// <reference types="node" />
// Entry point of the `sindri-pixel` command (built to dist-cli/sindri-pixel.mjs).
import { run } from './run';

process.exitCode = run(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});
