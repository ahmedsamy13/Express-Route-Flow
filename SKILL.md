---
name: express-route-flow
description: Analyze an Express JavaScript or TypeScript backend, inventory every route and middleware chain, and create a beginner-friendly route-by-route guide with importable SMSM Middleware Flow scenarios. Use when asked to explain an Express app's request-response cycles, map products/tours/users routers, or prepare Middleware Flow walkthroughs from backend source.
---

# Express Route Flow

Turn backend source into an evidenced route inventory and practical walkthroughs for SMSM Middleware Flow. Work locally. The simulator models selected control-flow branches; it does not run controllers, validate tokens, query a database, or test the real API.

## Establish the input

1. Locate the Express backend from the user's path or workspace. Read project instructions, package.json, the lockfile's Express version, entrypoint, app bootstrap, and existing API contracts/tests. If this is a frontend and no backend is supplied, ask for its folder or repository; do not invent its routes. Reconcile existing OpenAPI/Postman artifacts with source.
2. If available, follow `postman:api-engineer` for API engineering and `postman:api-testing` for explicitly requested live verification. These integrations are optional; their absence must not block static analysis or guide generation. Do not bind a Postman workspace, boot the backend, connect a database, or send real requests merely to create this guide. Report live verification separately when requested.
3. Locate simulator source from the user's path or workspace. The companion is [SMSM Middleware Flow](https://middleware-flow-visualizer.vercel.app/), with [source here](https://github.com/ahmedsamy13/middleware-flow-visualizer-). `D:\Middleware Flow` is one local example, not a required location. Read its `src/engine.ts` and UI controls. Read [simulator-format.md](references/simulator-format.md) for mapping rules; actual source takes precedence. If unavailable, inspect a user-provided exported config and state engine verification is unavailable.

## Analyze the complete registration graph

4. Read [analysis-and-delivery.md](references/analysis-and-delivery.md). Discover source with `rg --files`. Optionally run `scripts/scan-express.mjs` to make an AST candidate report. It never imports or executes backend source. Its report is a navigation aid, not a resolved inventory.
5. Trace from bootstrap through imported routers, nested mounts, registration functions, controller factories, handler arrays, `.route()` chains, `.all()`, `router.param()`, conditionals, and error handlers. Identify genuine Express receivers; Map/HTTP-client `.get()` calls are not routes. Expand literal path arrays and multiple mounts into separate entries. Preserve registration order and distinguish local paths from full URLs.
6. Read every resolved handler and relevant helpers/services to establish branches. Record repository-relative file plus line evidence, middleware/request properties, authentication/roles, params/query/body requirements, success/error status and response shape. Distinguish facts, assumptions and unresolved behavior. Never copy credentials, environment values, real tokens, personal records or password hashes into artifacts. Use synthetic examples.
7. Reconcile every candidate: route, mount, middleware, parameter handler, app setting, non-Express call, unreachable registration, or unresolved with a reason. Report dynamic paths, missing imported packages and conditional registrations explicitly. Do not claim complete coverage while any candidate or mount is unresolved.

## Create the walkthroughs

8. Use `docs/middleware-flow/` in the backend unless the user specifies otherwise. Produce `GUIDE.md`, `route-inventory.json`, `coverage.json`, `scenario-manifest.json`, and `scenarios/*.json` as described in the delivery reference. Keep simulator configs pure; put evidence, inputs and assumptions in metadata.
9. For each concrete route/method, make a success walkthrough where reachable and separate meaningful branches supported by source: unauthenticated, unauthorized role, invalid input, missing record, conflict, forwarded error, or pending. Include unmatched paths/control-flow scenarios when relevant. Do not invent success for shadowed/unreachable routes. Give every route a walkthrough or an explicit unsupported/unresolved explanation.
10. Preserve relevant app/router chains, original mount boundaries, competing registration order, and error handlers. Choose a fixed action per handler per scenario. Successful auth may add synthetic `req.user`; failure changes the auth handler's action. Simulator inputs cannot drive arbitrary auth/body/database conditions. Never remove a shadowing handler to force success or substitute unsupported syntax without declaring the difference.
11. Write easy numbered instructions: open SMSM Middleware Flow, **Import JSON**, choose the linked file, confirm method/URL, **Reset**, **Step** through handlers, inspect path/baseUrl/params/custom properties/status, then **Play**, **Pause**, and **Reset**. Use **Request path only** to hide skipped registrations from both diagram and log; enable **Reveal as you step** for progressive drawing. Use **Full stack** when explaining skip reasons. Explain the final Completed/Failed/Not found/Pending state. Include a route index and branch checklist.

## Verify and deliver

12. Run `scripts/validate-scenarios.mjs` against the actual simulator engine and manifest. Assert status/outcome, exact ordered handler runs, skips, and key snapshots. Fix failures; importing alone is not proof of intended flow. Audit guide links, evidence and coverage. Separate simulator validation from real API tests.
13. Report route counts, modeled/partial/unresolved routes, scenario count, checks run, and remaining gaps. Link guide/import files. Do not modify backend/simulator or commit/push artifacts unless authorized.

## Commands

Resolve `<skill>` from this installed directory, not the current working directory.
Replace example backend, simulator and TypeScript paths with actual locations. The host must provide source-file access and a Node.js shell; do not assume Codex-specific tool names exist in another agent.

```powershell
node "<skill>/scripts/scan-express.mjs" --app "D:/My Express App" --out "D:/My Express App/docs/middleware-flow/discovery.json" --typescript "D:/Middleware Flow/node_modules/typescript"
node --experimental-strip-types "<skill>/scripts/validate-scenarios.mjs" --simulator "D:/Middleware Flow" --manifest "D:/My Express App/docs/middleware-flow/scenario-manifest.json" --out "D:/My Express App/docs/middleware-flow/validation.json"
```

Scanner resolves TypeScript from backend/skill dependencies or an explicit compiler path. If missing, use `rg` and manual tracing; do not install backend dependencies without need. Validator requires Node with TypeScript stripping and the trusted simulator's standalone engine. Consult [Express middleware](https://expressjs.com/en/guide/using-middleware/) and [error handling](https://expressjs.com/en/guide/error-handling/) when version-specific behavior is uncertain.
