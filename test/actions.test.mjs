import {
  beforeEach, describe, it,
} from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  httpError, loadComponent, requests, reset, respondInOrder, runAction,
} from "./support.mjs";

const action = (name) => loadComponent(`actions/${name}/${name}.mjs`);

beforeEach(reset);

describe("Generate PDF", async () => {
  const generatePdf = await action("generate-pdf");

  it("puts version and wait in the query and leaves out blank inputs and test: false", async () => {
    respondInOrder({
      id: "sub_1",
      state: "processed",
    });
    const { summary } = await runAction(generatePdf, {
      templateId: "tpl_1",
      templateVersion: "draft",
      data: {
        first_name: "Jane",
      },
      test: false,
      password: "",
      metadata: undefined,
      outputFormats: [],
      wait: true,
    });
    assert.deepEqual(requests[0], {
      method: "POST",
      url: "https://sync.api.docspring.com/api/v2/templates/tpl_1/submissions",
      params: {
        version: "draft",
        wait: true,
      },
      data: {
        data: {
          first_name: "Jane",
        },
      },
      headers: requests[0].headers,
    });
    assert.equal(summary, "Generated PDF for submission sub_1 (processed)");
  });

  it("sends every filled-in input, with real booleans and integers", async () => {
    respondInOrder({
      id: "sub_1",
      state: "pending",
    });
    await runAction(generatePdf, {
      templateId: "tpl_1",
      data: "{\"a\": 1}",
      test: true,
      metadata: {
        order_id: "1",
      },
      outputFormats: [
        "pdf",
        "png",
      ],
      password: "pw",
      expiresIn: "3600",
      fieldOverrides: "{\"a\": {\"required\": false}}",
      editable: "true",
      wait: false,
    });
    assert.deepEqual(requests[0].params, {
      wait: false,
    });
    assert.deepEqual(requests[0].data, {
      data: {
        a: 1,
      },
      test: true,
      metadata: {
        order_id: "1",
      },
      output_formats: [
        "pdf",
        "png",
      ],
      password: "pw",
      expires_in: 3600,
      field_overrides: {
        a: {
          required: false,
        },
      },
      editable: true,
    });
  });

  it("sends empty data when none is given", async () => {
    respondInOrder({
      id: "sub_1",
      state: "processed",
    });
    await runAction(generatePdf, {
      templateId: "tpl_1",
    });
    assert.deepEqual(requests[0].data, {
      data: {},
    });
  });

  it("fails on a 201 with a failed state", async () => {
    respondInOrder({
      id: "sub_1",
      state: "image_download_failed",
      error_message: "Couldn't download https://example.com/logo.png",
    });
    await assert.rejects(runAction(generatePdf, {
      templateId: "tpl_1",
    }), {
      message: "Submission sub_1 failed (state: image_download_failed): Couldn't download https://example.com/logo.png",
    });
  });

  it("rejects an expiry that isn't a whole number", async () => {
    await assert.rejects(runAction(generatePdf, {
      templateId: "tpl_1",
      expiresIn: "soon",
    }), /Expires In must be a whole number/);
    assert.equal(requests.length, 0);
  });
});

describe("Generate PDFs in a Batch", async () => {
  const batchAction = await action("generate-pdfs-in-a-batch");

  it("sends template_version in the body and wait in the query", async () => {
    respondInOrder({
      id: "sbb_1",
      state: "processed",
      total_count: 2,
    });
    await runAction(batchAction, {
      templateId: "tpl_1",
      templateVersion: "1.2.0",
      submissions: [
        "[{\"data\": {\"a\": 1}}, {\"data\": {\"a\": 2}}]",
      ],
      test: true,
    });
    assert.equal(requests[0].url, "https://sync.api.docspring.com/api/v2/submissions/batches");
    assert.deepEqual(requests[0].params, {
      wait: true,
    });
    assert.deepEqual(requests[0].data, {
      template_id: "tpl_1",
      template_version: "1.2.0",
      test: true,
      submissions: [
        {
          data: {
            a: 1,
          },
        },
        {
          data: {
            a: 2,
          },
        },
      ],
    });
  });

  it("fails when the batch comes back in the error state", async () => {
    respondInOrder({
      id: "sbb_1",
      state: "error",
      total_count: 2,
      error_count: 1,
      submissions: [
        {
          id: "sub_1",
          state: "processed",
        },
        {
          id: "sub_2",
          state: "error",
          error_message: "Bad image",
        },
      ],
    });
    await assert.rejects(runAction(batchAction, {
      submissions: [
        {
          template_id: "tpl_1",
          data: {},
        },
      ],
    }), {
      message: "Submission batch sbb_1 failed (state: error): 1 of 2 submissions failed\nsub_2 (error): Bad image",
    });
  });
});

describe("Combine PDFs", async () => {
  const combine = await action("combine-pdfs");

  it("posts v2 sources to /combined_pdfs on the sync host", async () => {
    respondInOrder({
      id: "com_1",
      state: "processed",
    });
    await runAction(combine, {
      sourcePdfs: [
        "{\"type\": \"submission\", \"id\": \"sub_1\"}",
        {
          type: "combined_pdf",
          id: "com_0",
        },
        {
          type: "template",
          id: "tpl_1",
          template_version: "draft",
          processed: "false",
        },
        {
          type: "url",
          url: "https://example.com/a.pdf",
          id: "ignored",
        },
      ],
      expiresIn: 60,
    });
    assert.equal(requests[0].url, "https://sync.api.docspring.com/api/v2/combined_pdfs");
    assert.deepEqual(requests[0].params, {
      wait: true,
    });
    assert.deepEqual(requests[0].data, {
      source_pdfs: [
        {
          type: "submission",
          id: "sub_1",
        },
        {
          type: "combined_pdf",
          id: "com_0",
        },
        {
          type: "template",
          id: "tpl_1",
          template_version: "draft",
          processed: false,
        },
        {
          type: "url",
          url: "https://example.com/a.pdf",
        },
      ],
      expires_in: 60,
    });
  });

  it("rejects template_version on a source that isn't a template", async () => {
    await assert.rejects(runAction(combine, {
      sourcePdfs: [
        {
          type: "submission",
          id: "sub_1",
          template_version: "1",
        },
      ],
    }), /only apply to `template` sources/);
  });

  it("rejects v1's combined_submission type", async () => {
    await assert.rejects(runAction(combine, {
      sourcePdfs: [
        {
          type: "combined_submission",
          id: "com_1",
        },
      ],
    }), /needs a `type` of/);
  });

  it("fails when the combined PDF comes back in the error state", async () => {
    respondInOrder({
      id: "com_1",
      state: "error",
      error_message: "Source PDF 2 isn't a PDF",
    });
    await assert.rejects(runAction(combine, {
      sourcePdfs: [
        {
          type: "submission",
          id: "sub_1",
        },
      ],
    }), {
      message: "Combined PDF com_1 failed (state: error): Source PDF 2 isn't a PDF",
    });
  });
});

describe("Create Signature Request", async () => {
  const createSignatureRequest = await action("create-signature-request");
  const created = {
    id: "sub_1",
    state: "waiting_for_signature_requests",
    signature_requests: [
      {
        id: "srq_1",
        state: "pending",
      },
      {
        id: "srq_2",
        state: "pending",
      },
    ],
  };

  it("creates signature_requests on the standard host, then an email link for each", async () => {
    respondInOrder(created, {
      signature_request_url: "https://app.docspring.com/sign/1",
    }, {
      signature_request_url: "https://app.docspring.com/sign/2",
    });
    const { result } = await runAction(createSignatureRequest, {
      templateId: "tpl_1",
      templateVersion: "1",
      numberOfSigners: 2,
      data: {
        landlord: "Jane",
      },
      test: false,
      signer1Name: "Tenant",
      signer1Email: "tenant@example.com",
      signer1Fields: [
        "tenant_name",
        "tenant_signature",
      ],
      signer1PrefilledValuesEditable: true,
      signer2Fields: "guarantor_signature",
      signer2AuthType: "oauth",
      signer2AuthProvider: "google",
    });
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/templates/tpl_1/submissions");
    assert.deepEqual(requests[0].params, {
      version: "1",
    });
    assert.deepEqual(requests[0].data, {
      data: {
        landlord: "Jane",
      },
      signature_requests: [
        {
          name: "Tenant",
          email: "tenant@example.com",
          fields: [
            "tenant_name",
            "tenant_signature",
          ],
          auth_type: "email_link",
          prefilled_values_editable: true,
        },
        {
          fields: [
            "guarantor_signature",
          ],
          auth_type: "oauth",
          auth_provider: "google",
        },
      ],
    });
    assert.equal(requests[1].url, "https://api.docspring.com/api/v2/signature_requests/srq_1/tokens");
    assert.deepEqual(requests[1].data, {
      type: "email",
    });
    assert.equal(requests[1].params, undefined);
    assert.equal(requests[2].url, "https://api.docspring.com/api/v2/signature_requests/srq_2/tokens");
    assert.deepEqual(result.signature_requests.map((s) => s.signing_url), [
      "https://app.docspring.com/sign/1",
      "https://app.docspring.com/sign/2",
    ]);
    assert.equal(result.first_signature_request_id, "srq_1");
    assert.equal(result.first_signing_url, "https://app.docspring.com/sign/1");
    assert.equal(result.data_requests, undefined);
  });

  it("makes no links when the link type is none", async () => {
    respondInOrder(created);
    const { result } = await runAction(createSignatureRequest, {
      templateId: "tpl_1",
      numberOfSigners: 2,
      signingLinkType: "none",
      signer1Fields: [
        "a",
      ],
      signer2Fields: [
        "b",
      ],
    });
    assert.equal(requests.length, 1);
    assert.equal(result.first_signing_url, null);
    assert.equal(result.first_signature_request_id, "srq_1");
  });

  it("needs fields for every signer", async () => {
    await assert.rejects(runAction(createSignatureRequest, {
      templateId: "tpl_1",
      numberOfSigners: 1,
    }), /Signer 1 needs the names of the fields/);
  });

  it("needs a provider for oauth", async () => {
    await assert.rejects(runAction(createSignatureRequest, {
      templateId: "tpl_1",
      signer1Fields: [
        "a",
      ],
      signer1AuthType: "oauth",
    }), /needs an \*\*Authentication Provider\*\*/);
  });

  it("needs a role on every signer or none", async () => {
    await assert.rejects(runAction(createSignatureRequest, {
      templateId: "tpl_1",
      numberOfSigners: 2,
      signer1Fields: [
        "a",
      ],
      signer1Role: "Signer 1",
      signer2Fields: [
        "b",
      ],
    }), /Give every signer a role, or none of them/);
  });

  it("names the submission when a signing link fails", async () => {
    respondInOrder(created, httpError(409, {
      error: {
        code: "conflict",
        message: "Already completed",
        details: [],
        request_id: "req_1",
      },
    }));
    await assert.rejects(runAction(createSignatureRequest, {
      templateId: "tpl_1",
      signer1Fields: [
        "a",
      ],
    }), /Created submission sub_1, but couldn't create a signing link for signature request srq_1/);
  });

  it("offers the template's fillable field names as each signer's fields", async () => {
    respondInOrder({
      template_id: "tpl_1",
      fields: [
        {
          name: "tenant_name",
        },
        {
          name: "tenant_name",
        },
        {
          name: "@@date",
        },
        {
          name: "heading",
          static: true,
        },
        {
          name: "full_name",
          type: "combined",
        },
        {
          name: "tenant_signature",
          type: "signature",
        },
      ],
    });
    const props = await createSignatureRequest.additionalProps.call({
      templateId: "tpl_1",
      numberOfSigners: 2,
      docspring: (await import("./support.mjs")).makeApp(),
    });
    assert.deepEqual(requests[0].params, {
      version: "latest",
    });
    assert.deepEqual(props.signer1Fields.options, [
      "tenant_name",
      "tenant_signature",
    ]);
    assert.ok(props.signer2Email);
    assert.equal(props.signer3Fields, undefined);
  });
});

describe("Create Signing Link", async () => {
  const createSigningLink = await action("create-signing-link");

  it("sends the type in the body and returns the token", async () => {
    const token = {
      id: "tok_1",
      signature_request_url: "https://app.docspring.com/sign/1",
      expires_at: "2026-01-01T00:00:00Z",
    };
    respondInOrder(token);
    const { result } = await runAction(createSigningLink, {
      signatureRequestId: "srq_1",
      signingLinkType: "api",
    });
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/signature_requests/srq_1/tokens");
    assert.deepEqual(requests[0].data, {
      type: "api",
    });
    assert.deepEqual(result, token);
  });
});

describe("Find Templates and Find Submissions", async () => {
  const findTemplates = await action("find-templates");
  const findSubmissions = await action("find-submissions");

  it("finds templates with a name and folder, following next_cursor", async () => {
    respondInOrder({
      data: [
        {
          id: "tpl_1",
        },
      ],
      next_cursor: "tpl_1",
    }, {
      data: [
        {
          id: "tpl_2",
        },
      ],
      next_cursor: null,
    });
    const { result } = await runAction(findTemplates, {
      query: "lease",
      folderId: "fld_1",
      maxResults: 10,
    });
    assert.deepEqual(result.map((t) => t.id), [
      "tpl_1",
      "tpl_2",
    ]);
    assert.deepEqual(requests[1].params, {
      query: "lease",
      parent_folder_id: "fld_1",
      limit: 9,
      cursor: "tpl_1",
    });
  });

  it("rejects a Max Results below 1", async () => {
    await assert.rejects(runAction(findTemplates, {
      maxResults: 0,
    }), /Max Results must be at least 1/);
  });

  it("finds a template's live submissions with v2's test filter", async () => {
    respondInOrder({
      data: [],
      next_cursor: null,
    });
    await runAction(findSubmissions, {
      templateId: "tpl_1",
      mode: "live",
      createdAfter: "2026-01-01T00:00:00Z",
      includeData: true,
    });
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/templates/tpl_1/submissions");
    assert.deepEqual(requests[0].params, {
      test: false,
      created_after: "2026-01-01T00:00:00Z",
      include_data: true,
      limit: 50,
    });
  });

  it("finds every template's submissions without a test filter for any", async () => {
    respondInOrder({
      data: [],
      next_cursor: null,
    });
    await runAction(findSubmissions, {
      mode: "any",
      includeData: false,
    });
    assert.equal(requests[0].url, "https://api.docspring.com/api/v2/submissions");
    assert.deepEqual(requests[0].params, {
      limit: 50,
    });
  });
});

describe("submission and signature request lookups", async () => {
  it("gets, checks, expires and makes files", async () => {
    respondInOrder({
      id: "sub_1",
      state: "processed",
    }, {
      id: "sbb_1",
      state: "processed",
      total_count: 1,
      pending_count: 0,
      error_count: 0,
    }, {
      valid: false,
      template_id: "tpl_1",
      error: {
        details: [
          {},
          {},
        ],
      },
    }, {
      id: "sub_1",
      state: "processed",
      expired: true,
    }, {
      id: "com_1",
      state: "processed",
    }, {
      id: "srq_1",
      state: "completed",
    });
    await runAction(await action("get-submission"), {
      submissionId: "sub_1",
    });
    await runAction(await action("get-submission-batch"), {
      submissionBatchId: "sbb_1",
      includeData: true,
    });
    const check = await runAction(await action("check-data"), {
      templateId: "tpl_1",
      data: {},
      test: true,
      signatureRequests: [
        "{\"fields\": [\"a\"], \"auth_type\": \"email_link\"}",
      ],
    });
    await runAction(await action("expire-submission"), {
      submissionId: "sub_1",
    });
    await runAction(await action("get-combined-pdf"), {
      combinedPdfId: "com_1",
    });
    await runAction(await action("get-signature-request"), {
      signatureRequestId: "srq_1",
    });
    assert.deepEqual(requests.map((r) => `${r.method} ${r.url}`), [
      "GET https://api.docspring.com/api/v2/submissions/sub_1",
      "GET https://api.docspring.com/api/v2/submissions/batches/sbb_1",
      "POST https://api.docspring.com/api/v2/templates/tpl_1/submissions/validate",
      "DELETE https://api.docspring.com/api/v2/submissions/sub_1",
      "GET https://api.docspring.com/api/v2/combined_pdfs/com_1",
      "GET https://api.docspring.com/api/v2/signature_requests/srq_1",
    ]);
    assert.deepEqual(requests[1].params, {
      include_data: true,
    });
    assert.deepEqual(requests[2].data, {
      data: {},
      test: true,
      signature_requests: [
        {
          fields: [
            "a",
          ],
          auth_type: "email_link",
        },
      ],
    });
    assert.equal(check.summary, "The data isn't valid for template tpl_1: 2 problem(s)");
  });

  it("generates png files on the sync host and fails when one fails", async () => {
    const generateFiles = await action("generate-submission-files");
    respondInOrder({
      id: "sub_1",
      files: {
        png: {
          state: "error",
          error_message: "Too many pages",
        },
      },
    });
    await assert.rejects(runAction(generateFiles, {
      submissionId: "sub_1",
      formats: [
        "png",
      ],
      wait: true,
    }), {
      message: "Submission sub_1's png file failed (state: error): Too many pages",
    });
    assert.equal(requests[0].url, "https://sync.api.docspring.com/api/v2/submissions/sub_1/generate_files");
    assert.deepEqual(requests[0].params, {
      wait: true,
    });
    assert.deepEqual(requests[0].data, {
      formats: [
        "png",
      ],
    });
  });
});

describe("templates", async () => {
  const createTemplate = await action("create-template");
  const replacePdf = await action("replace-template-pdf");

  it("creates a PDF template from an https URL with AI field detection", async () => {
    respondInOrder({
      id: "tpl_1",
      name: "Lease",
      document: {
        state: "processed",
      },
    });
    await runAction(createTemplate, {
      name: "Lease",
      templateType: "pdf",
      document: "https://example.com/lease.pdf",
      detectFields: true,
      fieldLogic: "none",
      folderId: "fld_1",
    });
    assert.equal(requests[0].url, "https://sync.api.docspring.com/api/v2/templates");
    assert.deepEqual(requests[0].params, {
      wait: true,
    });
    assert.deepEqual(requests[0].data, {
      name: "Lease",
      template_type: "pdf",
      parent_folder_id: "fld_1",
      document_url: "https://example.com/lease.pdf",
      detect_fields: true,
      field_logic: "none",
    });
  });

  it("sends a file in /tmp as base64 with its name", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "docspring-test-"));
    const file = path.join(dir, "lease.pdf");
    writeFileSync(file, "%PDF-1.4 test");
    try {
      respondInOrder({
        id: "tpl_1",
        name: "Lease",
        document: {
          state: "processed",
        },
      });
      await runAction(replacePdf, {
        templateId: "tpl_1",
        document: file,
        reimportFields: true,
      });
      assert.equal(requests[0].method, "PUT");
      assert.equal(requests[0].url, "https://sync.api.docspring.com/api/v2/templates/tpl_1/document");
      assert.deepEqual(requests[0].data, {
        document_base64: Buffer.from("%PDF-1.4 test").toString("base64"),
        filename: "lease.pdf",
        reimport_fields: true,
      });
    } finally {
      rmSync(dir, {
        recursive: true,
      });
    }
  });

  it("creates an HTML template", async () => {
    respondInOrder({
      id: "tpl_2",
      name: "Invoice",
      document: null,
    });
    await runAction(createTemplate, {
      name: "Invoice",
      templateType: "html",
      html: "<h1>{{ name }}</h1>",
      scss: "h1 { color: red; }",
      footerHtml: "<p>1</p>",
      wait: false,
    });
    assert.deepEqual(requests[0].params, {
      wait: false,
    });
    assert.deepEqual(requests[0].data, {
      name: "Invoice",
      template_type: "html",
      html: "<h1>{{ name }}</h1>",
      scss: "h1 { color: red; }",
      footer_html: "<p>1</p>",
    });
  });

  it("rejects inputs for the other template type, and detection settings without Detect Fields", async () => {
    await assert.rejects(runAction(createTemplate, {
      name: "x",
      templateType: "pdf",
      document: "https://example.com/a.pdf",
      html: "<p></p>",
    }), /HTML only apply to HTML templates/);
    await assert.rejects(runAction(createTemplate, {
      name: "x",
      templateType: "html",
      document: "https://example.com/a.pdf",
    }), /PDF File or URL only apply to PDF templates/);
    await assert.rejects(runAction(createTemplate, {
      name: "x",
      document: "https://example.com/a.pdf",
      fieldNaming: "preserve",
    }), /Field Naming only apply with \*\*Detect Fields\*\* on/);
    assert.equal(requests.length, 0);
  });

  it("fails when the template's PDF couldn't be processed", async () => {
    respondInOrder({
      id: "tpl_1",
      document: {
        state: "password_required",
        error_message: "The PDF needs a password",
      },
    });
    await assert.rejects(runAction(createTemplate, {
      name: "x",
      document: "https://example.com/a.pdf",
    }), {
      message: "Template tpl_1's PDF failed (state: password_required): The PDF needs a password",
    });
  });

  it("moves, copies, publishes and lists", async () => {
    respondInOrder({
      id: "tpl_1",
      path: "/",
    }, {
      id: "tpl_2",
      name: "Copy",
    }, {
      id: "tpl_3",
      name: "Copy",
    }, {
      version: "1.1.0",
    }, {
      template_id: "tpl_1",
      fields: [],
    }, {
      template_id: "tpl_1",
      pages: [],
    });
    await runAction(await action("move-template"), {
      templateId: "tpl_1",
      folderId: "root",
    });
    await runAction(await action("copy-template"), {
      templateId: "tpl_1",
      publishedVersion: "1",
    });
    await runAction(await action("copy-template"), {
      templateId: "tpl_1",
      folderId: "root",
      name: "Copy",
    });
    await runAction(await action("publish-template-version"), {
      templateId: "tpl_1",
      versionType: "minor",
    });
    await runAction(await action("list-template-fields"), {
      templateId: "tpl_1",
      templateVersion: "latest",
    });
    await runAction(await action("get-template-page-images"), {
      templateId: "tpl_1",
    });
    assert.deepEqual(requests.map((r) => [
      `${r.method} ${r.url}`,
      r.data ?? r.params ?? null,
    ]), [
      [
        "POST https://api.docspring.com/api/v2/templates/tpl_1/move",
        {
          parent_folder_id: null,
        },
      ],
      [
        "POST https://api.docspring.com/api/v2/templates/tpl_1/copy",
        {
          version: "1",
        },
      ],
      [
        "POST https://api.docspring.com/api/v2/templates/tpl_1/copy",
        {
          name: "Copy",
          parent_folder_id: null,
        },
      ],
      [
        "POST https://api.docspring.com/api/v2/templates/tpl_1/publish_version",
        {
          version_type: "minor",
        },
      ],
      [
        "GET https://api.docspring.com/api/v2/templates/tpl_1/fields",
        {
          version: "latest",
        },
      ],
      [
        "GET https://api.docspring.com/api/v2/templates/tpl_1/page_images",
        {},
      ],
    ]);
  });

  it("adds, updates and removes fields", async () => {
    respondInOrder({
      template_id: "tpl_1",
    }, {
      template_id: "tpl_1",
    }, {
      template_id: "tpl_1",
    });
    await runAction(await action("add-template-fields"), {
      templateId: "tpl_1",
      fields: [
        "{\"name\": \"email\", \"page\": 1, \"type\": \"email\"}",
      ],
    });
    await runAction(await action("update-template-fields"), {
      templateId: "tpl_1",
      fields: "[{\"id\": \"12\", \"required\": false}]",
    });
    await runAction(await action("remove-template-fields"), {
      templateId: "tpl_1",
      fieldIds: [
        "12",
        "15",
      ],
    });
    assert.deepEqual(requests.map((r) => [
      `${r.method} ${r.url}`,
      r.data,
    ]), [
      [
        "POST https://api.docspring.com/api/v2/templates/tpl_1/fields",
        {
          fields: [
            {
              name: "email",
              page: 1,
              type: "email",
            },
          ],
        },
      ],
      [
        "PUT https://api.docspring.com/api/v2/templates/tpl_1/fields",
        {
          fields: [
            {
              id: 12,
              required: false,
            },
          ],
        },
      ],
      [
        "POST https://api.docspring.com/api/v2/templates/tpl_1/fields/remove",
        {
          field_ids: [
            12,
            15,
          ],
        },
      ],
    ]);
  });

  it("rejects a field ID that isn't a whole number", async () => {
    await assert.rejects(runAction(await action("remove-template-fields"), {
      templateId: "tpl_1",
      fieldIds: [
        "email",
      ],
    }), /Field ID must be a whole number/);
    await assert.rejects(runAction(await action("update-template-fields"), {
      templateId: "tpl_1",
      fields: [
        {
          required: false,
        },
      ],
    }), /needs the field's `id`/);
  });
});

describe("folders", async () => {
  it("lists and creates folders", async () => {
    respondInOrder({
      data: [
        {
          id: "fld_2",
        },
      ],
      next_cursor: null,
    }, {
      id: "fld_3",
      path: "/Leases/2026",
    });
    const list = await runAction(await action("list-folders"), {
      parentFolderId: "fld_1",
    });
    await runAction(await action("create-folder"), {
      name: "2026",
      parentFolderId: "fld_1",
    });
    assert.deepEqual(list.result, [
      {
        id: "fld_2",
      },
    ]);
    assert.deepEqual(requests[0].params, {
      parent_folder_id: "fld_1",
      limit: 50,
    });
    assert.equal(requests[1].url, "https://api.docspring.com/api/v2/folders");
    assert.deepEqual(requests[1].data, {
      name: "2026",
      parent_folder_id: "fld_1",
    });
  });
});
