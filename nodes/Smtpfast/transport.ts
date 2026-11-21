import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const SMTPFAST_API_BASE_URL = 'https://smtpfa.st/api/v1';
export const SMTPFAST_CREDENTIAL_TYPE = 'smtpfastApi';

const ERROR_HINTS: Record<string, string> = {
	'401': 'Check the API key in the SMTPfast credential. It may be revoked or mistyped.',
	'403':
		'The API key lacks the scope for this call, or the sender domain is not verified. Check the key scopes in the SMTPfast dashboard.',
	'404': 'Check the ID. It may belong to another account or the item may be deleted.',
	'429': 'SMTPfast rate-limited this request. Wait a moment, or lower the number of items per run.',
};

type SmtpfastContext =
	| IExecuteFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IWebhookFunctions;

/** Encode one path segment, such as an ID or an email address. */
export function pathSegment(value: unknown): string {
	return encodeURIComponent(String(value).trim());
}

export async function smtpfastApiRequest(
	this: SmtpfastContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	headers?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${SMTPFAST_API_BASE_URL}${path}`,
		json: true,
		headers: { Accept: 'application/json', ...headers },
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined && Object.keys(qs).length > 0) options.qs = qs;

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			SMTPFAST_CREDENTIAL_TYPE,
			options,
		)) as IDataObject;
	} catch (error) {
		const apiError =
			error instanceof NodeApiError ? error : new NodeApiError(this.getNode(), error as JsonObject);
		const hint = ERROR_HINTS[String(apiError.httpCode ?? '')];
		if (hint && !apiError.description) apiError.description = hint;
		throw apiError;
	}
}
