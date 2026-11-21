'use strict';

const { NodeApiError } = require('n8n-workflow');

const NODE = {
	id: 'node-1',
	name: 'SMTPfast',
	type: 'n8n-nodes-smtpfast.smtpfast',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * A fake HTTP layer: each call to httpRequestWithAuthentication takes the next
 * queued reply (an object to return, or an { error } to throw) and records the request.
 */
function createHttp(replies = []) {
	const calls = [];
	const queue = [...replies];
	async function httpRequestWithAuthentication(credentialType, options) {
		calls.push({ credentialType, options: JSON.parse(JSON.stringify(options)) });
		const reply = queue.length ? queue.shift() : {};
		if (reply && reply.error) throw reply.error;
		return reply;
	}
	return { calls, httpRequestWithAuthentication };
}

function httpError(status, body = { error: 'failed' }) {
	return {
		error: {
			message: `Request failed with status code ${status}`,
			httpCode: String(status),
			response: { status, data: body },
		},
	};
}

function apiError(status) {
	return { error: new NodeApiError(NODE, { message: 'failed', httpCode: String(status) }) };
}

function returnJsonArray(data) {
	const list = Array.isArray(data) ? data : [data];
	return list.map((json) => ({ json }));
}

/** A minimal IExecuteFunctions for the action node. params is one object per input item. */
function createExecuteContext({ params, items, replies, continueOnFail = false }) {
	const http = createHttp(replies);
	const inputItems = items ?? params.map(() => ({ json: {} }));
	const context = {
		getInputData: () => inputItems,
		getNode: () => NODE,
		continueOnFail: () => continueOnFail,
		getNodeParameter(name, itemIndex, fallback) {
			const value = params[itemIndex][name];
			if (value === undefined) {
				if (fallback !== undefined) return fallback;
				throw new Error(`Missing parameter ${name}`);
			}
			return value;
		},
		helpers: {
			httpRequestWithAuthentication: http.httpRequestWithAuthentication,
			returnJsonArray,
			constructExecutionMetaData: (data, { itemData }) =>
				data.map((entry) => ({ ...entry, pairedItem: itemData })),
			assertBinaryData(itemIndex, name) {
				const binary = inputItems[itemIndex].binary?.[name];
				if (!binary) throw new Error(`No binary data in field ${name}`);
				return binary;
			},
			async getBinaryDataBuffer(itemIndex, name) {
				return Buffer.from(inputItems[itemIndex].binary[name].data, 'base64');
			},
		},
	};
	return { context, calls: http.calls };
}

/** A minimal IHookFunctions / IWebhookFunctions for the trigger node. */
function createTriggerContext({
	params = {},
	replies,
	staticData = {},
	webhookUrl = 'https://n8n.example.com/webhook/abc/webhook',
	request = {},
}) {
	const http = createHttp(replies);
	const response = { statusCode: 200, body: undefined };
	const context = {
		getNode: () => ({
			...NODE,
			name: 'SMTPfast Trigger',
			type: 'n8n-nodes-smtpfast.smtpfastTrigger',
		}),
		getNodeParameter(name, fallback) {
			return name in params ? params[name] : fallback;
		},
		getNodeWebhookUrl: () => webhookUrl,
		getWorkflowStaticData: () => staticData,
		getRequestObject: () => request,
		getHeaderData: () => request.headers ?? {},
		getBodyData: () => request.body ?? {},
		getResponseObject: () => ({
			status(code) {
				response.statusCode = code;
				return this;
			},
			json(body) {
				response.body = body;
				return this;
			},
		}),
		helpers: {
			httpRequestWithAuthentication: http.httpRequestWithAuthentication,
			returnJsonArray,
		},
	};
	return { context, calls: http.calls, staticData, response };
}

module.exports = {
	NODE,
	apiError,
	createExecuteContext,
	createTriggerContext,
	httpError,
};
