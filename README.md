# MCP Browser Client

A static browser-based chat client for OpenAI-compatible models with MCP server tools, reusable skills, conversation history, and optional file uploads through a no-storage WebSocket relay.

## Disclaimer

Completely AI-generated code.

## Features

- Configure multiple OpenAI-compatible models.
- Choose `Responses API` or `Chat Completions API` per model.
- Configure multiple MCP JSON-RPC servers.
- Connect to tools exposed by MCP Streamable HTTP servers using protocol version `2026-07-28`.
- Enable or disable MCP servers and individual tools from the side pane.
- Add reusable skills that are injected as system instructions when enabled.
- Store conversations and settings in browser IndexedDB.
- Attach files directly as data URLs, or stream them through a relay URL configured in Settings.

## Run

This app is plain HTML/CSS/JavaScript. No build step is required.

Open `index.html` directly in a browser, or serve the directory locally:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Configure Models

Open Settings and add a model:

- `Display Name`: local label for the model.
- `Provider`: currently OpenAI-compatible.
- `API Key`: stored in IndexedDB.
- `Base URL`: optional. Leave empty for `https://api.openai.com/v1`.
- `API style`: choose `Responses API` or `Chat Completions API`.
- `Model ID`: provider model name, for example `gpt-5-mini`.
- `Temperature` and `Max tokens`: optional generation settings.

Endpoint paths are selected from the model API style:

- `Responses API` uses `/responses`.
- `Chat Completions API` uses `/chat/completions`.

Responses API conversations use local, stateless continuation. Requests set `store: false`, and the browser stores returned response output items in IndexedDB so later turns can replay model reasoning context. Encrypted reasoning is used when available; providers that return only reasoning summaries or message output continue at the strongest level they support. This continuation data is local, is never rendered in the transcript, and is removed with its messages.

## Configure MCP Servers

Open Settings, add an MCP server, and provide:

- `Name`
- `JSON-RPC Endpoint`
- Optional API key

Use the MCP side pane to toggle servers and tools. Disabled tools stay visible and unchecked, but they are not offered to the model.

### MCP Compatibility

This client intentionally supports only MCP protocol version `2026-07-28` over Streamable HTTP. It does not fall back to handshake-based protocol versions and will reject servers that do not advertise `2026-07-28` and the tools capability through `server/discover`.

The integration currently supports the tools surface only:

- `server/discover`
- `tools/list`, including pagination and TTL-based in-memory caching
- `tools/call`, including `Mcp-Method`, `Mcp-Name`, and schema-declared `Mcp-Param-*` headers
- JSON and request-scoped SSE responses

Prompts, resources, subscriptions, OAuth flows, multi-round-trip input handling, Tasks, and MCP Apps are not implemented. The client advertises no optional client capabilities or extensions.

## Skills

Skills are reusable instruction blocks. Add them in Settings with:

- `Name`
- Optional `Description`
- Required `Instructions`
- Enabled/disabled state

Enabled skills are added to the conversation context as system instructions.

## File Uploads

The upload button uses the configured file streaming relay. The app creates a relay token and streams file bytes over WebSocket only when the generated download URL is requested.

If no file streaming page URL is configured, chat file uploads are blocked until one is added.

Configure this in Settings under `File Uploads`:

- `File streaming page URL`: the URL of the relay client/page.
- `Token TTL seconds`: token lifetime requested from the relay.

The app derives these relay endpoints from the configured URL, including any path prefix.

- `POST /tokens`
- `GET /download/{token}`
- `WS /ws/{token}`

Token creation sends the requested TTL and selected file MIME type:

```json
{
  "ttl_seconds": 600,
  "mime": "image/png"
}
```

See `file_streaming_README.md` for the relay protocol.

## Data Storage

The app stores local data in IndexedDB:

- Model configurations
- MCP server configurations
- Skills
- Conversations
- Messages
- Responses API continuation items, including encrypted reasoning when returned by the provider
- Misc settings

API keys are stored locally in the browser. Do not use this app on an untrusted machine or browser profile.

## Project Structure

```text
index.html                  Static app shell and settings UI
file_streaming_README.md     File relay protocol notes
js/config.js                 Global app configuration
js/db.js                     IndexedDB wrapper
js/chatController.js         App state, chat flow, MCP orchestration
js/ui.js                     DOM rendering and event handling
js/mcpClient.js              High-level MCP client
js/mcpTransport.js           MCP HTTP JSON-RPC transport
js/models/baseModel.js       Model abstraction
js/models/openaiModel.js     OpenAI-compatible model adapter
```

## Development Notes

- Keep `APP_CONFIG.db.version` unchanged unless you intentionally need a browser IndexedDB migration.
- Browser cache can keep stale JS while developing. Hard refresh after script changes.
- The app currently uses global browser objects rather than a bundler or module system.
- Run the MCP protocol tests with `node --test tests/mcp.test.js`.

## License

MIT. See `LICENSE`.
