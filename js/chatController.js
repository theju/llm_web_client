/**
 * Chat controller for the MCP Browser Client MVP.
 *
 * Responsibilities:
 * - Manage conversations.
 * - Coordinate between:
 *   * IndexedDB (DB)
 *   * Chat models (OpenAI, Cerebras, etc.)
 *   * MCPClient instances (tools from multiple MCP servers)
 * - Provide a simple API for the UI layer (ui.js).
 *
 * This file does NOT touch the DOM directly; ui.js should call into this.
 */

(function () {
  const appConfig = window.APP_CONFIG || {};
  const openAI = appConfig.openAI || {
    defaultModel: 'gpt-5-mini',
    defaultTemperature: 0.7,
    defaultMaxTokens: null,
    defaultApiType: 'chat'
  };
  const fileUploadConfig = appConfig.fileUploads || {
    defaultTokenTtlSeconds: 600
  };

  /**
   * Simple in-memory state for the current session.
   * Persisted pieces (servers, messages, etc.) live in IndexedDB.
   */
  const state = {
    activeModelConfig: null, // { id, name, providerType, apiKey, baseUrl, model, temperature, maxTokens, apiType? }
    modelInstance: null, // ChatModel instance
    mcpServers: [], // [{ id, name, endpoint, apiKey }]
    mcpClients: {}, // { [serverId]: MCPClient }
    models: [], // [{ id, name, providerType, config }]
    skills: [], // [{ id, name, description, instructions, enabled }]
    fileUploadSettings: {
      streamingPageUrl: '',
      ttlSeconds: fileUploadConfig.defaultTokenTtlSeconds
    },
    conversations: [], // [{ id, title, ... }]
    activeConversationId: null, // numeric ID from IndexedDB
    isSending: false,
    // UI-related toggles (not persisted yet)
    activeServerIds: new Set(), // which servers are enabled
    disabledToolNames: new Set() // tool names disabled by user (as returned by server)
  };

  /**
   * Initialize the chat controller:
   * - Ensure DB is open
   * - Load MCP servers
   * - Load models
   * - Load conversations (or create a default one)
   * - Load any saved active model selection from meta
   */
  async function init() {
    await window.DB.openDb();

    // Load MCP servers
    state.mcpServers = await window.DB.getAllServers();
    _rebuildMcpClients();
    state.activeServerIds = new Set(state.mcpServers.map((s) => s.id));

    // Load models
    state.models = await window.DB.getAllModels();

    // Load skills and file-upload settings
    state.skills = window.DB.getAllSkills ? await window.DB.getAllSkills() : [];
    state.fileUploadSettings = await window.DB.getMeta('fileUploadSettings', {
      streamingPageUrl: '',
      ttlSeconds: fileUploadConfig.defaultTokenTtlSeconds
    });

    // Load conversations
    state.conversations = await window.DB.getAllConversations();
    if (state.conversations.length > 0) {
      state.activeConversationId = state.conversations[0].id;
    } else {
      const convId = await window.DB.addConversation({
        title: 'New conversation',
        serverId: null,
        modelId: null
      });
      state.conversations = await window.DB.getAllConversations();
      state.activeConversationId = convId;
    }

    // Load active model selection from meta (if any)
    const activeModelId = await window.DB.getMeta('activeModelId', null);
    if (activeModelId != null) {
      const model = state.models.find((m) => m.id === activeModelId);
      if (model) {
        await setActiveModelById(model.id);
      }
    }

    // Backward compatibility: if no models exist but we have an old openaiConfig,
    // create a default model from it.
    if (!state.models.length) {
      const legacyConfig = await window.DB.getMeta('openaiConfig', null);
      if (legacyConfig && legacyConfig.apiKey) {
        const modelId = await window.DB.addModel({
          name: legacyConfig.model || openAI.defaultModel,
          providerType: 'openai',
          config: legacyConfig
        });
        state.models = await window.DB.getAllModels();
        await setActiveModelById(modelId);
      }
    }

    return {
      mcpServers: state.mcpServers.slice(),
      models: state.models.slice(),
      skills: state.skills.slice(),
      fileUploadSettings: Object.assign({}, state.fileUploadSettings),
      conversations: state.conversations.slice(),
      activeConversationId: state.activeConversationId,
      activeModelConfig: state.activeModelConfig
    };
  }

  /**
   * Internal: rebuild MCPClient instances from state.mcpServers.
   */
  function _rebuildMcpClients() {
    state.mcpClients = {};
    for (const server of state.mcpServers) {
      if (!server.endpoint) continue;
      try {
        state.mcpClients[server.id] = new window.MCPClient({
          endpoint: server.endpoint,
          apiKey: server.apiKey || null
        });
      } catch (e) {
        // Ignore invalid configs; UI can surface errors when testing
      }
    }
  }

  /**
   * Get all MCP servers from DB and refresh in-memory state.
   */
  async function reloadMcpServers() {
    state.mcpServers = await window.DB.getAllServers();
    _rebuildMcpClients();
    state.activeServerIds = new Set(state.mcpServers.map((s) => s.id));
    return state.mcpServers.slice();
  }

  /**
   * Save or update an MCP server configuration.
   *
   * @param {Object} server
   * @returns {Promise<number>} - server ID
   */
  async function saveMcpServer(server) {
    if (server.id) {
      await window.DB.updateServer(server);
    } else {
      const id = await window.DB.addServer(server);
      server.id = id;
    }
    await reloadMcpServers();
    return server.id;
  }

  /**
   * Delete an MCP server by ID.
   */
  async function deleteMcpServer(id) {
    await window.DB.deleteServer(id);
    await reloadMcpServers();
  }

  /**
   * Test an MCP server by discovering it and listing its tools.
   *
   * @param {Object} serverConfig
   * @returns {Promise<{ ok: boolean, info?: any, error?: string }>}
   */
  async function testMcpServer(serverConfig) {
    try {
      const client = new window.MCPClient({
        endpoint: serverConfig.endpoint,
        apiKey: serverConfig.apiKey || null
      });

      const discoverResult = await client.discover();
      const toolsResult = await client.listTools();

      return {
        ok: true,
        info: {
          discover: discoverResult,
          tools: toolsResult
        }
      };
    } catch (e) {
      return {
        ok: false,
        error: e && e.message ? e.message : String(e)
      };
    }
  }

  /**
   * Create or update a model definition.
   *
   * @param {Object} modelInput
   * @param {number} [modelInput.id]
   * @param {string} modelInput.name
   * @param {string} [modelInput.providerType] - e.g. 'openai', 'cerebras'
   * @param {Object} modelInput.config        - provider-specific config
   * @returns {Promise<number>} - model ID
   */
  async function saveModel(modelInput) {
    const model = {
      id: modelInput.id,
      name: modelInput.name,
      providerType: modelInput.providerType || 'openai',
      config: modelInput.config || {}
    };

    if (model.id) {
      await window.DB.updateModel(model);
    } else {
      const id = await window.DB.addModel(model);
      model.id = id;
    }

    state.models = await window.DB.getAllModels();
    return model.id;
  }

  /**
   * Delete a model by ID.
   */
  async function deleteModel(id) {
    await window.DB.deleteModel(id);
    state.models = await window.DB.getAllModels();

    // If we deleted the active model, clear active selection
    if (state.activeModelConfig && state.activeModelConfig.id === id) {
      state.activeModelConfig = null;
      state.modelInstance = null;
      await window.DB.setMeta('activeModelId', null);
    }
  }

  /**
   * Get all models.
   */
  function getAllModels() {
    return state.models.slice();
  }

  /**
   * Set the active model by its ID.
   * - Instantiates the appropriate ChatModel implementation.
   * - Persists activeModelId in meta.
   */
  async function setActiveModelById(modelId) {
    const model = state.models.find((m) => m.id === modelId);
    if (!model) {
      throw new Error('Model not found');
    }

    const cfg = model.config || {};
    const providerType = model.providerType || 'openai';

    let instance;
    if (providerType === 'cerebras') {
      if (!window.CerebrasChatModel) {
        throw new Error('CerebrasChatModel is not available on window');
      }
      instance = new window.CerebrasChatModel(cfg);
    } else {
      // Default to OpenAI-compatible
      instance = new window.OpenAIChatModel(cfg);
    }

    state.activeModelConfig = Object.assign({ id: model.id, name: model.name, providerType }, cfg);
    state.modelInstance = instance;

    await window.DB.setMeta('activeModelId', model.id);
    return state.activeModelConfig;
  }

  /**
   * Backwards-compatible setter for a single OpenAI config.
   * Internally creates/updates a model named after the OpenAI model.
   */
  async function setActiveModelConfig(config) {
    if (!config || !config.apiKey) {
      throw new Error('Active model config requires an apiKey');
    }

    const normalizedConfig = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || '',
      model: config.model || openAI.defaultModel,
      temperature: typeof config.temperature === 'number' ? config.temperature : openAI.defaultTemperature,
      maxTokens: config.maxTokens === undefined ? openAI.defaultMaxTokens : config.maxTokens,
      apiType: config.apiType || openAI.defaultApiType || 'chat'
    };

    // Create or update a single "OpenAI default" model
    let existing = state.models.find((m) => m.providerType === 'openai' && m.name === normalizedConfig.model);

    const modelInput = {
      id: existing ? existing.id : undefined,
      name: normalizedConfig.model,
      providerType: 'openai',
      config: normalizedConfig
    };

    const modelId = await saveModel(modelInput);
    await window.DB.setMeta('openaiConfig', normalizedConfig); // keep legacy meta
    return setActiveModelById(modelId);
  }

  /**
   * Get the current active model config (may be null).
   */
  function getActiveModelConfig() {
    return state.activeModelConfig ? Object.assign({}, state.activeModelConfig) : null;
  }

  async function saveSkill(skillInput) {
    if (!window.DB.getAllSkills || !window.DB.addSkill || !window.DB.updateSkill) {
      throw new Error('Skills storage is not available. Reload the app and try again.');
    }

    const skill = {
      id: skillInput.id,
      name: skillInput.name,
      description: skillInput.description || '',
      instructions: skillInput.instructions || '',
      enabled: skillInput.enabled !== false
    };

    if (skill.id) {
      await window.DB.updateSkill(skill);
    } else {
      const id = await window.DB.addSkill(skill);
      skill.id = id;
    }

    state.skills = await window.DB.getAllSkills();
    return skill.id;
  }

  async function deleteSkill(id) {
    if (!window.DB.deleteSkill || !window.DB.getAllSkills) {
      throw new Error('Skills storage is not available. Reload the app and try again.');
    }

    await window.DB.deleteSkill(id);
    state.skills = await window.DB.getAllSkills();
  }

  async function reloadSkills() {
    state.skills = window.DB.getAllSkills ? await window.DB.getAllSkills() : [];
    return state.skills.slice();
  }

  function getAllSkills() {
    return state.skills.slice();
  }

  function getEnabledSkills() {
    return state.skills.filter((skill) => skill && skill.enabled !== false);
  }

  function _buildSkillsSystemPrompt() {
    const enabled = getEnabledSkills().filter((skill) => {
      return skill.name || skill.instructions || skill.description;
    });
    if (!enabled.length) return '';

    const lines = enabled.map((skill) => {
      const parts = [`Skill: ${skill.name || 'Untitled skill'}`];
      if (skill.description) parts.push(`Description: ${skill.description}`);
      if (skill.instructions) parts.push(`Instructions: ${skill.instructions}`);
      return parts.join('\n');
    });

    return `Use these enabled skills when they are relevant to the user request:\n\n${lines.join('\n\n')}`;
  }

  async function saveFileUploadSettings(settingsInput = {}) {
    const ttl = Number(settingsInput.ttlSeconds);
    const clean = {
      streamingPageUrl: (settingsInput.streamingPageUrl || '').trim(),
      ttlSeconds: Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : fileUploadConfig.defaultTokenTtlSeconds
    };
    state.fileUploadSettings = clean;
    await window.DB.setMeta('fileUploadSettings', clean);
    return Object.assign({}, clean);
  }

  function getFileUploadSettings() {
    return Object.assign({}, state.fileUploadSettings);
  }

  /**
   * Conversations helpers
   */

  function getAllConversations() {
    return state.conversations.slice();
  }

  function getActiveConversationId() {
    return state.activeConversationId;
  }

  async function setActiveConversation(id) {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) {
      throw new Error('Conversation not found');
    }
    state.activeConversationId = id;
    return id;
  }

  async function createConversation() {
    const id = await window.DB.addConversation({
      title: 'New conversation',
      serverId: null,
      modelId: null
    });
    state.conversations = await window.DB.getAllConversations();
    state.activeConversationId = id;
    return id;
  }

  async function renameConversation(id, newTitle) {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) {
      throw new Error('Conversation not found');
    }
    conv.title = (newTitle && newTitle.trim()) || 'Untitled conversation';
    await window.DB.updateConversation(conv);
    state.conversations = await window.DB.getAllConversations();
    return conv;
  }

  async function deleteConversation(id) {
    await window.DB.deleteConversation(id);
    // Delete messages for that conversation
    const msgs = await window.DB.getMessagesByConversation(id);
    for (const m of msgs) {
      await window.DB.deleteMessage(m.id);
    }
    state.conversations = await window.DB.getAllConversations();
    if (!state.conversations.length) {
      const newId = await window.DB.addConversation({
        title: 'New conversation',
        serverId: null,
        modelId: null
      });
      state.conversations = await window.DB.getAllConversations();
      state.activeConversationId = newId;
    } else if (state.activeConversationId === id) {
      state.activeConversationId = state.conversations[0].id;
    }
  }

  /**
   * Load all messages for the active conversation.
   */
  async function loadMessages() {
    if (!state.activeConversationId) {
      return [];
    }
    return window.DB.getMessagesByConversation(state.activeConversationId);
  }

  /**
   * Add a local-only message to the active conversation (no model call).
   * Intended for things like file uploads/previews.
   *
   * @param {Object} messageInput
   * @param {'user'|'assistant'|'system'|'tool'} [messageInput.role]
   * @param {string} [messageInput.content]
   * @param {boolean} [messageInput.fromTool]
   * @param {Object} [messageInput.attachment]
   * @returns {Promise<{ id: number, messages: any[] }>}
   */
  async function addLocalMessage(messageInput = {}) {
    if (!state.activeConversationId) {
      throw new Error('No active conversation.');
    }

    const now = new Date().toISOString();
    const record = {
      conversationId: state.activeConversationId,
      role: messageInput.role || 'user',
      content: messageInput.content != null ? String(messageInput.content) : '',
      createdAt: now,
      fromTool: !!messageInput.fromTool
    };

    if (messageInput.attachment && typeof messageInput.attachment === 'object') {
      record.attachment = messageInput.attachment;
    }

    const id = await window.DB.addMessage(record);
    const updatedMessages = await window.DB.getMessagesByConversation(state.activeConversationId);
    return { id, messages: updatedMessages };
  }

  /**
   * Update a message's content by message ID (must belong to active conversation).
   */
  async function updateMessage(messageId, newContent) {
    if (!state.activeConversationId) {
      throw new Error('No active conversation.');
    }
    const id = Number(messageId);
    if (Number.isNaN(id)) {
      throw new Error('Invalid message id');
    }

    const msg = await window.DB.getMessage(id);
    if (!msg) {
      throw new Error('Message not found');
    }
    if (msg.conversationId !== state.activeConversationId) {
      throw new Error('Cannot edit a message from a different conversation');
    }

    msg.content = newContent != null ? String(newContent) : '';
    await window.DB.updateMessage(msg);
    return msg;
  }

  /**
   * Delete a message by message ID (must belong to active conversation).
   */
  async function deleteMessage(messageId) {
    if (!state.activeConversationId) {
      throw new Error('No active conversation.');
    }
    const id = Number(messageId);
    if (Number.isNaN(id)) {
      throw new Error('Invalid message id');
    }

    const msg = await window.DB.getMessage(id);
    if (!msg) {
      return;
    }
    if (msg.conversationId !== state.activeConversationId) {
      throw new Error('Cannot delete a message from a different conversation');
    }

    await window.DB.deleteMessage(id);
  }

  /**
   * Clear all messages in the active conversation.
   */
  async function clearConversationMessages() {
    if (!state.activeConversationId) return;

    const messages = await window.DB.getMessagesByConversation(state.activeConversationId);
    for (const msg of messages) {
      await window.DB.deleteMessage(msg.id);
    }
  }

  function _resolveDefaultApiType() {
    // Default to Responses API unless explicitly provided in config.apiType
    const cfg = state.activeModelConfig || {};
    if (cfg.apiType === 'chat' || cfg.apiType === 'responses') {
      return cfg.apiType;
    }
    return 'responses';
  }

  function _isDataUrl(str) {
    return typeof str === 'string' && str.startsWith('data:');
  }

  function _attachmentToOpenAIInputPart(attachment) {
    if (!attachment || typeof attachment !== 'object') return null;
    if (attachment.kind !== 'file') return null;

    const mimeType = attachment.mimeType || '';
    const fileUrl = _isDataUrl(attachment.dataUrl) ? attachment.dataUrl : attachment.fileUrl;
    if (!fileUrl) return null;

    if (mimeType.startsWith('image/')) {
      return { type: 'input_image', image_url: fileUrl };
    }
    if (mimeType.startsWith('audio/')) {
      return { type: 'input_audio', audio_url: fileUrl };
    }
    if (mimeType.startsWith('video/')) {
      return { type: 'input_video', video_url: fileUrl };
    }

    return {
      type: 'input_file',
      file_url: fileUrl,
      filename: attachment.filename || undefined,
      mime_type: mimeType || undefined
    };
  }

  function _attachmentUrl(attachment) {
    if (!attachment || typeof attachment !== 'object') return '';
    if (_isDataUrl(attachment.dataUrl)) return attachment.dataUrl;
    return attachment.fileUrl || '';
  }

  function _contentWithAttachmentUrl(content, attachment) {
    const text = content != null ? String(content) : '';
    const url = _attachmentUrl(attachment);
    if (!url) return text;

    const filename = attachment.filename || 'uploaded file';
    const mimeType = attachment.mimeType || 'application/octet-stream';
    const size = attachment.size != null ? `\nFile size: ${attachment.size} bytes` : '';
    const fileBlock = `\n\nUploaded file:\nFilename: ${filename}\nMIME type: ${mimeType}${size}\nURL: ${url}`;
    return text ? `${text}${fileBlock}` : fileBlock.trim();
  }

  function _toModelMessages(dbMessages) {
    const out = [];
    const list = Array.isArray(dbMessages) ? dbMessages : [];

    for (const m of list) {
      if (!m) continue;

      if (m.role === 'user') {
        const attPart = _attachmentToOpenAIInputPart(m.attachment);
        const textContent = _contentWithAttachmentUrl(m.content, m.attachment);
        if (attPart) {
          out.push({
            role: 'user',
            content: [
              { type: 'input_text', text: textContent },
              attPart
            ]
          });
        } else {
          out.push({
            role: 'user',
            content: textContent
          });
        }
      } else {
        out.push({
          role: m.role,
          content: m.content != null ? String(m.content) : ''
        });
      }
    }

    return out;
  }

  function _extractTools(toolsResult) {
    if (!toolsResult) return [];
    if (Array.isArray(toolsResult)) return toolsResult;
    if (Array.isArray(toolsResult.tools)) return toolsResult.tools;
    if (toolsResult.result && Array.isArray(toolsResult.result.tools)) {
      return toolsResult.result.tools;
    }
    return [];
  }

  async function getAggregatedTools(options = {}) {
    const includeDisabled = !!options.includeDisabled;
    const out = [];
    const activeIds = new Set(state.activeServerIds);

    for (const server of state.mcpServers) {
      if (!server || !activeIds.has(server.id)) continue;
      const client = state.mcpClients[server.id];
      if (!client) continue;

      try {
        const toolsResult = await client.listTools({});
        const tools = _extractTools(toolsResult);
        tools.forEach((tool) => {
          if (!tool) return;
          const name = tool.function && tool.function.name ? tool.function.name : tool.name;
          const disabled = !!(name && state.disabledToolNames.has(name));
          if (!name || (disabled && !includeDisabled)) return;
          out.push(Object.assign({}, tool, {
            serverId: server.id,
            serverName: server.name || `Server ${server.id}`,
            disabled
          }));
        });
      } catch (e) {
        // Ignore server-specific tool listing failures so one server cannot block chat.
      }
    }

    return out;
  }

  async function executeToolCall(toolRequest) {
    if (!toolRequest || !toolRequest.name) {
      throw new Error('Tool request must include a name.');
    }

    const toolName = toolRequest.name;
    if (state.disabledToolNames.has(toolName)) {
      return {
        role: 'tool',
        name: toolName,
        content: `Tool "${toolName}" is disabled.`
      };
    }

    const activeIds = new Set(state.activeServerIds);

    for (const server of state.mcpServers) {
      if (!server || !activeIds.has(server.id)) continue;
      const client = state.mcpClients[server.id];
      if (!client) continue;

      try {
        const toolsResult = await client.listTools({});
        const tools = _extractTools(toolsResult);
        const hasTool = tools.some((tool) => {
          if (!tool) return false;
          const name = tool.function && tool.function.name ? tool.function.name : tool.name;
          return name === toolName;
        });
        if (!hasTool) continue;

        const result = await client.callTool({
          name: toolName,
          arguments: toolRequest.arguments || {}
        });

        return {
          role: 'tool',
          name: toolName,
          content: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        };
      } catch (e) {
        return {
          role: 'tool',
          name: toolName,
          content: `Tool call failed: ${e && e.message ? e.message : String(e)}`
        };
      }
    }

    return {
      role: 'tool',
      name: toolName,
      content: `Tool "${toolName}" was not found on any enabled MCP server.`
    };
  }

  /**
   * Regenerate the conversation after editing a message:
   * - Update the message content
   * - Delete all messages after it
   * - Re-run the model from that point to generate a new response
   *
   * @param {number} messageId
   * @param {string} newContent
   * @returns {Promise<{messages: any[]}>}
   */
  async function regenerateFromEditedMessage(messageId, newContent) {
    if (!state.activeConversationId) {
      throw new Error('No active conversation.');
    }
    if (!state.modelInstance || !state.activeModelConfig) {
      throw new Error('No active model configured. Please configure a model first.');
    }
    if (state.isSending) {
      throw new Error('A message is already being processed.');
    }

    const id = Number(messageId);
    if (Number.isNaN(id)) {
      throw new Error('Invalid message id');
    }

    const apiType = _resolveDefaultApiType();

    state.isSending = true;
    try {
      const msg = await window.DB.getMessage(id);
      if (!msg) throw new Error('Message not found');
      if (msg.conversationId !== state.activeConversationId) {
        throw new Error('Cannot edit a message from a different conversation');
      }

      // 1) Update message content
      msg.content = newContent != null ? String(newContent) : '';
      await window.DB.updateMessage(msg);

      // 2) Delete all messages after it
      await window.DB.deleteMessagesAfter(state.activeConversationId, id);

      // 3) Regenerate: re-run the model from current history
      let history = await window.DB.getMessagesByConversation(state.activeConversationId);
      history = _toModelMessages(history);

      const skillsPrompt = _buildSkillsSystemPrompt();
      if (skillsPrompt) {
        history.push({
          role: 'system',
          content: skillsPrompt
        });
      }

      const tools = await getAggregatedTools();
      history.push({
        role: 'system',
        content: `
You may use one of the following MCP tools: ${JSON.stringify(tools)}.
Do not provide any explanation or comments whatsoever.
Return a JSON object of the following format:
{"name": "<tool_name>", "arguments": {...}}
`
      });

      const firstResponse = await state.modelInstance.sendMessage(history, { apiType });
      const assistantMsg = firstResponse.message;

      await window.DB.addMessage({
        conversationId: state.activeConversationId,
        role: 'assistant',
        content: (assistantMsg && assistantMsg.content) || '',
        createdAt: new Date().toISOString(),
        fromTool: true
      });

      // Try to parse tool request
      let toolRequest = null;
      try {
        const parsed = JSON.parse(assistantMsg.content);
        if (parsed && parsed.name && parsed.arguments !== undefined) {
          toolRequest = parsed;
        }
      } catch (e) {
        // ignore
      }

      if (toolRequest) {
        const toolResultMessage = await executeToolCall(toolRequest);

        await window.DB.addMessage({
          conversationId: state.activeConversationId,
          role: 'assistant',
          name: toolResultMessage.name || '',
          content: toolResultMessage.content || '',
          createdAt: new Date().toISOString(),
          fromTool: true
        });

        // Final assistant response
        let history2 = await window.DB.getMessagesByConversation(state.activeConversationId);
        history2 = _toModelMessages(history2);

        const skillsPrompt2 = _buildSkillsSystemPrompt();
        if (skillsPrompt2) {
          history2.push({
            role: 'system',
            content: skillsPrompt2
          });
        }

        history2.push({
          role: 'system',
          content:
            'The previous assistant message contains the result of a tool call. ' +
            'If this result satisfies the user request, summarize it in a clear, ' +
            'human-readable way. Otherwise, explain what additional information or ' +
            'actions would be needed. using HTML. Do not offer any comments or explanations.\n' +
            'Use HTML to display the information to the user in a clear way. ' +
            'Do not add any comments or explanations when generating the HTML. ' +
            'Do not display the HTML within a markdown code block. ' +
            'Generate Aesthetic looking HTML with Bootstrap CSS and JS (optional) and Vanilla JS (optional). ' +
            'Bootstrap JS: https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.min.js ' +
            'Bootstrap CSS: https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css ' +
            'Bootstrap Icons: https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css '
        });

        const secondResponse = await state.modelInstance.sendMessage(history2, { apiType });
        const finalAssistant = secondResponse.message;

        await window.DB.addMessage({
          conversationId: state.activeConversationId,
          role: 'assistant',
          content: finalAssistant.content || '',
          createdAt: new Date().toISOString(),
          fromTool: false
        });
      }

      const updatedMessages = await window.DB.getMessagesByConversation(state.activeConversationId);
      return { messages: updatedMessages };
    } finally {
      state.isSending = false;
    }
  }

  /**
   * Send a user message through the active model, with MCP tools available.
   *
   * @param {string} userText
   * @param {Object} [options]
   * @param {Array<Object>} [options.attachments] - pending attachments (will be persisted on the user message as msg.attachment)
   */
  async function sendUserMessage(userText, options = {}) {
    if (!state.modelInstance || !state.activeModelConfig) {
      throw new Error('No active model configured. Please configure a model first.');
    }
    if (!state.activeConversationId) {
      throw new Error('No active conversation.');
    }
    if (!userText || !userText.trim()) {
      throw new Error('Cannot send an empty message.');
    }
    if (state.isSending) {
      throw new Error('A message is already being processed.');
    }

    const apiType = _resolveDefaultApiType();

    state.isSending = true;
    try {
      const now = new Date().toISOString();

      const attachments = Array.isArray(options.attachments) ? options.attachments : [];
      const firstAttachment = attachments.length ? attachments[0] : null;
      const hasAttachment = !!(firstAttachment && typeof firstAttachment === 'object');

      // 1. Save user message (persist only text; persist attachment separately for UI rendering)
      const userMessage = {
        conversationId: state.activeConversationId,
        role: 'user',
        content: userText,
        createdAt: now
      };
      if (hasAttachment) {
        userMessage.attachment = firstAttachment;
      }
      await window.DB.addMessage(userMessage);

      // If this is the first non-system message in the conversation, use it as the title
      const msgsForConv = await window.DB.getMessagesByConversation(state.activeConversationId);
      const nonSystem = msgsForConv.filter((m) => m.role === 'user' || m.role === 'assistant');
      if (nonSystem.length === 1) {
        const conv = state.conversations.find((c) => c.id === state.activeConversationId);
        if (conv) {
          conv.title = userText.slice(0, 80);
          await window.DB.updateConversation(conv);
          state.conversations = await window.DB.getAllConversations();
        }
      }

      // 2. Load full history and convert to model messages (multimodal for user messages with attachments)
      let history = await window.DB.getMessagesByConversation(state.activeConversationId);
      history = _toModelMessages(history);

      // 3. Add enabled skills, aggregate tools, and append system instruction
      const skillsPrompt = _buildSkillsSystemPrompt();
      if (skillsPrompt) {
        history.push({
          role: 'system',
          content: skillsPrompt
        });
      }

      const tools = await getAggregatedTools();
      history.push({
        role: 'system',
        content: `
You may use one of the following MCP tools: ${JSON.stringify(tools)}.
Do not provide any explanation or comments whatsoever.
Return a JSON object of the following format:
{"name": "<tool_name>", "arguments": {...}}
`
      });

      // 4. First call: ask model to produce a tool request JSON
      const firstResponse = await state.modelInstance.sendMessage(history, { apiType });
      const assistantMsg = firstResponse.message;
      const raw = firstResponse.raw;

      // Try to parse the assistant content as a tool request JSON
      let toolRequest = null;
      try {
        const parsed = JSON.parse(assistantMsg.content);
        if (parsed && parsed.name && parsed.arguments !== undefined) {
          toolRequest = parsed;
        }
      } catch (e) {
        // Not valid JSON; treat as a normal assistant reply
      }

      // Save the first assistant message (tool request or plain text)
      const assistantRecord = {
        conversationId: state.activeConversationId,
        role: 'assistant',
        content: assistantMsg.content || '',
        createdAt: new Date().toISOString(),
        fromTool: true
      };
      await window.DB.addMessage(assistantRecord);

      // 5. If we have a valid tool request, execute it and save result as assistant
      if (toolRequest) {
        const toolResultMessage = await executeToolCall(toolRequest);

        await window.DB.addMessage({
          conversationId: state.activeConversationId,
          role: 'assistant',
          name: toolResultMessage.name || '',
          content: toolResultMessage.content || '',
          createdAt: new Date().toISOString(),
          fromTool: true
        });

        // 6. Reload history including tool result and ask model for final answer
        let history2 = await window.DB.getMessagesByConversation(state.activeConversationId);
        history2 = _toModelMessages(history2);

        const skillsPrompt2 = _buildSkillsSystemPrompt();
        if (skillsPrompt2) {
          history2.push({
            role: 'system',
            content: skillsPrompt2
          });
        }

        history2.push({
          role: 'system',
          content:
            'The previous assistant message contains the result of a tool call. ' +
            'If this result satisfies the user request, summarize it in a clear, ' +
            'human-readable way. Otherwise, explain what additional information or ' +
            'actions would be needed. using HTML. Do not offer any comments or explanations.\n' +
            'Use HTML to display the information to the user in a clear way. ' +
            'Do not add any comments or explanations when generating the HTML. ' +
            'Do not display the HTML within a markdown code block. ' +
            'Generate Aesthetic looking HTML with Bootstrap CSS and JS (optional) and Vanilla JS (optional). ' +
            'Bootstrap JS: https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.min.js ' +
            'Bootstrap CSS: https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css ' +
            'Bootstrap Icons: https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css '
        });

        const secondResponse = await state.modelInstance.sendMessage(history2, { apiType });

        const finalAssistant = secondResponse.message;
        await window.DB.addMessage({
          conversationId: state.activeConversationId,
          role: 'assistant',
          content: finalAssistant.content || '',
          createdAt: new Date().toISOString(),
          fromTool: false
        });
      }

      const updatedMessages = await window.DB.getMessagesByConversation(state.activeConversationId);
      return {
        messages: updatedMessages,
        raw,
        conversations: state.conversations.slice()
      };
    } finally {
      state.isSending = false;
    }
  }

  function isSending() {
    return state.isSending;
  }

  function getMcpServers() {
    return state.mcpServers.slice();
  }

  function getActiveServerIds() {
    return Array.from(state.activeServerIds);
  }

  function setServerEnabled(serverId, enabled) {
    if (enabled) {
      state.activeServerIds.add(serverId);
    } else {
      state.activeServerIds.delete(serverId);
    }
  }

  function setToolEnabled(toolName, enabled) {
    if (enabled) {
      state.disabledToolNames.delete(toolName);
    } else {
      state.disabledToolNames.add(toolName);
    }
  }

  // Expose controller API
  window.ChatController = {
    init,
    reloadMcpServers,
    saveMcpServer,
    deleteMcpServer,
    testMcpServer,

    // models
    saveModel,
    deleteModel,
    getAllModels,
    setActiveModelById,
    setActiveModelConfig, // legacy OpenAI-only path
    getActiveModelConfig,

    // skills
    saveSkill,
    deleteSkill,
    reloadSkills,
    getAllSkills,
    getEnabledSkills,

    // file uploads
    saveFileUploadSettings,
    getFileUploadSettings,

    // conversations
    getAllConversations,
    getActiveConversationId,
    setActiveConversation,
    createConversation,
    renameConversation,
    deleteConversation,

    // messages
    loadMessages,
    clearConversation: clearConversationMessages,
    sendUserMessage,
    isSending,
    addLocalMessage,
    updateMessage,
    deleteMessage,
    regenerateFromEditedMessage,

    // MCP
    getMcpServers,
    getActiveServerIds,
    setServerEnabled,
    setToolEnabled,
    getAggregatedTools
  };
})();
