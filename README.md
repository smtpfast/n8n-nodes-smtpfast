# @smtpfast/n8n-nodes-smtpfast

This is an n8n community node for [SMTPfast](https://smtpfa.st), an email API for developers. Use it to send email, manage contacts and segments, check sending domains, and start workflows from SMTPfast webhook events.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Trigger](#trigger)
- [Example workflow](#example-workflow)
- [Compatibility](#compatibility)
- [Development](#development)
- [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In short, on a self-hosted n8n:

1. Go to **Settings > Community Nodes**.
2. Select **Install**.
3. Enter `@smtpfast/n8n-nodes-smtpfast` and confirm.

The package has no runtime dependencies.

## Credentials

The node uses one credential, **SMTPfast API**, with an API key sent as a Bearer token.

1. Sign in to the [SMTPfast dashboard](https://smtpfa.st) and open **API Keys**.
2. Create a key. Give it only the scopes your workflows need:

   | Feature | Scopes |
   | --- | --- |
   | Email: Send | `email:send` |
   | Email: Get | `email:read` |
   | Contact: Get, Get Many, segment lists | `contact:read` |
   | Contact: Create, Create or Update, Update, Delete, Add to Segment, Remove From Segment | `contact:write` |
   | Domain: Get, Get Many | `domain:read` |
   | SMTPfast Trigger | `webhook:read`, `webhook:write` |

3. In n8n, create an **SMTPfast API** credential and paste the key.

n8n tests the credential with `GET /v1/me`, which needs no scope.

## Operations

### Email

- **Send**: send one email with `POST /v1/emails`.
  - From (a verified domain, `Name <address>` is allowed), To, Subject.
  - Body as HTML, text, or both. With HTML only, SMTPfast makes the text part.
  - Category: `marketing` (the SMTPfast default) or `transactional`. Use transactional only for mail the recipient needs because of an action or account, such as receipts and password resets.
  - Additional fields: CC, BCC, Reply To, attachments from binary data, tags, custom headers, Scheduled At, Track Clicks, Track Opens, and an Idempotency Key.
- **Get**: get an email by ID with its status (`queued`, `sent`, `delivered`, `bounced`, `complained`, `failed` and so on). With **Simplify** on, the output has the 10 most useful fields. Turn it off to get every field, including the `events` list with bounce details.

**One email per input item.** The Send operation makes one API call, and so one email, for each input item. All addresses in To, CC and BCC on that item go on the same email, and every recipient sees the To and CC addresses. To send a separate email to each person, give each person their own item first, for example with the **Split Out** node, as in the [example workflow](#example-workflow). Each output item is paired with the input item that made it.

**Attachments.** Enter the names of the binary fields to attach, separated by commas, for example `data` or `invoice, logo`. The node sends the file name and MIME type from the binary data. SMTPfast takes up to 10 files and 25 MB per email.

**Test sends.** SMTPfast refuses recipients on domains reserved for documentation and tests, such as `example.com`. To test, send to the Amazon SES mailbox simulator, for example `success@simulator.amazonses.com` or `bounce@simulator.amazonses.com`.

### Contact

- **Create**: create a contact. Fails with 409 if the email address already exists.
- **Create or Update**: create a contact, or update the one with the same email address. Fields you send replace the stored ones, and fields you leave out stay. Segments are only added.
- **Update**: change the first name, last name, subscription status, properties, or segments. Segments given here replace all manual segments of the contact. The email address cannot change.
- **Get**: get a contact by ID or email address.
- **Get Many**: list contacts, with search, subscription status and segment filters. Turn on **Return All** to page through every contact.
- **Delete**: delete a contact permanently. The output is `{ "deleted": true }`.
- **Add to Segment** and **Remove From Segment**: change the manual segments of a contact. Removing a contact from a segment does not delete the contact.

Wherever the node asks for a contact, you can give the contact ID or the email address. Custom properties must exist in SMTPfast before you set them. Each property value has a type (Text, Number, Boolean or Empty for null). Pick the type the property has in SMTPfast.

### Domain

Read-only.

- **Get**: get a sending domain with its verification status, the status of each DNS record, and a live DNS check.
- **Get Many**: list your sending domains and their status.

## Trigger

The **SMTPfast Trigger** node starts a workflow when SMTPfast sends a webhook event. You choose the events, for example:

- Email: Sent, Delivered, Delivery Delayed, Bounced, Complained, Opened, Clicked, Failed, Suppressed, Unsubscribed, Scheduled, Received (inbound)
- Contact: Created, Updated, Deleted, Subscribed
- Domain: Created, Updated, Deleted
- Inbox: Email Received, Thread Assigned, Thread Unassigned

How it works:

- When you activate the workflow, the node registers a webhook in SMTPfast (`POST /v1/webhooks`) for the n8n webhook URL and the chosen events. When you deactivate it, the node deletes that webhook. If you change the events, the node updates the webhook and keeps its secret. The editor's test URL gets its own webhook, so listening for a test event does not touch the production webhook.
- SMTPfast returns a signing secret when it creates the webhook. The node keeps the webhook ID and the secret in the workflow's static data, and checks the `X-SMTPfast-Signature` header (HMAC-SHA256 of the raw body) on every request. A request with a missing or wrong signature gets a 401 and does not start the workflow.
- The output item is the event as SMTPfast sends it: `type`, `timestamp` and `data`.

Requirements:

- SMTPfast only sends webhooks to a **public HTTPS URL on port 443**. A local n8n on `http://localhost:5678` cannot receive them. Set `WEBHOOK_URL` on your n8n instance to its public `https://` address, or use a tunnel.
- The API key needs `webhook:read` and `webhook:write`.

## Example workflow

This workflow makes one item per recipient, sends one email to each through SMTPfast, waits 30 seconds, and gets the status of each email. The success address ends as `delivered`, the bounce address as `bounced`.

To use it, copy the JSON, paste it into an n8n workflow, select your SMTPfast credential on both SMTPfast nodes, and change the From address to one on your verified domain. The same file is in [`examples/send-and-check-status.json`](examples/send-and-check-status.json).

<details>
<summary>Workflow JSON</summary>

```json
{
  "name": "SMTPfast: send to the SES simulator and check status",
  "nodes": [
    {
      "name": "Start",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [
        0,
        0
      ],
      "parameters": {}
    },
    {
      "name": "Recipients",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        200,
        0
      ],
      "parameters": {
        "mode": "raw",
        "jsonOutput": "{\"to\": [\"success@simulator.amazonses.com\", \"bounce@simulator.amazonses.com\"]}",
        "options": {}
      }
    },
    {
      "name": "One Item Per Recipient",
      "type": "n8n-nodes-base.splitOut",
      "typeVersion": 1,
      "position": [
        400,
        0
      ],
      "parameters": {
        "fieldToSplitOut": "to",
        "options": {}
      }
    },
    {
      "name": "Send Email",
      "type": "@smtpfast/n8n-nodes-smtpfast.smtpfast",
      "typeVersion": 1,
      "position": [
        600,
        0
      ],
      "credentials": {
        "smtpfastApi": {
          "id": "",
          "name": "SMTPfast account"
        }
      },
      "parameters": {
        "resource": "email",
        "operation": "send",
        "from": "Acme <hello@yourdomain.com>",
        "to": "={{ $json.to }}",
        "subject": "Test from n8n",
        "emailFormat": "both",
        "html": "<p>Hello from n8n.</p>",
        "text": "Hello from n8n.",
        "category": "transactional",
        "additionalFields": {
          "tags": {
            "tag": [
              {
                "name": "source",
                "value": "n8n"
              }
            ]
          }
        }
      }
    },
    {
      "name": "Wait",
      "type": "n8n-nodes-base.wait",
      "typeVersion": 1.1,
      "position": [
        800,
        0
      ],
      "parameters": {
        "resume": "timeInterval",
        "amount": 30,
        "unit": "seconds"
      }
    },
    {
      "name": "Get Email",
      "type": "@smtpfast/n8n-nodes-smtpfast.smtpfast",
      "typeVersion": 1,
      "position": [
        1000,
        0
      ],
      "credentials": {
        "smtpfastApi": {
          "id": "",
          "name": "SMTPfast account"
        }
      },
      "parameters": {
        "resource": "email",
        "operation": "get",
        "emailId": "={{ $('Send Email').item.json.id }}",
        "simplify": true
      }
    }
  ],
  "connections": {
    "Start": {
      "main": [
        [
          {
            "node": "Recipients",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Recipients": {
      "main": [
        [
          {
            "node": "One Item Per Recipient",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "One Item Per Recipient": {
      "main": [
        [
          {
            "node": "Send Email",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Send Email": {
      "main": [
        [
          {
            "node": "Wait",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wait": {
      "main": [
        [
          {
            "node": "Get Email",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
```

</details>

## Compatibility

Tested with n8n 2.48.7 on Node.js 24.

## Development

```bash
npm ci
npm run lint    # n8n-node lint, the checks n8n runs for verified nodes
npm run build
npm test        # builds, then runs the unit tests with node:test
npm run dev     # starts n8n with this node loaded
```

The unit tests mock the HTTP layer. They cover request building for every operation and the trigger webhook lifecycle and signature check.

Releases go through the `Publish` GitHub Actions workflow, which publishes to npm with provenance when a version tag is pushed.

## Resources

- [SMTPfast API documentation](https://smtpfa.st/docs)
- [SMTPfast webhooks](https://smtpfa.st/docs/webhooks)
- [SMTPfast OpenAPI spec](https://smtpfa.st/api/v1/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
