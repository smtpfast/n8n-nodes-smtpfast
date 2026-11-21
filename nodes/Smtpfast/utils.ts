import type { IDataObject } from 'n8n-workflow';

/**
 * Split a list of addresses on commas, semicolons and new lines. A comma inside
 * quotes or angle brackets stays, so "Smith, Nathan" <nathan@example.com> is one address.
 */
export function parseAddresses(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (Array.isArray(value)) return value.flatMap((entry) => parseAddresses(entry));
	const text = String(value);
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	let inBrackets = false;
	for (const char of text) {
		if (char === '"') inQuotes = !inQuotes;
		else if (char === '<' && !inQuotes) inBrackets = true;
		else if (char === '>' && !inQuotes) inBrackets = false;
		if ((char === ',' || char === ';' || char === '\n') && !inQuotes && !inBrackets) {
			result.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	result.push(current);
	return result.map((entry) => entry.trim()).filter((entry) => entry !== '');
}

export interface SendEmailInput {
	from: string;
	to: unknown;
	subject: string;
	emailFormat: string;
	html?: string;
	text?: string;
	category: string;
	additionalFields: IDataObject;
	attachments?: IDataObject[];
}

export interface SendEmailRequest {
	body: IDataObject;
	headers: IDataObject;
}

interface NameValue {
	name?: string;
	value?: string;
}

function namedValues(collection: unknown, key: string): NameValue[] {
	if (!collection || typeof collection !== 'object') return [];
	const entries = (collection as IDataObject)[key];
	return Array.isArray(entries) ? (entries as NameValue[]) : [];
}

/** Build the POST /v1/emails body and headers from the node parameters of one item. */
export function buildSendEmailRequest(input: SendEmailInput): SendEmailRequest {
	const fields = input.additionalFields ?? {};
	const body: IDataObject = {
		from: input.from.trim(),
		to: parseAddresses(input.to),
		subject: input.subject,
		category: input.category,
	};

	if (input.emailFormat === 'html' || input.emailFormat === 'both') body.html = input.html ?? '';
	if (input.emailFormat === 'text' || input.emailFormat === 'both') body.text = input.text ?? '';

	const cc = parseAddresses(fields.cc);
	if (cc.length) body.cc = cc;
	const bcc = parseAddresses(fields.bcc);
	if (bcc.length) body.bcc = bcc;
	const replyTo = parseAddresses(fields.replyTo);
	if (replyTo.length) body.reply_to = replyTo;

	const tags = namedValues(fields.tags, 'tag')
		.filter((tag) => tag.name)
		.map((tag) => ({ name: String(tag.name), value: String(tag.value ?? '') }));
	if (tags.length) body.tags = tags;

	const headerEntries = namedValues(fields.headers, 'header').filter((header) => header.name);
	if (headerEntries.length) {
		const customHeaders: IDataObject = {};
		for (const header of headerEntries) {
			customHeaders[String(header.name)] = String(header.value ?? '');
		}
		body.headers = customHeaders;
	}

	if (fields.scheduledAt) body.scheduled_at = new Date(String(fields.scheduledAt)).toISOString();
	if (typeof fields.trackClicks === 'boolean') body.track_clicks = fields.trackClicks;
	if (typeof fields.trackOpens === 'boolean') body.track_opens = fields.trackOpens;
	if (input.attachments && input.attachments.length) body.attachments = input.attachments;

	const headers: IDataObject = {};
	const idempotencyKey = String(fields.idempotencyKey ?? '').trim();
	if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

	return { body, headers };
}

/** The names of the binary fields to attach, from a comma-separated list. */
export function parseBinaryPropertyNames(value: unknown): string[] {
	return String(value ?? '')
		.split(',')
		.map((name) => name.trim())
		.filter((name) => name !== '');
}

function toPropertyValue(
	name: string,
	type: unknown,
	value: unknown,
): IDataObject[keyof IDataObject] {
	if (type === 'null') return null;
	if (type === 'number') {
		const number = typeof value === 'number' ? value : Number(String(value ?? '').trim());
		if (String(value ?? '').trim() === '' || !Number.isFinite(number)) {
			throw new Error(`The value of property '${name}' is not a number`);
		}
		return number;
	}
	if (type === 'boolean') {
		if (typeof value === 'boolean') return value;
		const text = String(value ?? '')
			.trim()
			.toLowerCase();
		if (text === 'true') return true;
		if (text === 'false') return false;
		throw new Error(`The value of property '${name}' is not true or false`);
	}
	// Text, or a value an expression already typed.
	return value === undefined ? '' : (value as IDataObject[keyof IDataObject]);
}

/** Turn the Properties fixed collection into the API's properties object. */
export function propertiesToObject(collection: unknown): IDataObject | undefined {
	if (!collection || typeof collection !== 'object') return undefined;
	const entries = (collection as IDataObject).property;
	if (!Array.isArray(entries) || entries.length === 0) return undefined;
	const result: IDataObject = {};
	for (const entry of entries as Array<{ key?: string; type?: string; value?: unknown }>) {
		if (!entry.key) continue;
		result[entry.key] = toPropertyValue(entry.key, entry.type ?? 'string', entry.value);
	}
	return Object.keys(result).length ? result : undefined;
}

/** Map the contact fields of the node to the API field names. */
export function buildContactFields(fields: IDataObject): IDataObject {
	const body: IDataObject = {};
	if (fields.firstName !== undefined) body.first_name = fields.firstName;
	if (fields.lastName !== undefined) body.last_name = fields.lastName;
	if (typeof fields.unsubscribed === 'boolean') body.unsubscribed = fields.unsubscribed;
	const properties = propertiesToObject(fields.properties);
	if (properties) body.properties = properties;
	if (Array.isArray(fields.segmentIds)) body.segment_ids = fields.segmentIds;
	else if (typeof fields.segmentIds === 'string' && fields.segmentIds.trim() !== '') {
		body.segment_ids = parseBinaryPropertyNames(fields.segmentIds);
	}
	return body;
}

function pick(source: IDataObject, keys: string[]): IDataObject {
	const result: IDataObject = {};
	for (const key of keys) {
		if (key in source) result[key] = source[key];
	}
	return result;
}

export function simplifyEmail(email: IDataObject): IDataObject {
	return pick(email, [
		'id',
		'status',
		'to',
		'from',
		'subject',
		'category',
		'created_at',
		'delivered_at',
		'bounced_at',
		'error_message',
	]);
}

export function simplifyContact(contact: IDataObject): IDataObject {
	const result = pick(contact, [
		'id',
		'email',
		'first_name',
		'last_name',
		'unsubscribed',
		'suppressed',
		'disposable',
		'created_at',
		'properties',
	]);
	if (Array.isArray(contact.segments)) {
		result.segments = (contact.segments as IDataObject[]).map((segment) => segment.name as string);
	}
	return result;
}

export function simplifyDomain(domain: IDataObject): IDataObject {
	return pick(domain, [
		'id',
		'domain',
		'status',
		'verification_phase',
		'verification_message',
		'dns_live',
		'dkim_status',
		'spf_status',
		'dmarc_status',
		'verified_at',
	]);
}
