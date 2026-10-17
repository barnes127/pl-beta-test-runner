const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const check = process.argv.includes('--check');
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
let mismatches = 0;
for (const name of fs.readdirSync('src').filter(name => name.endsWith('.ts'))) {
  const filename = path.join('src', name);
  const original = fs.readFileSync(filename, 'utf8');
  const source = ts.createSourceFile(filename, original, ts.ScriptTarget.Latest, true);
  const formatted = printer.printFile(source);
  if (original !== formatted) {
    if (check) mismatches++;
    else fs.writeFileSync(filename, formatted);
  }
}
if (mismatches) {
  process.stderr.write('TypeScript formatting check failed; run pnpm format.\n');
  process.exitCode = 1;
}
