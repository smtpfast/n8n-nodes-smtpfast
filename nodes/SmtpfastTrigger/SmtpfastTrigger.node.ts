import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { pathSegment, smtpfastApiRequest } from '../Smtpfast/transport';

export const SMTPFAST_EVENTS: Array<{ name: string; value: string; description: string }> = [
	{ name: 'Contact Created', value: 'contact.created', description: 'A contact was created' },
	{ name: 'Contact Deleted', value: 'contact.deleted', description: 'A contact was deleted' },
	{
		name: 'Contact Subscribed',
		value: 'contact.subscribed',
		description: 'A contact subscribed through a hosted form or a confirmation',
	},
	{ name: 'Contact Updated', value: 'contact.updated', description: 'A contact was changed' },
	{ name: 'Domain Created', value: 'domain.created', description: 'A sending domain was added' },
	{ name: 'Domain Deleted', value: 'domain.deleted', description: 'A sending domain was deleted' },
	{
		name: 'Domain Updated',
		value: 'domain.updated',
		description: 'The verification state of a sending domain changed',
	},
	{ name: 'Email Bounced', value: 'email.bounced', description: 'An email bounced' },
	{
		name: 'Email Clicked',
		value: 'email.clicked',
		description: 'A recipient clicked a tracked link',
	},
	{
		name: 'Email Complained',
		value: 'email.complained',
		description: 'A recipient marked an email as spam',
	},
	{
		name: 'Email Delivered',
		value: 'email.delivered',
		description: "The recipient's mail server accepted an email",
	},
	{
		name: 'Email Delivery Delayed',
		value: 'email.delivery_delayed',
		description: 'A delivery attempt failed for now and SMTPfast will retry',
	},
	{
		name: 'Email Failed',
		value: 'email.failed',
		description: 'An email failed after the final send attempt',
	},
	{ name: 'Email Opened', value: 'email.opened', description: 'The tracking pixel was loaded' },
	{
		name: 'Email Received',
		value: 'email.received',
		description: 'An inbound email arrived, one event per recipient address',
	},
	{
		name: 'Email Scheduled',
		value: 'email.scheduled',
		description: 'An email was accepted for a later send time',
	},
	{
		name: 'Email Sent',
		value: 'email.sent',
		description: 'The sending provider accepted an email for delivery',
	},
	{
		name: 'Email Suppressed',
		value: 'email.suppressed',
		description: 'An email was not sent because every recipient was suppressed',
	},
	{
		name: 'Email Unsubscribed',
		value: 'email.unsubscribed',
		description: 'A recipient opted out of marketing email',
	},
	{
		name: 'Inbox Email Received',
		value: 'inbox.email.received',
		description: 'A received email was added to an inbox thread',
	},
	{
		name: 'Inbox Thread Assigned',
		value: 'inbox.thread.assigned',
		description: 'An inbox thread was assigned to a team member',
	},
	{
		name: 'Inbox Thread Unassigned',
		value: 'inbox.thread.unassigned',
		description: 'An inbox thread was unassigned',
	},
];

export const SIGNATURE_HEADER = 'x-smtpfast-signature';

/** Check the X-SMTPfast-Signature header: the hex HMAC-SHA256 of the raw body with the signing secret. */
export function isValidSignature(
	rawBody: Buffer | string,
	signature: unknown,
	secret: string,
): boolean {
	if (typeof signature !== 'string' || !secret) return false;
	const given = signature.trim();
	if (!/^[0-9a-f]{64}$/i.test(given)) return false;
	const expected = createHmac('sha256', secret).update(rawBody).digest();
	return timingSafeEqual(Buffer.from(given, 'hex'), expected);
}

interface StoredWebhook extends IDataObject {
	id: string;
	secret: string;
	/** Registered for the editor's test URL rather than the production URL. */
	test: boolean;
}

/**
 * Webhooks this node registered, keyed by n8n webhook URL. The test URL and the
 * production URL each get their own SMTPfast webhook and signing secret, so testing
 * the workflow in the editor does not touch the production webhook, and a request is
 * only checked against the secret of its own kind.
 */
interface WebhookStaticData extends IDataObject {
	webhooks?: Record<string, StoredWebhook>;
}

function storedWebhooks(staticData: WebhookStaticData): Record<string, StoredWebhook> {
	if (!staticData.webhooks || typeof staticData.webhooks !== 'object') staticData.webhooks = {};
	return staticData.webhooks;
}

/** n8n runs test webhooks, and their hooks, in manual mode. */
function isTestMode(context: IHookFunctions | IWebhookFunctions): boolean {
	return context.getMode() === 'manual';
}

function isNotFound(error: unknown): boolean {
	return error instanceof NodeApiError && String(error.httpCode) === '404';
}

function sameEvents(a: unknown, b: string[]): boolean {
	if (!Array.isArray(a) || a.length !== b.length) return false;
	const set = new Set(a.map(String));
	return b.every((event) => set.has(event));
}

export class SmtpfastTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SMTPfast Trigger',
		name: 'smtpfastTrigger',
		icon: { light: 'file:../../icons/smtpfast.svg', dark: 'file:../../icons/smtpfast.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when SMTPfast sends a webhook event',
		defaults: {
			name: 'SMTPfast Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'smtpfastApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'SMTPfast only sends webhooks to a public HTTPS URL on port 443. The n8n webhook URL must be reachable from the internet. The API key needs the webhook:write scope.',
				name: 'publicUrlNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['email.delivered', 'email.bounced', 'email.complained'],
				options: SMTPFAST_EVENTS,
				description: 'The events that start the workflow',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const webhooks = storedWebhooks(this.getWorkflowStaticData('node') as WebhookStaticData);
				const test = isTestMode(this);

				// A webhook of the same kind on another URL is left over from an old n8n URL. Remove it,
				// so SMTPfast stops sending there and its secret is no longer trusted.
				for (const [url, old] of Object.entries(webhooks)) {
					if (url === webhookUrl || Boolean(old.test) !== test) continue;
					try {
						await smtpfastApiRequest.call(this, 'DELETE', `/webhooks/${pathSegment(old.id)}`);
					} catch (error) {
						if (!isNotFound(error)) throw new NodeApiError(this.getNode(), error as JsonObject);
					}
					delete webhooks[url];
				}

				const stored = webhooks[webhookUrl];
				if (!stored?.id || !stored.secret) return false;

				let webhook: IDataObject;
				try {
					webhook = await smtpfastApiRequest.call(
						this,
						'GET',
						`/webhooks/${pathSegment(stored.id)}`,
					);
				} catch (error) {
					if (isNotFound(error)) {
						delete webhooks[webhookUrl];
						return false;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
				if (webhook.url !== webhookUrl) {
					delete webhooks[webhookUrl];
					return false;
				}

				// Keep the webhook and its secret, and bring the events and state up to date.
				const events = this.getNodeParameter('events') as string[];
				const isStandard = webhook.format === undefined || webhook.format === 'standard';
				if (!sameEvents(webhook.events, events) || webhook.active === false || !isStandard) {
					await smtpfastApiRequest.call(this, 'PATCH', `/webhooks/${pathSegment(stored.id)}`, {
						events,
						active: true,
						format: 'standard',
					});
				}
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				if (!webhookUrl || !webhookUrl.startsWith('https://')) {
					throw new NodeOperationError(
						this.getNode(),
						'SMTPfast needs a public HTTPS webhook URL',
						{
							description: `The n8n webhook URL is "${webhookUrl ?? ''}". Set WEBHOOK_URL on your n8n instance to a public https:// address, or use a tunnel.`,
						},
					);
				}
				if (!events.length) {
					throw new NodeOperationError(this.getNode(), 'Choose at least one event', {
						description: "Pick the events to listen for in 'Events'",
					});
				}

				const response = await smtpfastApiRequest.call(this, 'POST', '/webhooks', {
					url: webhookUrl,
					events,
					format: 'standard',
				});
				if (!response.id || !response.secret) {
					throw new NodeApiError(this.getNode(), response as JsonObject, {
						message: 'SMTPfast did not return a webhook ID and signing secret',
					});
				}

				const webhooks = storedWebhooks(this.getWorkflowStaticData('node') as WebhookStaticData);
				webhooks[webhookUrl] = {
					id: String(response.id),
					secret: String(response.secret),
					test: isTestMode(this),
				};
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const webhooks = storedWebhooks(this.getWorkflowStaticData('node') as WebhookStaticData);
				const stored = webhooks[webhookUrl];
				if (stored?.id) {
					try {
						await smtpfastApiRequest.call(this, 'DELETE', `/webhooks/${pathSegment(stored.id)}`);
					} catch (error) {
						if (!isNotFound(error)) return false;
					}
				}
				delete webhooks[webhookUrl];
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const webhooks = storedWebhooks(this.getWorkflowStaticData('node') as WebhookStaticData);
		const test = isTestMode(this);
		const secrets = Object.values(webhooks)
			.filter((webhook) => Boolean(webhook.test) === test)
			.map((webhook) => String(webhook.secret ?? ''));
		const rawBody = (req as unknown as { rawBody?: Buffer | string }).rawBody;
		const signature = this.getHeaderData()[SIGNATURE_HEADER];

		if (
			rawBody === undefined ||
			!secrets.some((secret) => isValidSignature(rawBody, signature, secret))
		) {
			res.status(401).json({ error: 'Invalid signature' });
			return { noWebhookResponse: true };
		}

		const body = this.getBodyData();
		const events = this.getNodeParameter('events') as string[];
		if (typeof body.type === 'string' && events.length && !events.includes(body.type)) {
			// Not an event this node listens for, such as a dashboard test event: accept and ignore it.
			return { webhookResponse: { received: true } };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(body)],
		};
	}
}
