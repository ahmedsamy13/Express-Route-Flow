#!/usr/bin/env node
// Imports only the trusted simulator engine, never an Express backend.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--simulator', '--manifest', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('Usage: node --experimental-strip-types validate-scenarios.mjs --simulator <trusted simulator> --manifest <manifest.json> [--out <report.json>]');
    if (result[args[i]]) throw new Error(`Duplicate option ${args[i]}`);
    result[args[i]] = args[i + 1];
  }
  if (!result['--simulator'] || !result['--manifest']) throw new Error('--simulator and --manifest required.');
  return result;
}
const within = (root, target) => { const rel = path.relative(root, target); return rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length);
async function readJson(file, maxSize) {
  if ((await fs.stat(file)).size > maxSize) throw new Error(`File too large: ${path.basename(file)}`);
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}
async function main() {
  const opt = options(process.argv.slice(2));
  const manifestPath = await fs.realpath(path.resolve(opt['--manifest']));
  const base = path.dirname(manifestPath);
  const scenarioRoot = path.join(base, 'scenarios');
  if ((await fs.lstat(scenarioRoot)).isSymbolicLink()) throw new Error('scenarios/ must not be a symbolic link.');
  const realRoot = await fs.realpath(scenarioRoot);
  const manifest = await readJson(manifestPath, 4 * 1024 * 1024);
  if (manifest.version !== 1 || !Array.isArray(manifest.scenarios) || !manifest.scenarios.length)
    throw new Error('Manifest must have version 1 and at least one scenario.');
  const enginePath = await fs.realpath(path.resolve(opt['--simulator'], 'src/engine.ts'));
  const engine = await import(pathToFileURL(enginePath).href);
  if (typeof engine.validateConfig !== 'function' || typeof engine.simulate !== 'function') throw new Error('Simulator must export validateConfig and simulate.');
  const report = { version: 1, checkedAt: new Date().toISOString(), nodeVersion: process.version,
    engine: enginePath, engineSha256: createHash('sha256').update(await fs.readFile(enginePath)).digest('hex'),
    realApiTested: false, scenarios: [], errors: [] };
  const ids = new Set();
  const files = new Set();
  const snapshotFields = ['path', 'baseUrl', 'params', 'properties', 'error', 'outcome', 'status', 'response', 'reason', 'name'];
  for (const item of manifest.scenarios) {
    const result = { id: item?.id ?? null, file: item?.file ?? null, passed: false, errors: [] };
    report.scenarios.push(result);
    try {
      if (!item || typeof item.id !== 'string' || !/^[\w-]{1,120}$/.test(item.id) || ids.has(item.id)) throw new Error('Unique scenario ID required.');
      ids.add(item.id);
      if (typeof item.routeId !== 'string' || !item.routeId) throw new Error('routeId required (use a special ID for unmatched-path scenarios).');
      if (typeof item.file !== 'string' || !item.file.endsWith('.json') || path.isAbsolute(item.file)) throw new Error('Relative scenario JSON path required.');
      const requested = path.resolve(base, item.file);
      if (!within(scenarioRoot, requested)) throw new Error('Scenario must be inside scenarios/.');
      const file = await fs.realpath(requested);
      if (!within(realRoot, file)) throw new Error('Scenario symlink escapes scenarios/.');
      if (files.has(file)) throw new Error('Scenario file is listed more than once.');
      files.add(file);
      const expected = item.expected;
      if (!expected || !['completed', 'failed', 'pending', 'not-found'].includes(expected.outcome)) throw new Error('Expected final outcome required.');
      if (expected.status !== null && (!Number.isInteger(expected.status) || expected.status < 200 || expected.status > 599)) throw new Error('Expected status must be 200–599 or null for pending.');
      if ((expected.outcome === 'pending') !== (expected.status === null)) throw new Error('Only pending scenarios have null status.');
      if (!strings(expected.runIds) || !strings(expected.skipIds) || !Array.isArray(expected.snapshots)) throw new Error('Expected runIds, skipIds and snapshots arrays required.');
      const config = engine.validateConfig(await readJson(file, 200000));
      const frames = engine.simulate(config);
      if (!Array.isArray(frames) || !frames.length) throw new Error('Engine produced no trace.');
      result.frames = frames;
      const last = frames.at(-1);
      result.actual = { outcome: last.outcome, status: last.status ?? null,
        runIds: frames.filter(frame => frame.event === 'run').map(frame => frame.id) };
      const compare = (actual, desired, label) => { if (!isDeepStrictEqual(actual, desired)) result.errors.push(`${label} differs from expected.`); };
      compare(last.outcome, expected.outcome, 'Final outcome');
      compare(last.status ?? null, expected.status, 'Final status');
      compare(result.actual.runIds, expected.runIds, 'Ordered handler runs');
      if (Object.hasOwn(expected, 'response')) compare(last.response ?? null, expected.response, 'Response');
      const skipped = new Set(frames.filter(frame => frame.event === 'skip').map(frame => frame.id));
      for (const id of expected.skipIds) if (!skipped.has(id)) result.errors.push(`Expected skipped layer not found: ${id}`);
      for (const snapshot of expected.snapshots) {
        if (!snapshot || typeof snapshot.id !== 'string' || !['run', 'enter', 'exit', 'skip', 'finish'].includes(snapshot.event)) throw new Error('Snapshot needs id and valid event.');
        if (Object.keys(snapshot).some(key => !['id', 'event', 'occurrence', ...snapshotFields].includes(key))) throw new Error('Unknown snapshot assertion field.');
        const occurrence = snapshot.occurrence ?? 0;
        if (!Number.isInteger(occurrence) || occurrence < 0) throw new Error('Snapshot occurrence must be a nonnegative integer.');
        const frame = frames.filter(value => value.id === snapshot.id && value.event === snapshot.event)[occurrence];
        if (!frame) { result.errors.push(`Snapshot not found: ${snapshot.id}/${snapshot.event}/${occurrence}`); continue; }
        for (const field of snapshotFields) if (Object.hasOwn(snapshot, field)) compare(frame[field] ?? null, snapshot[field], `Snapshot ${snapshot.id} ${field}`);
      }
      result.passed = result.errors.length === 0;
    } catch (error) { result.errors.push(error.message); }
  }
  async function audit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { report.errors.push(`Symbolic link in scenarios/: ${path.relative(realRoot, file)}`); continue; }
      if (entry.isDirectory()) await audit(file);
      else if (entry.isFile() && file.endsWith('.json') && !files.has(await fs.realpath(file))) report.errors.push(`Unlisted scenario: ${path.relative(realRoot, file)}`);
    }
  }
  await audit(realRoot);
  report.passed = report.errors.length === 0 && report.scenarios.every(item => item.passed);
  report.summary = { total: report.scenarios.length, passed: report.scenarios.filter(item => item.passed).length, failed: report.scenarios.filter(item => !item.passed).length };
  const destination = path.resolve(opt['--out'] ?? path.join(base, 'validation.json'));
  if (destination === manifestPath || within(scenarioRoot, destination)) throw new Error('Validation report must not overwrite manifest/scenario files.');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: destination, passed: report.passed, ...report.summary, manifestErrors: report.errors.length, realApiTested: false }));
  if (!report.passed) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
