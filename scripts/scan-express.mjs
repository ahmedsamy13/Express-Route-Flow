#!/usr/bin/env node
// Static candidate discovery only. Never imports the backend or evaluates its code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { METHODS } from 'node:http';

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--app', '--out', '--typescript'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('Usage: node scan-express.mjs --app <backend> --out <report.json> [--typescript <compiler directory>]');
    if (result[args[i]]) throw new Error(`Duplicate option ${args[i]}`);
    result[args[i]] = args[i + 1];
  }
  if (!result['--app'] || !result['--out']) throw new Error('--app and --out are required.');
  return result;
}

async function main() {
  const opt = options(process.argv.slice(2));
  const root = await fs.realpath(path.resolve(opt['--app']));
  if (!(await fs.stat(root)).isDirectory()) throw new Error('--app must be a directory.');
  const require = createRequire(import.meta.url);
  let ts;
  const attempts = opt['--typescript']
    ? [path.resolve(opt['--typescript'])]
    : [path.join(root, 'node_modules/typescript'), 'typescript'];
  for (const location of attempts) {
    try { ts = require(location); break; } catch { /* next compiler location */ }
  }
  if (!ts?.createSourceFile) throw new Error('TypeScript compiler not found. Supply --typescript <trusted typescript package directory> or use rg/manual source review. Backend code was not executed.');

  const excluded = new Set(['node_modules', '.git', '.agents', '.codex', '.claude', '.gemini', 'dist', 'build', 'coverage', '.next', '.cache', 'vendor']);
  const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
  const warnings = [];
  const report = { version: 1, mode: 'static-candidates-only', app: root,
    generatedAt: new Date().toISOString(), compilerVersion: ts.version,
    scope: 'Source in supplied folder only; dependency routers, ignored/generated files, dynamic registration and receiver identity require review.',
    excludedDirectories: [...excluded], files: [], candidates: [], imports: [], warnings };
  const rg = spawnSync('rg', ['--files', '--hidden', '-g', '!.git', '-g', '!node_modules'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  let names;
  if (rg.status === 0) {
    names = rg.stdout.split(/\r?\n/).filter(Boolean);
    report.discovery = 'rg --files (respects ignore files)';
  } else if (rg.status === 1 && !rg.error) {
    names = [];
    report.discovery = 'rg --files (no files found)';
  } else {
    report.discovery = 'filesystem fallback (does not interpret ignore files)';
    warnings.push('rg unavailable/failed; fallback excludes vendor/generated folders but not all ignore patterns.');
    names = [];
    async function walk(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) { warnings.push(`Skipped symbolic link: ${path.relative(root, path.join(dir, entry.name))}`); continue; }
        if (entry.isDirectory() && !excluded.has(entry.name)) await walk(path.join(dir, entry.name));
        else if (entry.isFile()) names.push(path.relative(root, path.join(dir, entry.name)));
        if (names.length > 10000) throw new Error('More than 10000 discovered files; select a narrower backend folder.');
      }
    }
    await walk(root);
  }
  names = names.filter(name => sourceExtension.test(name) && !name.split(/[\\/]/).some(part => excluded.has(part))).sort();
  if (names.length > 10000) throw new Error('More than 10000 source files; select a narrower backend folder.');
  const methods = new Set(['use', 'route', 'param', 'all', ...METHODS.map(method => method.toLowerCase())]);

  for (const name of names) {
    const full = path.resolve(root, name);
    const rel = path.relative(root, full);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) { warnings.push(`Skipped external path: ${name}`); continue; }
    const stat = await fs.lstat(full);
    if (!stat.isFile() || stat.isSymbolicLink()) { warnings.push(`Skipped nonregular file: ${name}`); continue; }
    if (stat.size > 2 * 1024 * 1024) { warnings.push(`Skipped source >2MB: ${name}`); continue; }
    const file = name.replaceAll('\\', '/');
    const source = ts.createSourceFile(file, await fs.readFile(full, 'utf8'), ts.ScriptTarget.Latest, true);
    report.files.push(file);
    const location = node => ({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    function symbol(node) {
      if (ts.isIdentifier(node)) return node.text;
      if (ts.isPropertyAccessExpression(node)) return `${symbol(node.expression)}.${node.name.text}`;
      if (ts.isCallExpression(node)) return `${symbol(node.expression)}(...)`;
      return `<${ts.SyntaxKind[node.kind]}>`;
    }
    function descriptor(node) {
      if (!node) return { kind: 'missing' };
      if (ts.isStringLiteralLike(node)) return { kind: 'literal', value: node.text };
      if (ts.isArrayLiteralExpression(node)) return { kind: 'array', elements: node.elements.map(descriptor) };
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return { kind: 'inline-handler', parameters: node.parameters.length, ...location(node) };
      if (ts.isCallExpression(node)) return { kind: 'factory-call', symbol: symbol(node.expression), argumentCount: node.arguments.length, ...location(node) };
      if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) return { kind: 'reference', symbol: symbol(node), ...location(node) };
      return { kind: 'dynamic', syntax: ts.SyntaxKind[node.kind], ...location(node) };
    }
    function routeOrigin(node) {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
      if (node.expression.name.text === 'route') return node;
      return routeOrigin(node.expression.expression);
    }
    function contexts(node) {
      const result = [];
      for (let parent = node.parent; parent && parent !== source; parent = parent.parent) {
        if (ts.isFunctionLike(parent)) result.push({ kind: 'function', ...location(parent) });
        else if (ts.isIfStatement(parent) || ts.isConditionalExpression(parent) || ts.isIterationStatement(parent, false) || ts.isSwitchStatement(parent))
          result.push({ kind: 'conditional-or-loop', ...location(parent) });
      }
      return result;
    }
    for (const diagnostic of source.parseDiagnostics) warnings.push({ ...location({ getStart: () => diagnostic.start ?? 0 }), reason: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ') });
    function visit(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) report.imports.push({ ...location(node), module: node.moduleSpecifier.text });
      }
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
          report.imports.push({ ...location(node), module: node.arguments[0].text });
        if (ts.isPropertyAccessExpression(node.expression) && methods.has(node.expression.name.text)) {
          const method = node.expression.name.text;
          const origin = routeOrigin(node.expression.expression);
          const first = node.arguments[0];
          const literalMount = method === 'use' && first && (ts.isStringLiteralLike(first) || (ts.isArrayLiteralExpression(first) && first.elements.length > 0 && first.elements.every(ts.isStringLiteralLike)));
          const unambiguousHandler = method === 'use' && first && (ts.isArrowFunction(first) || ts.isFunctionExpression(first));
          const routePath = origin ? descriptor(origin.arguments[0]) : descriptor(first);
          report.candidates.push({
            id: `candidate-${report.candidates.length + 1}`, ...location(node),
            receiver: symbol(origin ? origin.expression.expression : node.expression.expression),
            method, chainedRoute: origin ? location(origin) : null,
            path: method === 'use' ? (literalMount ? descriptor(first) : unambiguousHandler ? { kind: 'omitted', value: '/' } : { kind: 'ambiguous-first-argument', argument: descriptor(first) }) : routePath,
            handlers: [...node.arguments].slice(origin ? 0 : method === 'use' && !literalMount ? 0 : 1).map(descriptor),
            contexts: contexts(node), needsReview: true
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  if (!report.files.length) warnings.push('No supported JS/TS source found; this is not a complete route inventory.');
  const destination = path.resolve(opt['--out']);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: destination, files: report.files.length, candidates: report.candidates.length, warnings: warnings.length, completeRouteInventory: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
