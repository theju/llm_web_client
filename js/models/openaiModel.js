/**
 * OpenAI-compatible ChatModel implementation for the MCP Browser Client MVP.
 *
 * This implementation is designed to work with:
 * - OpenAI's Chat Completions API
 * - OpenAI's Responses API
 * - Other OpenAI-compatible providers (by changing base URL and model name)
 *
 * It expects configuration to be provided at construction time, typically
 * loaded from IndexedDB or user input:
 *
 * {
 *   apiKey: string,
 *   baseUrl?: string,   // defaults to APP_CONFIG.openAI.defaultBaseUrl
 *   model: string,
 *   temperature?: number,
 *   maxTokens?: number|null,
 *   apiType?: 'chat' | 'responses'
 * }
 */

(function () {
  const { openAI } = window.APP_CONFIG;

  /**
   * @typedef {import('./baseModel').ChatMessage} ChatMessage
   * @typedef {import('./baseModel').ChatOptions} ChatOptions
   */

  class OpenAIChatModel extends window.ChatModel {
    /**
     * @param {Object} config
     * @param {string} config.apiKey
     * @param {string} [config.baseUrl]
     * @param {string} [config.model]
     * @param {number} [config.temperature]
     * @param {number|null} [config.maxTokens]
     * @param {'chat'|'responses'} [config.apiType]
     */
    constructor(config = {}) {
      super(config);
      if (!config.apiKey) {
        throw new Error('OpenAIChatModel requires an apiKey in config');
      }
      this.apiType = config.apiType || openAI.defaultApiType || 'chat';
    }

    /**
     * Build the full URL for the chosen endpoint (chat completions or responses).
     * @returns {string}
     * @private
     */
    _getEndpointUrl(apiType) {
      const baseUrl = this.config.baseUrl || openAI.defaultBaseUrl;
      const path = apiType === 'responses' ? openAI.responsesPath : openAI.chatCompletionsPath;
      // Ensure no double slashes
      return baseUrl.replace(/\/+$/, '') + path;
    }

    /**
     * Convert our normalized messages into OpenAI's expected format for
     * Chat Completions API.
     * @param {Array} messages
     * @returns {Array}
     * @private
     */
    _toOpenAIChatMessages(messages) {
      return messages.map((m) => {
        const base = {
          role: m.role,
          // IMPORTANT: content may be string OR structured (array/object) for multimodal.
          // We pass it through as-is.
          content: m.content
        };
        if (m.name) base.name = m.name;
        return base;
      });
    }

    /**
     * Convert our normalized messages into OpenAI's expected format for
     * the Responses API.
     *
     * We send `input` as an array of message objects (not a single string),
     * so multimodal content can be preserved as JSON.
     *
     * @param {Array} messages
     * @returns {Array}
     * @private
     */
    _toResponsesInput(messages) {
      return messages.map((m) => {
        const item = {
          role: m.role,
          content: m.content
        };
        if (m.name) item.name = m.name;
        return item;
      });
    }

    /**
     * Extract all assistant text from a Responses API result.
     * Reasoning models may emit one or more reasoning items before the
     * message item, and a message may contain multiple output_text parts.
     *
     * @param {Object} data
     * @returns {string}
     * @private
     */
    _extractResponsesText(data) {
      const textParts = [];
      const outputItems = data && Array.isArray(data.output) ? data.output : [];

      for (const outputItem of outputItems) {
        if (!outputItem || outputItem.type !== 'message' || !Array.isArray(outputItem.content)) {
          continue;
        }
        for (const contentPart of outputItem.content) {
          if (
            contentPart &&
            contentPart.type === 'output_text' &&
            typeof contentPart.text === 'string'
          ) {
            textParts.push(contentPart.text);
          }
        }
      }

      return textParts.join('');
    }

    /**
     * Send a chat request to the OpenAI-compatible API.
     *
     * @param {ChatMessage[]} messages
     * @param {ChatOptions} [options]
     * @returns {Promise<{ message: ChatMessage, raw: any }>}
     */
    async sendMessage(messages, options = {}) {
      const normalizedMessages = window.normalizeMessages(messages);
      const normalizedOptions = window.normalizeChatOptions.call(
        this,
        Object.assign(
          {
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
            apiType: this.apiType
          },
          options
        )
      );

      const apiType = normalizedOptions.apiType === 'responses' ? 'responses' : 'chat';
      const url = this._getEndpointUrl(apiType);
      const modelName = this.config.model || openAI.defaultModel;

      let body;

      if (apiType === 'responses') {
        // OpenAI Responses API payload (structured input)
        body = {
          model: modelName,
          input: this._toResponsesInput(normalizedMessages)
        };

        if (
          Object.prototype.hasOwnProperty.call(normalizedOptions, 'temperature') &&
          typeof normalizedOptions.temperature === 'number' &&
          Number.isFinite(normalizedOptions.temperature)
        ) {
          body.temperature = normalizedOptions.temperature;
        }

        if (Object.prototype.hasOwnProperty.call(normalizedOptions, 'maxTokens')) {
          const mt = normalizedOptions.maxTokens;
          if (mt === null || (typeof mt === 'number' && Number.isFinite(mt))) {
            body.max_output_tokens = mt;
          }
        }

        // Tools for Responses API are different; for MVP we skip tool wiring here.
        // Future: map MCP tools into responses "tools" format if needed.
      } else {
        // Chat Completions API payload
        body = {
          model: modelName,
          messages: this._toOpenAIChatMessages(normalizedMessages)
        };

        // Only include temperature if it is a finite number.
        if (
          Object.prototype.hasOwnProperty.call(normalizedOptions, 'temperature') &&
          typeof normalizedOptions.temperature === 'number' &&
          Number.isFinite(normalizedOptions.temperature)
        ) {
          body.temperature = normalizedOptions.temperature;
        }

        // Only include max_completion_tokens if it is a finite number or null.
        if (Object.prototype.hasOwnProperty.call(normalizedOptions, 'maxTokens')) {
          const mt = normalizedOptions.maxTokens;
          if (mt === null || (typeof mt === 'number' && Number.isFinite(mt))) {
            body.max_completion_tokens = mt;
          }
        }

        // Tools and tool_choice are passed through as-is, assuming they are
        // already in OpenAI-compatible format.
        if (Array.isArray(normalizedOptions.tools) && normalizedOptions.tools.length > 0) {
          body.tools = normalizedOptions.tools;
        }
        if (normalizedOptions.toolChoice != null) {
          body.tool_choice = normalizedOptions.toolChoice;
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        let errorText = `OpenAI API error: ${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson && errJson.error && errJson.error.message) {
            errorText += ` – ${errJson.error.message}`;
          }
        } catch (e) {
          // ignore JSON parse errors, keep basic status text
        }
        throw new Error(errorText);
      }

      const data = await response.json();

      if (apiType === 'responses') {
        const text = this._extractResponsesText(data);

        const message = {
          role: 'assistant',
          content: text || '',
          toolCall: null
        };

        return {
          message,
          raw: data
        };
      }

      // Chat Completions API handling (existing behavior)
      if (!data.choices || !data.choices.length) {
        throw new Error('OpenAI API returned no choices');
      }

      const choice = data.choices[0];

      // Handle tool calls if present (OpenAI tool calling format)
      let content = '';
      let role = choice.message.role || 'assistant';
      let toolCall = null;

      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        // We treat this as a "tool" role message with metadata
        role = 'assistant';
        content = ''; // content may be empty when tool_calls are present
        toolCall = {
          tool_calls: choice.message.tool_calls
        };
      } else if (Array.isArray(choice.message.content)) {
        // Some providers may return content as an array of parts
        content = choice.message.content
          .map((part) => (typeof part === 'string' ? part : part.text || ''))
          .join('');
      } else {
        content = choice.message.content || '';
      }

      const message = {
        role,
        content,
        toolCall
      };

      return {
        message,
        raw: data
      };
    }
  }

  // Expose globally
  window.OpenAIChatModel = OpenAIChatModel;
})();
