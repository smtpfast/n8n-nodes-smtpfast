# Security policy

## Supported versions

Only the latest release of `n8n-nodes-smtpfast` gets security fixes.

## Report a vulnerability

Email security@devops-daily.com with the steps to reproduce, the package and n8n versions, and the impact. Do not open a public issue.

We acknowledge reports within 48 hours and tell you when a fix is released.

## How the node handles secrets

- The SMTPfast API key lives in an n8n credential, which n8n encrypts at rest. The node never logs it.
- The SMTPfast Trigger keeps the webhook signing secret in the workflow's static data, so it can check the `X-SMTPfast-Signature` header. Anyone who can export the workflow can read that secret. Deactivate and activate the workflow to get a new webhook and a new secret.
