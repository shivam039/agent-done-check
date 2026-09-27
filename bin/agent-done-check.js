#!/usr/bin/env node
import { main } from '../src/cli.js';

main().catch((error) => {
  console.error(`agent-done-check: ${error.message}`);
  process.exitCode = 2;
});
