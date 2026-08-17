# n8n-nodes-tareno

This package provides an n8n community node for [Tareno](https://tareno.co), a social media operations platform for planning, publishing, scheduling, and managing content across multiple channels.

Use it to publish and schedule posts from n8n workflows without hand-building every Tareno API request.

## Features

- Publish posts immediately through connected Tareno social accounts
- Schedule posts for a future date and timezone
- Upload media from binary data or media URLs
- Reuse existing media through content-hash deduplication
- List connected Tareno accounts for account-aware workflows
- List and upload files in the Tareno media library
- Load Pinterest boards for connected Pinterest accounts

## Supported channels

- Instagram
- Facebook
- YouTube
- TikTok
- X / Twitter
- LinkedIn
- Threads
- Pinterest

Available publishing behavior depends on the social accounts, platform permissions, and plan features enabled in your Tareno workspace.

## Prerequisites

- A Tareno account
- At least one connected social account in Tareno
- A Tareno API key created from the Tareno dashboard
- A self-hosted n8n instance, or an n8n instance that supports verified community nodes

## Installation

### Install from n8n

1. Open your n8n canvas.
2. Open the nodes panel.
3. Search for `Tareno`.
4. Install the verified community node when it is available.

### Install as a community package

1. Go to **Settings** -> **Community Nodes**.
2. Select **Install**.
3. Enter:

```text
n8n-nodes-tareno
```

4. Confirm the installation and restart n8n if your instance requires it.

### Manual installation

```bash
cd ~/.n8n/custom
npm install n8n-nodes-tareno
```

## Credentials

1. In Tareno, open **Settings** -> **API** and create an API key.
2. In n8n, open **Credentials**.
3. Create a new **Tareno API** credential.
4. Paste the API key.
5. Keep the base URL as `https://tareno.co` unless you are testing a private Tareno environment.

The credential sends the key as:

```http
X-Tareno-API-Key: <your-api-key>
```

## Node resources

### Post

Use **Post** to publish or schedule a social post through one connected Tareno account.

Operations:

- **Publish Now**: publish immediately
- **Schedule**: schedule for a specific date, time, and timezone

Main fields:

- **Filter Accounts by Platform**: narrows the account dropdown
- **Account**: the connected Tareno social account to publish through
- **Text / Caption**: post body
- **Media Source**: no media, binary file, or hosted media URLs
- **Format**: feed post, story, or reel for Instagram/Facebook
- **Additional Options**: platform-specific metadata for YouTube, TikTok, Pinterest, Threads, and X

### Media Library

Use **Media Library** to upload or list media in Tareno.

Operations:

- **Upload**: upload a binary file or import from URL
- **List**: list media files available to the workspace

### Account

Use **Account** to list connected Tareno social accounts and their IDs. This is useful when you want to route items dynamically before publishing.

## Example workflows

### Publish a generated post

```text
Schedule Trigger -> OpenAI -> Tareno: Publish Now
```

### Schedule rows from a spreadsheet

```text
Google Sheets -> Split In Batches -> Tareno: Schedule
```

### Upload media before publishing

```text
Google Drive -> Tareno: Media Library Upload -> Tareno: Publish Now
```

## Error handling

The node returns Tareno API validation messages when possible. Common errors include:

- Missing or invalid API key
- No connected social account selected
- Media URL not reachable
- Platform-specific publishing requirement missing
- Social account permission expired in Tareno

Use n8n's **Continue On Fail** option when you want a batch workflow to keep running and return error objects for failed items.

## Security and privacy

The node sends workflow data, captions, media URLs, binary media files, and selected account IDs to the configured Tareno API base URL. API keys are stored in n8n credentials. Community nodes run inside your n8n instance, so only install this package from the official npm package and repository.

## Development

```bash
npm install
npm run lint
npm run build
```

For local node testing:

```bash
npm run dev
```

## Support

- Product: [https://tareno.co](https://tareno.co)
- API docs: [https://tareno.co/docs/api](https://tareno.co/docs/api)
- n8n docs: [https://tareno.co/docs/n8n](https://tareno.co/docs/n8n)
- Email: support@tareno.co

## License

MIT
