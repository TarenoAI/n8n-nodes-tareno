import {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class TarenoApi implements ICredentialType {
    name = 'tarenoApi';
    displayName = 'Tareno API';
    documentationUrl = 'https://tareno.co/docs/api';

    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
            required: true,
            description: 'Your Tareno API Key. Get one from Settings → API in your Tareno dashboard.',
        },
        {
            displayName: 'Base URL',
            name: 'baseUrl',
            type: 'string',
            default: 'https://tareno.co',
            description: 'The base URL of the Tareno API',
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                'X-Tareno-API-Key': '={{$credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: '={{$credentials.baseUrl}}',
            url: '/api/external/usage',
            method: 'GET',
        },
    };
}
