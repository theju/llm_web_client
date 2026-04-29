# WebSocket File Relay (No-Storage Relay)

## Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

The server will be available at:

- HTTP: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`

## API overview

### `POST /tokens`

Creates a relay token. The token is **reusable** until it expires.

- Request body: JSON
- Response: JSON containing the token and related info (see `/docs` for the exact schema)

Example:

```bash
curl -X POST http://localhost:8000/tokens \
-H "Content-Type: application/json" \
-d '{"ttl_seconds": 600, "mime": "image/png"}'
```

Notes:

- TTL is clamped by the server to a maximum (`MAX_TOKEN_TTL_SECONDS` in `server/main.py`).
- Tokens are cleaned up periodically by a background task.

### `GET /download/{token}`

Streams the file bytes for a given token as an HTTP response. This endpoint does not read from disk; it streams bytes that arrive over the WebSocket connection.

Example:

```bash
curl -L http://localhost:8000/download/<token> --output received.bin
```

Behavior:

- If the token is missing/expired, the server returns an error (typically 404).
- If no browser is connected (or the browser does not send data), the download will fail.
- The response is streamed; the server does not buffer the entire file.

### `GET /health`

Simple health endpoint.

### `WS /ws/{token}`

WebSocket endpoint used by the browser (sender). The browser connects with the token and participates in a small message protocol.

See the OpenAPI docs and the server code (`server/main.py`) for the exact message schemas and required fields.

## WebSocket protocol

This section describes the message protocol used on `WS /ws/{token}`.

### Transport

- Client connects to: `ws://<host>/ws/<token>` (or `wss://` when using HTTPS).
- Messages are either:
  - **Text frames** containing JSON objects, or
  - **Binary frames** containing raw file bytes.

### High-level sequence

1. Browser connects to `WS /ws/<token>`.
2. Browser sends a **`hello`** JSON message (exactly once, immediately after connect).
3. When an HTTP client calls `GET /download/<token>`, the server sends a **`start`** JSON message with a `request_id`.
4. Browser responds with:
   1. **`meta`** JSON message (must include the same `request_id`)
   2. One or more **binary frames** containing the file bytes
   3. **`end`** JSON message (must include the same `request_id`)
5. Either side may send an **`error`** JSON message to abort a transfer.

### Message types

#### Client → Server: `hello`

Sent once after the WebSocket is opened. Used to announce the file that will be sent.

Example:

```json
{
  "type": "hello",
  "filename": "example.bin",
  "size": 12345,
  "mime": "application/octet-stream"
}
```

Fields:

- `type`: `"hello"`
- `filename`: string
- `size`: integer (bytes)
- `mime`: string (content type)

Server behavior:

- If `size` exceeds `MAX_FILE_SIZE_BYTES`, the server sends `reject` and closes the socket.

#### Server → Client: `start`

Sent when an HTTP download begins. The `request_id` correlates all subsequent messages for that download.

Example:

```json
{
  "type": "start",
  "request_id": "b2b2f0a0-2c2a-4b2a-9c2a-0c0c0c0c0c0c"
}
```

Fields:

- `type`: `"start"`
- `request_id`: string (UUID)

#### Client → Server: `meta`

Sent after `start` and before any binary frames. Declares the file metadata for this specific download request.

Example:

```json
{
  "type": "meta",
  "request_id": "b2b2f0a0-2c2a-4b2a-9c2a-0c0c0c0c0c0c",
  "filename": "example.bin",
  "size": 12345,
  "mime": "application/octet-stream"
}
```

Fields:

- `type`: `"meta"`
- `request_id`: string (must match the `start` message)
- `filename`: string
- `size`: integer (bytes)
- `mime`: string

Server behavior:

- If `size` exceeds `MAX_FILE_SIZE_BYTES`, the server sends `cancel` and the HTTP download fails.

#### Client → Server: binary frames (file bytes)

After `meta`, the client sends raw bytes as binary WebSocket frames.

Rules:

- The total number of bytes sent must equal `meta.size`.
- If the client sends more bytes than declared, the server sends `cancel` and aborts.

#### Client → Server: `end`

Sent after all bytes have been sent.

Example:

```json
{
  "type": "end",
  "request_id": "b2b2f0a0-2c2a-4b2a-9c2a-0c0c0c0c0c0c"
}
```

Fields:

- `type`: `"end"`
- `request_id`: string (must match the `start` message)

Server behavior:

- If the number of bytes received does not match `meta.size`, the server treats it as an incomplete transfer and the HTTP download fails.

#### Either direction: `error`

Used to abort a transfer with a message.

Example:

```json
{
  "type": "error",
  "request_id": "b2b2f0a0-2c2a-4b2a-9c2a-0c0c0c0c0c0c",
  "message": "Something went wrong"
}
```

Fields:

- `type`: `"error"`
- `request_id`: string
- `message`: string

#### Server → Client: `reject`

Sent when the server refuses the session (e.g., file too large based on `hello`).

Example:

```json
{
  "type": "reject",
  "reason": "File too large. Max allowed is 262144000 bytes."
}
```

Fields:

- `type`: `"reject"`
- `reason`: string

#### Server → Client: `cancel`

Sent when the server cancels an in-progress transfer (e.g., too many bytes, file too large).

Example:

```json
{
  "type": "cancel",
  "request_id": "b2b2f0a0-2c2a-4b2a-9c2a-0c0c0c0c0c0c",
  "reason": "Sent more bytes than declared size."
}
```

Fields:

- `type`: `"cancel"`
- `request_id`: string
- `reason`: string

### Concurrency notes

- Only one WebSocket client may be connected per token at a time.
- Only one HTTP download may be active per token at a time. If a second download starts while one is in progress, the server returns HTTP `409`.

## Browser client example

A minimal example client is included at:

- `client/example_client.html`

Typical usage:

1. Open the HTML file in a browser (or serve it via a static server).
2. Create a token (the example may do this for you, depending on how it’s wired).
3. Select a file and connect to the WebSocket.
4. From another terminal/service, download via `GET /download/<token>`.

## Limits and configuration

- **Max file size**: enforced by `MAX_FILE_SIZE_BYTES` in `server/main.py` (hard-coded server limit).
- **Token TTL**:
  - Default TTL: `DEFAULT_TOKEN_TTL_SECONDS`
  - Max TTL: `MAX_TOKEN_TTL_SECONDS`
- **Token cleanup**: runs every `TOKEN_CLEANUP_INTERVAL_SECONDS`.

## CORS

CORS is enabled for HTTP endpoints (permissive). This is convenient for development and browser-based clients. If you deploy this in production, consider restricting allowed origins.

## Troubleshooting

- **Download hangs**: ensure the browser is connected to the WebSocket for the same token and is actively sending bytes after receiving `start`.
- **404 on download**: token may be expired or never created.
- **File too large**: the server enforces a hard limit (`MAX_FILE_SIZE_BYTES`).
- **WebSocket disconnects**: check browser console logs and server logs; ensure proxies/load balancers support WebSockets.

## Disclaimer

Completely AI generated code.

## License

MIT License. Check the `LICENSE` file for more details.
