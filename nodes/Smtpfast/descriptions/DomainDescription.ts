import type { INodeProperties } from 'n8n-workflow';

export const domainOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['domain'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a sending domain with its verification status and DNS records',
				action: 'Get a domain',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of sending domains',
				action: 'Get many domains',
			},
		],
		default: 'getAll',
	},
];

export const domainFields: INodeProperties[] = [
	{
		displayName: 'Domain Name or ID',
		name: 'domainId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDomains' },
		required: true,
		default: '',
		description:
			'The sending domain. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { resource: ['domain'], operation: ['get'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['domain'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['domain'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: { resource: ['domain'] } },
	},
];
