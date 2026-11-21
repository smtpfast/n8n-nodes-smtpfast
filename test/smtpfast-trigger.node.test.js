'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { NodeOperationError } = require('n8n-workflow');

const {
	SmtpfastTrigger,
	isValidSignature,
} = require('../dist/nodes/SmtpfastTrigger/SmtpfastTrigger.node.js');
const { apiError, createTriggerContext } = require('./helpers');

const API = 'https://smtpfa.st/api/v1';
const URL = 'https://n8n.example.com/webhook/abc/webhook';
const EVENTS = ['email.delivered', 'email.bounced'];
const trigger = new SmtpfastTrigger();
const hooks = trigger.webhookMethods.default;

const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('hex');
const stored = (id = 'wh_1', secret = 's', url = URL) => ({ webhooks: { [url]: { id, secret } } });

describe('trigger lifecycle', () => {
	it('create registers a standard webhook and keeps its ID and secret', async () => {
		const { context, calls, staticData } = createTriggerContext({
			params: { events: EVENTS },
			replies: [{ id: 'wh_1', url: URL, events: EVENTS, secret: 's3cret', active: true }],
		});
		assert.equal(await hooks.create.call(context), true);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].credentialType, 'smtpfastApi');
		assert.equal(calls[0].options.method, 'POST');
		assert.equal(calls[0].options.url, `${API}/webhooks`);
		assert.deepEqual(calls[0].options.body, { url: URL, events: EVENTS, format: 'standard' });
		assert.deepEqual(staticData, stored('wh_1', 's3cret'));
	});

	it('create refuses a webhook URL that is not HTTPS, without calling the API', async () => {
		const { context, calls } = createTriggerContext({
			params: { events: EVENTS },
			webhookUrl: 'http://localhost:5678/webhook/abc/webhook',
		});
		await assert.rejects(hooks.create.call(context), NodeOperationError);
		assert.equal(calls.length, 0);
	});

	it('create fails when the API returns no signing secret', async () => {
		const { context, staticData } = createTriggerContext({
			params: { events: EVENTS },
			replies: [{ id: 'wh_1' }],
		});
		await assert.rejects(hooks.create.call(context), /signing secret/);
		assert.equal(staticData.webhooks?.[URL], undefined);
	});

	it('checkExists is false without a stored webhook and makes no call', async () => {
		const { context, calls } = createTriggerContext({ params: { events: EVENTS } });
		assert.equal(await hooks.checkExists.call(context), false);
		assert.equal(calls.length, 0);
	});

	it('checkExists is true when the stored webhook matches the URL and events', async () => {
		const { context, calls } = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored(),
			replies: [
				{ id: 'wh_1', url: URL, events: [...EVENTS].reverse(), active: true, format: 'standard' },
			],
		});
		assert.equal(await hooks.checkExists.call(context), true);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].options.method, 'GET');
		assert.equal(calls[0].options.url, `${API}/webhooks/wh_1`);
	});

	it('checkExists only looks at the webhook stored for the current URL', async () => {
		const { context, calls } = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored('wh_prod', 's', 'https://n8n.example.com/webhook/prod/webhook'),
			webhookUrl: 'https://n8n.example.com/webhook-test/abc/webhook',
		});
		assert.equal(await hooks.checkExists.call(context), false);
		assert.equal(calls.length, 0);
	});

	it('checkExists clears the stored webhook when SMTPfast no longer has it', async () => {
		const { context, staticData } = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored(),
			replies: [apiError(404)],
		});
		assert.equal(await hooks.checkExists.call(context), false);
		assert.deepEqual(staticData, { webhooks: {} });
	});

	it('checkExists updates the events of the webhook and keeps its secret', async () => {
		const { context, calls, staticData } = createTriggerContext({
			params: { events: ['email.opened'] },
			staticData: stored(),
			replies: [{ id: 'wh_1', url: URL, events: EVENTS, active: false }, { id: 'wh_1' }],
		});
		assert.equal(await hooks.checkExists.call(context), true);
		assert.equal(calls[1].options.method, 'PATCH');
		assert.equal(calls[1].options.url, `${API}/webhooks/wh_1`);
		assert.deepEqual(calls[1].options.body, {
			events: ['email.opened'],
			active: true,
			format: 'standard',
		});
		assert.deepEqual(staticData, stored());
	});

	it('checkExists passes other API failures on', async () => {
		const { context } = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored(),
			replies: [apiError(500)],
		});
		await assert.rejects(hooks.checkExists.call(context));
	});

	it('delete removes the webhook and the stored secret', async () => {
		const { context, calls, staticData } = createTriggerContext({
			staticData: stored(),
			replies: [{ success: true }],
		});
		assert.equal(await hooks.delete.call(context), true);
		assert.equal(calls[0].options.method, 'DELETE');
		assert.equal(calls[0].options.url, `${API}/webhooks/wh_1`);
		assert.deepEqual(staticData, { webhooks: {} });
	});

	it('delete leaves the webhook of the other URL alone', async () => {
		const prodUrl = 'https://n8n.example.com/webhook/prod/webhook';
		const staticData = {
			webhooks: { [prodUrl]: { id: 'wh_prod', secret: 'p' }, [URL]: { id: 'wh_1', secret: 's' } },
		};
		const { context, calls } = createTriggerContext({ staticData, replies: [{ success: true }] });
		assert.equal(await hooks.delete.call(context), true);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].options.url, `${API}/webhooks/wh_1`);
		assert.deepEqual(staticData, { webhooks: { [prodUrl]: { id: 'wh_prod', secret: 'p' } } });
	});

	it('delete treats a webhook that is already gone as deleted', async () => {
		const { context, staticData } = createTriggerContext({
			staticData: stored(),
			replies: [apiError(404)],
		});
		assert.equal(await hooks.delete.call(context), true);
		assert.deepEqual(staticData, { webhooks: {} });
	});

	it('delete reports failure and keeps the ID when SMTPfast cannot delete it', async () => {
		const { context, staticData } = createTriggerContext({
			staticData: stored(),
			replies: [apiError(500)],
		});
		assert.equal(await hooks.delete.call(context), false);
		assert.deepEqual(staticData, stored());
	});

	it('a full activate, check and deactivate cycle', async () => {
		const staticData = {};
		const created = createTriggerContext({
			params: { events: EVENTS },
			staticData,
			replies: [{ id: 'wh_9', secret: 'k' }],
		});
		assert.equal(await hooks.checkExists.call(created.context), false);
		assert.equal(await hooks.create.call(created.context), true);

		const checked = createTriggerContext({
			params: { events: EVENTS },
			staticData,
			replies: [{ id: 'wh_9', url: URL, events: EVENTS, active: true }],
		});
		assert.equal(await hooks.checkExists.call(checked.context), true);
		assert.equal(checked.calls.length, 1);

		const removed = createTriggerContext({ staticData, replies: [{ success: true }] });
		assert.equal(await hooks.delete.call(removed.context), true);
		assert.equal(removed.calls[0].options.url, `${API}/webhooks/wh_9`);
		assert.deepEqual(staticData, { webhooks: {} });
	});
});

describe('webhook signature', () => {
	const secret = 'whsec_test';
	const payload = {
		type: 'email.bounced',
		timestamp: '2026-11-21T08:00:00.000Z',
		data: { email_id: 'email_1', to: ['bounce@simulator.amazonses.com'], bounce_type: 'Permanent' },
	};
	const raw = JSON.stringify(payload);

	it('isValidSignature matches the documented HMAC-SHA256 hex digest', () => {
		assert.equal(isValidSignature(raw, sign(raw, secret), secret), true);
		assert.equal(isValidSignature(Buffer.from(raw), sign(raw, secret).toUpperCase(), secret), true);
		assert.equal(isValidSignature(raw, sign(raw, 'other'), secret), false);
		assert.equal(isValidSignature(raw, 'abc', secret), false);
		assert.equal(isValidSignature(raw, undefined, secret), false);
		assert.equal(isValidSignature(raw, sign(raw, ''), ''), false);
	});

	const request = (body, signature) => ({
		rawBody: Buffer.from(body),
		body: JSON.parse(body),
		headers: { 'x-smtpfast-signature': signature },
	});

	it('starts the workflow for a signed event', async () => {
		const { context, response } = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored('wh_1', secret),
			request: request(raw, sign(raw, secret)),
		});
		const result = await trigger.webhook.call(context);
		assert.deepEqual(result.workflowData, [[{ json: payload }]]);
		assert.equal(response.statusCode, 200);
	});

	it('answers 401 and does not start the workflow for a bad signature', async () => {
		const { context, response } = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored('wh_1', secret),
			request: request(raw, sign(raw + ' ', secret)),
		});
		const result = await trigger.webhook.call(context);
		assert.deepEqual(result, { noWebhookResponse: true });
		assert.equal(response.statusCode, 401);
	});

	it('answers 401 when there is no stored secret or no raw body', async () => {
		const noSecret = createTriggerContext({
			params: { events: EVENTS },
			request: request(raw, sign(raw, secret)),
		});
		assert.deepEqual(await trigger.webhook.call(noSecret.context), { noWebhookResponse: true });
		assert.equal(noSecret.response.statusCode, 401);

		const noRaw = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored('wh_1', secret),
			request: { body: payload, headers: { 'x-smtpfast-signature': sign(raw, secret) } },
		});
		assert.deepEqual(await trigger.webhook.call(noRaw.context), { noWebhookResponse: true });
		assert.equal(noRaw.response.statusCode, 401);
	});

	it('accepts a signature from either the test or the production secret', async () => {
		const staticData = {
			webhooks: {
				'https://n8n.example.com/webhook/prod/webhook': { id: 'wh_prod', secret: 'prod' },
				[URL]: { id: 'wh_1', secret },
			},
		};
		const { context } = createTriggerContext({
			params: { events: EVENTS },
			staticData,
			request: request(raw, sign(raw, 'prod')),
		});
		const result = await trigger.webhook.call(context);
		assert.deepEqual(result.workflowData, [[{ json: payload }]]);
	});

	it('accepts but ignores a signed event the node does not listen for', async () => {
		const other = JSON.stringify({ type: 'test', data: {} });
		const { context } = createTriggerContext({
			params: { events: EVENTS },
			staticData: stored('wh_1', secret),
			request: request(other, sign(other, secret)),
		});
		const result = await trigger.webhook.call(context);
		assert.equal(result.workflowData, undefined);
		assert.deepEqual(result.webhookResponse, { received: true });
	});
});
