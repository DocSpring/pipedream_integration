import { axios } from "@pipedream/platform";
import constants from "./common/constants.mjs";
import utils from "./common/utils.mjs";

export default {
  type: "app",
  app: "docspring",
  propDefinitions: {
    templateId: {
      type: "string",
      label: "Template",
      description: "The ID of the template, e.g. `tpl_1234567890abcdef01`."
        + " Use **Find Templates** to find it (the `id` field).",
      async options({ prevContext }) {
        return this._paginateOptions({
          prevContext,
          list: (params) => this.listTemplates({
            params,
          }),
          toOption: (template) => ({
            label: template.path && template.path !== "/"
              ? `${template.path}/${template.name || template.id}`
              : template.name || template.id,
            value: template.id,
          }),
        });
      },
    },
    templateVersion: {
      type: "string",
      label: "Template Version",
      description: "The template version to use: a published version such as `1.2.0` (or `1` for the latest 1.x.x), `latest` or `draft`, e.g. `draft`."
        + " Leave blank for the latest published version (the draft when none has been published).",
      optional: true,
    },
    data: {
      type: "object",
      label: "Data",
      description: "The values of the template's fields, by field name, e.g. `{\"first_name\": \"Jane\", \"start_date\": \"2026-01-31\"}`."
        + " Dates are `YYYY-MM-DD`. Use **List Template Fields** to see the template's field names.",
      optional: true,
    },
    test: {
      type: "boolean",
      label: "Test",
      description: "`true` makes a free test PDF with a watermark; `false` (the default) makes a live PDF, which uses credits."
        + " A test API token always makes test PDFs. e.g. `true`.",
      optional: true,
      default: false,
    },
    metadata: {
      type: "object",
      label: "Metadata",
      description: "Your own data to store with the record, such as an ID from your app. It isn't printed on the PDF."
        + " e.g. `{\"order_id\": \"1234\"}`.",
      optional: true,
    },
    outputFormats: {
      type: "string[]",
      label: "Output Formats",
      description: "What to make: `pdf`, and `png` for an image of each page (up to 100 pages), e.g. `[\"pdf\", \"png\"]`."
        + " Leave blank for just the PDF.",
      options: constants.OUTPUT_FORMAT_OPTIONS,
      optional: true,
    },
    password: {
      type: "string",
      label: "PDF Password",
      description: "A password the PDF needs to be opened with, e.g. `s3cret-pass`. It's never returned.",
      optional: true,
      secret: true,
    },
    expiresIn: {
      type: "integer",
      label: "Expires In (Seconds)",
      description: "Seconds after the PDF is made until its data and files are deleted, up to 10 years (`315360000`), e.g. `86400` for a day."
        + " Leave blank for the template's expiration setting.",
      optional: true,
      min: 1,
      max: 315360000,
    },
    fieldOverrides: {
      type: "object",
      label: "Field Overrides",
      description: "Advanced: changes to field settings for this PDF only, by field name, e.g. `{\"name\": {\"required\": false, \"font_size\": 9}}`."
        + " [See the documentation](https://docspring.com/docs/api/#tag/submissions/post/templates/{template_id}/submissions).",
      optional: true,
    },
    editable: {
      type: "boolean",
      label: "Editable",
      description: "`true` keeps the PDF's text and check fields fillable, `false` flattens them, e.g. `true`."
        + " Leave blank to use the template's setting.",
      optional: true,
    },
    wait: {
      type: "boolean",
      label: "Wait for the PDF",
      description: "`true` (the default) waits until the PDF is ready and returns it in its final state."
        + " `false` returns at once with a pending record: get it later with the matching **Get** action or the **New Event (Instant)** trigger. e.g. `true`.",
      optional: true,
      default: true,
    },
    submissionId: {
      type: "string",
      label: "Submission ID",
      description: "The ID of the submission, e.g. `sub_1234567890abcdef01`."
        + " Use **Find Submissions** to find it, or take the `id` from **Generate PDF**.",
    },
    submissionBatchId: {
      type: "string",
      label: "Submission Batch ID",
      description: "The ID of the batch, e.g. `sbb_1234567890abcdef01`."
        + " Take it from the `id` that **Generate PDFs in a Batch** returns.",
    },
    combinedPdfId: {
      type: "string",
      label: "Combined PDF ID",
      description: "The ID of the combined PDF, e.g. `com_1234567890abcdef01`."
        + " Take it from the `id` that **Combine PDFs** returns.",
    },
    signatureRequestId: {
      type: "string",
      label: "Signature Request ID",
      description: "The ID of the signature request, e.g. `srq_1234567890abcdef01`."
        + " Take it from `signature_requests[].id` in **Create Signature Request** or **Get Submission**.",
    },
    folderId: {
      type: "string",
      label: "Folder",
      description: "The ID of the folder, e.g. `fld_1234567890abcdef01`. Use **List Folders** to find it (the `id` field).",
      async options({
        prevContext, includeRoot,
      }) {
        const result = await this._paginateOptions({
          prevContext,
          list: (params) => this.listFolders({
            params,
          }),
          toOption: (folder) => ({
            label: folder.path || folder.name,
            value: folder.id,
          }),
        });
        if (includeRoot && !prevContext?.count) {
          result.options.unshift({
            label: "/ (root folder)",
            value: "root",
          });
        }
        return result;
      },
    },
    maxResults: {
      type: "integer",
      label: "Max Results",
      description: "The most items to return, e.g. `50`. Defaults to `50`.",
      optional: true,
      default: constants.DEFAULT_MAX_RESULTS,
      min: 1,
    },
    includeData: {
      type: "boolean",
      label: "Include Data",
      description: "`true` includes each submission's field values in `data`; `false` (the default) returns `data` as null. e.g. `true`.",
      optional: true,
      default: false,
    },
    fieldIds: {
      type: "string[]",
      label: "Fields",
      description: "The IDs of the template's fields (whole numbers), e.g. `[\"12\", \"15\"]`."
        + " Use **List Template Fields** to find them (the `fields[].id` field).",
      async options({ templateId }) {
        if (!templateId) {
          return [];
        }
        const { fields } = await this.listTemplateFields({
          templateId,
        });
        return (fields || []).map((field) => ({
          label: `${field.name || "(no name)"} (ID ${field.id}, page ${field.page})`,
          value: String(field.id),
        }));
      },
    },
    document: {
      type: "string",
      label: "PDF File or URL",
      description: "The PDF: a public `https://` URL that DocSpring downloads (up to 100 MB), e.g. `https://example.com/form.pdf`,"
        + " or a file in `/tmp` (up to 7 MB), e.g. `/tmp/form.pdf`.",
      format: "file-ref",
    },
    filename: {
      type: "string",
      label: "File Name",
      description: "The PDF's file name, e.g. `rental-agreement.pdf`. Leave blank to use the file's or the URL's name.",
      optional: true,
    },
    signingLinkType: {
      type: "string",
      label: "Signing Link Type",
      description: "`email` links open the signing form for 7 days, for a link you send by email."
        + " `api` links open it for 24 hours, for a link your app opens or gives the person right away. e.g. `email`.",
      options: constants.SIGNING_LINK_TYPE_OPTIONS,
      default: "email",
    },
    eventTypes: {
      type: "string[]",
      label: "Events",
      description: "The DocSpring events to emit, e.g. `[\"submission.processed\", \"signature_request.completed\"]`.",
      options: constants.EVENT_TYPE_OPTIONS,
    },
  },
  methods: {
    /**
     * The connected account's region: `us`, `eu` or `self_hosted`.
     * @returns {string}
     */
    _region() {
      return String(this.$auth.region || "us").toLowerCase();
    },
    /**
     * @returns {boolean} whether the account is on a self-hosted DocSpring server
     */
    _isSelfHosted() {
      return this._region() === "self_hosted";
    },
    /**
     * The base URL for a request.
     * @param {boolean} [sync=false] - whether to use the host that waits for PDFs
     * @returns {string}
     */
    _baseUrl(sync = false) {
      if (this._isSelfHosted()) {
        const host = String(this.$auth.custom_host || "").trim()
          .replace(/\/+$/, "");
        if (!host) {
          throw new Error("A Self-Hosted Host is required for the Self-Hosted / Enterprise region (e.g. https://docspring.example.com).");
        }
        return host.includes("://")
          ? host
          : `https://${host}`;
      }
      const hosts = constants.HOSTS[this._region()] || constants.HOSTS.us;
      return `https://${sync
        ? hosts.sync
        : hosts.standard}`;
    },
    /**
     * The headers every request sends: HTTP Basic auth with the API token, and the
     * integration's User-Agent.
     * @returns {object}
     */
    _headers() {
      const token = Buffer.from(`${this.$auth.token_id}:${this.$auth.token_secret}`).toString("base64");
      return {
        "Authorization": `Basic ${token}`,
        "Accept": "application/json",
        "User-Agent": constants.USER_AGENT,
      };
    },
    /**
     * Sends a request to DocSpring's API v2. A failed request throws an error whose message
     * has DocSpring's error code, message, details and request ID.
     * @param {object} opts
     * @param {object} [opts.$=this] - the step's context, for request logging
     * @param {string} opts.path - the path after `/api/v2`, e.g. `/submissions/sub_123`
     * @param {boolean} [opts.sync=false] - whether to use the host that waits for PDFs
     * @param {object} [opts.headers] - extra headers
     * @returns {Promise<*>} the response body
     */
    async _makeRequest({
      $ = this, path, sync = false, headers, ...args
    }) {
      try {
        return await axios($, {
          url: `${this._baseUrl(sync)}${constants.API_PATH}${path}`,
          headers: {
            ...this._headers(),
            ...headers,
          },
          ...args,
        });
      } catch (error) {
        if (!error.response) {
          throw error;
        }
        const {
          status, statusText, data,
        } = error.response;
        const apiError = new Error(utils.formatApiError({
          status,
          statusText,
          data,
          selfHosted: this._isSelfHosted(),
        }));
        apiError.status = status;
        apiError.code = data?.error?.code;
        apiError.response = {
          status,
          data,
        };
        throw apiError;
      }
    },
    /**
     * Loads one page of dropdown options from a cursor-paged list, for "load more".
     * Stops after 1,000 options.
     * @param {object} opts
     * @param {object} [opts.prevContext] - the previous page's context
     * @param {function} opts.list - fetches a page: `(params) => Promise<{data, next_cursor}>`
     * @param {function} opts.toOption - maps an item to `{label, value}`
     * @returns {Promise<{options: object[], context: object}>}
     */
    async _paginateOptions({
      prevContext, list, toOption,
    }) {
      const count = prevContext?.count ?? 0;
      if (count > 0 && !prevContext?.cursor) {
        return {
          options: [],
        };
      }
      if (count >= constants.MAX_PICKER_OPTIONS) {
        return {
          options: [],
        };
      }
      const page = await list(utils.compact({
        limit: constants.MAX_PAGE_SIZE,
        cursor: prevContext?.cursor,
      }));
      const items = page?.data || [];
      return {
        options: items.map(toOption),
        context: {
          cursor: page?.next_cursor || null,
          count: count + items.length,
        },
      };
    },
    /**
     * Yields the items of a cursor-paged list, following `next_cursor` until `max` items.
     * @param {object} opts
     * @param {function} opts.fn - a list method of this app
     * @param {object} [opts.args] - its arguments; `params.limit` and `params.cursor` are set
     * @param {number} [opts.max=50] - the most items to yield
     * @yields {object}
     */
    async *paginate({
      fn, args = {}, max = constants.DEFAULT_MAX_RESULTS,
    }) {
      let count = 0;
      let cursor;
      while (count < max) {
        const page = await fn.call(this, {
          ...args,
          params: utils.compact({
            ...args.params,
            limit: Math.min(constants.MAX_PAGE_SIZE, max - count),
            cursor,
          }),
        });
        const items = page?.data || [];
        for (const item of items) {
          yield item;
          count += 1;
          if (count >= max) {
            return;
          }
        }
        cursor = page?.next_cursor;
        if (!cursor || !items.length) {
          return;
        }
      }
    },
    /**
     * Checks the API token. Returns `{authenticated: true}`.
     * @param {object} [args]
     * @returns {Promise<object>}
     */
    testAuthentication(args = {}) {
      return this._makeRequest({
        path: "/authentication",
        ...args,
      });
    },
    /**
     * Creates a submission. Generate PDF uses the sync host (`sync: true`); a submission
     * with signature requests uses the standard host.
     * @param {object} opts
     * @param {string} opts.templateId
     * @param {boolean} [opts.sync=false]
     * @returns {Promise<object>} the submission
     */
    createSubmission({
      templateId, sync = false, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/templates/${templateId}/submissions`,
        sync,
        ...args,
      });
    },
    /**
     * Generates PDFs in a batch, on the sync host.
     * @param {object} [args]
     * @returns {Promise<object>} the submission batch
     */
    createSubmissionBatch(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/submissions/batches",
        sync: true,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.submissionBatchId
     * @returns {Promise<object>} the submission batch
     */
    getSubmissionBatch({
      submissionBatchId, ...args
    }) {
      return this._makeRequest({
        path: `/submissions/batches/${submissionBatchId}`,
        ...args,
      });
    },
    /**
     * Checks submission data against a template without creating a submission.
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} `{valid, template_id, template_version, error}`
     */
    validateSubmission({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/templates/${templateId}/submissions/validate`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.submissionId
     * @returns {Promise<object>} the submission
     */
    getSubmission({
      submissionId, ...args
    }) {
      return this._makeRequest({
        path: `/submissions/${submissionId}`,
        ...args,
      });
    },
    /**
     * Lists the account's submissions, newest first.
     * @param {object} [args]
     * @returns {Promise<{data: object[], next_cursor: string|null}>}
     */
    listSubmissions(args = {}) {
      return this._makeRequest({
        path: "/submissions",
        ...args,
      });
    },
    /**
     * Lists a template's submissions, newest first.
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<{data: object[], next_cursor: string|null}>}
     */
    listTemplateSubmissions({
      templateId, ...args
    }) {
      return this._makeRequest({
        path: `/templates/${templateId}/submissions`,
        ...args,
      });
    },
    /**
     * Makes more files for a processed submission, on the sync host.
     * @param {object} opts
     * @param {string} opts.submissionId
     * @returns {Promise<object>} the submission
     */
    generateSubmissionFiles({
      submissionId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/submissions/${submissionId}/generate_files`,
        sync: true,
        ...args,
      });
    },
    /**
     * Expires a submission: deletes its data and files.
     * @param {object} opts
     * @param {string} opts.submissionId
     * @returns {Promise<object>} the expired submission
     */
    expireSubmission({
      submissionId, ...args
    }) {
      return this._makeRequest({
        method: "DELETE",
        path: `/submissions/${submissionId}`,
        ...args,
      });
    },
    /**
     * Merges PDFs into a combined PDF, on the sync host.
     * @param {object} [args]
     * @returns {Promise<object>} the combined PDF
     */
    createCombinedPdf(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/combined_pdfs",
        sync: true,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.combinedPdfId
     * @returns {Promise<object>} the combined PDF
     */
    getCombinedPdf({
      combinedPdfId, ...args
    }) {
      return this._makeRequest({
        path: `/combined_pdfs/${combinedPdfId}`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.signatureRequestId
     * @returns {Promise<object>} the signature request
     */
    getSignatureRequest({
      signatureRequestId, ...args
    }) {
      return this._makeRequest({
        path: `/signature_requests/${signatureRequestId}`,
        ...args,
      });
    },
    /**
     * Creates a token whose `signature_request_url` opens the signing form.
     * @param {object} opts
     * @param {string} opts.signatureRequestId
     * @returns {Promise<object>} the token
     */
    createSignatureRequestToken({
      signatureRequestId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/signature_requests/${signatureRequestId}/tokens`,
        ...args,
      });
    },
    /**
     * Lists templates as summaries.
     * @param {object} [args]
     * @returns {Promise<{data: object[], next_cursor: string|null}>}
     */
    listTemplates(args = {}) {
      return this._makeRequest({
        path: "/templates",
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the template
     */
    getTemplate({
      templateId, ...args
    }) {
      return this._makeRequest({
        path: `/templates/${templateId}`,
        ...args,
      });
    },
    /**
     * Creates a PDF or HTML template, on the sync host.
     * @param {object} [args]
     * @returns {Promise<object>} the template
     */
    createTemplate(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/templates",
        sync: true,
        ...args,
      });
    },
    /**
     * Replaces a PDF template's PDF, on the sync host.
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the template
     */
    updateTemplateDocument({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "PUT",
        path: `/templates/${templateId}/document`,
        sync: true,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the copy
     */
    copyTemplate({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/templates/${templateId}/copy`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the template
     */
    moveTemplate({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/templates/${templateId}/move`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the template version
     */
    publishTemplateVersion({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/templates/${templateId}/publish_version`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<{template_id: string, version: string|null, fields: object[]}>}
     */
    listTemplateFields({
      templateId, ...args
    }) {
      return this._makeRequest({
        path: `/templates/${templateId}/fields`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the template's fields
     */
    addTemplateFields({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/templates/${templateId}/fields`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the template's fields
     */
    updateTemplateFields({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "PUT",
        path: `/templates/${templateId}/fields`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the template's remaining fields
     */
    removeTemplateFields({
      templateId, ...args
    }) {
      return this._makeRequest({
        method: "POST",
        path: `/templates/${templateId}/fields/remove`,
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.templateId
     * @returns {Promise<object>} the page images
     */
    getTemplatePageImages({
      templateId, ...args
    }) {
      return this._makeRequest({
        path: `/templates/${templateId}/page_images`,
        ...args,
      });
    },
    /**
     * @param {object} [args]
     * @returns {Promise<{data: object[], next_cursor: string|null}>}
     */
    listFolders(args = {}) {
      return this._makeRequest({
        path: "/folders",
        ...args,
      });
    },
    /**
     * @param {object} [args]
     * @returns {Promise<object>} the folder
     */
    createFolder(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/folders",
        ...args,
      });
    },
    /**
     * Creates a webhook. Webhooks created with API v2 send version 4 events.
     * @param {object} [args]
     * @returns {Promise<object>} the webhook
     */
    createWebhook(args = {}) {
      return this._makeRequest({
        method: "POST",
        path: "/webhooks",
        ...args,
      });
    },
    /**
     * @param {object} opts
     * @param {string} opts.webhookId
     * @returns {Promise<object>} the deleted webhook
     */
    deleteWebhook({
      webhookId, ...args
    }) {
      return this._makeRequest({
        method: "DELETE",
        path: `/webhooks/${webhookId}`,
        ...args,
      });
    },
  },
};
