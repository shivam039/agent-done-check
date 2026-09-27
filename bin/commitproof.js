#!/usr/bin/env node
import { main } from '../src/cli.js';

main().catch((error) => {
  console.error(`commitproof: ${error.message}`);
  process.exitCode = 2;
});
