import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SmtpfastApi implements ICredentialType {
	name = 'smtpfastApi';

	displayName = 'SMTPfast API';

	icon: Icon = { light: 'file:../icons/smtpfast.svg', dark: 'file:../icons/smtpfast.dark.svg' };

	documentationUrl = 'https://smtpfa.st/docs/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'An SMTPfast API key. Create one in the SMTPfast dashboard under API Keys. Give it only the scopes your workflows need.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://smtpfa.st/api/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
