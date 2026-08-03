/**
 * MCP 2026-07-28 Streamable HTTP transport.
 */

(function () {
  let nextId = 1;

  class MCPError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = 'MCPError';
      this.status = details.status;
      this.code = details.code;
      this.data = details.data;
      this.requestId = details.requestId;
    }
  }

  function utf8ToBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function encodeMCPHeaderValue(value) {
    const text = String(value);
    const isVisibleAscii = /^[\x20-\x7e]*$/.test(text);
    const hasOuterWhitespace = text !== text.trim();
    const resemblesSentinel = text.startsWith('=?base64?') && text.endsWith('?=');
    if (isVisibleAscii && !hasOuterWhitespace && !resemblesSentinel) return text;
    return `=?base64?${utf8ToBase64(text)}?=`;
  }

  class MCPHttpTransport {
    constructor(config = {}) {
      if (!config.endpoint) throw new Error('MCPHttpTransport requires an endpoint URL');
      if (!config.protocolVersion) throw new Error('MCPHttpTransport requires a protocol version');
      this.endpoint = config.endpoint;
      this.protocolVersion = config.protocolVersion;
      this.apiKey = config.apiKey || null;
      this.extraHeaders = config.headers || {};
    }

    _buildHeaders(method, params, requestHeaders = {}) {
      const headers = Object.assign({}, this.extraHeaders, requestHeaders, {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': this.protocolVersion,
        'Mcp-Method': method
      });

      if (method === 'tools/call' || method === 'resources/read' || method === 'prompts/get') {
        const name = params && (params.name != null ? params.name : params.uri);
        if (name == null) throw new Error(`${method} requires a name or URI for the Mcp-Name header`);
        headers['Mcp-Name'] = encodeMCPHeaderValue(name);
      }
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
      return headers;
    }

    _parseSseEvent(block) {
      const dataLines = [];
      for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue;
        const index = line.indexOf(':');
        const field = index === -1 ? line : line.slice(0, index);
        let value = index === -1 ? '' : line.slice(index + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'data') dataLines.push(value);
      }
      return dataLines.length ? dataLines.join('\n') : null;
    }

    _unwrapResponse(data, requestId, status) {
      if (!data || data.jsonrpc !== '2.0') {
        throw new MCPError('MCP JSON-RPC error: invalid response', { status, requestId });
      }
      if (data.id !== requestId) return undefined;
      if (data.error) {
        const message = data.error.message || 'Unknown MCP JSON-RPC error';
        const suffix = data.error.code != null ? ` (code ${data.error.code})` : '';
        throw new MCPError(`MCP JSON-RPC error${suffix}: ${message}`, {
          status,
          code: data.error.code,
          data: data.error.data,
          requestId
        });
      }
      if (!Object.prototype.hasOwnProperty.call(data, 'result')) {
        throw new MCPError('MCP JSON-RPC error: missing result field', { status, requestId });
      }
      return data.result;
    }

    async _consumeEventStream(response, requestId) {
      const reader = response.body && response.body.getReader ? response.body.getReader() : null;
      if (!reader) throw new MCPError('MCP HTTP error: event-stream response has no readable body');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let finalResult;
      const processBlock = (block) => {
        const payload = this._parseSseEvent(block);
        if (!payload) return;
        let data;
        try {
          data = JSON.parse(payload);
        } catch (_) {
          throw new MCPError('MCP HTTP error: invalid JSON in event-stream response', {
            status: response.status,
            requestId
          });
        }
        // Notifications have no id and are allowed before the final response.
        if (!Object.prototype.hasOwnProperty.call(data, 'id')) return;
        const result = this._unwrapResponse(data, requestId, response.status);
        if (result !== undefined) finalResult = result;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        blocks.forEach(processBlock);
      }
      buffer += decoder.decode();
      if (buffer.trim()) processBlock(buffer);
      if (finalResult === undefined) {
        throw new MCPError('MCP HTTP error: event-stream contained no matching JSON-RPC response', {
          status: response.status,
          requestId
        });
      }
      return finalResult;
    }

    async _readError(response, requestId) {
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        // An intermediary may return an empty or non-JSON error response.
      }
      if (data && data.error) {
        const message = data.error.message || response.statusText || 'Request failed';
        throw new MCPError(`MCP HTTP error: ${response.status} ${message}`, {
          status: response.status,
          code: data.error.code,
          data: data.error.data,
          requestId
        });
      }
      throw new MCPError(`MCP HTTP error: ${response.status} ${response.statusText}`.trim(), {
        status: response.status,
        requestId
      });
    }

    async sendRequest(method, params = {}, options = {}) {
      const id = nextId++;
      const payload = { jsonrpc: '2.0', id, method, params };
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this._buildHeaders(method, params, options.headers),
        body: JSON.stringify(payload),
        signal: options.signal
      });
      if (!response.ok) return this._readError(response, id);

      const mime = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      if (mime === 'text/event-stream') return this._consumeEventStream(response, id);

      let data;
      try {
        data = await response.json();
      } catch (_) {
        throw new MCPError('MCP HTTP error: invalid JSON response', {
          status: response.status,
          requestId: id
        });
      }
      return this._unwrapResponse(data, id, response.status);
    }
  }

  window.MCPError = MCPError;
  window.MCPHttpTransport = MCPHttpTransport;
  window.encodeMCPHeaderValue = encodeMCPHeaderValue;
})();
