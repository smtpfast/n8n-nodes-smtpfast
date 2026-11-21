import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { contactFields, contactOperations } from './descriptions/ContactDescription';
import { domainFields, domainOperations } from './descriptions/DomainDescription';
import { emailFields, emailOperations } from './descriptions/EmailDescription';
import { pathSegment, smtpfastApiRequest } from './transport';
import {
	buildContactFields,
	buildSendEmailRequest,
	parseAddresses,
	parseBinaryPropertyNames,
	simplifyContact,
	simplifyDomain,
	simplifyEmail,
} from './utils';

const MAX_ATTACHMENTS = 10;
const CONTACTS_PAGE_SIZE = 100;

async function buildAttachments(
	this: IExecuteFunctions,
	itemIndex: number,
	value: unknown,
): Promise<IDataObject[]> {
	const names = parseBinaryPropertyNames(value);
	if (names.length > MAX_ATTACHMENTS) {
		throw new NodeOperationError(
			this.getNode(),
			`SMTPfast accepts up to ${MAX_ATTACHMENTS} attachments per email, and ${names.length} were given`,
			{ itemIndex, description: "Give fewer binary field names in 'Attachments'" },
		);
	}
	const attachments: IDataObject[] = [];
	for (const name of names) {
		const binary = this.helpers.assertBinaryData(itemIndex, name);
		const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, name);
		const attachment: IDataObject = {
			filename: binary.fileName ?? name,
			content: buffer.toString('base64'),
		};
		if (binary.mimeType) attachment.content_type = binary.mimeType;
		attachments.push(attachment);
	}
	return attachments;
}

async function sendEmail(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	const emailFormat = this.getNodeParameter('emailFormat', i) as string;
	const to = this.getNodeParameter('to', i);

	if (parseAddresses(to).length === 0) {
		throw new NodeOperationError(this.getNode(), "The 'To' field has no address", {
			itemIndex: i,
			description: 'Enter at least one recipient address',
		});
	}
	if (additionalFields.scheduledAt && isNaN(Date.parse(String(additionalFields.scheduledAt)))) {
		throw new NodeOperationError(this.getNode(), "The 'Scheduled At' value is not a date", {
			itemIndex: i,
			description: 'Use an ISO 8601 date and time, e.g. 2026-04-10T14:00:00Z',
		});
	}

	const attachments = await buildAttachments.call(this, i, additionalFields.attachments);

	const request = buildSendEmailRequest({
		from: this.getNodeParameter('from', i) as string,
		to,
		subject: this.getNodeParameter('subject', i) as string,
		emailFormat,
		html:
			emailFormat === 'html' || emailFormat === 'both'
				? (this.getNodeParameter('html', i) as string)
				: undefined,
		text:
			emailFormat === 'text' || emailFormat === 'both'
				? (this.getNodeParameter('text', i) as string)
				: undefined,
		category: this.getNodeParameter('category', i) as string,
		additionalFields,
		attachments,
	});

	return smtpfastApiRequest.call(this, 'POST', '/emails', request.body, undefined, request.headers);
}

async function getAllContacts(this: IExecuteFunctions, i: number): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
	const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

	const qs: IDataObject = {};
	if (filters.q) qs.q = filters.q;
	if (filters.status && filters.status !== 'all') qs.status = filters.status;
	if (filters.segmentId) qs.segment_id = filters.segmentId;

	// The page size stays the same on every page, so page numbers keep pointing at the right rows.
	const pageSize = Math.min(CONTACTS_PAGE_SIZE, limit);
	const contacts: IDataObject[] = [];
	for (let page = 1; contacts.length < limit; page++) {
		const response = await smtpfastApiRequest.call(this, 'GET', '/contacts', undefined, {
			...qs,
			limit: pageSize,
			page,
		});
		const data = (response.data as IDataObject[]) ?? [];
		contacts.push(...data);
		if (!response.has_more || data.length === 0) break;
	}
	return contacts.slice(0, limit);
}

async function updateContact(this: IExecuteFunctions, i: number): Promise<IDataObject> {
	const contactId = this.getNodeParameter('contactId', i) as string;
	const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
	const body = buildContactFields(updateFields);
	if (Object.keys(body).length === 0) {
		throw new NodeOperationError(this.getNode(), 'No fields to update', {
			itemIndex: i,
			description: "Add at least one field under 'Update Fields'",
		});
	}
	return smtpfastApiRequest.call(this, 'PATCH', `/contacts/${pathSegment(contactId)}`, body);
}

export class Smtpfast implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SMTPfast',
		name: 'smtpfast',
		icon: { light: 'file:../../icons/smtpfast.svg', dark: 'file:../../icons/smtpfast.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send email and manage contacts and domains with the SMTPfast API',
		defaults: {
			name: 'SMTPfast',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'smtpfastApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'Domain', value: 'domain' },
					{ name: 'Email', value: 'email' },
				],
				default: 'email',
			},
			...emailOperations,
			...emailFields,
			...contactOperations,
			...contactFields,
			...domainOperations,
			...domainFields,
		],
	};

	methods = {
		loadOptions: {
			async getSegments(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await smtpfastApiRequest.call(this, 'GET', '/segments');
				const segments = (response.data as IDataObject[]) ?? [];
				return segments.map((segment) => ({
					name: String(segment.name),
					value: String(segment.id),
				}));
			},
			async getDomains(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await smtpfastApiRequest.call(this, 'GET', '/domains');
				const domains = (response.data as IDataObject[]) ?? [];
				return domains.map((domain) => ({
					name: `${String(domain.domain)} (${String(domain.status)})`,
					value: String(domain.id),
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let result: IDataObject | IDataObject[];

				if (resource === 'email') {
					if (operation === 'send') {
						result = await sendEmail.call(this, i);
					} else if (operation === 'get') {
						const emailId = this.getNodeParameter('emailId', i) as string;
						const email = await smtpfastApiRequest.call(
							this,
							'GET',
							`/emails/${pathSegment(emailId)}`,
						);
						result = this.getNodeParameter('simplify', i) ? simplifyEmail(email) : email;
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
							itemIndex: i,
						});
					}
				} else if (resource === 'contact') {
					if (operation === 'create' || operation === 'upsert') {
						const email = (this.getNodeParameter('email', i) as string).trim();
						const additionalFields = this.getNodeParameter(
							'additionalFields',
							i,
							{},
						) as IDataObject;
						const contact = { email, ...buildContactFields(additionalFields) };
						if (operation === 'create') {
							result = await smtpfastApiRequest.call(this, 'POST', '/contacts', contact);
						} else {
							// The bulk form of POST /v1/contacts matches by email and updates, so it is the upsert.
							const response = await smtpfastApiRequest.call(this, 'POST', '/contacts', {
								contacts: [contact],
							});
							result = ((response.data as IDataObject[]) ?? [])[0] ?? response;
						}
					} else if (operation === 'update') {
						result = await updateContact.call(this, i);
					} else if (operation === 'get') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const contact = await smtpfastApiRequest.call(
							this,
							'GET',
							`/contacts/${pathSegment(contactId)}`,
						);
						result = this.getNodeParameter('simplify', i) ? simplifyContact(contact) : contact;
					} else if (operation === 'getAll') {
						const contacts = await getAllContacts.call(this, i);
						result = this.getNodeParameter('simplify', i)
							? contacts.map((contact) => simplifyContact(contact))
							: contacts;
					} else if (operation === 'delete') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						await smtpfastApiRequest.call(this, 'DELETE', `/contacts/${pathSegment(contactId)}`);
						result = { deleted: true };
					} else if (operation === 'addToSegment' || operation === 'removeFromSegment') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const segmentId = this.getNodeParameter('segmentId', i) as string;
						const response = await smtpfastApiRequest.call(
							this,
							operation === 'addToSegment' ? 'POST' : 'DELETE',
							`/contacts/${pathSegment(contactId)}/segments/${pathSegment(segmentId)}`,
						);
						result = { contact: contactId, segment_id: segmentId, ...response };
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
							itemIndex: i,
						});
					}
				} else if (resource === 'domain') {
					const simplify = this.getNodeParameter('simplify', i) as boolean;
					if (operation === 'get') {
						const domainId = this.getNodeParameter('domainId', i) as string;
						const domain = await smtpfastApiRequest.call(
							this,
							'GET',
							`/domains/${pathSegment(domainId)}`,
						);
						result = simplify ? simplifyDomain(domain) : domain;
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const response = await smtpfastApiRequest.call(this, 'GET', '/domains');
						let domains = (response.data as IDataObject[]) ?? [];
						if (!returnAll) domains = domains.slice(0, this.getNodeParameter('limit', i) as number);
						result = simplify ? domains.map((domain) => simplifyDomain(domain)) : domains;
					} else {
						throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, {
							itemIndex: i,
						});
					}
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, {
						itemIndex: i,
					});
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(result),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					error.context.itemIndex = i;
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
				if (error instanceof NodeApiError) {
					error.context.itemIndex = i;
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
