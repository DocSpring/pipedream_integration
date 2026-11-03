# Changelog

## 0.0.1 (unreleased)

The first published components, on DocSpring's API v2 with version 4 webhooks. Every component starts at 0.0.1, as
new Pipedream components do. An earlier draft on API v1 was submitted in PipedreamHQ/pipedream#21947 and never
published; the list below is what changed from it.

- **Self-hosted DocSpring servers need a release with API v2 that emails signers.** On a server without API v2, every
  action says to upgrade it; on one with API v2 but an older release, Create Signature Request, and Check Data with
  signature requests, fail because the server refuses `send_email`.
- **Renamed:** Find Template is **Find Templates** and Find Submission is **Find Submissions** (getting one
  submission by ID is now **Get Submission**). Data requests are **signature requests** everywhere, and combined
  submissions are **combined PDFs**.
- **Output follows API v2:** a PDF's links are in `files.pdf` (`download_url`, `permanent_url`), signers are in
  `signature_requests`, and errors list DocSpring's message, each problem and the request ID. Create Signing Link
  returns the token (`signature_request_url` is the link). Email links open the signing form for 7 days, API links for
  24 hours.
- **IDs only name one record:** each ID that goes into a request's path is encoded, and a blank ID, `.` or `..`
  fails before any request is made.
- **New Event (Instant)** emits the event as DocSpring sends it (`id`, `event_type`, `created_at`, `data`) plus
  `resource_type` and `resource_id`, for 24 events, now including submission declined and updated, signature request
  declined, updated, sent (DocSpring first emailed someone their link) and email bounced, combined PDF expired, custom
  file created and folder events. It can be limited to some templates (for submission, signature request and template
  events), and can leave submission data out. It checks each delivery's `X-DocSpring-Signature` and turns away (401)
  any request that DocSpring didn't sign.
- **Create Signature Request** has inputs for each signer: their fields (picked from the template's field names),
  role, authentication, signing step, and whether they can change prefilled values. **Emails to Signers**: DocSpring
  emails each signer a link to sign (the default, as in the API), with any reminders and the signed PDF once everyone
  has signed, and you can set the subject, a message, CC addresses, reminders, the reply-to address, notification
  emails and a notification each time someone signs; or you send the links yourself, and the action makes email
  links, API links or none. **Signing Order**: everyone at once, or one step at a time.
- **Check Data** checks signature requests with the same email settings, and defaults each one's `auth_type` to
  `email_link`, as Create Signature Request does.
- **Generate PDF** adds output formats (PNG page images, and a Word template's Word document and OpenDocument file),
  field overrides, editable PDFs and a switch to return without waiting for the PDF. Generate PDFs in a Batch and
  Generate Submission Files make the same formats.
- **New actions:** Generate PDFs in a Batch, Get Submission Batch, Check Data, Get Submission, Generate Submission
  Files, Expire Submission, Get Combined PDF, Get Signature Request, Get Template, Create Template, Replace Template PDF,
  Copy Template, Move Template, Publish Template Version, List Template Fields, Add Template Fields, Update Template
  Fields, Remove Template Fields, Get Template Page Images, List Folders and Create Folder.
