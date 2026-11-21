import type { INodeProperties } from 'n8n-workflow';

const showForSend = { resource: ['email'], operation: ['send'] };
const showForGet = { resource: ['email'], operation: ['get'] };

export const emailOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['email'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve an email with its delivery status and events',
				action: 'Get an email',
			},
			{
				name: 'Send',
				value: 'send',
				description: 'Send an email through the SMTPfast API',
				action: 'Send an email',
			},
		],
		default: 'send',
	},
];

export const emailFields: INodeProperties[] = [
	{
		displayName:
			'Each input item sends one email. All addresses in To, CC and BCC go on that one email. To send a separate email to each person, give each person their own input item.',
		name: 'itemPerEmailNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showForSend },
	},
	{
		displayName: 'From',
		name: 'from',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Acme <hello@acme.com>',
		description:
			'The sender address. It must be on a domain you verified in SMTPfast. A display name is allowed, as in Name &lt;address&gt;.',
		displayOptions: { show: showForSend },
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. nathan@example.com',
		description: 'Recipient addresses, separated by commas. Up to 50.',
		displayOptions: { show: showForSend },
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. Your order has shipped',
		displayOptions: { show: showForSend },
	},
	{
		displayName: 'Email Format',
		name: 'emailFormat',
		type: 'options',
		options: [
			{
				name: 'HTML',
				value: 'html',
				description: 'Send an HTML body. SMTPfast makes the text part.',
			},
			{ name: 'Text', value: 'text', description: 'Send a plain text body only' },
			{ name: 'Both', value: 'both', description: 'Send an HTML body and your own text part' },
		],
		default: 'html',
		displayOptions: { show: showForSend },
	},
	{
		displayName: 'HTML',
		name: 'html',
		type: 'string',
		typeOptions: { rows: 5 },
		required: true,
		default: '',
		placeholder: 'e.g. <p>Hello Nathan</p>',
		description:
			'The HTML body. In fixed mode, {{unsubscribe_url}} inserts the unsubscribe link, and an email with it is always marketing.',
		displayOptions: { show: { ...showForSend, emailFormat: ['html', 'both'] } },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 5 },
		required: true,
		default: '',
		placeholder: 'e.g. Hello Nathan',
		description: 'The plain text body',
		displayOptions: { show: { ...showForSend, emailFormat: ['text', 'both'] } },
	},
	{
		displayName: 'Category',
		name: 'category',
		type: 'options',
		options: [
			{
				name: 'Marketing',
				value: 'marketing',
				description:
					'Newsletters and promotions. Gets a one-click unsubscribe header and skips unsubscribed addresses.',
			},
			{
				name: 'Transactional',
				value: 'transactional',
				description:
					'Mail the recipient needs because of an action or account, such as receipts and password resets. Still reaches addresses that only opted out of marketing.',
			},
		],
		default: 'marketing',
		description:
			'How SMTPfast treats this email. Do not label promotions transactional. SMTPfast treats an email without a category as marketing.',
		displayOptions: { show: showForSend },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showForSend },
		options: [
			{
				displayName: 'Attachments',
				name: 'attachments',
				type: 'string',
				default: '',
				placeholder: 'e.g. data, invoice',
				description:
					'Names of the binary fields on the input item to attach, separated by commas. Up to 10 files and 25 MB per email.',
			},
			{
				displayName: 'BCC',
				name: 'bcc',
				type: 'string',
				default: '',
				placeholder: 'e.g. nathan@example.com',
				description: 'BCC addresses, separated by commas',
			},
			{
				displayName: 'CC',
				name: 'cc',
				type: 'string',
				default: '',
				placeholder: 'e.g. nathan@example.com',
				description: 'CC addresses, separated by commas',
			},
			{
				displayName: 'Headers',
				name: 'headers',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				placeholder: 'Add Header',
				description: 'Custom email headers, such as X-Entity-Ref-ID',
				options: [
					{
						displayName: 'Header',
						name: 'header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'e.g. X-Entity-Ref-ID',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'e.g. order-1041-shipped',
				description:
					'A unique key for this send. If the same key and body come again within 24 hours, SMTPfast returns the first result and does not send again.',
			},
			{
				displayName: 'Reply To',
				name: 'replyTo',
				type: 'string',
				default: '',
				placeholder: 'e.g. support@acme.com',
				description: 'Reply-To addresses, separated by commas. Up to 50.',
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduledAt',
				type: 'dateTime',
				default: '',
				description: 'Send the email later, up to 30 days ahead',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				placeholder: 'Add Tag',
				description:
					'Up to 50 name and value pairs. SMTPfast returns them on events and webhooks, and you can filter logs by them.',
				options: [
					{
						displayName: 'Tag',
						name: 'tag',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'e.g. category',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: 'e.g. welcome',
							},
						],
					},
				],
			},
			{
				displayName: 'Track Clicks',
				name: 'trackClicks',
				type: 'boolean',
				default: true,
				description:
					'Whether to send links through the click tracker. Leave this field out to use the account setting.',
			},
			{
				displayName: 'Track Opens',
				name: 'trackOpens',
				type: 'boolean',
				default: true,
				description:
					'Whether to add the open-tracking pixel. Leave this field out to use the account setting.',
			},
		],
	},
	{
		displayName: 'Email ID',
		name: 'emailId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. email_abc123',
		description: 'The ID that the Send operation returned',
		displayOptions: { show: showForGet },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: showForGet },
	},
];
