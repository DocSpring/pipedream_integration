import docspring from "../../docspring.app.mjs";
import utils from "../../common/utils.mjs";

export default {
  props: {
    docspring,
    db: "$.service.db",
    http: "$.interface.http",
    eventTypes: {
      propDefinition: [
        docspring,
        "eventTypes",
      ],
    },
    templateIds: {
      propDefinition: [
        docspring,
        "templateId",
      ],
      type: "string[]",
      label: "Templates",
      description: "Only emit events for these templates (their submissions, signature requests and template events), e.g. `[\"tpl_1234567890abcdef01\"]`."
        + " Use **Find Templates** to find them (the `id` field). With templates set, only submission, signature request and template events can be chosen."
        + " Leave blank for every template.",
      optional: true,
    },
    mode: {
      type: "string",
      label: "Live or Test",
      description: "Only emit events for `live` or `test` submissions, e.g. `live`. Leave blank for both.",
      options: [
        "live",
        "test",
      ],
      optional: true,
    },
    includeSubmissionData: {
      type: "boolean",
      label: "Include Submission Data",
      description: "`true` (the default) includes submissions' and signature requests' field values in `data`;"
        + " `false` sends them as null. e.g. `true`.",
      default: true,
      optional: true,
    },
  },
  hooks: {
    async activate() {
      const webhook = await this.docspring.createWebhook({
        data: utils.compact({
          url: this.http.endpoint,
          name: "Pipedream",
          event_types: utils.parseStringArray(this.eventTypes),
          template_ids: utils.parseStringArray(this.templateIds),
          mode: this.mode,
          include_submission_data: utils.toBoolean(this.includeSubmissionData, "Include Submission Data") ?? true,
        }),
      });
      this._setHookId(webhook.id);
    },
    async deactivate() {
      const hookId = this._getHookId();
      if (!hookId) {
        return;
      }
      try {
        await this.docspring.deleteWebhook({
          webhookId: hookId,
        });
      } catch (error) {
        // A 404 means the webhook was already deleted. Any other error (e.g. a revoked
        // token) leaves it in DocSpring, so deactivation fails.
        if (error.response?.status !== 404) {
          throw error;
        }
      }
      this._setHookId(null);
    },
  },
  methods: {
    _getHookId() {
      return this.db.get("hookId");
    },
    _setHookId(hookId) {
      this.db.set("hookId", hookId);
    },
  },
  async run(event) {
    const body = (event && event.body) || {};
    // DocSpring sends each event with a unique `id` that stays the same when a delivery is
    // retried. Requiring it keeps `dedupe: "unique"` working for retries.
    if (!body.id) {
      throw new Error("The DocSpring webhook delivery has no event `id`");
    }
    const output = utils.eventOutput(body);
    const ts = Date.parse(body.created_at);
    this.$emit(output, {
      id: body.id,
      summary: `${body.event_type || "Event"}: ${output.resource_id ?? ""}`,
      ts: Number.isNaN(ts)
        ? Date.now()
        : ts,
    });
  },
};
