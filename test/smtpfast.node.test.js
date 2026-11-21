'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');

const { Smtpfast } = require('../dist/nodes/Smtpfast/Smtpfast.node.js');
const { parseAddresses, buildSendEmailRequest } = require('../dist/nodes/Smtpfast/utils.js');
const { createExecuteContext, httpError } = require('./helpers');

const API = 'https://smtpfa.st/api/v1';
const node = new Smtpfast();

function run(options) {
	const { context, calls } = createExecuteContext(options);
	return { calls, result: node.execute.call(context) };
}

const sendParams = (overrides = {}) => ({
	resource: 'email',
	operation: 'send',
	from: 'Acme <hello@acme.dev>',
	to: 'success@simulator.amazonses.com',
	subject: 'Hello',
	emailFormat: 'html',
	html: '<p>Hi</p>',
	category: 'transactional',
	additionalFields: {},
	...overrides,
});

describe('parseAddresses', () => {
	it('splits on commas, semicolons and new lines', () => {
		assert.deepEqual(parseAddresses('a@x.dev, b@x.dev;c@x.dev\nd@x.dev'), [
			'a@x.dev',
			'b@x.dev',
			'c@x.dev',
			'd@x.dev',
		]);
	});

	it('keeps commas inside quotes and angle brackets', () => {
		assert.deepEqual(parseAddresses('"Smith, Nathan" <nathan@x.dev>, b@x.dev'), [
			'"Smith, Nathan" <nathan@x.dev>',
			'b@x.dev',
		]);
	});

	it('accepts arrays and drops empty entries', () => {
		assert.deepEqual(parseAddresses(['a@x.dev', ' b@x.dev , ', '']), ['a@x.dev', 'b@x.dev']);
		assert.deepEqual(parseAddresses(undefined), []);
		assert.deepEqual(parseAddresses(' , '), []);
	});
});

describe('buildSendEmailRequest', () => {
	it('sends only the body parts the format asks for', () => {
		const text = buildSendEmailRequest({
			from: 'a@x.dev',
			to: 'b@x.dev',
			subject: 's',
			emailFormat: 'text',
			text: 'plain',
			category: 'marketing',
			additionalFields: {},
		});
		assert.equal(text.body.text, 'plain');
		assert.equal('html' in text.body, false);

		const both = buildSendEmailRequest({
			from: 'a@x.dev',
			to: 'b@x.dev',
			subject: 's',
			emailFormat: 'both',
			html: '<p>x</p>',
			text: 'x',
			category: 'marketing',
			additionalFields: {},
		});
		assert.equal(both.body.html, '<p>x</p>');
		assert.equal(both.body.text, 'x');
	});

	it('leaves out optional fields that were not set', () => {
		const { body, headers } = buildSendEmailRequest({
			from: ' a@x.dev ',
			to: 'b@x.dev',
			subject: 's',
			emailFormat: 'html',
			html: 'h',
			category: 'marketing',
			additionalFields: { cc: '', tags: {}, headers: { header: [] } },
		});
		assert.deepEqual(Object.keys(body).sort(), ['category', 'from', 'html', 'subject', 'to']);
		assert.equal(body.from, 'a@x.dev');
		assert.deepEqual(headers, {});
	});
});

describe('Email: send', () => {
	it('builds the POST /v1/emails request from every field', async () => {
		const { calls, result } = run({
			params: [
				sendParams({
					to: 'success@simulator.amazonses.com, bounce@simulator.amazonses.com',
					additionalFields: {
						cc: 'cc@x.dev',
						bcc: 'bcc1@x.dev; bcc2@x.dev',
						replyTo: 'support@acme.dev',
						tags: { tag: [{ name: 'flow', value: 'n8n' }] },
						headers: { header: [{ name: 'X-Entity-Ref-ID', value: 'abc-123' }] },
						trackClicks: false,
						trackOpens: true,
						scheduledAt: '2026-12-01T10:00:00.000Z',
						idempotencyKey: 'order-1041',
					},
				}),
			],
			replies: [{ id: 'email_1' }],
		});
		const output = await result;

		assert.equal(calls.length, 1);
		const { credentialType, options } = calls[0];
		assert.equal(credentialType, 'smtpfastApi');
		assert.equal(options.method, 'POST');
		assert.equal(options.url, `${API}/emails`);
		assert.equal(options.json, true);
		assert.equal(options.headers['Idempotency-Key'], 'order-1041');
		assert.deepEqual(options.body, {
			from: 'Acme <hello@acme.dev>',
			to: ['success@simulator.amazonses.com', 'bounce@simulator.amazonses.com'],
			subject: 'Hello',
			category: 'transactional',
			html: '<p>Hi</p>',
			cc: ['cc@x.dev'],
			bcc: ['bcc1@x.dev', 'bcc2@x.dev'],
			reply_to: ['support@acme.dev'],
			tags: [{ name: 'flow', value: 'n8n' }],
			headers: { 'X-Entity-Ref-ID': 'abc-123' },
			scheduled_at: '2026-12-01T10:00:00.000Z',
			track_clicks: false,
			track_opens: true,
		});
		assert.deepEqual(output, [[{ json: { id: 'email_1' }, pairedItem: { item: 0 } }]]);
	});

	it('sends one request per input item', async () => {
		const { calls, result } = run({
			params: [
				sendParams({ to: 'success@simulator.amazonses.com' }),
				sendParams({ to: 'bounce@simulator.amazonses.com' }),
			],
			replies: [{ id: 'email_1' }, { id: 'email_2' }],
		});
		const output = await result;
		assert.equal(calls.length, 2);
		assert.deepEqual(calls[0].options.body.to, ['success@simulator.amazonses.com']);
		assert.deepEqual(calls[1].options.body.to, ['bounce@simulator.amazonses.com']);
		assert.deepEqual(
			output[0].map((item) => [item.json.id, item.pairedItem.item]),
			[
				['email_1', 0],
				['email_2', 1],
			],
		);
	});

	it('attaches binary data as base64 with the file name and type', async () => {
		const pdf = Buffer.from('%PDF-1.4 test');
		const { calls, result } = run({
			params: [sendParams({ additionalFields: { attachments: 'invoice, logo' } })],
			items: [
				{
					json: {},
					binary: {
						invoice: {
							data: pdf.toString('base64'),
							fileName: 'invoice.pdf',
							mimeType: 'application/pdf',
						},
						logo: { data: Buffer.from('png').toString('base64'), mimeType: 'image/png' },
					},
				},
			],
			replies: [{ id: 'email_1' }],
		});
		await result;
		assert.deepEqual(calls[0].options.body.attachments, [
			{ filename: 'invoice.pdf', content: pdf.toString('base64'), content_type: 'application/pdf' },
			{
				filename: 'logo',
				content: Buffer.from('png').toString('base64'),
				content_type: 'image/png',
			},
		]);
	});

	it('refuses more than 10 attachments before calling the API', async () => {
		const names = Array.from({ length: 11 }, (_, i) => `f${i}`).join(',');
		const { calls, result } = run({
			params: [sendParams({ additionalFields: { attachments: names } })],
		});
		await assert.rejects(result, NodeOperationError);
		assert.equal(calls.length, 0);
	});

	it('refuses an empty To field before calling the API', async () => {
		const { calls, result } = run({ params: [sendParams({ to: ' , ' })] });
		await assert.rejects(result, /no address/);
		assert.equal(calls.length, 0);
	});

	it('refuses a Scheduled At value that is not a date', async () => {
		const { calls, result } = run({
			params: [sendParams({ additionalFields: { scheduledAt: 'tomorrow-ish' } })],
		});
		await assert.rejects(result, /not a date/);
		assert.equal(calls.length, 0);
	});

	it('turns API failures into NodeApiError with the item index', async () => {
		const { result } = run({
			params: [sendParams()],
			replies: [httpError(401, { error: 'Invalid API key' })],
		});
		await assert.rejects(result, (error) => {
			assert.ok(error instanceof NodeApiError);
			assert.equal(error.httpCode, '401');
			assert.equal(error.context.itemIndex, 0);
			return true;
		});
	});

	it('returns the error as an item when Continue On Fail is on', async () => {
		const { result } = run({
			params: [sendParams(), sendParams()],
			replies: [httpError(403), { id: 'email_2' }],
			continueOnFail: true,
		});
		const output = await result;
		assert.equal(output[0].length, 2);
		assert.ok(output[0][0].json.error);
		assert.deepEqual(output[0][0].pairedItem, { item: 0 });
		assert.equal(output[0][1].json.id, 'email_2');
	});
});

describe('Email: get', () => {
	const email = {
		id: 'email_1',
		status: 'bounced',
		to: ['bounce@simulator.amazonses.com'],
		from: 'a@x.dev',
		subject: 's',
		category: 'transactional',
		created_at: 't0',
		delivered_at: null,
		bounced_at: 't1',
		error_message: null,
		html: '<p>big</p>',
		events: [{ type: 'bounced' }],
	};

	it('gets the email by encoded ID and simplifies it', async () => {
		const { calls, result } = run({
			params: [{ resource: 'email', operation: 'get', emailId: 'email/1', simplify: true }],
			replies: [email],
		});
		const output = await result;
		assert.equal(calls[0].options.method, 'GET');
		assert.equal(calls[0].options.url, `${API}/emails/email%2F1`);
		const json = output[0][0].json;
		assert.equal(json.status, 'bounced');
		assert.equal('html' in json, false);
		assert.equal('events' in json, false);
		assert.ok(Object.keys(json).length <= 10);
	});

	it('returns the raw email when Simplify is off', async () => {
		const { result } = run({
			params: [{ resource: 'email', operation: 'get', emailId: 'email_1', simplify: false }],
			replies: [email],
		});
		const output = await result;
		assert.deepEqual(output[0][0].json, email);
	});
});

describe('Contact', () => {
	it('creates a contact with the API field names', async () => {
		const { calls, result } = run({
			params: [
				{
					resource: 'contact',
					operation: 'create',
					email: ' nathan@x.dev ',
					additionalFields: {
						firstName: 'Nathan',
						lastName: 'Smith',
						unsubscribed: false,
						properties: { property: [{ key: 'company', value: 'Acme' }] },
						segmentIds: ['seg_1'],
					},
				},
			],
			replies: [{ object: 'contact', id: 'c_1' }],
		});
		await result;
		assert.equal(calls[0].options.method, 'POST');
		assert.equal(calls[0].options.url, `${API}/contacts`);
		assert.deepEqual(calls[0].options.body, {
			email: 'nathan@x.dev',
			first_name: 'Nathan',
			last_name: 'Smith',
			unsubscribed: false,
			properties: { company: 'Acme' },
			segment_ids: ['seg_1'],
		});
	});

	it('upserts through the bulk form and returns the one contact', async () => {
		const contact = { id: 'c_1', email: 'nathan@x.dev', first_name: 'Nathan' };
		const { calls, result } = run({
			params: [
				{
					resource: 'contact',
					operation: 'upsert',
					email: 'nathan@x.dev',
					additionalFields: { firstName: 'Nathan' },
				},
			],
			replies: [{ object: 'list', has_more: false, data: [contact] }],
		});
		const output = await result;
		assert.deepEqual(calls[0].options.body, {
			contacts: [{ email: 'nathan@x.dev', first_name: 'Nathan' }],
		});
		assert.deepEqual(output[0][0].json, contact);
	});

	it('updates a contact found by email address', async () => {
		const { calls, result } = run({
			params: [
				{
					resource: 'contact',
					operation: 'update',
					contactId: 'nathan+n8n@x.dev',
					updateFields: { unsubscribed: true, segmentIds: [] },
				},
			],
			replies: [{ object: 'contact', id: 'c_1' }],
		});
		await result;
		assert.equal(calls[0].options.method, 'PATCH');
		assert.equal(calls[0].options.url, `${API}/contacts/nathan%2Bn8n%40x.dev`);
		assert.deepEqual(calls[0].options.body, { unsubscribed: true, segment_ids: [] });
	});

	it('refuses an update with no fields', async () => {
		const { calls, result } = run({
			params: [{ resource: 'contact', operation: 'update', contactId: 'c_1', updateFields: {} }],
		});
		await assert.rejects(result, /No fields to update/);
		assert.equal(calls.length, 0);
	});

	it('deletes a contact and returns deleted: true', async () => {
		const { calls, result } = run({
			params: [{ resource: 'contact', operation: 'delete', contactId: 'c_1' }],
			replies: [{ object: 'contact', contact: 'c_1', deleted: true }],
		});
		const output = await result;
		assert.equal(calls[0].options.method, 'DELETE');
		assert.equal(calls[0].options.url, `${API}/contacts/c_1`);
		assert.deepEqual(output[0][0].json, { deleted: true });
	});

	it('adds to and removes from a segment', async () => {
		const add = run({
			params: [
				{ resource: 'contact', operation: 'addToSegment', contactId: 'c_1', segmentId: 'seg_1' },
			],
			replies: [{ id: 'seg_1' }],
		});
		await add.result;
		assert.equal(add.calls[0].options.method, 'POST');
		assert.equal(add.calls[0].options.url, `${API}/contacts/c_1/segments/seg_1`);

		const remove = run({
			params: [
				{
					resource: 'contact',
					operation: 'removeFromSegment',
					contactId: 'c_1',
					segmentId: 'seg_1',
				},
			],
			replies: [{ id: 'seg_1' }],
		});
		await remove.result;
		assert.equal(remove.calls[0].options.method, 'DELETE');
		assert.equal(remove.calls[0].options.url, `${API}/contacts/c_1/segments/seg_1`);
	});

	it('pages through Get Many with a fixed page size and stops at the limit', async () => {
		const page = (start, count, hasMore) => ({
			object: 'list',
			has_more: hasMore,
			data: Array.from({ length: count }, (_, i) => ({
				id: `c_${start + i}`,
				email: `${start + i}@x.dev`,
				segments: [{ id: 's', name: 'Beta', color: null }],
			})),
		});
		const { calls, result } = run({
			params: [
				{
					resource: 'contact',
					operation: 'getAll',
					returnAll: false,
					limit: 150,
					filters: { q: 'x.dev', status: 'subscribed', segmentId: 'seg_1' },
					simplify: true,
				},
			],
			replies: [page(0, 100, true), page(100, 100, true)],
		});
		const output = await result;
		assert.equal(calls.length, 2);
		assert.deepEqual(calls[0].options.qs, {
			q: 'x.dev',
			status: 'subscribed',
			segment_id: 'seg_1',
			limit: 100,
			page: 1,
		});
		assert.equal(calls[1].options.qs.page, 2);
		assert.equal(output[0].length, 150);
		assert.deepEqual(output[0][0].json.segments, ['Beta']);
	});

	it('Get Many with Return All follows has_more and leaves out the all status', async () => {
		const { calls, result } = run({
			params: [
				{
					resource: 'contact',
					operation: 'getAll',
					returnAll: true,
					filters: { status: 'all' },
					simplify: false,
				},
			],
			replies: [
				{ has_more: true, data: [{ id: 'c_1' }] },
				{ has_more: false, data: [{ id: 'c_2' }] },
			],
		});
		const output = await result;
		assert.equal(calls.length, 2);
		assert.equal('status' in calls[0].options.qs, false);
		assert.deepEqual(
			output[0].map((item) => item.json.id),
			['c_1', 'c_2'],
		);
	});
});

describe('Domain', () => {
	const domains = {
		object: 'list',
		has_more: false,
		data: [
			{ id: 'd_1', domain: 'a.dev', status: 'verified', dkim_status: 'verified', created_at: 't' },
			{ id: 'd_2', domain: 'b.dev', status: 'pending', dkim_status: 'pending', created_at: 't' },
		],
	};

	it('lists domains with a limit', async () => {
		const { calls, result } = run({
			params: [
				{ resource: 'domain', operation: 'getAll', returnAll: false, limit: 1, simplify: true },
			],
			replies: [domains],
		});
		const output = await result;
		assert.equal(calls[0].options.url, `${API}/domains`);
		assert.equal(output[0].length, 1);
		assert.equal(output[0][0].json.domain, 'a.dev');
		assert.equal('created_at' in output[0][0].json, false);
	});

	it('gets one domain by ID', async () => {
		const { calls, result } = run({
			params: [{ resource: 'domain', operation: 'get', domainId: 'd_1', simplify: false }],
			replies: [{ id: 'd_1', status: 'verified', dns_records: [] }],
		});
		const output = await result;
		assert.equal(calls[0].options.url, `${API}/domains/d_1`);
		assert.deepEqual(output[0][0].json.dns_records, []);
	});
});

describe('load options', () => {
	it('lists segments and domains for the dropdowns', async () => {
		const { context } = createExecuteContext({
			params: [{}],
			replies: [
				{ data: [{ id: 'seg_1', name: 'Beta' }] },
				{ data: [{ id: 'd_1', domain: 'a.dev', status: 'verified' }] },
			],
		});
		assert.deepEqual(await node.methods.loadOptions.getSegments.call(context), [
			{ name: 'Beta', value: 'seg_1' },
		]);
		assert.deepEqual(await node.methods.loadOptions.getDomains.call(context), [
			{ name: 'a.dev (verified)', value: 'd_1' },
		]);
	});
});
