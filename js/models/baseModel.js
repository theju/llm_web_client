/**
 * Base model abstractions for the MCP Browser Client MVP.
 *
 * Defines:
 * - ChatModel: abstract base class for chat-style models.
 * - Utility helpers for normalizing messages and options.
 *
 * Concrete implementations (e.g. OpenAI, local WebGPU) should extend ChatModel
 * and implement the sendMessage method.
 */

(function () {
  /**
   * @typedef {Object} ChatMessage
   * @property {'system'|'user'|'assistant'|'tool'} role
   * @property {string|Array|Object} content
   * @property {string} [name]       - Optional name (for tools, etc.)
   * @property {Object} [toolCall]   - Provider-specific tool call metadata
   */

  /**
   * @typedef {Object} ChatOptions
   * @property {number} [temperature]          - Optional; some models may ignore this.
   * @property {number|null} [maxTokens]       - Optional; some models may ignore this.
   * @property {Array<Object>} [tools]         - Tool definitions (provider-specific)
   * @property {string|Object} [toolChoice]    - Tool choice (provider-specific)
   * @property {'chat'|'responses'} [apiType]  - OpenAI API type; defaults to config/openAI default.
   */

  /**
   * Abstract base class for chat models.
   * Implementations must override sendMessage.
   */
  class ChatModel {
    /**
     * @param {Object} config - Provider-specific configuration.
     */
    constructor(config = {}) {
      this.config = config;
    }

    /**
     * Send a chat request to the model.
     *
     * @param {ChatMessage[]} messages - Conversation history.
     * @param {ChatOptions} [options]  - Generation options.
     * @returns {Promise<{ message: ChatMessage, raw: any }>}
     *
     * The returned object should contain:
     * - message: normalized assistant message
     * - raw: raw provider response (for debugging / advanced use)
     */
    // eslint-disable-next-line no-unused-vars
    async sendMessage(messages, options = {}) {
      throw new Error('sendMessage must be implemented by subclasses');
    }
  }

  /**
   * Normalize options by applying defaults from APP_CONFIG.openAI.
   * This is generic enough for OpenAI-compatible APIs.
   *
   * IMPORTANT:
   * - If a caller explicitly passes `temperature` or `maxTokens` as
   *   `undefined`, `null`, or a non-number, we do NOT force a default.
   *   This allows models that do not support these options to simply
   *   ignore them.
   *
   * @param {ChatOptions} options
   * @returns {ChatOptions}
   */
  function normalizeChatOptions(options = {}) {
    const { openAI } = window.APP_CONFIG;
    const normalized = Object.assign({}, options);

    // Only apply default temperature if the caller did not specify it at all.
    if (!Object.prototype.hasOwnProperty.call(normalized, 'temperature')) {
      normalized.temperature = openAI.defaultTemperature;
    }

    // Only apply default maxTokens if the caller did not specify it at all.
    if (!Object.prototype.hasOwnProperty.call(normalized, 'maxTokens')) {
      normalized.maxTokens = openAI.defaultMaxTokens;
    }

    // API type: 'chat' (chat completions) or 'responses'
    if (!Object.prototype.hasOwnProperty.call(normalized, 'apiType')) {
      // Prefer explicit config.apiType if present, else global default
      const cfg = (this && this.config) || {};
      normalized.apiType = cfg.apiType || openAI.defaultApiType || 'chat';
    }

    return normalized;
  }

  /**
   * Simple helper to ensure messages are in the expected shape.
   *
   * NOTE: content may be a string OR structured content (array/object) for multimodal.
   * We must NOT coerce it to String(), otherwise arrays/objects become "[object Object]".
   *
   * @param {ChatMessage[]} messages
   * @returns {ChatMessage[]}
   */
  function normalizeMessages(messages = []) {
    if (!Array.isArray(messages)) return [];
    return messages.map((m) => {
      let content = '';
      if (m && Object.prototype.hasOwnProperty.call(m, 'content')) {
        if (m.content === null || m.content === undefined) {
          content = '';
        } else if (typeof m.content === 'string') {
          content = m.content;
        } else {
          // Preserve arrays/objects for multimodal content
          content = m.content;
        }
      }

      return {
        role: m.role,
        content,
        name: m.name,
        toolCall: m.toolCall
      };
    });
  }

  // Expose globally
  window.ChatModel = ChatModel;
  window.normalizeChatOptions = normalizeChatOptions;
  window.normalizeMessages = normalizeMessages;
})();
