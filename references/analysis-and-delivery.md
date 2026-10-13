# Analysis and delivery

## Registration inventory

Find Express instantiation, version and entrypoints. Trace ESM/CommonJS imports/exports, aliases, router factories and registration helpers. AST scanner reports syntax locations; file order is not global runtime order. Resolve bootstrap call graph manually.

Account for .use/.METHOD/.all/.route(path).METHOD/.param, middleware arrays/factories, multiple app instances, repeated mounts, literal path arrays, environment conditions and dynamic route loading. Count each method on a shared route separately; keep duplicate registrations. Distinguish implicit HEAD from explicit HEAD and ALL from separate methods. Flag unsupported methods, optional/wildcard/regex paths, missing dependencies, dynamic paths and unknown order.

Read protect/restrictTo/catchAsync/getOne(Model) implementations and helpers. Record URL rewrites, parameter preprocessing, property writes, body/query/header use, responses/forwards and unknown branches. Names alone cannot establish behavior. Reuse existing API contracts/tests as evidence, but do not claim source-inferred requirements were tested.

Trace global before/after middleware, nested routers, 404/errors in order. CORS/parsers/rate limiting/static serving can terminate early: document selected assumptions instead of silently converting all to next. Inspect async wrappers and Express version before choosing error/reject.

## Artifacts

Default backend output docs/middleware-flow/:

- GUIDE.md: app/version; simulator vs real app; beginner instructions; route index; numbered branch walkthroughs; inputs, order, skips, property/path transitions, status; limitations/unresolved checklist. Relative links to each scenario.
- discovery.json: optional candidates/imports/parse and exclusion warnings, without raw handler bodies or secret values.
- route-inventory.json: version 1, app summary, routes, reconciled candidates, unresolved mounts. Each route: stable ID, method/full pattern/local pattern/mount chain/registration index/source locations/handler chain/observed inputs and outputs/reachability/scenario IDs. Source file paths relative to backend with verified lines. Explain runtime order.
- coverage.json: version 1; totals; each route modeled/partial/unsupported/unresolved, scenario IDs, supported/omitted branches and reasons. Include unresolved mounts/candidates/version differences. Modeled means only stated branches; unsupported routes still count. Never equate simulator coverage with endpoint verification.
- scenario-manifest.json: format in simulator-format.md, plus source locations, selected branch, synthetic inputs, assumptions, omissions and human-readable steps. Validator ignores extra descriptive fields.
- scenarios/*.json: exact configs only, descriptive filenames such as tours-get-one-success.json and users-update-forbidden.json. Synthetic IDs/payloads; <TOKEN> placeholders in prose. <=200KB each.
- validation.json: actual engine report/traces. If engine unavailable, state unverified and reason instead of fabricating results.

Update existing source-backed documentation without erasing unrelated hand-written content. Do not commit/publish to other repos by default.

## Easy walkthrough template

For each method/full path and meaningful branch:

1. Explain goal and source-backed preconditions. Tiny synthetic params/header/body example if real API requires it; clearly these are documentation, not configurable simulator inputs.
2. Link the scenario. Open SMSM Middleware Flow, **Import JSON**, select file, check method/URL, **Reset**.
3. Choose **Request path only** and press **Step**. Explain each eligible handler and diagram/log change; use an ordered chain/table. This mode omits skipped events in diagram/log/playback. For skip reasons, switch to **Full stack**. Explain router-local path/baseUrl transitions; **Reveal as you step** optionally draws visited nodes progressively.
4. Inspect params and configured custom request properties. Distinguish illustrative values from backend computation.
5. State expected status/message, or pending/no status; identify terminating/error handler and fallbacks. Successful responses show **Completed**; failure/404/pending branches retain their actual outcomes rather than being labeled successful.
6. **Play**/**Pause** to replay; **Reset** to restart; import alternative branch. Mark real endpoint verification still needed.

## Audit

Every route/method has a scenario or explicit unsupported reason. Every candidate/mount reconciled. All scenarios referenced and assertions pass. Earlier shadowing/error middleware retained. Source lines/links accurate. No private data. Only claim actual checks.

## Skill helper checks

Run `node "<skill>/scripts/self-test.mjs" --simulator "D:/Middleware Flow" --typescript "D:/Middleware Flow/node_modules/typescript"` after changing helpers or simulator format. It creates synthetic source/scenarios in a verified temporary folder, checks AST discovery, runs 12 explicitly asserted scenarios in the actual engine, rejects invalid expectations/configs/manifests, and cleans up. It never executes the fixture backend or checks a real API.

## Scanner limits

Agent tooling folders (`.agents`, `.codex`, `.claude`, `.gemini`) are excluded so installing this skill inside the backend does not turn the skill's own helper calls into apparent API routes. Exclusions are recorded in discovery output.

scan-express.mjs parses JS/TS-family files using TypeScript AST; reports shaped calls, imports and syntax errors. It cannot evaluate configuration, resolve aliases/factories, infer behavior or prove receivers are Express. Inspect local imports manually. Factory descriptors omit argument values; read source safely to resolve roles/options. Dynamic mount ambiguity flagged. Ignored/vendor/generated directories excluded; external or ignored routers require separate analysis and coverage notes. Use rg/manual reading if compiler unavailable; do not execute backend to resolve uncertainty.
