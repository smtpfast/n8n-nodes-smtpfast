# Changelog

## 0.1.0 (unreleased)

First version.

- SMTPfast API credential with a Bearer API key, tested with `GET /v1/me`.
- SMTPfast node:
  - Email: Send (HTML, text, CC, BCC, Reply To, attachments from binary data, category, tags, custom headers, scheduling, tracking flags, idempotency key) and Get.
  - Contact: Create, Create or Update, Update, Get, Get Many, Delete, Add to Segment, Remove From Segment.
  - Domain: Get and Get Many.
- SMTPfast Trigger node: registers a webhook for the chosen events on activation, removes it on deactivation, and checks the `X-SMTPfast-Signature` HMAC on every request.
