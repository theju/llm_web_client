/**
 * MCP JSON-RPC transport over HTTP for the MCP Browser Client MVP.
 *
 * This module provides a simple HTTP-based transport that can be used by
 * higher-level MCP clients. It assumes:
 *
 * - JSON-RPC 2.0
 * - POST requests to a single endpoint per MCP server
 * - CORS is enabled on the server
 *
 * Usage:
 *   const transport = new MCPHttpTransport({
 *     endpoint: 'https://example.com/mcp',
 *     apiKey: 'optional-api-key'
 *   });
 *
 *   const result = await transport.sendRequest('mcp.tools.list', { });
 */

(function () {
  const { mcp } = window.APP_CONFIG;

  let nextId = 1;

  /**
   * Build a JSON-RPC method name from prefix + method key.
   * E.g. prefix "mcp" + key "tools.list" => "mcp.tools.list"
   *
   * @param {string} methodKey
   * @param {string} [prefix]
   * @returns {string}
   */
  function buildMethodName(methodKey, prefix = mcp.defaultMethodPrefix) {
    if (!prefix) return methodKey;
    // Avoid double dots if methodKey already starts with prefix
    if (methodKey.startsWith(prefix + '.')) return methodKey;
    return `${prefix}.${methodKey}`;
  }

  /**
   * Simple HTTP transport for JSON-RPC 2.0.
   */
  class MCPHttpTransport {
    /**
     * @param {Object} config
     * @param {string} config.endpoint - Full URL to the JSON-RPC endpoint.
     * @param {string} [config.apiKey] - Optional API key for Authorization header.
     * @param {Object} [config.headers] - Additional headers to send with each request.
     */
    constructor(config = {}) {
      if (!config.endpoint) {
        throw new Error('MCPHttpTransport requires an endpoint URL');
      }
      this.endpoint = config.endpoint;
      this.apiKey = config.apiKey || null;
      this.extraHeaders = config.headers || {};
    }

    /**
     * Build headers for the request.
     * @returns {Object}
     * @private
     */
    _buildHeaders() {
      const headers = Object.assign(
        {
          'Content-Type': 'application/json',
          // Some MCP servers require that clients explicitly accept both
          // JSON and event-stream responses.
          Accept: 'application/json, text/event-stream'
        },
        this.extraHeaders
      );

      if (this.apiKey) {
        // Generic Bearer token; servers can interpret as needed.
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      return headers;
    }

    /**
     * Parse a single Server-Sent Events (SSE) event block into an object.
     * This is a minimal parser that supports "event" and "data" fields.
     *
     * @param {string} block
     * @returns {{ event?: string, data?: string }|null}
     * @private
     */
    _parseSseEvent(block) {
      const lines = block.split(/\r?\n/);
      let eventName = null;
      const dataLines = [];

      for (const line of lines) {
        if (!line || line.startsWith(':')) {
          // comment or empty line inside block
          continue;
        }
        const idx = line.indexOf(':');
        const field = idx === -1 ? line : line.slice(0, idx);
        let value = idx === -1 ? '' : line.slice(idx + 1);
        if (value.startsWith(' ')) value = value.slice(1);

        if (field === 'event') {
          eventName = value;
        } else if (field === 'data') {
          dataLines.push(value);
        }
      }

      if (!eventName && dataLines.length === 0) {
        return null;
      }

      return {
        event: eventName || undefined,
        data: dataLines.join('\n')
      };
    }

    /**
     * Consume a text/event-stream response and resolve with the final JSON-RPC result.
     *
     * This implementation assumes the server eventually sends a JSON-RPC response
     * (or a wrapper) in one of the SSE "data:" fields. It:
     * - concatenates all data chunks that look like JSON
     * - tries to parse them as JSON-RPC
     *
     * If it cannot find a valid JSON-RPC result, it throws an error.
     *
     * @param {Response} response
     * @returns {Promise<any>}
     * @private
     */
    async _consumeEventStream(response) {
      const reader = response.body && response.body.getReader
        ? response.body.getReader()
        : null;

      if (!reader) {
        throw new Error('MCP HTTP error: event-stream response has no readable body');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let aggregatedJsonText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split into complete SSE event blocks by double newline
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';

        for (const part of parts) {
          const evt = this._parseSseEvent(part);
          if (!evt || !evt.data) continue;

          // Heuristic: accumulate anything that looks like JSON.
          const trimmed = evt.data.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            // Separate multiple JSON chunks with newline to keep them parseable
            if (aggregatedJsonText) aggregatedJsonText += '\n';
            aggregatedJsonText += trimmed;
          }
        }
      }

      // Try to parse the aggregated JSON text.
      if (!aggregatedJsonText) {
        throw new Error('MCP HTTP error: event-stream contained no JSON payload');
      }

      let data;
      try {
        // Some servers may send multiple JSON objects separated by newlines.
        // Try parsing as a single JSON first; if that fails, try line-by-line.
        try {
          data = JSON.parse(aggregatedJsonText);
        } catch (e) {
          const candidates = [];
          for (const line of aggregatedJsonText.split('\n')) {
            const t = line.trim();
            if (!t) continue;
            try {
              candidates.push(JSON.parse(t));
            } catch (_) {
              // ignore non-JSON lines
            }
          }
          if (!candidates.length) {
            throw e;
          }
          // Use the last JSON object as the final JSON-RPC response.
          data = candidates[candidates.length - 1];
        }
      } catch (e) {
        throw new Error('MCP HTTP error: invalid JSON in event-stream response');
      }

      if (data.error) {
        const msg = data.error.message || 'Unknown MCP JSON-RPC error';
        const code = data.error.code != null ? ` (code ${data.error.code})` : '';
        throw new Error(`MCP JSON-RPC error${code}: ${msg}`);
      }

      if (!Object.prototype.hasOwnProperty.call(data, 'result')) {
        throw new Error('MCP JSON-RPC error: missing result field in event-stream response');
      }

      return data.result;
    }

    /**
     * Send a JSON-RPC request.
     *
     * @param {string} method - Full JSON-RPC method name (e.g. "mcp.tools.list").
     * @param {Object} [params] - Parameters object.
     * @returns {Promise<any>} - Resolves with result or rejects with Error.
     */
    async sendRequest(method, params = {}) {
      const id = nextId++;
      const payload = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this._buildHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorText = `MCP HTTP error: ${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.error && errJson.error.message) {
            errorText += ` – ${errJson.error.message}`;
          }
        } catch (e) {
          // ignore JSON parse errors
        }
        throw new Error(errorText);
      }

      const contentType = response.headers.get('Content-Type') || '';
      const mime = contentType.split(';')[0].trim().toLowerCase();

      if (mime === 'text/event-stream') {
        // Handle streaming SSE responses and resolve with the final JSON-RPC result.
        return this._consumeEventStream(response);
      }

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error('MCP HTTP error: invalid JSON response');
      }

      if (data.error) {
        const msg = data.error.message || 'Unknown MCP JSON-RPC error';
        const code = data.error.code != null ? ` (code ${data.error.code})` : '';
        throw new Error(`MCP JSON-RPC error${code}: ${msg}`);
      }

      if (!Object.prototype.hasOwnProperty.call(data, 'result')) {
        throw new Error('MCP JSON-RPC error: missing result field');
      }

      return data.result;
    }
  }

  // Expose globally
  window.MCPHttpTransport = MCPHttpTransport;
  window.buildMCPMethodName = buildMethodName;
})();
