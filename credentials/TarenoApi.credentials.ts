import {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
    Icon,
} from 'n8n-workflow';

export class TarenoApi implements ICredentialType {
    name = 'tarenoApi';
    displayName = 'Tareno API';
    icon: Icon = {
        light: 'file:tareno.svg',
        dark: 'file:tareno.dark.svg',
    };
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
            url: 'https://tareno.co/api/external/usage',
            method: 'GET',
        },
    };
}
