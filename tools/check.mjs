// Syntax-checks every source/test .js file with `node --check` (skips vendor).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'vendor' || entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [...walk('src'), ...walk('test')];
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f]);
  } catch (e) {
    bad++;
    console.error('SYNTAX ERROR:', f);
    console.error(String(e.stdout || '') + String(e.stderr || ''));
  }
}
console.log(`checked ${files.length} files, ${bad} error(s)`);
process.exit(bad ? 1 : 0);
