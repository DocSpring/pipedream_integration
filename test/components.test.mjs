import {
  describe, it,
} from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import {
  componentsDir, loadComponent,
} from "./support.mjs";

const pkg = JSON.parse(readFileSync(path.join(componentsDir, "package.json"), "utf8"));
const actionNames = readdirSync(path.join(componentsDir, "actions"));
const actions = await Promise.all(actionNames.map(async (name) => [
  name,
  await loadComponent(`actions/${name}/${name}.mjs`),
]));
const actionDisplayNames = new Set(actions.map(([
  , action,
]) => action.name));

// The operations in the sc-5981 spec, except Make an API Call (Pipedream has its own).
const SPEC_OPERATIONS = [
  "Generate PDF",
  "Generate PDFs in a Batch",
  "Get Submission Batch",
  "Check Data",
  "Get Submission",
  "Find Submissions",
  "Generate Submission Files",
  "Expire Submission",
  "Combine PDFs",
  "Get Combined PDF",
  "Create Signature Request",
  "Create Signing Link",
  "Get Signature Request",
  "Find Templates",
  "Get Template",
  "Create Template",
  "Replace Template PDF",
  "Copy Template",
  "Move Template",
  "Publish Template Version",
  "List Template Fields",
  "Add Template Fields",
  "Update Template Fields",
  "Remove Template Fields",
  "Get Template Page Images",
  "List Folders",
  "Create Folder",
];

describe("components", () => {
  it("has one action per operation in the spec", () => {
    assert.deepEqual([
      ...actionDisplayNames,
    ].sort(), [
      ...SPEC_OPERATIONS,
    ].sort());
  });

  for (const [
    folder,
    action,
  ] of actions) {
    it(`${folder}: key, version, type, ai, annotations and docs link`, () => {
      assert.equal(action.key, `docspring-${folder}`);
      assert.equal(action.version, pkg.version);
      assert.equal(action.type, "action");
      assert.equal(action.ai, "optimized");
      assert.deepEqual(Object.keys(action.annotations).sort(), [
        "destructiveHint",
        "openWorldHint",
        "readOnlyHint",
      ]);
      assert.match(action.description, /\[See the documentation\]\(https:\/\/docspring\.com\/docs\/api\/#tag\/[a-z-]+\/(get|post|put|delete)\/[^)]+\)$/);
      assert.equal(Object.keys(action.props)[0], "docspring");
    });

    it(`${folder}: names only real actions in bold, and says nothing about data requests or UIDs`, () => {
      const text = JSON.stringify(action, (key, value) => (typeof value === "function"
        ? undefined
        : value));
      for (const [
        , name,
      ] of text.matchAll(/\*\*([^*]+)\*\*/g)) {
        if (/^(New Event \(Instant\)|Data|Prefilled Values Editable|Reimport Fields|Detect Fields|Template Version|Output Formats|Authentication Provider|Signer \d+ Fields|Signer \$\{i\} Fields)$/.test(name)) {
          continue;
        }
        assert.ok(actionDisplayNames.has(name), `${folder} mentions **${name}**, which isn't an action`);
      }
      assert.doesNotMatch(text, /data.request|\bUID\b|\/api\/v1/i);
    });
  }

  it("marks only the deleting actions destructive, and only the reading ones read-only", () => {
    const destructive = actions.filter(([
      , action,
    ]) => action.annotations.destructiveHint).map(([
      folder,
    ]) => folder)
      .sort();
    assert.deepEqual(destructive, [
      "expire-submission",
      "remove-template-fields",
      "replace-template-pdf",
    ]);
    for (const [
      folder,
      action,
    ] of actions) {
      const reads = /^(get|find|list|check)-/.test(folder);
      assert.equal(action.annotations.readOnlyHint, reads, folder);
    }
  });

  it("gives the source no annotations, the package's version and dedupe", async () => {
    const source = await loadComponent("sources/new-event/new-event.mjs");
    assert.equal(source.key, "docspring-new-event");
    assert.equal(source.version, pkg.version);
    assert.equal(source.dedupe, "unique");
    assert.equal(source.annotations, undefined);
    assert.equal(source.type, "source");
  });
});
