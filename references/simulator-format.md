# SMSM Middleware Flow format

Checked against the companion simulator's `src/engine.ts` on 2026-10-13. [Open the simulator](https://middleware-flow-visualizer.vercel.app/) or [get its source](https://github.com/ahmedsamy13/middleware-flow-visualizer-). Recheck before generating imports; future versions may differ. App targets Express 5. For an Express 4 backend inspect `catchAsync`/promise wrappers; bare rejected promises do not have Express 5 forwarding semantics. Mark remaining version mismatches.

## Display modes

Request path only is the default: only entered routers/routes and executed handlers appear in the diagram. Its execution log and Step/Play omit skipped events and stop at the final response/outcome. Reveal as you step draws the path progressively; otherwise the complete configured path is visible before playback. Full stack shows every registration and restores skipped-event explanations. These controls affect presentation only; import/export configurations retain the complete stack.

## Exact configuration

```json
{
  "version": 1,
  "method": "GET",
  "url": "/api/v1/tours/demo-tour",
  "layers": [
    {
      "id": "tours-router",
      "name": "Tours router",
      "kind": "router",
      "path": "/api/v1/tours",
      "method": "ALL",
      "action": "next",
      "status": 200,
      "message": "",
      "property": "",
      "value": "",
      "enabled": true,
      "children": [
        {
          "id": "get-tour",
          "name": "GET /:id",
          "kind": "route",
          "path": "/:id",
          "method": "GET",
          "action": "next",
          "status": 200,
          "message": "",
          "property": "",
          "value": "",
          "enabled": true,
          "children": [
            {
              "id": "get-tour-handler",
              "name": "getTour: sample success branch",
              "kind": "middleware",
              "path": "/",
              "method": "ALL",
              "action": "respond",
              "status": 200,
              "message": "Synthetic tour response",
              "property": "",
              "value": "",
              "enabled": true,
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

Illustrative only, not backend evidence. Every layer needs all fields. Unique IDs `[\w-]{1,80}`; names length 1–80. Kinds: middleware/error/route/router. Actions: next/respond/error/route/router/reject/pending. Only routers/routes have children; routes require at least one middleware/error child and cannot contain nested routes/routers. Container actions do not execute; use next.

Request method GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS; layer method also ALL. Only routes filter method; HEAD falls back to GET. Other methods unsupported. Layer paths: literal slash segments or `:name` parameters only; no regex/wildcards/optional segments/query strings. Query in request URL does not influence control flow. URL <=1000, layer path <=200; encoding must be valid. Status is always integer 200–599 even when ignored. Message <=1000; value <=2000. Import <=200,000 bytes, <=80 layers, <=8 nesting levels. Validate against current engine.

## Mapping

| Source | Simulation |
| --- | --- |
| app.use('/api', router) | router at /api, children with local paths |
| router.get('/:id', protect, getOne) | route GET /:id, ordered handler children |
| application/path middleware | middleware at registered path; omitted => / |
| four-argument error handler | error layer at original position/mount |
| next() | next |
| res.status(n).json/send/end(...) | respond with selected status and synthetic message |
| next(err) or thrown synchronous error | error |
| rejected returned promise in Express 5 | reject |
| next('route') in a route handler | route |
| next('router') inside router | router |
| no response/no next in selected branch | pending |

Router entry updates local path/baseUrl. Params model default `mergeParams:false`. `mergeParams:true`, router.param preprocessing/caching, case-sensitive/strict settings, implicit OPTIONS and finer HEAD semantics need limitation notes; do not claim faithfully modeled. Incoming errors skip route registrations/normal handlers until an eligible error handler handles or clears the error. next in an error handler clears it. Default terminal: no response => not-found/404; unhandled error => failed/500; respond >=400 => failed, otherwise completed; pending has no HTTP status.

`property` optionally sets one custom request property; string `value` is JSON-parsed or becomes plain text. Use synthetic user/requestId. Built-ins url/originalUrl/baseUrl/path/params/method/query/headers/body and prototype names cannot be assigned. Prefer documenting omitted properties over adding artificial helper layers.

## Visible limitations

- Actions never execute backend JavaScript. Header/body/query/auth/database branches are selected by scenario author, not evaluated.
- Responses are illustrative selected messages/statuses; no serializers, headers/cookies, JWT/session handling, files, database or network traffic.
- No callback timing, work after next, double-next, headersSent, streaming, WebSockets or full error objects/status derivation.
- next transfers control but does not terminate the JavaScript function. Document omitted post-next side effects.
- Set downstream error response explicitly from source; engine does not derive it from an error object.
- Preserve duplicate/shadowing registrations. Large-app slices are partial if omitted handlers could affect results; state layer/depth exclusions.

## Manifest for validation

Place scenario-manifest.json alongside scenarios/. Metadata is not an import. All scenario JSON files must be listed; paths cannot escape scenarios/.

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "get-tour-success",
      "routeId": "tours-get-one",
      "file": "scenarios/get-tour-success.json",
      "title": "Get a tour: success",
      "expected": {
        "outcome": "completed",
        "status": 200,
        "response": "Synthetic tour response",
        "runIds": ["get-tour-handler"],
        "skipIds": [],
        "snapshots": [
          {
            "id": "get-tour-handler",
            "event": "run",
            "path": "/demo-tour",
            "baseUrl": "/api/v1/tours",
            "params": {"id": "demo-tour"},
            "properties": {}
          }
        ]
      }
    }
  ]
}
```

runIds must equal exact ordered middleware/error runs (container entry is not run). skipIds checks those IDs were skipped, not exhaustive skips. Status required, null for pending. Response equality optional. Snapshots compare supplied fields exactly, including complete params/properties objects. Validator invokes trusted simulator validateConfig/simulate and writes traces/results, never imports backend.
