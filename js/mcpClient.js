/**
 * Tools-focused MCP 2026-07-28 client.
 */

(function () {
  const { mcp } = window.APP_CONFIG;
  const HEADER_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

  function requireComplete(result, operation) {
    if (!result || result.resultType !== 'complete') {
      const type = result && result.resultType ? result.resultType : 'missing';
      throw new Error(`${operation} returned unsupported resultType "${type}"`);
    }
    return result;
  }

  function validateCacheFields(result, operation) {
    if (!Number.isInteger(result.ttlMs) || result.ttlMs < 0) {
      throw new Error(`${operation} returned an invalid ttlMs`);
    }
    if (result.cacheScope !== 'private' && result.cacheScope !== 'public') {
      throw new Error(`${operation} returned an invalid cacheScope`);
    }
  }

  function inspectToolHeaders(tool) {
    const descriptors = [];
    const seen = new Set();
    const failures = [];

    function visit(node, propertyPath, reachable) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((child) => visit(child, propertyPath, false));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(node, 'x-mcp-header')) {
        const header = node['x-mcp-header'];
        const primitive = node.type === 'string' || node.type === 'integer' || node.type === 'boolean';
        const normalized = typeof header === 'string' ? header.toLowerCase() : '';
        if (!reachable || !propertyPath.length) failures.push('annotation is not reachable through properties');
        else if (typeof header !== 'string' || !header || !HEADER_TOKEN.test(header)) failures.push('invalid header name');
        else if (!primitive) failures.push('annotation must target a string, integer, or boolean');
        else if (seen.has(normalized)) failures.push('duplicate header name');
        else {
          seen.add(normalized);
          descriptors.push({ header, path: propertyPath.slice(), type: node.type });
        }
      }

      for (const [key, value] of Object.entries(node)) {
        if (!value || typeof value !== 'object') continue;
        if (key === 'properties' && !Array.isArray(value)) {
          for (const [propertyName, propertySchema] of Object.entries(value)) {
            visit(propertySchema, propertyPath.concat(propertyName), reachable);
          }
        } else {
          visit(value, propertyPath, false);
        }
      }
    }

    visit(tool.inputSchema, [], true);
    return { valid: failures.length === 0, descriptors, reason: failures[0] };
  }

  function valueAtPath(value, path) {
    let current = value;
    for (const part of path) {
      if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  class MCPClient {
    constructor(config = {}) {
      if (!config.endpoint) throw new Error('MCPClient requires an endpoint URL');
      this.protocolVersion = mcp.protocolVersion;
      this.clientInfo = Object.assign({}, mcp.clientInfo, config.clientInfo || {});
      this.clientCapabilities = Object.assign({}, mcp.clientCapabilities);
      this.transport = new window.MCPHttpTransport({
        endpoint: config.endpoint,
        protocolVersion: this.protocolVersion,
        apiKey: config.apiKey,
        headers: config.headers
      });
      this._discoverCache = null;
      this._toolsCache = null;
      this._toolDefinitions = new Map();
      this._toolHeaders = new Map();
    }

    _params(params = {}) {
      const next = Object.assign({}, params);
      next._meta = Object.assign({}, params._meta || {}, {
        'io.modelcontextprotocol/protocolVersion': this.protocolVersion,
        'io.modelcontextprotocol/clientInfo': Object.assign({}, this.clientInfo),
        'io.modelcontextprotocol/clientCapabilities': Object.assign({}, this.clientCapabilities)
      });
      return next;
    }

    _isFresh(cache) {
      return !!cache && Date.now() < cache.expiresAt;
    }

    async discover(options = {}) {
      if (!options.forceRefresh && this._isFresh(this._discoverCache)) return this._discoverCache.value;
      const result = requireComplete(
        await this.transport.sendRequest(mcp.methods.discover, this._params()),
        'server/discover'
      );
      validateCacheFields(result, 'server/discover');
      if (!Array.isArray(result.supportedVersions) || !result.supportedVersions.includes(this.protocolVersion)) {
        throw new Error(`MCP server does not support protocol version ${this.protocolVersion}`);
      }
      if (!result.capabilities || !result.capabilities.tools) {
        throw new Error('MCP server does not advertise the tools capability');
      }
      this._discoverCache = { value: result, expiresAt: Date.now() + result.ttlMs };
      return result;
    }

    async listTools(options = {}) {
      if (!options.forceRefresh && this._isFresh(this._toolsCache)) return this._toolsCache.value;
      await this.discover({ forceRefresh: !!options.forceRefresh });

      const tools = [];
      const toolDefinitions = new Map();
      const toolHeaders = new Map();
      const seenCursors = new Set();
      let cursor;
      let ttlMs = Infinity;
      let cacheScope = 'public';
      let firstMeta;

      do {
        const requestParams = cursor ? { cursor } : {};
        const result = requireComplete(
          await this.transport.sendRequest(mcp.methods.listTools, this._params(requestParams)),
          'tools/list'
        );
        validateCacheFields(result, 'tools/list');
        if (!Array.isArray(result.tools)) throw new Error('tools/list returned an invalid tools array');
        if (firstMeta === undefined) firstMeta = result._meta;
        ttlMs = Math.min(ttlMs, result.ttlMs);
        if (result.cacheScope === 'private') cacheScope = 'private';

        for (const tool of result.tools) {
          if (!tool || typeof tool.name !== 'string' || !tool.inputSchema) continue;
          const inspection = inspectToolHeaders(tool);
          if (!inspection.valid) {
            console.warn(`Ignoring MCP tool "${tool.name}": invalid x-mcp-header (${inspection.reason}).`);
            continue;
          }
          tools.push(tool);
          toolDefinitions.set(tool.name, tool);
          toolHeaders.set(tool.name, inspection.descriptors);
        }

        cursor = result.nextCursor;
        if (cursor) {
          if (seenCursors.has(cursor)) throw new Error('tools/list returned a repeated pagination cursor');
          seenCursors.add(cursor);
        }
      } while (cursor);

      const value = {
        resultType: 'complete',
        tools,
        ttlMs: Number.isFinite(ttlMs) ? ttlMs : 0,
        cacheScope
      };
      if (firstMeta !== undefined) value._meta = firstMeta;
      this._toolDefinitions = toolDefinitions;
      this._toolHeaders = toolHeaders;
      this._toolsCache = { value, expiresAt: Date.now() + value.ttlMs };
      return value;
    }

    _callHeaders(name, args) {
      const headers = {};
      for (const descriptor of this._toolHeaders.get(name) || []) {
        const value = valueAtPath(args, descriptor.path);
        if (value === undefined || value === null) continue;
        if (descriptor.type === 'integer' && (!Number.isSafeInteger(value))) {
          throw new Error(`Tool parameter ${descriptor.path.join('.')} must be a safe integer`);
        }
        if (descriptor.type === 'boolean' && typeof value !== 'boolean') {
          throw new Error(`Tool parameter ${descriptor.path.join('.')} must be a boolean`);
        }
        if (descriptor.type === 'string' && typeof value !== 'string') {
          throw new Error(`Tool parameter ${descriptor.path.join('.')} must be a string`);
        }
        headers[`Mcp-Param-${descriptor.header}`] = window.encodeMCPHeaderValue(value);
      }
      return headers;
    }

    async callTool(params) {
      if (!params || !params.name) throw new Error('callTool requires a params object with a "name" field');
      await this.listTools();
      if (!this._toolDefinitions.has(params.name)) throw new Error(`Unknown MCP tool "${params.name}"`);

      const invoke = async () => {
        const result = requireComplete(
          await this.transport.sendRequest(mcp.methods.callTool, this._params(params), {
            headers: this._callHeaders(params.name, params.arguments || {})
          }),
          'tools/call'
        );
        if (!Array.isArray(result.content)) throw new Error('tools/call returned an invalid content array');
        return result;
      };

      try {
        return await invoke();
      } catch (error) {
        if (error && error.code === -32020) {
          await this.listTools({ forceRefresh: true });
          if (!this._toolDefinitions.has(params.name)) throw new Error(`Unknown MCP tool "${params.name}" after refresh`);
          return invoke();
        }
        throw error;
      }
    }
  }

  window.MCPClient = MCPClient;
})();
