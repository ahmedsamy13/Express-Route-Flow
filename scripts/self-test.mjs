#!/usr/bin/env node
// Deterministic synthetic fixtures; never runs or imports a backend.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--simulator', '--typescript'].includes(args[i]) || !args[i + 1]) throw new Error('Use --simulator <project> --typescript <compiler directory>.');
  opt[args[i]] = args[i + 1];
}
if (!opt['--simulator'] || !opt['--typescript']) throw new Error('--simulator and --typescript required.');
const scripts = path.dirname(fileURLToPath(import.meta.url));
const temporaryParent = await fs.realpath(os.tmpdir());
const temp = await fs.mkdtemp(path.join(temporaryParent, 'smsm-flow-skill-test-'));
let assertions = 0;
function check(condition, message) { assert.ok(condition, message); assertions++; }
function run(script, args, expectedExit = 0) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', path.join(scripts, script), ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, expectedExit, `${script}: ${result.stdout}\n${result.stderr}`);
  assertions++;
  return result;
}
async function json(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2)); }
const layer = (id, action = 'next', extra = {}) => ({ id, name: id, kind: 'middleware', path: '/', method: 'ALL', action, status: 200, message: '', property: '', value: '', enabled: true, children: [], ...extra });
const route = (id, children, routePath = '/items/:id', method = 'GET') => layer(id, 'next', { kind: 'route', path: routePath, method, children });
const router = (id, routerPath, children) => layer(id, 'next', { kind: 'router', path: routerPath, children });
const config = (layers, method = 'GET', url = '/api/items/demo') => ({ version: 1, method, url, layers });
const scenario = (id, cfg, outcome, status, runs, skips = [], snapshots = []) => ({ id, routeId: id, file: `scenarios/${id}.json`, cfg, expected: { outcome, status, runIds: runs, skipIds: skips, snapshots } });

try {
  const app = path.join(temp, 'backend');
  await fs.mkdir(app);
  await fs.writeFile(path.join(app, 'app.js'), `throw new Error('This backend must never execute');
import express from 'express';
import tourRouter from './tours.js';
const app = express();
app.use(logger);
app.use('/api/tours', tourRouter);
app.use(dynamicMount, tourRouter);
app.use([protect, validate]);
app.use(makeMountPath(), tourRouter);
app.copy('/special-method', handler);
app.route('/products/:id').get(protect, getProduct).patch(restrictTo('admin'), updateProduct);
app.use((err, req, res, next) => res.status(500).send('failed'));
app.param('id', loadId);
if (process.env.FEATURE) app.post('/conditional', handler);
function register(app) { app.delete('/factory', handler); }
const cache = new Map(); cache.get('not-a-route');
// app.get('/comment-should-not-appear', pretend)
`);
  await fs.writeFile(path.join(app, 'tours.js'), `const express = require('express');
const router = express.Router();
router.get(['/', '/list'], [protect, getTours]);
router.use('/nested', nestedRouter);
module.exports = router;
`);
  await fs.writeFile(path.join(app, 'broken.ts'), 'const broken = ;');
  await fs.mkdir(path.join(app, 'node_modules'));
  await fs.writeFile(path.join(app, 'node_modules', 'ignored.js'), "app.get('/ignored', ignored);");
  await fs.mkdir(path.join(app, '.agents', 'skills', 'test-skill'), { recursive: true });
  await fs.writeFile(path.join(app, '.agents', 'skills', 'test-skill', 'tooling.js'), "app.get('/agent-tooling', ignored);");
  const discovery = path.join(temp, 'discovery.json');
  run('scan-express.mjs', ['--app', app, '--out', discovery, '--typescript', opt['--typescript']]);
  const found = JSON.parse(await fs.readFile(discovery, 'utf8'));
  check(found.mode === 'static-candidates-only', 'Candidate report must not claim resolved routes');
  check(found.files.length === 3, 'Scan app source only, not node_modules or agent tooling');
  check(found.candidates.some(c => c.method === 'patch' && c.chainedRoute && c.path.value === '/products/:id' && c.handlers[0].kind === 'factory-call'), 'Resolve chained route path and factory descriptor');
  check(found.candidates.some(c => c.method === 'get' && c.path.kind === 'array'), 'Discover literal path arrays');
  check(found.candidates.some(c => c.path.kind === 'ambiguous-first-argument'), 'Flag dynamic/omitted mount ambiguity');
  check(found.candidates.some(c => c.method === 'use' && c.path.kind === 'ambiguous-first-argument' && c.handlers[0].kind === 'array'), 'Preserve handler-array ambiguity');
  check(found.candidates.some(c => c.method === 'use' && c.path.kind === 'ambiguous-first-argument' && c.handlers[0].kind === 'factory-call'), 'Preserve function-computed mount ambiguity');
  check(found.candidates.some(c => c.method === 'copy'), 'Discover unsupported HTTP methods for coverage reporting');
  check(found.candidates.some(c => c.method === 'post' && c.contexts.some(x => x.kind === 'conditional-or-loop')), 'Flag conditional registrations');
  check(found.candidates.some(c => c.method === 'delete' && c.contexts.some(x => x.kind === 'function')), 'Flag registration function scope');
  check(found.candidates.some(c => c.receiver === 'cache' && c.needsReview), 'Do not assert non-Express get is a real route');
  check(!found.candidates.some(c => c.path.value === '/comment-should-not-appear'), 'Ignore route-shaped comments');
  check(found.warnings.some(w => typeof w === 'object' && w.file === 'broken.ts'), 'Report malformed source');
  check(found.imports.some(i => i.module === './tours.js') && found.imports.some(i => i.module === 'express'), 'Discover ESM and CommonJS imports');
  check(found.candidates.every(c => Number.isInteger(c.line) && c.line > 0), 'Attach source evidence');

  const api = (...children) => router('api', '/api', children);
  const item = (...handlers) => route('item', handlers);
  const success = item(layer('protect', 'next', { property: 'user', value: '{"role":"guide"}' }), layer('controller', 'respond', { message: 'item' }));
  const denied = item(layer('protect', 'error', { message: 'Unauthorized' }), layer('controller', 'respond'));
  const plain = item(layer('controller', 'respond'));
  const skipRoute = route('first', [layer('skip-route', 'route'), layer('unreached', 'respond')]);
  const fallbackRoute = route('fallback', [layer('fallback-handler', 'respond')]);
  const exited = api(layer('skip-router', 'router'), item(layer('unreached', 'respond')));
  const nested = api(router('v1', '/v1', [route('nested', [layer('send', 'respond')])]));
  const examples = [
    scenario('success', config([layer('log'), api(success)]), 'completed', 200, ['log', 'protect', 'controller'], [], [{ id: 'controller', event: 'run', path: '/items/demo', baseUrl: '/api', params: { id: 'demo' }, properties: { user: { role: 'guide' } } }]),
    scenario('unauthenticated', config([api(denied), layer('errors', 'respond', { kind: 'error', status: 401 })]), 'failed', 401, ['protect', 'errors'], ['controller']),
    scenario('method-mismatch', config([api(plain)], 'POST'), 'not-found', 404, [], ['item', 'controller']),
    scenario('shadowing', config([layer('block', 'respond', { status: 403 }), api(plain)]), 'failed', 403, ['block'], ['controller']),
    scenario('rejected-promise', config([layer('async-handler', 'reject', { message: 'Failed' }), layer('normal'), layer('errors', 'respond', { kind: 'error', status: 500 })]), 'failed', 500, ['async-handler', 'errors'], ['normal']),
    scenario('pending', config([layer('hang', 'pending'), layer('later', 'respond')]), 'pending', null, ['hang'], ['later']),
    scenario('route-skip', config([api(skipRoute, fallbackRoute)]), 'completed', 200, ['skip-route', 'fallback-handler'], ['unreached']),
    scenario('router-skip', config([exited, layer('fallback', 'respond', { status: 401 })]), 'failed', 401, ['skip-router', 'fallback'], ['unreached']),
    scenario('error-cleared', config([layer('bad', 'error'), layer('recover', 'next', { kind: 'error' }), layer('response', 'respond')]), 'completed', 200, ['bad', 'recover', 'response']),
    scenario('unhandled-error', config([layer('bad', 'error'), layer('normal')]), 'failed', 500, ['bad'], ['normal']),
    scenario('nested-router', config([nested], 'GET', '/api/v1/items/demo'), 'completed', 200, ['send'], [], [{ id: 'send', event: 'run', path: '/items/demo', baseUrl: '/api/v1', params: { id: 'demo' } }]),
    scenario('head-fallback', config([api(item(layer('send', 'respond')))], 'HEAD'), 'completed', 200, ['send'])
  ];
  const output = path.join(temp, 'walkthroughs');
  const manifest = path.join(output, 'scenario-manifest.json');
  const entries = [];
  for (const example of examples) {
    const { cfg, ...entry } = example;
    entries.push(entry);
    await json(path.join(output, entry.file), cfg);
  }
  await json(manifest, { version: 1, scenarios: entries });
  const validateArgs = ['--simulator', opt['--simulator'], '--manifest', manifest];
  run('validate-scenarios.mjs', validateArgs);
  const valid = JSON.parse(await fs.readFile(path.join(output, 'validation.json'), 'utf8'));
  check(valid.passed && valid.summary.passed === 12 && valid.realApiTested === false, 'Validate 12 fixed scenarios with actual simulator engine');
  const badManifest = structuredClone(entries);
  badManifest[0].expected.status = 201;
  await json(manifest, { version: 1, scenarios: badManifest });
  run('validate-scenarios.mjs', validateArgs, 1);
  check(!(JSON.parse(await fs.readFile(path.join(output, 'validation.json'), 'utf8'))).passed, 'Reject incorrect expected outcome');
  await json(manifest, { version: 1, scenarios: entries });
  const invalid = structuredClone(examples[0].cfg);
  invalid.layers[0].property = 'headers';
  await json(path.join(output, entries[0].file), invalid);
  run('validate-scenarios.mjs', validateArgs, 1);
  await json(path.join(output, entries[0].file), examples[0].cfg);
  await json(path.join(output, 'scenarios/unlisted.json'), config([]));
  run('validate-scenarios.mjs', validateArgs, 1);
  await fs.unlink(path.join(output, 'scenarios/unlisted.json'));
  const escaped = structuredClone(entries);
  escaped[0].file = '../discovery.json';
  await json(manifest, { version: 1, scenarios: escaped });
  run('validate-scenarios.mjs', validateArgs, 1);
  await json(manifest, { version: 1, scenarios: [] });
  run('validate-scenarios.mjs', validateArgs, 1);
  console.log(JSON.stringify({ passed: true, assertions, simulatedScenarios: 12, negativeValidationCases: 5, realBackendExecuted: false }));
} finally {
  const checked = await fs.realpath(temp);
  if (path.dirname(checked) !== temporaryParent || !path.basename(checked).startsWith('smsm-flow-skill-test-')) throw new Error('Unsafe cleanup path.');
  await fs.rm(checked, { recursive: true, force: true });
}
