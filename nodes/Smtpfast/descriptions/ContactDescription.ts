import type { INodeProperties } from 'n8n-workflow';

const contactIdField = (operations: string[]): INodeProperties => ({
	displayName: 'Contact',
	name: 'contactId',
	type: 'string',
	required: true,
	default: '',
	placeholder: 'e.g. nathan@example.com',
	description: 'The contact ID or the contact email address',
	displayOptions: { show: { resource: ['contact'], operation: operations } },
});

const segmentIdField = (operations: string[]): INodeProperties => ({
	displayName: 'Segment Name or ID',
	name: 'segmentId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getSegments' },
	required: true,
	default: '',
	description:
		'A manual segment. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	displayOptions: { show: { resource: ['contact'], operation: operations } },
});

const propertiesField: INodeProperties = {
	displayName: 'Properties',
	name: 'properties',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	placeholder: 'Add Property',
	description:
		'Custom contact properties. Declare a property in SMTPfast before you set it on a contact.',
	options: [
		{
			displayName: 'Property',
			name: 'property',
			values: [
				{
					displayName: 'Name',
					name: 'key',
					type: 'string',
					default: '',
					placeholder: 'e.g. company',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'string',
					default: '',
					placeholder: 'e.g. Acme',
				},
			],
		},
	],
};

const nameAndSubscriptionFields: INodeProperties[] = [
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		default: '',
		placeholder: 'e.g. Nathan',
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		default: '',
		placeholder: 'e.g. Smith',
	},
	{
		displayName: 'Unsubscribed',
		name: 'unsubscribed',
		type: 'boolean',
		default: false,
		description: 'Whether the contact is unsubscribed from broadcasts',
	},
];

export const contactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{
				name: 'Add to Segment',
				value: 'addToSegment',
				description: 'Add a contact to a manual segment',
				action: 'Add contact to segment',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create a new contact. Fails if the email address already exists.',
				action: 'Create a contact',
			},
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update a contact',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a contact permanently',
				action: 'Delete a contact',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a contact',
				action: 'Get a contact',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of contacts',
				action: 'Get many contacts',
			},
			{
				name: 'Remove From Segment',
				value: 'removeFromSegment',
				description: 'Remove a contact from a manual segment. The contact stays in your contacts.',
				action: 'Remove contact from segment',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update the name, subscription or properties of a contact',
				action: 'Update a contact',
			},
		],
		default: 'create',
	},
];

export const contactFields: INodeProperties[] = [
	// create and upsert
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'e.g. nathan@example.com',
		required: true,
		default: '',
		description: 'The email address of the contact',
		displayOptions: { show: { resource: ['contact'], operation: ['create', 'upsert'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['create', 'upsert'] } },
		options: [
			...nameAndSubscriptionFields,
			propertiesField,
			{
				displayName: 'Segment Names or IDs',
				name: 'segmentIds',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getSegments' },
				default: [],
				description:
					'Manual segments to add the contact to. For Create or Update, this only adds segments. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},

	// get, update, delete, segments
	contactIdField(['get', 'update', 'delete', 'addToSegment', 'removeFromSegment']),
	segmentIdField(['addToSegment', 'removeFromSegment']),

	// update
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
		options: [
			...nameAndSubscriptionFields,
			propertiesField,
			{
				displayName: 'Segment Names or IDs',
				name: 'segmentIds',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getSegments' },
				default: [],
				description:
					'Replaces all manual segments of the contact with this list. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},

	// get many
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				placeholder: 'e.g. nathan',
				description:
					'Search by email, first name or last name. Several email addresses separated by commas match exactly.',
			},
			{
				displayName: 'Segment Name or ID',
				name: 'segmentId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getSegments' },
				default: '',
				description:
					'Only contacts in this manual segment. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'All', value: 'all' },
					{ name: 'Subscribed', value: 'subscribed' },
					{ name: 'Unsubscribed', value: 'unsubscribed' },
				],
				default: 'all',
				description: 'Only contacts with this subscription status',
			},
		],
	},

	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: { resource: ['contact'], operation: ['get', 'getAll'] } },
	},
];
