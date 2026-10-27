import {
  beforeEach, describe, it,
} from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  app, componentsDir, constants, httpError, loadComponent, makeApp, requests, reset, respondInOrder,
} from "./support.mjs";

beforeEach(reset);

describe("hosts and headers", () => {
  it("sends standard requests to api.docspring.com/api/v2", async () => {
    await makeApp().getSubmission({
      submissionId: "sub_1",
    });
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/submissions/sub_1");
  });

  it("sends PDF-making requests to the US sync host", async () => {
    await makeApp().createCombinedPdf({
      data: {},
    });
    assert.equal(requests[0].url, "https://sync.api.docspring.com/api/v2/combined_pdfs");
  });

  it("uses the EU hosts", async () => {
    const docspring = makeApp({
      region: "eu",
    });
    await docspring.listTemplates();
    await docspring.createSubmissionBatch({
      data: {},
    });
    assert.equal(requests[0].url, "https://api-eu.docspring.com/api/v2/templates");
    assert.equal(requests[1].url, "https://sync.api-eu.docspring.com/api/v2/submissions/batches");
  });

  it("uses a self-hosted host for both, adding https:// when it has no scheme", async () => {
    const docspring = makeApp({
      region: "self_hosted",
      custom_host: "docspring.example.com/",
    });
    await docspring.getTemplate({
      templateId: "tpl_1",
    });
    await docspring.createTemplate({
      data: {},
    });
    assert.equal(requests[0].url, "https://docspring.example.com/api/v2/templates/tpl_1");
    assert.equal(requests[1].url, "https://docspring.example.com/api/v2/templates");
  });

  it("sends Basic auth and the docspring-pipedream User-Agent", async () => {
    await makeApp().testAuthentication();
    const { headers } = requests[0];
    assert.equal(headers.Authorization, `Basic ${Buffer.from("api_test123:secret456").toString("base64")}`);
    assert.equal(headers["User-Agent"], "docspring-pipedream/0.0.1");
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/authentication");
  });

  it("keeps the User-Agent version in step with package.json", () => {
    const pkg = JSON.parse(readFileSync(path.join(componentsDir, "package.json"), "utf8"));
    assert.equal(constants.PACKAGE_VERSION, pkg.version);
  });
});

describe("IDs in paths", () => {
  // Every app method that puts an ID in the request path: [method, ID argument, path].
  const ID_METHODS = [
    [
      "createSubmission",
      "templateId",
      "/templates/{id}/submissions",
    ],
    [
      "getSubmissionBatch",
      "submissionBatchId",
      "/submissions/batches/{id}",
    ],
    [
      "validateSubmission",
      "templateId",
      "/templates/{id}/submissions/validate",
    ],
    [
      "getSubmission",
      "submissionId",
      "/submissions/{id}",
    ],
    [
      "listTemplateSubmissions",
      "templateId",
      "/templates/{id}/submissions",
    ],
    [
      "generateSubmissionFiles",
      "submissionId",
      "/submissions/{id}/generate_files",
    ],
    [
      "expireSubmission",
      "submissionId",
      "/submissions/{id}",
    ],
    [
      "getCombinedPdf",
      "combinedPdfId",
      "/combined_pdfs/{id}",
    ],
    [
      "getSignatureRequest",
      "signatureRequestId",
      "/signature_requests/{id}",
    ],
    [
      "createSignatureRequestToken",
      "signatureRequestId",
      "/signature_requests/{id}/tokens",
    ],
    [
      "getTemplate",
      "templateId",
      "/templates/{id}",
    ],
    [
      "updateTemplateDocument",
      "templateId",
      "/templates/{id}/document",
    ],
    [
      "copyTemplate",
      "templateId",
      "/templates/{id}/copy",
    ],
    [
      "moveTemplate",
      "templateId",
      "/templates/{id}/move",
    ],
    [
      "publishTemplateVersion",
      "templateId",
      "/templates/{id}/publish_version",
    ],
    [
      "listTemplateFields",
      "templateId",
      "/templates/{id}/fields",
    ],
    [
      "addTemplateFields",
      "templateId",
      "/templates/{id}/fields",
    ],
    [
      "updateTemplateFields",
      "templateId",
      "/templates/{id}/fields",
    ],
    [
      "removeTemplateFields",
      "templateId",
      "/templates/{id}/fields/remove",
    ],
    [
      "getTemplatePageImages",
      "templateId",
      "/templates/{id}/page_images",
    ],
    [
      "deleteWebhook",
      "webhookId",
      "/webhooks/{id}",
    ],
  ];

  it("covers every method that builds its path from an argument", () => {
    const withIds = Object.entries(app.methods)
      .filter(([
        , fn,
      ]) => /path: `/.test(fn.toString()))
      .map(([
        name,
      ]) => name)
      .sort();
    assert.deepEqual(withIds, ID_METHODS.map(([
      name,
    ]) => name).sort());
  });

  for (const [
    method,
    arg,
    path,
  ] of ID_METHODS) {
    it(`${method}: encodes the ID, so it can't reach another endpoint`, async () => {
      await makeApp()[method]({
        [arg]: " ../templates/tpl_abc/copy?x=1#y ",
      });
      const expected = path.replace("{id}", "..%2Ftemplates%2Ftpl_abc%2Fcopy%3Fx%3D1%23y");
      assert.ok(requests[0].url.endsWith(`/api/v2${expected}`), requests[0].url);
    });

    it(`${method}: rejects a blank ID, \`.\` and \`..\` before any request`, async () => {
      for (const id of [
        ".",
        "..",
        " .. ",
        "",
        "  ",
        undefined,
      ]) {
        await assert.rejects(makeApp()[method]({
          [arg]: id,
        }), /^(ConfigurationError|Error)?.*(isn't a valid .*ID|ID is required)/, `${method} with ${JSON.stringify(id)}`);
      }
      assert.equal(requests.length, 0);
    });
  }

  it("names the input in the error", async () => {
    await assert.rejects(makeApp().expireSubmission({
      submissionId: "..",
    }), {
      message: "`..` isn't a valid Submission ID",
    });
    await assert.rejects(makeApp().getTemplate({
      templateId: " ",
    }), {
      message: "Template ID is required",
    });
  });
});

describe("errors", () => {
  it("lists v2's code, message, details, record and request ID", async () => {
    respondInOrder(httpError(422, {
      error: {
        code: "invalid_data",
        message: "The data doesn't match the template's fields: /data/last_name is required",
        details: [
          {
            code: "required",
            message: "is required",
            pointer: "/data/last_name",
          },
          {
            code: "invalid",
            message: "isn't a version",
            parameter: "version",
          },
          {
            code: "other",
            message: "the request as a whole",
          },
        ],
        request_id: "req_1",
        submission_id: "sub_1",
      },
    }));
    await assert.rejects(makeApp().createSubmission({
      templateId: "tpl_1",
      data: {},
    }), (error) => {
      assert.equal(error.message, [
        "DocSpring API error 422 invalid_data: The data doesn't match the template's fields: /data/last_name is required",
        "/data/last_name: is required",
        "version: isn't a version",
        "the request as a whole",
        "Submission: sub_1",
        "Request ID: req_1",
      ].join("\n"));
      assert.equal(error.status, 422);
      assert.equal(error.code, "invalid_data");
      assert.equal(error.response.status, 422);
      return true;
    });
  });

  it("says how to get the PDF later after a 504 polling_timeout", async () => {
    respondInOrder(httpError(504, {
      error: {
        code: "polling_timeout",
        message: "Timed out",
        details: [],
        request_id: "req_2",
        submission_id: "sub_2",
      },
    }));
    await assert.rejects(makeApp().createSubmission({
      templateId: "tpl_1",
      sync: true,
    }), {
      message: "The PDF wasn't ready in time. Get it later with Get Submission (sub_2), or use the submission.processed trigger.\nRequest ID: req_2",
    });
  });

  it("names the combined PDF after a 504 on Combine PDFs", async () => {
    respondInOrder(httpError(504, {
      error: {
        code: "polling_timeout",
        message: "Timed out",
        details: [],
        request_id: null,
        combined_pdf_id: "com_1",
      },
    }));
    await assert.rejects(makeApp().createCombinedPdf({}), {
      message: "The PDF wasn't ready in time. Get it later with Get Combined PDF (com_1), or use the combined_pdf.processed trigger.",
    });
  });

  it("tells a self-hosted server without API v2 to upgrade", async () => {
    respondInOrder(httpError(404, "<html>Not Found</html>", "Not Found"));
    await assert.rejects(makeApp({
      region: "self_hosted",
      custom_host: "https://docspring.example.com",
    }).testAuthentication(), {
      message: "This DocSpring server doesn't have API v2 yet. Upgrade it to the latest release.",
    });
  });

  it("reports a v2 not_found from a self-hosted server as it is", async () => {
    respondInOrder(httpError(404, {
      error: {
        code: "not_found",
        message: "Submission not found",
        details: [],
        request_id: "req_3",
      },
    }));
    await assert.rejects(makeApp({
      region: "self_hosted",
      custom_host: "docspring.example.com",
    }).getSubmission({
      submissionId: "sub_x",
    }), {
      message: "DocSpring API error 404 not_found: Submission not found\nRequest ID: req_3",
    });
  });

  it("never prints [object Object] for a body that isn't v2's", async () => {
    respondInOrder(httpError(500, {
      error: {
        unexpected: true,
      },
    }, "Internal Server Error"));
    await assert.rejects(makeApp().getSubmission({
      submissionId: "sub_1",
    }), {
      message: "DocSpring API error 500: Internal Server Error",
    });
  });

  it("turns a network error into one that names the host and never carries the token", async () => {
    const token = Buffer.from("api_test123:secret456").toString("base64");
    // Shaped like the AxiosError @pipedream/platform rethrows when there's no response.
    const networkError = new Error("connect ECONNREFUSED 10.0.0.1:443");
    networkError.name = "AxiosError";
    networkError.code = "ECONNREFUSED";
    networkError.config = {
      url: "https://sync.api.docspring.com/api/v2/combined_pdfs",
      headers: {
        Authorization: `Basic ${token}`,
      },
      auth: {
        username: "api_test123",
        password: "secret456",
      },
    };
    networkError.request = {
      _header: `POST /api/v2/combined_pdfs HTTP/1.1\r\nAuthorization: Basic ${token}\r\n`,
    };
    respondInOrder(networkError);
    let thrown;
    try {
      await makeApp().createCombinedPdf({
        data: {},
      });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, "the request should fail");
    assert.equal(thrown.message, "Couldn't reach DocSpring at https://sync.api.docspring.com: connect ECONNREFUSED 10.0.0.1:443");
    assert.equal(thrown.code, "ECONNREFUSED");
    assert.equal(thrown.config, undefined);
    assert.equal(thrown.request, undefined);
    assert.equal(thrown.cause, undefined);
    const ownProperties = Object.fromEntries(Object.getOwnPropertyNames(thrown).map((key) => [
      key,
      thrown[key],
    ]));
    const everything = [
      JSON.stringify(ownProperties),
      thrown.message,
      thrown.stack,
    ].join("\n");
    for (const secret of [
      "api_test123",
      "secret456",
      token,
    ]) {
      assert.ok(!everything.includes(secret), `the error exposes ${secret}`);
    }
  });

  it("names a self-hosted host in a network error, and keeps a missing host's own message", async () => {
    const networkError = new Error("getaddrinfo ENOTFOUND docspring.example.com");
    networkError.code = "ENOTFOUND";
    respondInOrder(networkError);
    await assert.rejects(makeApp({
      region: "self_hosted",
      custom_host: "docspring.example.com",
    }).getSubmission({
      submissionId: "sub_1",
    }), {
      message: "Couldn't reach DocSpring at https://docspring.example.com: getaddrinfo ENOTFOUND docspring.example.com",
      code: "ENOTFOUND",
    });
    await assert.rejects(makeApp({
      region: "self_hosted",
      custom_host: " ",
    }).getSubmission({
      submissionId: "sub_1",
    }), /A Self-Hosted Host is required/);
  });
});

describe("rate limits", () => {
  const rateLimited = (retryAfter) => httpError(429, {
    error: {
      code: "rate_limited",
      message: `This account has made too many API requests. Try again in ${retryAfter} seconds (the Retry-After header).`,
      details: [],
      request_id: "req_429",
    },
  }, "Too Many Requests", retryAfter === undefined
    ? {}
    : {
      "retry-after": String(retryAfter),
    });

  // The app with its sleep replaced by a recorder, so the tests don't wait.
  const appWithSleeps = () => {
    const sleeps = [];
    const docspring = makeApp();
    docspring._sleep = async (ms) => {
      sleeps.push(ms);
    };
    return {
      docspring,
      sleeps,
    };
  };

  it("waits for Retry-After and sends the same request again", async () => {
    respondInOrder(rateLimited(3), {
      id: "sub_1",
      state: "pending",
    });
    const {
      docspring, sleeps,
    } = appWithSleeps();
    const submission = await docspring.createSubmission({
      templateId: "tpl_1",
      data: {
        data: {
          name: "Jane",
        },
      },
    });
    assert.equal(submission.id, "sub_1");
    assert.deepEqual(sleeps, [
      3000,
    ]);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], requests[0]);
    assert.equal(requests[1].method, "POST");
  });

  it("waits at least a second when Retry-After is missing or zero", async () => {
    respondInOrder(rateLimited(undefined), rateLimited(0), {
      id: "sub_1",
    });
    const {
      docspring, sleeps,
    } = appWithSleeps();
    await docspring.getSubmission({
      submissionId: "sub_1",
    });
    assert.deepEqual(sleeps, [
      1000,
      1000,
    ]);
  });

  it("fails at once with the API error when Retry-After doesn't fit in 20 seconds", async () => {
    respondInOrder(rateLimited(21));
    const {
      docspring, sleeps,
    } = appWithSleeps();
    await assert.rejects(docspring.createSubmission({
      templateId: "tpl_1",
      data: {},
    }), (error) => {
      assert.match(error.message, /^DocSpring API error 429 rate_limited: This account has made too many API requests/);
      assert.match(error.message, /Request ID: req_429$/);
      assert.equal(error.status, 429);
      return true;
    });
    assert.deepEqual(sleeps, []);
    assert.equal(requests.length, 1);
  });

  it("stops waiting when the total would pass 20 seconds", async () => {
    respondInOrder(rateLimited(8), rateLimited(8), rateLimited(8));
    const {
      docspring, sleeps,
    } = appWithSleeps();
    await assert.rejects(docspring.getTemplate({
      templateId: "tpl_1",
    }), /429 rate_limited/);
    assert.deepEqual(sleeps, [
      8000,
      8000,
    ]);
    assert.equal(requests.length, 3);
  });

  it("doesn't retry other errors", async () => {
    respondInOrder(httpError(503, {
      error: {
        code: "service_unavailable",
        message: "Try again later",
        details: [],
        request_id: "req_503",
      },
    }, "Service Unavailable", {
      "retry-after": "1",
    }));
    const {
      docspring, sleeps,
    } = appWithSleeps();
    await assert.rejects(docspring.getTemplate({
      templateId: "tpl_1",
    }), /503 service_unavailable/);
    assert.deepEqual(sleeps, []);
  });

  it("lets Create Signature Request make its links after a 429, or name the submission when it can't", async () => {
    const action = await loadComponent("actions/create-signature-request/create-signature-request.mjs");
    const run = async (...responses) => {
      reset();
      respondInOrder(...responses);
      const { docspring } = appWithSleeps();
      return action.run.call({
        ...action.methods,
        docspring,
        templateId: "tpl_1",
        numberOfSigners: 1,
        signer1Fields: [
          "signature",
        ],
        signingLinkType: "email",
      }, {
        $: {
          export() {},
        },
      });
    };
    const submission = {
      id: "sub_1",
      signature_requests: [
        {
          id: "srq_1",
          state: "pending",
        },
      ],
    };
    const result = await run(submission, rateLimited(12), {
      signature_request_url: "https://app.docspring.com/sign/x",
    });
    assert.equal(result.first_signing_url, "https://app.docspring.com/sign/x");
    await assert.rejects(run(submission, rateLimited(60)), /^Error: Created submission sub_1, but couldn't create a signing link for signature request srq_1/);
  });
});

describe("pickers", () => {
  const optionsFor = (prop, args) => app.propDefinitions[prop].options.call(makeApp(), args);

  it("pages templates with prevContext and stops after the last page", async () => {
    respondInOrder({
      data: [
        {
          id: "tpl_1",
          name: "Lease",
          path: "/",
        },
        {
          id: "tpl_2",
          name: "Invoice",
          path: "/Billing",
        },
      ],
      next_cursor: "tpl_2",
    }, {
      data: [
        {
          id: "tpl_3",
          name: null,
          path: "/",
        },
      ],
      next_cursor: null,
    });
    const first = await optionsFor("templateId", {
      prevContext: {},
    });
    assert.deepEqual(first.options, [
      {
        label: "Lease",
        value: "tpl_1",
      },
      {
        label: "/Billing/Invoice",
        value: "tpl_2",
      },
    ]);
    assert.deepEqual(requests[0].params, {
      limit: 100,
    });
    const second = await optionsFor("templateId", {
      prevContext: first.context,
    });
    assert.deepEqual(requests[1].params, {
      limit: 100,
      cursor: "tpl_2",
    });
    assert.deepEqual(second.options, [
      {
        label: "tpl_3",
        value: "tpl_3",
      },
    ]);
    const third = await optionsFor("templateId", {
      prevContext: second.context,
    });
    assert.deepEqual(third.options, []);
    assert.equal(requests.length, 2);
  });

  it("stops loading options at 1,000", async () => {
    const done = await optionsFor("templateId", {
      prevContext: {
        cursor: "tpl_999",
        count: 1000,
      },
    });
    assert.deepEqual(done.options, []);
    assert.equal(requests.length, 0);
  });

  it("offers the root folder first when asked", async () => {
    respondInOrder({
      data: [
        {
          id: "fld_1",
          name: "Leases",
          path: "/Leases",
        },
      ],
      next_cursor: null,
    });
    const { options } = await optionsFor("folderId", {
      prevContext: {},
      includeRoot: true,
    });
    assert.deepEqual(options, [
      {
        label: "/ (root folder)",
        value: "root",
      },
      {
        label: "/Leases",
        value: "fld_1",
      },
    ]);
  });
});

describe("paginate", () => {
  it("follows next_cursor and stops at max", async () => {
    respondInOrder({
      data: [
        {
          id: 1,
        },
        {
          id: 2,
        },
      ],
      next_cursor: "c2",
    }, {
      data: [
        {
          id: 3,
        },
        {
          id: 4,
        },
      ],
      next_cursor: "c4",
    });
    const docspring = makeApp();
    const items = [];
    for await (const item of docspring.paginate({
      fn: docspring.listSubmissions,
      args: {
        params: {
          test: true,
        },
      },
      max: 3,
    })) {
      items.push(item.id);
    }
    assert.deepEqual(items, [
      1,
      2,
      3,
    ]);
    assert.deepEqual(requests.map((r) => r.params), [
      {
        test: true,
        limit: 3,
      },
      {
        test: true,
        limit: 1,
        cursor: "c2",
      },
    ]);
  });
});
