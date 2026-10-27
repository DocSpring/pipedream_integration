import {
  beforeEach, describe, it,
} from "node:test";
import assert from "node:assert/strict";
import {
  constants, httpError, loadComponent, makeApp, requests, reset, respondInOrder, utils,
} from "./support.mjs";

const source = await loadComponent("sources/new-event/new-event.mjs");

const makeSource = (props = {}) => {
  const store = {};
  const emitted = [];
  const context = {
    ...source.methods,
    docspring: makeApp(),
    db: {
      get: (key) => store[key],
      set: (key, value) => {
        store[key] = value;
      },
    },
    http: {
      endpoint: "https://abc.m.pipedream.net",
    },
    $emit: (event, meta) => emitted.push({
      event,
      meta,
    }),
    ...props,
  };
  return {
    context,
    store,
    emitted,
  };
};

beforeEach(reset);

describe("New Event (Instant)", () => {
  it("creates a flat version 4 webhook and stores its id", async () => {
    respondInOrder({
      id: "whk_1",
      version: 4,
    });
    const {
      context, store,
    } = makeSource({
      eventTypes: [
        "submission.processed",
        "signature_request.completed",
      ],
      templateIds: [
        "tpl_1",
      ],
      mode: "live",
    });
    await source.hooks.activate.call(context);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/webhooks");
    assert.deepEqual(requests[0].data, {
      url: "https://abc.m.pipedream.net",
      name: "Pipedream",
      event_types: [
        "submission.processed",
        "signature_request.completed",
      ],
      template_ids: [
        "tpl_1",
      ],
      mode: "live",
      include_submission_data: true,
    });
    assert.equal(store.hookId, "whk_1");
  });

  it("fails activation before any request when templates are set with events they can't filter", async () => {
    const {
      context, store,
    } = makeSource({
      eventTypes: [
        "submission.processed",
        "combined_pdf.processed",
        "signature_request.completed",
        "template.updated",
        "submission_batch.failed",
        "custom_file.created",
        "folder.created",
      ],
      templateIds: [
        "tpl_1",
      ],
    });
    await assert.rejects(source.hooks.activate.call(context), {
      message: "Templates only filter submission, signature request and template events, so these events can't be chosen"
        + " with them: `combined_pdf.processed`, `submission_batch.failed`, `custom_file.created`, `folder.created`."
        + " Remove those events, or leave Templates blank.",
    });
    assert.equal(requests.length, 0);
    assert.equal(store.hookId, undefined);
  });

  it("takes any event when no templates are set", async () => {
    respondInOrder({
      id: "whk_1",
    });
    const { context } = makeSource({
      eventTypes: [
        "combined_pdf.processed",
        "folder.created",
      ],
      templateIds: [],
    });
    await source.hooks.activate.call(context);
    assert.deepEqual(requests[0].data.event_types, [
      "combined_pdf.processed",
      "folder.created",
    ]);
    assert.equal(requests[0].data.template_ids, undefined);
  });

  it("says in the Templates help which events templates can filter", () => {
    const { description } = source.props.templateIds;
    assert.match(description, /only filter submission, signature request and template events/);
    assert.match(description, /combined PDF, submission batch, custom file and folder events/);
  });

  it("deletes the webhook on deactivation, and treats a 404 as done", async () => {
    respondInOrder({}, httpError(404, {
      error: {
        code: "not_found",
        message: "Not found",
        details: [],
        request_id: "req_1",
      },
    }));
    const first = makeSource();
    first.store.hookId = "whk_1";
    await source.hooks.deactivate.call(first.context);
    assert.equal(requests[0].method, "DELETE");
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/webhooks/whk_1");
    assert.equal(first.store.hookId, null);

    const second = makeSource();
    second.store.hookId = "whk_2";
    await source.hooks.deactivate.call(second.context);
    assert.equal(second.store.hookId, null);
  });

  it("fails deactivation on other errors, keeping the id", async () => {
    respondInOrder(httpError(401, {
      error: {
        code: "unauthorized",
        message: "Invalid API token",
        details: [],
        request_id: "req_1",
      },
    }));
    const { context, store } = makeSource();
    store.hookId = "whk_1";
    await assert.rejects(source.hooks.deactivate.call(context), /401 unauthorized/);
    assert.equal(store.hookId, "whk_1");
  });

  it("does nothing on deactivation when no webhook was created", async () => {
    const { context } = makeSource();
    await source.hooks.deactivate.call(context);
    assert.equal(requests.length, 0);
  });

  it("emits the event as delivered plus resource_type and resource_id", async () => {
    const { context, emitted } = makeSource();
    const body = {
      id: "6f1c2e8a-3b4d-4c5e-9f60-7a8b9c0d1e2f",
      event_type: "signature_request.completed",
      created_at: "2026-06-27T03:16:07Z",
      data: {
        id: "srq_1",
        submission_id: "sub_1",
        created_at: "2026-06-26T00:00:00Z",
      },
    };
    await source.run.call(context, {
      body,
    });
    assert.deepEqual(emitted, [
      {
        event: {
          ...body,
          resource_type: "signature_request",
          resource_id: "srq_1",
        },
        meta: {
          id: body.id,
          summary: "signature_request.completed: srq_1",
          ts: Date.parse("2026-06-27T03:16:07Z"),
        },
      },
    ]);
  });

  it("rejects a delivery with no event id", async () => {
    const { context } = makeSource();
    await assert.rejects(source.run.call(context, {
      body: {
        event_type: "submission.processed",
        data: {},
      },
    }), /has no event `id`/);
  });

  it("has a sample event in the emitted shape", () => {
    const { sampleEmit } = source;
    const {
      resource_type: resourceType, resource_id: resourceId, ...delivered
    } = sampleEmit;
    assert.deepEqual(utils.eventOutput(delivered), sampleEmit);
    assert.equal(resourceType, "submission");
    assert.equal(resourceId, delivered.data.id);
  });

  it("offers every version 4 event except webhook.*", () => {
    const values = constants.EVENT_TYPE_OPTIONS.map((option) => option.value);
    assert.equal(values.length, 22);
    assert.ok(values.every((value) => !value.startsWith("webhook.")));
    assert.ok(values.every((value) => !/data_request|combined_submission/.test(value)));
    assert.ok(constants.EVENT_TYPE_OPTIONS.every((option) => option.label && option.value));
  });
});
