# DocSpring Pipedream Components — Design Notes

Port spec for the DocSpring **Pipedream** integration. Source of truth for behavior
is the Zapier integration (`DocSpring/zapier_integration`), the Make app, the n8n node
(`DocSpring/n8n_integration`), and the Node-RED nodes; this doc records what carries
over and what changes because Pipedream components are **Node.js (ESM `.mjs`)** using
`@pipedream/platform` (axios), submitted to the `PipedreamHQ/pipedream` monorepo.

Modeled on the existing PDF-generation apps in the monorepo (`craftmypdf`,
`apitemplate_io`, `documint`) — all API-key apps with the same shape.

## Structure (`components/docspring/`)

```
docspring.app.mjs            # the app: auth (this.$auth.*), propDefinitions, methods
package.json                 # @pipedream/docspring, dep @pipedream/platform
actions/
  generate-pdf/generate-pdf.mjs
  combine-pdfs/combine-pdfs.mjs
  create-data-request/create-data-request.mjs
  create-signing-link/create-signing-link.mjs
  find-template/find-template.mjs
  find-submission/find-submission.mjs
sources/
  new-event/new-event.mjs    # webhook source for DocSpring events
```

## App file — `docspring.app.mjs`

```js
import { axios } from "@pipedream/platform";
export default {
  type: "app",
  app: "docspring",
  propDefinitions: {
    templateId: { type: "string", label: "Template", async options() { /* listTemplates */ } },
    submissionId: { ... }, dataRequestId: { ... }, /* etc. */
  },
  methods: {
    _region() { return this.$auth.region || "us"; },
    _baseUrl(sync) { /* region → api[.eu].docspring.com or sync host or custom_host */ },
    _headers() {
      return {
        Authorization: "Basic " + Buffer.from(`${this.$auth.token_id}:${this.$auth.token_secret}`).toString("base64"),
        Accept: "application/json",
      };
    },
    async _makeRequest({ $ = this, path, sync, ...opts }) {
      return axios($, { url: `${this._baseUrl(sync)}/api/v1${path}`, headers: this._headers(), ...opts });
    },
    generatePdf({ templateId, ...a }) { return this._makeRequest({ method:"POST", path:`/templates/${templateId}/submissions`, params:{wait:true}, sync:true, ...a }); },
    combinePdfs(a) { return this._makeRequest({ method:"POST", path:"/combined_submissions", params:{wait:true}, sync:true, ...a }); },
    createSubmission({ templateId, ...a }) { return this._makeRequest({ method:"POST", path:`/templates/${templateId}/submissions`, ...a }); },
    createToken({ dataRequestId, ...a }) { return this._makeRequest({ method:"POST", path:`/data_requests/${dataRequestId}/tokens`, ...a }); },
    listTemplates(a) { return this._makeRequest({ path:"/templates", ...a }); },
    getSubmission({ submissionId, ...a }) { return this._makeRequest({ path:`/submissions/${submissionId}`, ...a }); },
    listSubmissions(a) { return this._makeRequest({ path:"/submissions", ...a }); },
    createWebhook(a) { return this._makeRequest({ method:"POST", path:"/webhooks", ...a }); },
    deleteWebhook({ webhookId, ...a }) { return this._makeRequest({ method:"DELETE", path:`/webhooks/${webhookId}`, ...a }); },
  },
};
```

## Auth (this.$auth) — the key open item

DocSpring uses **Basic auth** with a **token id + secret** pair, plus a **region**
(and self-hosted **custom_host**). In Pipedream that's a **custom-fields** app whose
`$auth` keys are `token_id`, `token_secret`, `region`, `custom_host`. Confirm how a
NEW app's auth is registered (app-file declaration vs Pipedream team pre-registering
the app in their DB via the PR) — pending research.

## Actions (each `type: "action"`, reuse app propDefinitions, call app methods)

- **Generate PDF** — `docspring.generatePdf` (sync host + `?wait=true`). `templateId` +
  a JSON `data` object + test/password/expires/version → `body.submission`.
- **Combine PDFs** — `docspring.combinePdfs` (sync host + wait). `sourcePdfs` array.
- **Create Data Request** — `docspring.createSubmission` (standard host, no wait) with
  `data_requests`, then mint a 30-day `email` token per recipient → submission +
  `signing_url`s.
- **Create Signing Link** — `docspring.createToken` with `type` in the query string.
- **Find Template** — `docspring.listTemplates` (page pagination, per_page ≤ 50).
- **Find Submission** — `docspring.getSubmission` (single) / `listSubmissions`
  (cursor pagination).

Each does `$.export("$summary", "...")` and returns the response.

## Source — `sources/new-event` (webhook)

`hooks.activate()` → `docspring.createWebhook({ webhook: { url: this.http.endpoint,
event_types: [...selected], include_submission_data: true, version: 3, name: "Pipedream",
mode } })`, storing the webhook `id`; `hooks.deactivate()` → `deleteWebhook`. The `run(event)`
handler flattens the delivery (top-level `id` = event uuid, `resource_id`,
`resource_type`, `data`) and `this.$emit(body, { id: body.id, summary, ts })`.

## Gotchas carried over

- **Sync host + `?wait=true`** for Generate PDF / Combine PDFs; **standard host, no
  wait** for Create Data Request.
- Signing-link `type` in the **query string**.
- v3 webhook: top-level `id` is the event uuid; the resource's ID at `data.id`.
- DocSpring errors: `{status:error, errors:[…]}` (axios throws on non-2xx).

## Testing & submission

- Test the request logic against the DocSpring test account (framework-agnostic).
- `pd` CLI (`pd dev`) for live component iteration once the app auth exists.
- Submit a PR to `PipedreamHQ/pipedream` adding `components/docspring/`; their team
  reviews/merges and registers the app → it appears in the Pipedream registry.
