/**
 * Global configuration and simple helpers for the MCP Browser Client MVP.
 *
 * This file defines:
 * - Constants for IndexedDB
 * - Defaults for OpenAI-compatible APIs
 * - Utility functions for safe localStorage access (for non-sensitive prefs)
 *
 * NOTE: API keys are NOT persisted here; they will be stored in IndexedDB.
 */

const APP_CONFIG = {
  appName: 'MCP Browser Client MVP',

  // IndexedDB configuration
  db: {
    name: 'mcp_browser_client_db',
    version: 1,
    stores: {
      servers: 'servers',           // MCP servers + model providers
      models: 'models',             // Model definitions (OpenAI-compatible, local, etc.)
      skills: 'skills',             // Reusable system instructions
      conversations: 'conversations',
      messages: 'messages',
      meta: 'meta'                  // Misc key/value settings if needed
    }
  },

  // Default OpenAI-compatible configuration
  openAI: {
    defaultBaseUrl: 'https://api.openai.com/v1',
    chatCompletionsPath: '/chat/completions',
    responsesPath: '/responses',
    defaultModel: 'gpt-5-mini',
    defaultTemperature: 0.7,
    defaultMaxTokens: null, // null means "let the API decide" unless user overrides
    defaultApiType: 'chat'  // 'chat' | 'responses'
  },

  // MCP JSON-RPC defaults
  mcp: {
    protocolVersion: '2026-07-28',
    clientInfo: {
      name: 'MCP Browser Client',
      version: '0.0.1'
    },
    clientCapabilities: {},
    methods: {
      discover: 'server/discover',
      listTools: 'tools/list',
      callTool: 'tools/call'
    }
  },

  // Browser-side file streaming relay defaults
  fileUploads: {
    defaultTokenTtlSeconds: 600
  }
};

/**
 * Simple wrapper around localStorage to avoid throwing in private mode
 * or restricted environments. Use this only for non-sensitive data.
 */
const SafeStorage = {
  get(key, defaultValue = null) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Ignore storage errors silently
    }
  },

  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      // Ignore
    }
  }
};

// Expose config globally (simple pattern for vanilla JS)
window.APP_CONFIG = APP_CONFIG;
window.SafeStorage = SafeStorage;
