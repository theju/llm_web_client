/**
 * High-level MCP client for the MCP Browser Client MVP.
 *
 * This wraps MCPHttpTransport and provides convenience methods for:
 * - initialize
 * - listTools
 * - callTool
 *
 * It assumes JSON-RPC 2.0 over HTTP and the method naming convention:
 *   initialize
 *   tools/list
 *   tools/call
 *
 * The actual method names are configurable via APP_CONFIG.mcp.
 */

(function () {
  const { mcp } = window.APP_CONFIG;

  /**
   * Build a fully-qualified MCP method name using the configured prefix.
   *
   * @param {string} methodKey - e.g. "tools/list"
   * @returns {string} - e.g. "mcp.tools.list"
   */
  function buildMethod(methodKey) {
    const prefix = mcp.defaultMethodPrefix;
    if (!prefix) return methodKey;
    if (methodKey.startsWith(prefix + '.')) return methodKey;
    return `${prefix}.${methodKey}`;
  }

  /**
   * Simple MCP client using an underlying transport (MCPHttpTransport).
   */
  class MCPClient {
    /**
     * @param {Object} config
     * @param {string} config.endpoint - JSON-RPC endpoint URL.
     * @param {string} [config.apiKey] - Optional API key for Authorization header.
     * @param {Object} [config.headers] - Extra headers.
     */
    constructor(config = {}) {
      if (!config.endpoint) {
        throw new Error('MCPClient requires an endpoint URL');
      }

      this.transport = new window.MCPHttpTransport({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        headers: config.headers
      });
    }

    /**
     * Call mcp.initialize (or configured equivalent).
     *
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async initialize(params = {}) {
      const methodKey = mcp.methods.initialize || 'initialize';
      const method = buildMethod(methodKey);
      return this.transport.sendRequest(method, params);
    }

    /**
     * Call mcp.tools.list (or configured equivalent).
     *
     * @param {Object} [params]
     * @returns {Promise<{ tools: Array<any> }|any>}
     */
    async listTools(params = {}) {
      const methodKey = mcp.methods.listTools || 'tools/list';
      const method = buildMethod(methodKey);
      return this.transport.sendRequest(method, params);
    }

    /**
     * Call mcp.tools.call (or configured equivalent).
     *
     * @param {Object} params
     * @param {string} params.name - Tool name.
     * @param {any} [params.arguments] - Tool arguments.
     * @returns {Promise<any>}
     */
    async callTool(params) {
      if (!params || !params.name) {
        throw new Error('callTool requires a params object with a "name" field');
      }
      const methodKey = mcp.methods.callTool || 'tools/call';
      const method = buildMethod(methodKey);
      return this.transport.sendRequest(method, params);
    }
  }

  // Expose globally
  window.MCPClient = MCPClient;
})();
