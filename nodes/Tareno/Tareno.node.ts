import {
    IDataObject,
    IExecuteFunctions,
    ILoadOptionsFunctions,
    INodeExecutionData,
    INodePropertyOptions,
    INodeType,
    INodeTypeDescription,
    JsonObject,
    NodeApiError,
    NodeConnectionTypes,
    NodeOperationError,
} from 'n8n-workflow';
import { createHash } from 'crypto';

type TarenoAccount = {
    id: string;
    platform: string;
    username?: string;
    displayName?: string;
};

type TarenoAccountsResponse = {
    accounts?: TarenoAccount[];
};

type TarenoPinterestBoard = {
    name: string;
    value: string;
    description?: string;
};

type TarenoPinterestBoardsResponse = {
    boards?: TarenoPinterestBoard[];
};

type TarenoAdditionalOptions = IDataObject & {
    tiktokPrivacy?: string;
    disableComments?: boolean;
    tiktokDisableDuet?: boolean;
    tiktokDisableStitch?: boolean;
    tiktokIsCommercialContent?: boolean;
    tiktokIsYourBrand?: boolean;
    tiktokIsBrandedContent?: boolean;
    twitterLocationId?: string;
};

type TarenoPublishBody = IDataObject & {
    accountId: string;
    source: string;
    text: string;
    mediaUrls: string[];
    metadata: IDataObject;
    scheduledAt?: string;
    timezone?: string;
};

type TarenoSignedMediaResponse = {
    deduplicated?: boolean;
    signedUrl?: string;
    publicUrl?: string;
    path?: string;
};

type TarenoErrorData = {
    details?: string;
    message?: string;
    error?: string;
};

const TARENO_API_BASE_URL = 'https://tareno.co';

function parseSignedMediaResponse(response: unknown): TarenoSignedMediaResponse {
    if (typeof response === 'string') {
        try {
            return JSON.parse(response) as TarenoSignedMediaResponse;
        } catch {
            return {};
        }
    }

    if (typeof response === 'object' && response !== null) {
        return response as TarenoSignedMediaResponse;
    }

    return {};
}

function getTarenoApiErrorMessage(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
        return undefined;
    }

    const response = (error as { response?: { data?: unknown } }).response;
    const errorData = response?.data;

    if (typeof errorData !== 'object' || errorData === null) {
        return undefined;
    }

    const { details, message, error: apiError } = errorData as TarenoErrorData;
    return details || message || apiError || JSON.stringify(errorData);
}

function errorToJsonObject(error: unknown): JsonObject {
    if (typeof error === 'object' && error !== null) {
        return error as JsonObject;
    }

    return { message: String(error) };
}

export class Tareno implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Tareno',
        name: 'tareno',
        icon: {
            light: 'file:tareno.svg',
            dark: 'file:tareno.dark.svg',
        },
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
        description: 'Publish and manage social media posts via Tareno',
        defaults: { name: 'Tareno' },
        inputs: [NodeConnectionTypes.Main],
        outputs: [NodeConnectionTypes.Main],
        credentials: [{ name: 'tarenoApi', required: true }],
        properties: [
            // ========================
            // RESOURCE SELECTION
            // ========================
            {
                displayName: 'Resource',
                name: 'resource',
                type: 'options',
                noDataExpression: true,
                options: [
                    { name: 'Account', value: 'account', description: 'Get connected accounts' },
                    { name: 'Media Library', value: 'media', description: 'Upload to Tareno Media Library' },
                    { name: 'Post', value: 'post', description: 'Create a social media post' },
                ],
                default: 'post',
            },

            // ========================
            // POST RESOURCE
            // ========================
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                displayOptions: { show: { resource: ['post'] } },
                options: [
                    {
                        name: 'Publish',
                        value: 'publish',
                        action: 'Publish post immediately',
                        description: 'Publish a social media post immediately',
                    },
                    {
                        name: 'Schedule',
                        value: 'schedule',
                        action: 'Schedule post',
                        description: 'Schedule a social media post for later',
                    },
                ],
                default: 'publish',
            },

            // Account Filter
            {
                displayName: 'Filter Accounts by Platform',
                name: 'platformFilter',
                type: 'options',
                displayOptions: { show: { resource: ['post'] } },
                options: [
                    { name: 'Facebook', value: 'facebook' },
                    { name: 'Instagram', value: 'instagram' },
                    { name: 'LinkedIn', value: 'linkedin' },
                    { name: 'Pinterest', value: 'pinterest' },
                    { name: 'Show All', value: 'all' },
                    { name: 'Threads', value: 'threads' },
                    { name: 'TikTok', value: 'tiktok' },
                    { name: 'Twitter / X', value: 'twitter' },
                    { name: 'YouTube', value: 'youtube' },
                ],
                default: 'all',
                description: 'Filter the account dropdown (one post = one account)',
            },

            // Account Selection
            {
                displayName: 'Account Name or ID',
                name: 'accountId',
                type: 'options',
                required: true,
                typeOptions: {
                    loadOptionsMethod: 'getAccounts',
                    loadOptionsDependsOn: ['platformFilter'],
                },
                displayOptions: { show: { resource: ['post'] } },
                default: '',
                description: 'Select ONE account to post to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
            },

            // Pinterest Board (Dynamic)
            {
                displayName: 'Pinterest Board Name or ID',
                name: 'pinterestBoard',
                type: 'options',
                typeOptions: {
                    loadOptionsMethod: 'getPinterestBoards',
                    loadOptionsDependsOn: ['accountId'],
                },
                displayOptions: {
                    show: {
                        resource: ['post'],
                        platformFilter: ['pinterest']
                    }
                },
                default: '',
                description: 'Select the Pinterest board to post to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
            },

            // Text/Caption
            {
                displayName: 'Text / Caption',
                name: 'text',
                type: 'string',
                typeOptions: { rows: 4 },
                displayOptions: { show: { resource: ['post'] } },
                default: '',
                description: 'The text content of your post',
            },

            // Media Source Selection
            {
                displayName: 'Media Source',
                name: 'mediaSource',
                type: 'options',
                displayOptions: { show: { resource: ['post'] } },
                options: [
                    { name: 'Binary File', value: 'binary', description: 'From previous node (e.g., Google Drive)' },
                    { name: 'No Media', value: 'none', description: 'Text-only post' },
                    { name: 'URL(s)', value: 'url', description: 'Already hosted media URLs' },
                ],
                default: 'none',
            },

            // Binary Property (when source is binary)
            {
                displayName: 'Binary Property',
                name: 'binaryPropertyName',
                type: 'string',
                default: 'data',
                displayOptions: { show: { resource: ['post'], mediaSource: ['binary'] } },
                description: 'Name of the binary property containing the media file',
            },

            // Media URLs (when source is url)
            {
                displayName: 'Media URLs',
                name: 'mediaUrls',
                type: 'string',
                typeOptions: { rows: 2 },
                displayOptions: { show: { resource: ['post'], mediaSource: ['url'] } },
                default: '',
                placeholder: 'https://example.com/image.jpg, https://example.com/video.mp4',
                description: 'Comma-separated URLs of media files',
            },

            // Schedule Time
            {
                displayName: 'Schedule Time',
                name: 'scheduledAt',
                type: 'dateTime',
                required: true,
                displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
                default: '',
                description: 'The date and time to schedule the post',
            },
            {
                displayName: 'Timezone',
                name: 'timezone',
                type: 'options',
                displayOptions: { show: { resource: ['post'], operation: ['schedule'] } },
                default: 'Europe/Berlin',
                description: 'Timezone for the scheduled time',
                options: [
                    { name: 'America/Chicago (CST/CDT)', value: 'America/Chicago' },
                    { name: 'America/Los_Angeles (PST/PDT)', value: 'America/Los_Angeles' },
                    { name: 'America/New_York (EST/EDT)', value: 'America/New_York' },
                    { name: 'Asia/Dubai (GST)', value: 'Asia/Dubai' },
                    { name: 'Asia/Tokyo (JST)', value: 'Asia/Tokyo' },
                    { name: 'Australia/Sydney (AEST/AEDT)', value: 'Australia/Sydney' },
                    { name: 'Europe/Berlin (CET/CEST)', value: 'Europe/Berlin' },
                    { name: 'Europe/London (GMT/BST)', value: 'Europe/London' },
                    { name: 'Europe/Paris (CET/CEST)', value: 'Europe/Paris' },
                    { name: 'Europe/Vienna (CET/CEST)', value: 'Europe/Vienna' },
                    { name: 'Europe/Zurich (CET/CEST)', value: 'Europe/Zurich' },
                    { name: 'UTC', value: 'UTC' },
                ],
            },

            // Format (Only for Instagram/Facebook)
            {
                displayName: 'Format (Instagram/Facebook)',
                name: 'format',
                type: 'options',
                displayOptions: {
                    show: {
                        resource: ['post'],
                        platformFilter: ['instagram', 'facebook']
                    }
                },
                options: [
                    { name: 'Feed Post', value: 'post' },
                    { name: 'Reel', value: 'reel' },
                    { name: 'Story', value: 'story' },
                ],
                default: 'post',
            },

            // Additional Options
            {
                displayName: 'Additional Options',
                name: 'additionalOptions',
                type: 'collection',
                placeholder: 'Add Option',
                displayOptions: { show: { resource: ['post'] } },
                default: {},
                options: [
                    { displayName: 'Branded Content', name: 'tiktokIsBrandedContent', type: 'boolean', default: false },
                    { displayName: 'Commercial Content', name: 'tiktokIsCommercialContent', type: 'boolean', default: false },
                    { displayName: 'Disable Comments', name: 'disableComments', type: 'boolean', default: false },
                    { displayName: 'Disable Duet', name: 'tiktokDisableDuet', type: 'boolean', default: false },
                    { displayName: 'Disable Stitch', name: 'tiktokDisableStitch', type: 'boolean', default: false },
                    { displayName: 'Pinterest Link', name: 'pinterestLink', type: 'string', default: '' },
                    { displayName: 'Pinterest Title', name: 'pinterestTitle', type: 'string', default: '' },
                    { displayName: 'Threads Topic Tag', name: 'threadsTopicTag', type: 'string', default: '' },
                    {
                        displayName: 'TikTok Privacy', name: 'tiktokPrivacy', type: 'options', options: [
                            { name: 'Public', value: 'PUBLIC_TO_EVERYONE' },
                            { name: 'Followers', value: 'FOLLOWER_OF_CREATOR' },
                            { name: 'Friends', value: 'MUTUAL_FOLLOW_FRIENDS' },
                            { name: 'Private', value: 'SELF_ONLY' },
                        ], default: 'PUBLIC_TO_EVERYONE'
                    },
                    { displayName: 'X Location ID', name: 'twitterLocationId', type: 'string', default: '', description: 'Optional X/Twitter place ID' },
                    {
                        displayName: 'X Reply Settings',
                        name: 'replySettings',
                        type: 'options',
                        options: [
                            { name: 'Everyone', value: 'everyone' },
                            { name: 'Following', value: 'following' },
                            { name: 'Mentioned Users', value: 'mentioned' },
                        ],
                        default: 'everyone',
                    },
                    { displayName: 'Your Brand', name: 'tiktokIsYourBrand', type: 'boolean', default: false },
                    { displayName: 'YouTube Category ID', name: 'youtubeCategory', type: 'string', default: '' },
                    { displayName: 'YouTube Description', name: 'youtubeDescription', type: 'string', typeOptions: { rows: 3 }, default: '' },
                    {
                        displayName: 'YouTube Privacy',
                        name: 'youtubePrivacy',
                        type: 'options',
                        options: [
                            { name: 'Public', value: 'public' },
                            { name: 'Unlisted', value: 'unlisted' },
                            { name: 'Private', value: 'private' },
                        ],
                        default: 'public',
                    },
                    { displayName: 'YouTube Tags', name: 'youtubeTags', type: 'string', default: '', description: 'Comma-separated tags' },
                    { displayName: 'YouTube Thumbnail URL', name: 'youtubeThumbnailUrl', type: 'string', default: '' },
                    { displayName: 'YouTube Title', name: 'youtubeTitle', type: 'string', default: '' },
                ],
            },

            // ========================
            // MEDIA LIBRARY RESOURCE
            // ========================
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                displayOptions: { show: { resource: ['media'] } },
                options: [
                    {
                        name: 'Get Many',
                        value: 'list',
                        action: 'Get many media files',
                        description: 'Retrieve a list of media files from the Tareno Media Library',
                    },
                    {
                        name: 'Upload',
                        value: 'upload',
                        action: 'Upload media file',
                        description: 'Upload a media file to the Tareno Media Library',
                    },
                ],
                default: 'upload',
            },

            {
                displayName: 'Upload Mode',
                name: 'uploadMode',
                type: 'options',
                displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
                options: [
                    { name: 'Binary File', value: 'file', description: 'From previous node' },
                    { name: 'URL', value: 'url', description: 'Download from URL' },
                ],
                default: 'file',
            },

            {
                displayName: 'Binary Property',
                name: 'mediaBinaryPropertyName',
                type: 'string',
                default: 'data',
                required: true,
                displayOptions: { show: { resource: ['media'], operation: ['upload'], uploadMode: ['file'] } },
                description: 'Name of the binary property containing the media file',
            },

            {
                displayName: 'Media URL',
                name: 'mediaUrl',
                type: 'string',
                required: true,
                displayOptions: { show: { resource: ['media'], operation: ['upload'], uploadMode: ['url'] } },
                default: '',
                placeholder: 'e.g. https://example.com/video.mp4',
                description: 'Public URL of the media file to add to the Tareno Media Library',
            },

            {
                displayName: 'File Name',
                name: 'fileName',
                type: 'string',
                displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
                default: '',
                placeholder: 'e.g. campaign-video.mp4',
                description: 'Optional file name to display in the Tareno Media Library',
            },
        ],
        usableAsTool: true,
    };

    methods = {
        loadOptions: {
            async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const platformFilter = this.getNodeParameter('platformFilter', 'all') as string;

                try {
                    const response = await this.helpers.httpRequestWithAuthentication.call(this as unknown as IExecuteFunctions, 'tarenoApi', {
                        method: 'GET',
                        url: `${TARENO_API_BASE_URL}/api/external/accounts`,
                        json: true,
                    }) as TarenoAccountsResponse;

                    if (response.accounts && Array.isArray(response.accounts)) {
                        let accounts = response.accounts;
                        if (platformFilter !== 'all') {
                            accounts = accounts.filter((account) => account.platform === platformFilter);
                        }
                        return accounts.map((account) => ({
                            name: `${account.platform.toUpperCase()} - ${account.username || account.displayName || 'Unknown'}`,
                            value: account.id,
                        }));
                    }
                    return [];
                } catch {
                    return [{ name: 'Error Loading Accounts', value: '' }];
                }
            },
            async getPinterestBoards(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
                const accountId = this.getNodeParameter('accountId') as string;

                if (!accountId) {
                    return [];
                }

                try {
                    const response = await this.helpers.httpRequestWithAuthentication.call(this as unknown as IExecuteFunctions, 'tarenoApi', {
                        method: 'GET',
                        url: `${TARENO_API_BASE_URL}/api/external/pinterest/boards?accountId=${accountId}`,
                        json: true,
                    }) as TarenoPinterestBoardsResponse;

                    if (response.boards && Array.isArray(response.boards)) {
                        return response.boards.map((board) => ({
                            name: board.name,
                            value: board.value,
                            description: board.description
                        }));
                    }
                    return [];
                } catch {
                    return [{ name: 'Error Loading Boards', value: '' }];
                }
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
                let responseData: IDataObject | undefined;

                // ========================
                // POST
                // ========================
                if (resource === 'post') {
                    const accountId = this.getNodeParameter('accountId', i) as string;
                    const text = this.getNodeParameter('text', i) as string;
                    const mediaSource = this.getNodeParameter('mediaSource', i) as string;
                    const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as TarenoAdditionalOptions;

                    const format = this.getNodeParameter('format', i, 'post') as string;

                    let mediaUrls: string[] = [];

                    // Handle binary upload - with content-hash deduplication
                    if (mediaSource === 'binary') {
                        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
                        const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
                        const binaryBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

                        // Calculate SHA-256 hash of file content for deduplication
                        const contentHash = createHash('sha256').update(binaryBuffer).digest('hex');

                        // Step 1: Request signed URL (API checks for duplicates)
                        const signResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                            method: 'POST',
                            url: `${TARENO_API_BASE_URL}/api/external/media/sign`,
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                fileName: binaryData.fileName || 'upload',
                                contentType: binaryData.mimeType,
                                folder: 'n8n-uploads',
                                contentHash,
                                fileSize: binaryBuffer.length
                            }),
                        });

                        const signData = parseSignedMediaResponse(signResponse);

                        // Check if file was deduplicated (already exists)
                        if (signData.deduplicated) {
                            if (!signData.publicUrl) {
                                throw new NodeOperationError(this.getNode(), 'Tareno returned a deduplicated media file without a public URL', { itemIndex: i });
                            }
                            // File already exists! Use existing URL, skip upload
                            mediaUrls = [signData.publicUrl];
                        } else {
                            // File is new, need to upload
                            if (!signData.signedUrl) {
                                throw new NodeOperationError(this.getNode(), `Failed to get signed upload URL: ${JSON.stringify(signData)}`, { itemIndex: i });
                            }
                            if (!signData.publicUrl) {
                                throw new NodeOperationError(this.getNode(), `Failed to get public media URL: ${JSON.stringify(signData)}`, { itemIndex: i });
                            }

                            // Step 2: Upload directly to Supabase
                            await this.helpers.httpRequest({
                                method: 'PUT',
                                url: signData.signedUrl,
                                headers: {
                                    'Content-Type': binaryData.mimeType || 'application/octet-stream',
                                },
                                body: binaryBuffer,
                            });

                            // Step 3: Register the hash for future deduplication
                            try {
                                await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                                    method: 'POST',
                                    url: `${TARENO_API_BASE_URL}/api/external/media/register-hash`,
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                        contentHash,
                                        storagePath: signData.path,
                                        publicUrl: signData.publicUrl,
                                        fileName: binaryData.fileName,
                                        contentType: binaryData.mimeType,
                                        fileSize: binaryBuffer.length
                                    }),
                                });
                            } catch {
                                // Hash registration failed, but upload succeeded - continue
                            }

                            mediaUrls = [signData.publicUrl];
                        }
                    } else if (mediaSource === 'url') {
                        const mediaUrlsRaw = this.getNodeParameter('mediaUrls', i, '') as string;
                        mediaUrls = mediaUrlsRaw ? mediaUrlsRaw.split(',').map(url => url.trim()).filter(Boolean) : [];
                    }

                    const pinterestBoard = this.getNodeParameter('pinterestBoard', i, '') as string;

                    const body: TarenoPublishBody = {
                        accountId,
                        source: 'n8n',
                        text,
                        mediaUrls,
                        metadata: {
                            format,
                            pinterestBoard,
                            tiktokPrivacyLevel: additionalOptions.tiktokPrivacy,
                            tiktokDisableComment: additionalOptions.disableComments,
                            tiktokOptions: {
                                privacy_level: additionalOptions.tiktokPrivacy,
                                allow_comment: additionalOptions.disableComments !== true,
                                allow_duet: additionalOptions.tiktokDisableDuet !== true,
                                allow_stitch: additionalOptions.tiktokDisableStitch !== true,
                                is_commercial_content: additionalOptions.tiktokIsCommercialContent === true,
                                is_your_brand: additionalOptions.tiktokIsYourBrand === true,
                                is_branded_content: additionalOptions.tiktokIsBrandedContent === true,
                            },
                            location: additionalOptions.twitterLocationId,
                            ...additionalOptions
                        }
                    };

                    if (operation === 'schedule') {
                        body.scheduledAt = this.getNodeParameter('scheduledAt', i) as string;
                        body.timezone = this.getNodeParameter('timezone', i, 'Europe/Berlin') as string;
                    }

                    try {
                        responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                            method: 'POST',
                            url: `${TARENO_API_BASE_URL}/api/external/publish`,
                            body,
                            json: true,
                        });
                    } catch (error) {
                        // Extract detailed error message from server response if available
                        const errorMessage = getTarenoApiErrorMessage(error);
                        if (errorMessage) {
                            throw new NodeOperationError(this.getNode(), `Tareno API Error: ${errorMessage}`, { itemIndex: i });
                        }
                        throw new NodeApiError(this.getNode(), errorToJsonObject(error), { itemIndex: i });
                    }
                }

                // ========================
                // MEDIA LIBRARY
                // ========================
                if (resource === 'media') {
                    if (operation === 'upload') {
                        const uploadMode = this.getNodeParameter('uploadMode', i) as string;
                        const fileName = this.getNodeParameter('fileName', i, '') as string;

                        if (uploadMode === 'url') {
                            const mediaUrl = this.getNodeParameter('mediaUrl', i) as string;
                            responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                                method: 'POST',
                                url: `${TARENO_API_BASE_URL}/api/external/media`,
                                body: { mediaUrl, fileName: fileName || undefined },
                                json: true,
                            });
                        } else {
                            // Binary upload with content-hash deduplication
                            const binaryPropertyName = this.getNodeParameter('mediaBinaryPropertyName', i) as string;
                            const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
                            const binaryBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

                            // Calculate SHA-256 hash for deduplication
                            const contentHash = createHash('sha256').update(binaryBuffer).digest('hex');

                            // Step 1: Get signed upload URL (with dedup check)
                            const signResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                                method: 'POST',
                                url: `${TARENO_API_BASE_URL}/api/external/media/sign`,
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    fileName: fileName || binaryData.fileName || 'upload',
                                    contentType: binaryData.mimeType,
                                    folder: 'media-library',
                                    contentHash,
                                    fileSize: binaryBuffer.length
                                }),
                            });

                            const signData = parseSignedMediaResponse(signResponse);

                            if (signData.deduplicated) {
                                // File already exists, return existing info
                                responseData = {
                                    success: true,
                                    deduplicated: true,
                                    url: signData.publicUrl,
                                    name: fileName || binaryData.fileName,
                                    path: signData.path
                                };
                            } else {
                                if (!signData.signedUrl) {
                                    throw new NodeOperationError(this.getNode(), 'Failed to get signed upload URL', { itemIndex: i });
                                }

                                // Step 2: Upload directly to Supabase
                                await this.helpers.httpRequest({
                                    method: 'PUT',
                                    url: signData.signedUrl,
                                    headers: {
                                        'Content-Type': binaryData.mimeType || 'application/octet-stream',
                                    },
                                    body: binaryBuffer,
                                });

                                // Step 3: Register hash for future dedup
                                try {
                                    await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                                        method: 'POST',
                                        url: `${TARENO_API_BASE_URL}/api/external/media/register-hash`,
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            contentHash,
                                            storagePath: signData.path,
                                            publicUrl: signData.publicUrl,
                                            fileName: fileName || binaryData.fileName,
                                            contentType: binaryData.mimeType,
                                            fileSize: binaryBuffer.length
                                        }),
                                    });
                                } catch {
                                    // Continue even if registration fails
                                }

                                responseData = {
                                    success: true,
                                    url: signData.publicUrl,
                                    name: fileName || binaryData.fileName,
                                    path: signData.path
                                };
                            }
                        }
                    } else if (operation === 'list') {
                        responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                            method: 'GET',
                            url: `${TARENO_API_BASE_URL}/api/external/media`,
                            json: true,
                        });
                    }
                }

                // ========================
                // ACCOUNTS
                // ========================
                if (resource === 'account') {
                    responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'tarenoApi', {
                        method: 'GET',
                        url: `${TARENO_API_BASE_URL}/api/external/accounts`,
                        json: true,
                    });
                }

                if (responseData) returnData.push({ json: responseData, pairedItem: { item: i } });
            } catch (error) {
                if (this.continueOnFail()) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    returnData.push({ json: { error: message }, pairedItem: { item: i } });
                    continue;
                }
                throw new NodeApiError(this.getNode(), errorToJsonObject(error), { itemIndex: i });
            }
        }
        return [returnData];
    }
}
