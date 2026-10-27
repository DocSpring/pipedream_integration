# Changelog

## 0.1.0 (unreleased)

The components now use DocSpring's API v2, and webhooks send version 4 events.

- **Self-hosted DocSpring servers need the release that has API v2.** On an older server, every action says to
  upgrade it.
- **Renamed:** Find Template is **Find Templates** and Find Submission is **Find Submissions** (getting one
  submission by ID is now **Get Submission**). Data requests are **signature requests** everywhere, and combined
  submissions are **combined PDFs**.
- **Output follows API v2:** a PDF's links are in `files.pdf` (`download_url`, `permanent_url`), signers are in
  `signature_requests`, and errors list DocSpring's message, each problem and the request ID. Create Signing Link
  returns the token (`signature_request_url` is the link). Email links open the signing form for 7 days, API links for
  24 hours.
- **New Event (Instant)** emits the event as DocSpring sends it (`id`, `event_type`, `created_at`, `data`) plus
  `resource_type` and `resource_id`, for 22 events, now including submission declined and updated, signature request
  declined and updated, combined PDF expired, custom file created and folder events. It can be limited to some
  templates, and can leave submission data out.
- **Create Signature Request** has inputs for each signer: their fields (picked from the template's field names),
  role, authentication, and whether they can change prefilled values. It can make email links, API links or none.
- **Generate PDF** adds output formats (PNG page images), field overrides, editable PDFs and a switch to return
  without waiting for the PDF.
- **New actions:** Generate PDFs in a Batch, Get Submission Batch, Check Data, Get Submission, Generate Submission
  Files, Expire Submission, Get Combined PDF, Get Signature Request, Get Template, Create Template, Replace Template PDF,
  Copy Template, Move Template, Publish Template Version, List Template Fields, Add Template Fields, Update Template
  Fields, Remove Template Fields, Get Template Page Images, List Folders and Create Folder.

## 0.0.1

The first components (API v1, version 3 webhooks), submitted in PipedreamHQ/pipedream#21947 and not published.
