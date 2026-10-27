# DocSpring Pipedream Components: Design Notes

How the DocSpring components for **Pipedream** work, and why. They're Node.js ES modules (`.mjs`) that use
`@pipedream/platform`'s `axios`, written to go upstream into the `PipedreamHQ/pipedream` monorepo
(`components/docspring/`). The other DocSpring integrations (Zapier, Make, n8n, Node-RED, Bubble) follow the same
operation set and rules (Shortcut sc-5981), so a change to one usually belongs in all of them.

All of them call **DocSpring API v2** (`/api/v2`) and create **version 4** webhooks. Nothing calls API v1.

## Structure (`components/docspring/`)

```
docspring.app.mjs          # auth, hosts, User-Agent, errors, paging, pickers, one method per API operation
common/constants.mjs       # version, hosts, limits, failure states, dropdown options, the 22 webhook events
common/utils.mjs           # pure helpers: input parsing, request cleaning, error messages, event output
actions/<name>/<name>.mjs  # 27 actions, key docspring-<name>
sources/common/base-webhook.mjs
sources/new-event/         # New Event (Instant) and its sample event
package.json               # @pipedream/docspring; its version is the User-Agent's
```

Tests live outside `components/` (`test/`, `package.json` at the root), so they don't go upstream.

## Auth and hosts

The app is a custom-fields app: `this.$auth.token_id` and `token_secret` (HTTP Basic: the token ID is the username),
`region` (`us`, `eu` or `self_hosted`) and `custom_host`. Pipedream has to register the app with these fields before
an account can connect (PipedreamHQ/pipedream#21948). The registration's connection test should be
`GET https://api.docspring.com/api/v2/authentication`, which returns `{"authenticated": true}`
(`testAuthentication()` makes the same request).

| Region      | Standard host          | Sync host (waits for PDFs) |
| ----------- | ---------------------- | -------------------------- |
| US          | `api.docspring.com`    | `sync.api.docspring.com`   |
| EU          | `api-eu.docspring.com` | `sync.api-eu.docspring.com` |
| Self-hosted | the custom host        | the custom host            |

A custom host without a scheme gets `https://`. The operations that make a file use the sync host with
`?wait=true`, or `wait=false` when **Wait for the PDF** is off: Generate PDF, Generate PDFs in a Batch, Combine PDFs,
Generate Submission Files, Create Template and Replace Template PDF. Everything else, including Create Signature
Request, uses the standard host.

Every request sends `User-Agent: docspring-pipedream/<version>`, from `PACKAGE_VERSION` in `common/constants.mjs`. Keep
it equal to `package.json`'s version (a test checks): Pipedream bumps the package with every component change, so it
names the release, and DocSpring counts users by it in `api_logs.user_agent`.

## Requests

- JSON bodies, flat (no `{webhook: ...}` wrappers). `version` and `wait` are query parameters; a batch's template
  version is `template_version` in its body.
- IDs in request paths go through `utils.pathId`: trimmed and encoded with `encodeURIComponent`, so an ID from an
  earlier step or an agent can't point the request at another endpoint (`../templates/tpl_...` as a submission ID
  would otherwise make Expire Submission delete a template). A blank ID, `.` or `..` is a `ConfigurationError` before
  any request. Every app method that puts an ID in its path does this (a test checks).
- Inputs left blank aren't sent (`utils.compact` drops `undefined`, `null`, `""` and `[]`). `test` is sent only when
  it's true: v2 rejects `test: false` from a test token, and a test token always makes test PDFs anyway.
- Strings that Pipedream hands over for booleans and integers are converted, and ones that can't be are a
  `ConfigurationError`. Object inputs take an object or a JSON string; list inputs take a list, a JSON array, or items
  that are JSON objects or arrays (`utils.parseObjectArray`).
- `data` is passed through as the user mapped it: v2 checks it against the template (dates are `YYYY-MM-DD`). It's a
  key-value object rather than fields built from the template's schema, which works the same for agents and for data
  mapped whole from an earlier step.
- Lists use cursors: Find Templates, Find Submissions and List Folders follow `next_cursor` (up to 100 a request) until
  **Max Results** (default 50), and return an array. The template and folder pickers page with `prevContext` and stop
  after 1,000 options. The folder picker can offer `root` (sent as `null`) for Copy Template and Move Template.

## Responses and errors

- Actions return the v2 resource as the API returns it. The only additions are Create Signature Request's
  `signature_requests[].signing_url`, `first_signature_request_id` and `first_signing_url`.
- `_makeRequest` turns an HTTP error into
  `DocSpring API error <status> <code>: <message>`, then one line per detail (`<pointer or parameter>: <message>`), the
  record (`Submission: sub_...`, `Combined PDF: ...`, `Submission batch: ...`, `Template: ...`) and
  `Request ID: req_...`. The error keeps `status`, `code` and `response: {status, data}`.
- A network error (no response) becomes a new `Error`: "Couldn't reach DocSpring at <base URL>: <cause>", with the
  cause's `code` (e.g. `ECONNREFUSED`). The AxiosError isn't rethrown or attached as `cause`: its `config` and
  `request` carry the Authorization header.
- A 429 is retried in `_makeRequest`: test tokens make 5 requests a minute (burst 15), so Create Signature Request
  (a submission plus a token call per signer) and paging can hit one. It waits `Retry-After` seconds (at least 1;
  1 when the header is missing) and sends the same request again, as long as the waits in that call add up to no more
  than 20 seconds (`MAX_RATE_LIMIT_WAIT_SECONDS`, inside Pipedream's default 30-second step timeout). Otherwise it
  throws the usual API error at once, so Create Signature Request still names the submission it created. A 429 means
  DocSpring didn't process the request, so POSTs are retried too. Other statuses (including a 503 with
  `Retry-After`) aren't retried. Tests replace `_sleep`.
- A 504 `polling_timeout` says which action gets the record later, and which trigger event to use
  ("The PDF wasn't ready in time. Get it later with Get Submission (sub_...), or use the submission.processed
  trigger.").
- A 404 from a self-hosted server whose body isn't a v2 error means the server has no API v2: "This DocSpring server
  doesn't have API v2 yet. Upgrade it to the latest release." A v2
  `not_found` is reported as it is.
- A 201 whose record failed throws, naming the state, the error message and the ID: a submission in `error`,
  `syntax_error`, `image_download_failed` or `image_processing_failed`; a combined PDF or batch in `error`; a template
  whose `document.state` is `password_required`, `malformed_pdf`, `unknown_error` or `download_failed`; a generated
  file whose `state` is `error`.

## Actions

| Action | v2 operation | Notes |
| --- | --- | --- |
| Generate PDF | `POST /templates/{id}/submissions` (sync) | version, data, test, metadata, output formats, password, expires in, field overrides, editable, wait |
| Generate PDFs in a Batch | `POST /submissions/batches` (sync) | submissions as JSON; batch-level template, `template_version`, test, metadata, output formats |
| Get Submission Batch | `GET /submissions/batches/{id}` | include data |
| Check Data | `POST /templates/{id}/submissions/validate` | data, test, optional signature requests as JSON; returns `valid` without throwing |
| Get Submission | `GET /submissions/{id}` | |
| Find Submissions | `GET /submissions` or `GET /templates/{id}/submissions` | live / test / any, created after / before, include data |
| Generate Submission Files | `POST /submissions/{id}/generate_files` (sync) | `png` |
| Expire Submission | `DELETE /submissions/{id}` | destructive |
| Combine PDFs | `POST /combined_pdfs` (sync) | sources as JSON; `template_version` and `processed` only on `template` sources |
| Get Combined PDF | `GET /combined_pdfs/{id}` | |
| Create Signature Request | `POST /templates/{id}/submissions` (standard host) | see below |
| Create Signing Link | `POST /signature_requests/{id}/tokens` | `type` in the body: `email` (7 days, the default) or `api` (24 hours); returns the token |
| Get Signature Request | `GET /signature_requests/{id}` | |
| Find Templates | `GET /templates` | name, folder |
| Get Template | `GET /templates/{id}` | |
| Create Template | `POST /templates` (sync) | PDF (file or URL, AI field detection) or HTML; folder |
| Replace Template PDF | `PUT /templates/{id}/document` (sync) | reimport fields; destructive (replaces the draft's PDF) |
| Copy Template | `POST /templates/{id}/copy` | name, folder (`root` or left out: the template's own folder), published version |
| Move Template | `POST /templates/{id}/move` | folder or `root` |
| Publish Template Version | `POST /templates/{id}/publish_version` | `patch`, `minor` or `major`; description |
| List Template Fields | `GET /templates/{id}/fields` | version (draft by default) |
| Add Template Fields | `POST /templates/{id}/fields` | fields as JSON |
| Update Template Fields | `PUT /templates/{id}/fields` | fields as JSON, each with its `id` |
| Remove Template Fields | `POST /templates/{id}/fields/remove` | picks from the template's fields; destructive |
| Get Template Page Images | `GET /templates/{id}/page_images` | version (draft by default) |
| List Folders | `GET /folders` | parent folder |
| Create Folder | `POST /folders` | name, parent folder |

There's no **Make an API Call** action: Pipedream already gives every app a "Use any DocSpring API" code step with the
connected account's credentials on `this.docspring.$auth`
([docs](https://pipedream.com/docs/workflows/building-workflows/code/nodejs/auth)), and Pipedream Connect's API proxy
sends any request with them.

### Create Signature Request

**Number of Signers** (with `reloadProps`) adds a group of inputs for each signer in `additionalProps()`: name,
email, fields, role, authentication (`email_link` by default, `password`, `oauth` with a provider, `phone_number`,
`ldap`, `saml`), prefilled values editable and ignore unknown fields. **Fields** is a multi-select of the template's
field names (from `GET /templates/{id}/fields?version=`, without static and `combined` fields or `@@` details);
when the template can't be read at setup time (its ID comes from an earlier step), the names are typed in. Every
signer needs fields, `oauth` needs a provider, and either every signer has a role or none does.

After creating the submission, the action makes a signing link of the chosen type (`email`, `api` or `none`) for
each pending signature request. If one fails, the error names the submission so the step isn't rerun to make a
second one.

## Source: New Event (Instant)

- `activate()` creates the webhook with `POST /api/v2/webhooks`: `url`, `name: "Pipedream"`, `event_types`, and
  optionally `template_ids`, `mode` and `include_submission_data` (on by default). Webhooks created with API v2 send
  version 4 events. The webhook's `id` and `secret` are stored (`hookId` and `hookSecret` in `$.service.db`).
- `deactivate()` deletes it and clears both; a 404 means it's already gone. Any other error fails deactivation and
  keeps them.
- `run()` emits the event as delivered (`id` = the event ID, `event_type`, `created_at`, `data` = the v2 resource) plus
  `resource_type` (the event type before the first dot) and `resource_id` (`data.id`). The resource stays under
  `data`, so its `id` and `created_at` don't collide with the event's. The emit's `id` is the event ID (it stays the
  same on retries, so `dedupe: "unique"` drops repeats) and `ts` is `created_at`.
- Events: every v4 event except `webhook.*`: `submission.{created,processed,failed,declined,updated,expired}`,
  `signature_request.{viewed,completed,declined,updated}`, `combined_pdf.{processed,failed,expired}`,
  `submission_batch.{processed,failed}`, `template.{created,updated,deleted}`, `custom_file.created` and
  `folder.{created,updated,deleted}`. With templates set, DocSpring only accepts submission, signature request and
  template events (`app/models/webhook.rb`, `TEMPLATE_SCOPABLE_RESOURCES`), and rejects any other with a 422. The
  Templates help says so, and `activate()` fails with a `ConfigurationError` naming the other events before it calls
  the API.
- Every delivery is checked against `X-DocSpring-Signature` before it's emitted (`utils.verifySignature`): the
  HMAC-SHA256 hex of `"{t}.{raw body}"` with the stored secret, compared in constant time with each `v1` (any match
  passes). There's no timestamp-age check. The raw body is the platform's `event.bodyRaw`, the unparsed request body
  (`SourceHttpRunOptions` in the monorepo's `types/src/index.ts`; Pipedream's own HTTP source offers it "for JSON/XML
  verification"). The monorepo's source guidelines say `rawBody`, but the type and the upstream sources that verify
  signatures (Zendesk, Help Scout, Clio, Vercel) all read `bodyRaw`. The `http` prop has `customResponse: true`, so
  `run()` responds itself: 401 for a missing or wrong signature (nothing is emitted), 200 otherwise. A source
  activated before the secret was stored has none, so its deliveries aren't checked.

## Pipedream conventions these follow

From the monorepo's `.github/pipedream-component-guidelines.md` and its CodeRabbit config:

- Actions have `ai: "optimized"` and `annotations` (`readOnlyHint` for get, find, list and check; `destructiveHint`
  for Expire Submission, Remove Template Fields and Replace Template PDF). The source has no annotations.
- Every prop description has an example, and ID props name the action that finds them in **bold**. Descriptions end
  with a link to the operation in the [API v2 reference](https://docspring.com/docs/api/) and don't mention HTTP
  paths.
- Props used by several components are `propDefinitions` in the app file. Generic helpers are in `common/utils.mjs`,
  constants in `common/constants.mjs`.
- File inputs (`document`) have `format: "file-ref"` and a `syncDir` prop (`type: "dir"`, `accessMode: "read"`), and
  are read with `getFileStreamAndMetadata`. A public `https://` URL goes to DocSpring as `document_url` (up to 100 MB)
  instead of being downloaded; a file is sent as `document_base64` (up to 7 MB).
- Versions: every component and `package.json` start at `0.0.1`, as new components must (none of these has been
  published). After that, bump each changed component's `version` and `package.json` (and `PACKAGE_VERSION`).

## Testing

`npm test` at the repo root (Node 22.3 or later, after `npm install` in `components/docspring`) runs `node --test`
with `@pipedream/platform`'s `axios` mocked and `fetch` blocked. Nothing reaches the network. Upstream's lint is
`npx eslint components/docspring` in the monorepo; `node --check` catches syntax errors here.

Before release, try each action against a DocSpring test token with `pd dev` (once Pipedream has registered the
app), and check that the source receives an event and deletes its webhook when removed.
