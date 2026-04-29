/**
 * UI layer for the MCP Browser Client MVP.
 *
 * Responsibilities:
 * - Wire DOM events to ChatController methods.
 * - Render conversations list (left pane).
 * - Render MCP server list (settings modal and right pane).
 * - Render tools list in right pane.
 * - Render messages.
 * - Handle model config form and active model state.
 *
 * This file assumes:
 * - window.ChatController is available.
 * - DOM elements from index.html exist.
 */

(function () {
  // DOM references (settings modal)
  let mcpServerListEl;
  let addMcpServerBtn;
  let mcpServerForm;
  let mcpServerIdInput;
  let mcpServerNameInput;
  let mcpServerEndpointInput;
  let mcpServerApiKeyInput;
  let testMcpServerBtn;
  let resetMcpServerFormBtn;
  let mcpServerFormStatusEl;

  let modelConfigForm;
  let modelIdInput;
  let modelNameInput;
  let modelProviderSelect;
  let modelApiKeyInput;
  let modelBaseUrlInput;
  let modelApiTypeSelect;
  let modelModelNameInput;
  let modelTemperatureInput;
  let modelMaxTokensInput;
  let modelConfigStatusEl;
  let modelListEl;

  let skillListEl;
  let addSkillBtn;
  let skillForm;
  let skillIdInput;
  let skillNameInput;
  let skillDescriptionInput;
  let skillInstructionsInput;
  let skillEnabledInput;
  let resetSkillFormBtn;
  let skillFormStatusEl;

  let fileUploadSettingsForm;
  let fileUploadPageUrlInput;
  let fileUploadTtlInput;
  let fileUploadSettingsStatusEl;

  // Conversations pane
  let conversationsPaneEl;
  let toggleConversationsPaneBtn;
  let newConversationBtn;
  let conversationListEl;

  // Header controls
  let activeModelSelect;
  let openSettingsBtn;
  let settingsModalEl;
  let settingsModalInstance;
  let toggleMcpPaneBtn;

  // Right-side MCP pane
  let mcpPaneEl;
  let collapseMcpPaneBtn;
  let mcpPaneServerListEl;
  let mcpPaneToolListEl;
  let mcpToolsCountEl;

  // Chat area
  let messagesEl;
  let chatForm;
  let chatInput;
  let chatStatusEl;
  let clearChatBtn;
  let sendBtn;

  // Upload
  let uploadFileBtn;
  let chatFileInput;

  // Pending attachment UI (above textarea)
  let pendingAttachmentRowEl;
  let pendingAttachmentLinkEl;
  let pendingAttachmentDeleteBtn;

  // In-memory pending attachment (NOT persisted)
  let pendingAttachment = null;
  let activeFileStreams = [];

  function cacheDom() {
    // MCP servers (settings)
    mcpServerListEl = document.getElementById('mcp-server-list');
    addMcpServerBtn = document.getElementById('add-mcp-server-btn');
    mcpServerForm = document.getElementById('mcp-server-form');
    mcpServerIdInput = document.getElementById('mcp-server-id');
    mcpServerNameInput = document.getElementById('mcp-server-name');
    mcpServerEndpointInput = document.getElementById('mcp-server-endpoint');
    mcpServerApiKeyInput = document.getElementById('mcp-server-api-key');
    testMcpServerBtn = document.getElementById('test-mcp-server-btn');
    resetMcpServerFormBtn = document.getElementById('reset-mcp-server-form-btn');
    mcpServerFormStatusEl = document.getElementById('mcp-server-form-status');

    // Models (settings)
    modelConfigForm = document.getElementById('model-config-form');
    modelIdInput = document.getElementById('model-id');
    modelNameInput = document.getElementById('model-name');
    modelProviderSelect = document.getElementById('model-provider');
    modelApiKeyInput = document.getElementById('model-api-key');
    modelBaseUrlInput = document.getElementById('model-base-url');
    modelApiTypeSelect = document.getElementById('model-api-type');
    modelModelNameInput = document.getElementById('model-model-name');
    modelTemperatureInput = document.getElementById('model-temperature');
    modelMaxTokensInput = document.getElementById('model-max-tokens');
    modelConfigStatusEl = document.getElementById('model-config-status');
    modelListEl = document.getElementById('model-list');

    // Skills (settings)
    skillListEl = document.getElementById('skill-list');
    addSkillBtn = document.getElementById('add-skill-btn');
    skillForm = document.getElementById('skill-form');
    skillIdInput = document.getElementById('skill-id');
    skillNameInput = document.getElementById('skill-name');
    skillDescriptionInput = document.getElementById('skill-description');
    skillInstructionsInput = document.getElementById('skill-instructions');
    skillEnabledInput = document.getElementById('skill-enabled');
    resetSkillFormBtn = document.getElementById('reset-skill-form-btn');
    skillFormStatusEl = document.getElementById('skill-form-status');

    // File uploads (settings)
    fileUploadSettingsForm = document.getElementById('file-upload-settings-form');
    fileUploadPageUrlInput = document.getElementById('file-upload-page-url');
    fileUploadTtlInput = document.getElementById('file-upload-ttl');
    fileUploadSettingsStatusEl = document.getElementById('file-upload-settings-status');

    // Conversations pane
    conversationsPaneEl = document.getElementById('conversations-pane');
    toggleConversationsPaneBtn = document.getElementById('toggle-conversations-pane-btn');
    newConversationBtn = document.getElementById('new-conversation-btn');
    conversationListEl = document.getElementById('conversation-list');

    // Header
    activeModelSelect = document.getElementById('active-model-select');
    openSettingsBtn = document.getElementById('open-settings-btn');
    toggleMcpPaneBtn = document.getElementById('toggle-mcp-pane-btn');
    settingsModalEl = document.getElementById('settings-modal');
    if (settingsModalEl && window.bootstrap && window.bootstrap.Modal) {
      settingsModalInstance = new window.bootstrap.Modal(settingsModalEl);
    }

    // MCP pane
    mcpPaneEl = document.getElementById('mcp-pane');
    collapseMcpPaneBtn = document.getElementById('collapse-mcp-pane-btn');
    mcpPaneServerListEl = document.getElementById('mcp-pane-server-list');
    mcpPaneToolListEl = document.getElementById('mcp-pane-tool-list');
    mcpToolsCountEl = document.getElementById('mcp-tools-count');

    // Chat
    messagesEl = document.getElementById('messages');
    chatForm = document.getElementById('chat-form');
    chatInput = document.getElementById('chat-input');
    chatStatusEl = document.getElementById('chat-status');
    clearChatBtn = document.getElementById('clear-chat-btn');
    sendBtn = document.getElementById('send-btn');

    // Upload
    uploadFileBtn = document.getElementById('upload-file-btn');
    chatFileInput = document.getElementById('chat-file-input');

    // Pending attachment UI
    pendingAttachmentRowEl = document.getElementById('pending-attachment-row');
    pendingAttachmentLinkEl = document.getElementById('pending-attachment-link');
    pendingAttachmentDeleteBtn = document.getElementById('pending-attachment-delete-btn');
  }

  function _escapeHtml(str) {
    const s = str == null ? '' : String(str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _safeFilename(name) {
    const base = (name == null ? 'thread' : String(name)).trim() || 'thread';
    return base
      .replace(/[\/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 120);
  }

  function _downloadTextFile(filename, text, mimeType = 'text/plain') {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch (e) {
        // ignore
      }
      URL.revokeObjectURL(url);
    }, 0);
  }

  function _buildThreadMessagesContainer(messages) {
    // This creates a DOM structure similar to what is shown in the app,
    // but without iframes (we export plain HTML blocks for assistant HTML messages).
    const container = document.createElement('div');
    container.className = 'messages';

    if (!Array.isArray(messages) || messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-muted small';
      empty.textContent = 'No messages.';
      container.appendChild(empty);
      return container;
    }

    for (const msg of messages) {
      const isUser = msg && msg.role === 'user';
      const bodyContent = (msg && msg.content) || '';
      const isToolResult = !!(msg && msg.fromTool);

      const looksLikeHtml =
        typeof bodyContent === 'string' &&
        /<\/(html|body|div|p|span|table|ul|ol|li|h1|h2|h3|h4|h5|h6)>/i.test(bodyContent);

      const row = document.createElement('div');
      row.className = 'd-flex flex-column mb-2';

      const bubble = document.createElement('div');
      bubble.className = `message ${isUser ? 'message-user' : 'message-assistant'}`;

      const header = document.createElement('div');
      header.className = 'small fw-bold mb-1 d-flex justify-content-between align-items-center';

      const headerLeft = document.createElement('span');
      headerLeft.textContent = isUser ? 'You' : 'Assistant';
      header.appendChild(headerLeft);

      bubble.appendChild(header);

      if (isToolResult) {
        const toolLabel = document.createElement('div');
        toolLabel.className = 'small text-muted mb-1';
        toolLabel.textContent = 'Tool result';
        bubble.appendChild(toolLabel);
      }

      const body = document.createElement('div');

      if (looksLikeHtml) {
        // Export assistant HTML as actual HTML (not inside an iframe).
        // We wrap it to avoid it affecting the outer document too much.
        const wrapper = document.createElement('div');
        wrapper.className = 'generated-html';
        wrapper.innerHTML = bodyContent;
        body.appendChild(wrapper);
      } else {
        body.textContent = bodyContent;
      }

      bubble.appendChild(body);
      row.appendChild(bubble);
      container.appendChild(row);
    }

    return container;
  }

  async function downloadThreadHtml(conversation) {
    const prevConversationId = window.ChatController.getActiveConversationId();
    const prevStatus = chatStatusEl ? chatStatusEl.textContent : '';

    try {
      setChatStatus('Preparing download...');
      setSendingState(true);

      // Switch to the target conversation to reuse controller's loadMessages()
      await window.ChatController.setActiveConversation(conversation.id);
      const msgs = await window.ChatController.loadMessages();

      const container = _buildThreadMessagesContainer(msgs);
      const inner = container.innerHTML;

      const title = conversation.title || `Conversation ${conversation.id}`;
      const filename = `${_safeFilename(title)}.html`;

      const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${_escapeHtml(title)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css">
  <style>
    body { background: #f8f9fa; }
    .messages { padding: 1rem; }
    .message {
      margin-bottom: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      max-width: 100%;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .message-user {
      background-color: #e6feda;
      color: #000;
      border: 1px solid #dee2e6;
    }
    .message-assistant {
      background-color: #ffffff;
      border: 1px solid #dee2e6;
    }
    .generated-html { overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container-fluid">
    <div class="py-3">
      <h1 class="h5 mb-0">${_escapeHtml(title)}</h1>
      <div class="text-muted small">Exported thread</div>
    </div>
    <div class="messages">
${inner}
    </div>
  </div>
</body>
</html>`;

      _downloadTextFile(filename, htmlDoc, 'text/html');
      setChatStatus('Download started.');
    } catch (err) {
      setChatStatus(`Download failed: ${err && err.message ? err.message : String(err)}`);
    } finally {
      // Restore previous conversation and UI
      try {
        if (prevConversationId != null) {
          await window.ChatController.setActiveConversation(prevConversationId);
          const msgs = await window.ChatController.loadMessages();
          renderMessages(msgs);

          const convs = window.ChatController.getAllConversations();
          renderConversationList(convs, prevConversationId);
        }
      } catch (e) {
        // ignore
      }

      setSendingState(false);
      // Restore status (but avoid forcing "Ready." if something else is set)
      if (prevStatus) {
        setChatStatus(prevStatus);
      }
    }
  }

  // ----- Conversations pane -----

  function renderConversationList(conversations, activeConversationId) {
    if (!conversationListEl) return;

    conversationListEl.innerHTML = '';

    if (!conversations || conversations.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'text-muted small px-2 py-1';
      emptyEl.textContent = 'No conversations yet.';
      conversationListEl.appendChild(emptyEl);
      return;
    }

    conversations.forEach((conv) => {
      const item = document.createElement('div');
      item.className = 'list-group-item d-flex justify-content-between align-items-center conversation-item';
      if (conv.id === activeConversationId) {
        item.classList.add('active');
      }
      item.dataset.conversationId = conv.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'text-truncate';
      titleSpan.textContent = conv.title || `Conversation ${conv.id}`;

      const menuWrapper = document.createElement('div');
      menuWrapper.className = 'dropdown';

      const menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.className = 'btn btn-sm btn-link text-muted p-0';
      menuBtn.setAttribute('data-bs-toggle', 'dropdown');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.innerHTML = '&#8942;';

      const menu = document.createElement('ul');
      menu.className = 'dropdown-menu dropdown-menu-end';

      const renameItem = document.createElement('li');
      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'dropdown-item';
      renameBtn.textContent = 'Rename';
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newTitle = prompt('New conversation title:', conv.title || '');
        if (newTitle == null) return;
        try {
          await window.ChatController.renameConversation(conv.id, newTitle.trim());
          const updatedConvs = window.ChatController.getAllConversations();
          renderConversationList(updatedConvs, window.ChatController.getActiveConversationId());
        } catch (err) {
          alert(`Failed to rename conversation: ${err.message || err}`);
        }
      });
      renameItem.appendChild(renameBtn);
      menu.appendChild(renameItem);

      // Download (after Rename, before Delete)
      const downloadItem = document.createElement('li');
      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.className = 'dropdown-item';
      downloadBtn.textContent = 'Download';
      downloadBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await downloadThreadHtml(conv);
      });
      downloadItem.appendChild(downloadBtn);
      menu.appendChild(downloadItem);

      const deleteItem = document.createElement('li');
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'dropdown-item text-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this conversation?')) return;
        try {
          await window.ChatController.deleteConversation(conv.id);
          const updatedConvs = window.ChatController.getAllConversations();
          renderConversationList(updatedConvs, window.ChatController.getActiveConversationId());
          const msgs = await window.ChatController.loadMessages();
          renderMessages(msgs);
        } catch (err) {
          alert(`Failed to delete conversation: ${err.message || err}`);
        }
      });
      deleteItem.appendChild(deleteBtn);
      menu.appendChild(deleteItem);

      menuWrapper.appendChild(menuBtn);
      menuWrapper.appendChild(menu);

      item.appendChild(titleSpan);
      item.appendChild(menuWrapper);

      item.addEventListener('click', async (ev) => {
        if (ev.target.nodeName.toLowerCase() === 'button') {
          return null;
        }
        try {
          await window.ChatController.setActiveConversation(conv.id);
          const msgs = await window.ChatController.loadMessages();
          renderMessages(msgs);
          const updatedConvs = window.ChatController.getAllConversations();
          renderConversationList(updatedConvs, conv.id);

          // Clear pending attachment when switching conversations
          clearPendingAttachment();
        } catch (err) {
          alert(`Failed to switch conversation: ${err.message || err}`);
        }
      });

      conversationListEl.appendChild(item);
    });
  }

  // ----- MCP servers (settings) -----

  function renderMcpServerList(servers) {
    if (!mcpServerListEl) return;

    mcpServerListEl.innerHTML = '';

    if (!servers || servers.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'text-muted small';
      emptyEl.textContent = 'No MCP servers configured.';
      mcpServerListEl.appendChild(emptyEl);
      return;
    }

    servers.forEach((server) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className =
        'list-group-item list-group-item-action d-flex justify-content-between align-items-center server-item';
      item.dataset.serverId = server.id;

      const mainSpan = document.createElement('span');
      mainSpan.textContent = server.name || `Server ${server.id}`;

      const rightGroup = document.createElement('span');
      rightGroup.className = 'd-flex gap-1';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-sm btn-outline-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fillMcpServerForm(server);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-sm btn-outline-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete MCP server "${server.name}"?`)) return;
        try {
          await window.ChatController.deleteMcpServer(server.id);
          const updated = await window.ChatController.reloadMcpServers();
          renderMcpServerList(updated);
          await refreshMcpPane();
        } catch (err) {
          alert(`Failed to delete server: ${err.message || err}`);
        }
      });

      rightGroup.appendChild(editBtn);
      rightGroup.appendChild(deleteBtn);

      item.appendChild(mainSpan);
      item.appendChild(rightGroup);

      mcpServerListEl.appendChild(item);
    });
  }

  function fillMcpServerForm(server) {
    if (!mcpServerForm) return;
    mcpServerIdInput.value = server.id || '';
    mcpServerNameInput.value = server.name || '';
    mcpServerEndpointInput.value = server.endpoint || '';
    mcpServerApiKeyInput.value = server.apiKey || '';
    mcpServerFormStatusEl.textContent = 'Editing existing server.';
  }

  function resetMcpServerForm() {
    if (!mcpServerForm) return;
    mcpServerIdInput.value = '';
    mcpServerNameInput.value = '';
    mcpServerEndpointInput.value = '';
    mcpServerApiKeyInput.value = '';
    mcpServerFormStatusEl.textContent = '';
  }

  // ----- Models (settings + header) -----

  function renderModelList(models) {
    if (!modelListEl) return;

    modelListEl.innerHTML = '';

    if (!models || models.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'text-muted small';
      emptyEl.textContent = 'No models configured.';
      modelListEl.appendChild(emptyEl);
      return;
    }

    models.forEach((model) => {
      const item = document.createElement('div');
      item.className = 'list-group-item d-flex justify-content-between align-items-center';

      const left = document.createElement('div');
      left.className = 'd-flex flex-column';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = model.name || `Model ${model.id}`;

      const providerSpan = document.createElement('span');
      providerSpan.className = 'text-muted small';
      providerSpan.textContent = model.providerType || 'openai';

      left.appendChild(nameSpan);
      left.appendChild(providerSpan);

      const right = document.createElement('div');
      right.className = 'd-flex gap-1';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-sm btn-outline-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        fillModelForm(model);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-sm btn-outline-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Delete model "${model.name}"?`)) return;
        try {
          await window.ChatController.deleteModel(model.id);
          const updated = window.ChatController.getAllModels();
          renderModelList(updated);
          renderActiveModelSelect(window.ChatController.getActiveModelConfig());
        } catch (err) {
          alert(`Failed to delete model: ${err.message || err}`);
        }
      });

      right.appendChild(editBtn);
      right.appendChild(deleteBtn);

      item.appendChild(left);
      item.appendChild(right);

      modelListEl.appendChild(item);
    });
  }

  function fillModelForm(model) {
    if (!modelConfigForm) return;
    modelIdInput.value = model.id || '';
    modelNameInput.value = model.name || '';
    modelProviderSelect.value = model.providerType || 'openai';

    const cfg = model.config || {};
    modelApiKeyInput.value = cfg.apiKey || '';
    modelBaseUrlInput.value = cfg.baseUrl || '';
    modelApiTypeSelect.value = cfg.apiType === 'chat' ? 'chat' : 'responses';
    modelModelNameInput.value = cfg.model || '';
    modelTemperatureInput.value = typeof cfg.temperature === 'number' ? String(cfg.temperature) : '';
    modelMaxTokensInput.value = cfg.maxTokens != null ? String(cfg.maxTokens) : '';

    modelConfigStatusEl.textContent = 'Editing existing model.';
  }

  function resetModelForm() {
    if (!modelConfigForm) return;
    modelIdInput.value = '';
    modelNameInput.value = '';
    modelProviderSelect.value = 'openai';
    modelApiKeyInput.value = '';
    modelBaseUrlInput.value = '';
    modelApiTypeSelect.value = 'responses';
    modelModelNameInput.value = '';
    modelTemperatureInput.value = '';
    modelMaxTokensInput.value = '';
    modelConfigStatusEl.textContent = '';
  }

  function renderActiveModelSelect(activeConfig) {
    if (!activeModelSelect) return;

    activeModelSelect.innerHTML = '';

    const models = window.ChatController.getAllModels ? window.ChatController.getAllModels() : [];

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = models.length ? 'Select a model' : 'No models configured';
    activeModelSelect.appendChild(placeholder);

    models.forEach((model) => {
      const opt = document.createElement('option');
      opt.value = String(model.id);
      opt.textContent = `${model.providerType || 'openai'}: ${model.name}`;
      if (activeConfig && activeConfig.id === model.id) {
        opt.selected = true;
      }
      activeModelSelect.appendChild(opt);
    });
  }

  // ----- Skills (settings) -----

  function renderSkillList(skills) {
    if (!skillListEl) return;

    skillListEl.innerHTML = '';

    if (!skills || skills.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'text-muted small';
      emptyEl.textContent = 'No skills configured.';
      skillListEl.appendChild(emptyEl);
      return;
    }

    skills.forEach((skill) => {
      const item = document.createElement('div');
      item.className = 'list-group-item d-flex justify-content-between align-items-center';

      const left = document.createElement('div');
      left.className = 'd-flex flex-column';

      const nameRow = document.createElement('div');
      nameRow.className = 'd-flex align-items-center gap-2';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = skill.name || `Skill ${skill.id}`;
      nameRow.appendChild(nameSpan);

      const badge = document.createElement('span');
      badge.className = `badge ${skill.enabled === false ? 'text-bg-secondary' : 'text-bg-success'}`;
      badge.textContent = skill.enabled === false ? 'Disabled' : 'Enabled';
      nameRow.appendChild(badge);

      const descSpan = document.createElement('span');
      descSpan.className = 'text-muted small';
      descSpan.textContent = skill.description || '';

      left.appendChild(nameRow);
      if (skill.description) left.appendChild(descSpan);

      const right = document.createElement('div');
      right.className = 'd-flex gap-1';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-sm btn-outline-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        fillSkillForm(skill);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-sm btn-outline-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Delete skill "${skill.name}"?`)) return;
        try {
          await window.ChatController.deleteSkill(skill.id);
          renderSkillList(window.ChatController.getAllSkills());
        } catch (err) {
          alert(`Failed to delete skill: ${err.message || err}`);
        }
      });

      right.appendChild(editBtn);
      right.appendChild(deleteBtn);

      item.appendChild(left);
      item.appendChild(right);
      skillListEl.appendChild(item);
    });
  }

  function fillSkillForm(skill) {
    if (!skillForm) return;
    skillIdInput.value = skill.id || '';
    skillNameInput.value = skill.name || '';
    skillDescriptionInput.value = skill.description || '';
    skillInstructionsInput.value = skill.instructions || '';
    skillEnabledInput.checked = skill.enabled !== false;
    skillFormStatusEl.textContent = 'Editing existing skill.';
  }

  function resetSkillForm() {
    if (!skillForm) return;
    skillIdInput.value = '';
    skillNameInput.value = '';
    skillDescriptionInput.value = '';
    skillInstructionsInput.value = '';
    skillEnabledInput.checked = true;
    skillFormStatusEl.textContent = '';
  }

  function renderFileUploadSettings(settings) {
    if (!fileUploadPageUrlInput || !fileUploadTtlInput) return;
    const cfg = settings || {};
    fileUploadPageUrlInput.value = cfg.streamingPageUrl || '';
    fileUploadTtlInput.value = cfg.ttlSeconds != null ? String(cfg.ttlSeconds) : '';
    if (fileUploadSettingsStatusEl) {
      fileUploadSettingsStatusEl.textContent = '';
    }
  }

  // ----- MCP pane (servers + tools) -----

  function renderMcpPaneServers(servers, activeServerIds) {
    if (!mcpPaneServerListEl) return;

    mcpPaneServerListEl.innerHTML = '';

    if (!servers || servers.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'text-muted small px-2 py-1';
      emptyEl.textContent = 'No servers configured.';
      mcpPaneServerListEl.appendChild(emptyEl);
      return;
    }

    const activeSet = new Set(activeServerIds || []);

    servers.forEach((server) => {
      const item = document.createElement('label');
      item.className = 'list-group-item d-flex justify-content-between align-items-center mcp-server-toggle';

      const left = document.createElement('div');
      left.className = 'd-flex align-items-center';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input me-2';
      checkbox.checked = activeSet.has(server.id);
      checkbox.addEventListener('change', () => {
        window.ChatController.setServerEnabled(server.id, checkbox.checked);
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = server.name || `Server ${server.id}`;

      left.appendChild(checkbox);
      left.appendChild(nameSpan);

      const endpointSpan = document.createElement('span');
      endpointSpan.className = 'text-muted small ms-2';
      endpointSpan.textContent = server.endpoint || '';

      item.appendChild(left);
      item.appendChild(endpointSpan);

      mcpPaneServerListEl.appendChild(item);
    });
  }

  function renderMcpPaneTools(tools) {
    if (!mcpPaneToolListEl || !mcpToolsCountEl) return;

    mcpPaneToolListEl.innerHTML = '';

    const count = Array.isArray(tools) ? tools.length : 0;
    mcpToolsCountEl.textContent = String(count);

    if (!tools || tools.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'text-muted small px-2 py-1';
      emptyEl.textContent = 'No tools available (check servers).';
      mcpPaneToolListEl.appendChild(emptyEl);
      return;
    }

    tools.forEach((tool) => {
      if (!tool) return;

      let toolName = '';
      let toolDescription = '';

      if (tool.function && tool.function.name) {
        toolName = tool.function.name;
        toolDescription = tool.function.description || '';
      } else if (tool.name) {
        toolName = tool.name;
        toolDescription = tool.description || '';
      } else {
        return;
      }

      const item = document.createElement('label');
      item.className = 'list-group-item d-flex flex-column mcp-tool-toggle';

      const topRow = document.createElement('div');
      topRow.className = 'd-flex justify-content-between align-items-center';

      const left = document.createElement('div');
      left.className = 'd-flex align-items-center';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'form-check-input me-2';
      checkbox.checked = !tool.disabled;
      checkbox.addEventListener('change', () => {
        window.ChatController.setToolEnabled(toolName, checkbox.checked);
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = toolName;

      left.appendChild(checkbox);
      left.appendChild(nameSpan);

      topRow.appendChild(left);

      const desc = document.createElement('div');
      desc.className = 'text-muted small mt-1';
      desc.textContent = toolDescription;

      item.appendChild(topRow);
      item.appendChild(desc);

      mcpPaneToolListEl.appendChild(item);
    });
  }

  // ----- Chat rendering -----

  async function copyToClipboard(text) {
    const value = text != null ? String(text) : '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (e) {
      // fall back
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function createIconButton({ title, iconClass, onClick, variant = 'link', extraClass = '' }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm btn-${variant} p-0 ${extraClass}`.trim();
    btn.title = title;
    btn.setAttribute('aria-label', title);

    const icon = document.createElement('i');
    icon.className = iconClass;
    btn.appendChild(icon);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onClick === 'function') onClick(e);
    });

    return btn;
  }

  function _rewriteIframeLinksToNewWindow(iframe) {
    try {
      const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!doc) return;

      const links = doc.querySelectorAll('a[href]');
      links.forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    } catch (e) {
      // ignore (cross-origin or sandbox restrictions)
    }
  }

  function _autoResizeIframe(iframe) {
    try {
      const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!doc || !doc.body) return;

      const resize = () => {
        try {
          const h = doc.body.scrollHeight || 0;
          if (h) iframe.style.height = h + 'px';
        } catch (e) {
          // ignore
        }
      };

      resize();
      setTimeout(resize, 50);
      setTimeout(resize, 200);
    } catch (e) {
      // ignore
    }
  }

  function _attachIframeAutoResize(iframe) {
    if (!iframe || iframe.__autoResizeAttached) return;
    iframe.__autoResizeAttached = true;

    const tryResize = () => _autoResizeIframe(iframe);

    // Resize when iframe fires load (covers srcdoc and navigation)
    iframe.addEventListener('load', () => {
      tryResize();

      // Try to observe size changes inside the iframe (if same-origin allowed)
      try {
        const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        const win = iframe.contentWindow;
        if (!doc || !doc.body) return;

        // Resize after fonts/images settle
        setTimeout(tryResize, 0);
        setTimeout(tryResize, 50);
        setTimeout(tryResize, 200);
        setTimeout(tryResize, 500);

        // Use ResizeObserver if available
        if (win && win.ResizeObserver) {
          const ro = new win.ResizeObserver(() => {
            tryResize();
          });
          ro.observe(doc.body);
          iframe.__resizeObserver = ro;
        } else {
          // Fallback: short polling window
          let ticks = 0;
          const maxTicks = 20; // ~2s at 100ms
          const interval = setInterval(() => {
            ticks += 1;
            tryResize();
            if (ticks >= maxTicks) {
              clearInterval(interval);
            }
          }, 100);
        }
      } catch (e) {
        // ignore (cross-origin or sandbox restrictions)
      }
    });

    // Also do an initial resize attempt
    setTimeout(tryResize, 0);
  }

  function _setIframeHtml(iframe, html) {
    _attachIframeAutoResize(iframe);

    // Prefer srcdoc when available; it avoids timing issues with load events.
    try {
      iframe.srcdoc = html;
    } catch (e) {
      // ignore
    }

    // Also attempt to write directly (works in most browsers for about:blank iframes)
    try {
      const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    } catch (e) {
      // ignore
    }

    // Post-process links + resize after the DOM is ready
    setTimeout(() => {
      _rewriteIframeLinksToNewWindow(iframe);
      _autoResizeIframe(iframe);
    }, 0);
  }

  function _formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  }

  function _renderAttachmentPreview(attachment) {
    if (!attachment || typeof attachment !== 'object') return null;

    const { dataUrl, fileUrl, mimeType, filename, size } = attachment;
    const href = fileUrl || dataUrl;

    const wrapper = document.createElement('div');
    wrapper.className = 'mb-2';

    const meta = document.createElement('div');
    meta.className = 'small text-muted';
    const parts = [];
    if (filename) parts.push(filename);
    if (mimeType) parts.push(mimeType);
    if (size != null) parts.push(_formatBytes(size));
    meta.textContent = parts.join(' • ');
    wrapper.appendChild(meta);

    if (typeof href === 'string' && href) {
      if (typeof mimeType === 'string' && mimeType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = href;
        img.alt = filename || 'uploaded image';
        img.className = 'img-fluid rounded border mt-2';
        img.style.maxHeight = '260px';
        wrapper.appendChild(img);
      } else if (typeof mimeType === 'string' && mimeType.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = href;
        audio.className = 'w-100 mt-2';
        wrapper.appendChild(audio);
      } else if (typeof mimeType === 'string' && mimeType.startsWith('video/')) {
        const video = document.createElement('video');
        video.controls = true;
        video.src = href;
        video.className = 'w-100 mt-2 rounded border';
        video.style.maxHeight = '320px';
        wrapper.appendChild(video);
      } else {
        const link = document.createElement('a');
        link.href = href;
        link.download = filename || 'download';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'btn btn-sm btn-outline-secondary mt-2';
        link.textContent = 'Open file';
        wrapper.appendChild(link);
      }
    }

    return wrapper;
  }

  function renderMessages(messages) {
    if (!messagesEl) return;

    messagesEl.innerHTML = '';

    if (!messages || messages.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'text-muted small';
      emptyEl.textContent = 'No messages yet. Start the conversation!';
      messagesEl.appendChild(emptyEl);
      return;
    }

    messages.forEach((msg, index) => {
      const isUser = msg.role === 'user';
      const bodyContent = msg.content || '';
      const isToolResult = !!msg.fromTool;

      // Decide if content looks like HTML we should render in an iframe
      const looksLikeHtml =
        typeof bodyContent === 'string' &&
        /<\/(html|body|div|p|span|table|ul|ol|li|h1|h2|h3|h4|h5|h6)>/i.test(bodyContent);

      // Row wrapper so actions can sit OUTSIDE the bubble, bottom-right
      const row = document.createElement('div');
      row.className = 'd-flex flex-column mb-2';

      // Bubble
      const bubble = document.createElement('div');
      bubble.classList.add('message');
      if (msg && msg.id != null) {
        bubble.dataset.messageId = String(msg.id);
      }
      bubble.classList.add(isUser ? 'message-user' : 'message-assistant');

      const header = document.createElement('div');
      header.className = 'small fw-bold mb-1 d-flex justify-content-between align-items-center';

      const headerLeft = document.createElement('span');
      headerLeft.textContent = isUser ? 'You' : 'Assistant';
      header.appendChild(headerLeft);

      // Tool result toggle stays inside the bubble header
      let toolBodyWrapper = null;
      if (isToolResult) {
        const collapseId = `tool-msg-${msg.id || index}`;
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn btn-sm btn-link p-0 ms-2';
        toggleBtn.setAttribute('data-bs-toggle', 'collapse');
        toggleBtn.setAttribute('data-bs-target', `#${collapseId}`);
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.setAttribute('aria-controls', collapseId);
        toggleBtn.textContent = 'Show tool result';
        header.appendChild(toggleBtn);

        toolBodyWrapper = document.createElement('div');
        toolBodyWrapper.className = 'collapse';
        toolBodyWrapper.id = collapseId;

        if (looksLikeHtml) {
          const iframe = document.createElement('iframe');
          iframe.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
          iframe.style.width = '100%';
          iframe.style.border = 'none';
          iframe.style.minHeight = '120px';

          toolBodyWrapper.appendChild(iframe);
          _setIframeHtml(iframe, bodyContent);
        } else {
          const body = document.createElement('div');
          body.textContent = bodyContent;
          toolBodyWrapper.appendChild(body);
        }
      }

      bubble.appendChild(header);

      if (isToolResult) {
        bubble.appendChild(toolBodyWrapper);
      } else {
        const body = document.createElement('div');

        // For user messages, prepend attachment preview/link above the text
        if (isUser && msg.attachment) {
          const attachmentPreview = _renderAttachmentPreview(msg.attachment);
          if (attachmentPreview) {
            body.appendChild(attachmentPreview);
          }
        }

        if (looksLikeHtml) {
          const iframe = document.createElement('iframe');
          iframe.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
          iframe.style.width = '100%';
          iframe.style.border = 'none';
          iframe.style.minHeight = '120px';

          body.appendChild(iframe);
          _setIframeHtml(iframe, bodyContent);
        } else {
          body.appendChild(document.createTextNode(bodyContent));
        }

        bubble.appendChild(body);
      }

      // Actions OUTSIDE bubble, bottom-right of the row
      const actionsRow = document.createElement('div');
      actionsRow.className = 'd-flex gap-2 mt-1';
      actionsRow.style.justifyContent = 'flex-end';
      actionsRow.style.width = 'fit-content';
      actionsRow.style.alignSelf = 'flex-end';
      actionsRow.style.opacity = '0.9';

      const copyBtn = createIconButton({
        title: 'Copy',
        iconClass: 'bi bi-copy',
        onClick: async () => {
          const ok = await copyToClipboard(msg.content || '');
          if (!ok) {
            alert('Copy failed.');
          }
        },
        variant: 'link',
        extraClass: 'text-muted'
      });

      const editBtn = createIconButton({
        title: 'Edit',
        iconClass: 'bi bi-pencil',
        onClick: () => {
          if (msg.id == null) {
            alert('This message cannot be edited (missing id).');
            return;
          }
          startInlineEdit(row, bubble, msg);
        },
        variant: 'link',
        extraClass: 'text-muted'
      });

      const deleteBtn = createIconButton({
        title: 'Delete',
        iconClass: 'bi bi-trash',
        onClick: async () => {
          if (msg.id == null) {
            alert('This message cannot be deleted (missing id).');
            return;
          }
          if (!confirm('Delete this message?')) return;
          try {
            await window.ChatController.deleteMessage(msg.id);
            const updated = await window.ChatController.loadMessages();
            renderMessages(updated);
          } catch (err) {
            alert(`Failed to delete message: ${err.message || err}`);
          }
        },
        variant: 'link',
        extraClass: 'text-danger'
      });

      actionsRow.appendChild(copyBtn);
      actionsRow.appendChild(editBtn);
      actionsRow.appendChild(deleteBtn);

      row.appendChild(bubble);
      row.appendChild(actionsRow);

      messagesEl.appendChild(row);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function startInlineEdit(messageRowEl, bubbleEl, msg) {
    const existingText = msg.content != null ? String(msg.content) : '';

    // Replace bubble content with editor (actions remain outside)
    bubbleEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'small fw-bold mb-1 d-flex justify-content-between align-items-center';

    const headerLeft = document.createElement('span');
    headerLeft.textContent = msg.role === 'user' ? 'You' : 'Assistant';
    header.appendChild(headerLeft);

    bubbleEl.appendChild(header);

    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'mt-1';

    const ta = document.createElement('textarea');
    ta.className = 'form-control form-control-sm';
    ta.rows = 4;
    ta.value = existingText;

    const btnRow = document.createElement('div');
    btnRow.className = 'd-flex gap-2 mt-2';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-sm btn-primary';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-sm btn-outline-secondary';
    cancelBtn.textContent = 'Cancel';

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);

    editorWrapper.appendChild(ta);
    editorWrapper.appendChild(btnRow);

    bubbleEl.appendChild(editorWrapper);

    const restore = async () => {
      try {
        const updated = await window.ChatController.loadMessages();
        renderMessages(updated);
      } catch (e) {
        // ignore
      }
    };

    cancelBtn.addEventListener('click', async () => {
      await restore();
    });

    saveBtn.addEventListener('click', async () => {
      const newText = ta.value;

      // Immediately exit edit mode visually (remove textarea) by re-rendering
      // the current messages (still old content until regeneration finishes).
      await restore();

      // Put edited message into main chat input and disable controls
      if (chatInput) {
        chatInput.value = newText;
      }
      setSendingState(true);
      setChatStatus('Regenerating from edited message...');

      try {
        await window.ChatController.regenerateFromEditedMessage(msg.id, newText);

        // Refresh messages after regeneration
        const updated = await window.ChatController.loadMessages();
        renderMessages(updated);

        // Clear main input and restore controls
        if (chatInput) {
          chatInput.value = '';
        }
        setChatStatus('Ready.');
      } catch (err) {
        // Keep status not "Ready" on error, but re-enable controls so user can recover
        setChatStatus(`Error regenerating: ${err.message || err}`);
      } finally {
        setSendingState(false);
      }
    });

    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });

    setTimeout(() => {
      try {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      } catch (e) {
        // ignore
      }
    }, 0);
  }

  // ----- Pending attachment helpers -----

  function renderPendingAttachment() {
    if (!pendingAttachmentRowEl || !pendingAttachmentLinkEl || !pendingAttachmentDeleteBtn) {
      return;
    }

    if (!pendingAttachment) {
      pendingAttachmentRowEl.classList.add('d-none');
      pendingAttachmentLinkEl.href = '#';
      pendingAttachmentLinkEl.textContent = 'Attachment';
      return;
    }

    pendingAttachmentRowEl.classList.remove('d-none');
    pendingAttachmentLinkEl.href = pendingAttachment.fileUrl || pendingAttachment.dataUrl || '#';
    pendingAttachmentLinkEl.textContent = pendingAttachment.filename || 'Attachment';
  }

  function _closeFileStreamSession(session) {
    if (!session) return;
    session.closed = true;
    try {
      if (session.ws && session.ws.readyState <= WebSocket.OPEN) {
        session.ws.close();
      }
    } catch (e) {
      // ignore
    }
  }

  function _retainPendingAttachmentStream() {
    if (pendingAttachment && pendingAttachment.streamSession) {
      activeFileStreams.push(pendingAttachment.streamSession);
    }
  }

  function clearPendingAttachment(options = {}) {
    const shouldCloseStream = options.closeStream !== false;
    if (shouldCloseStream && pendingAttachment && pendingAttachment.streamSession) {
      _closeFileStreamSession(pendingAttachment.streamSession);
    }
    pendingAttachment = null;
    renderPendingAttachment();
  }

  function _persistableAttachment(attachment) {
    if (!attachment || typeof attachment !== 'object') return null;
    return {
      kind: attachment.kind || 'file',
      filename: attachment.filename || '',
      mimeType: attachment.mimeType || 'application/octet-stream',
      size: attachment.size,
      dataUrl: attachment.dataUrl,
      fileUrl: attachment.fileUrl,
      token: attachment.token,
      streaming: !!attachment.streaming
    };
  }

  // ----- Misc helpers -----

  function setChatStatus(text) {
    if (!chatStatusEl) return;
    chatStatusEl.textContent = text;
  }

  function setSendingState(isSending) {
    if (!chatInput || !sendBtn || !clearChatBtn) return;
    chatInput.disabled = isSending;
    sendBtn.disabled = isSending;
    clearChatBtn.disabled = isSending;

    if (uploadFileBtn) uploadFileBtn.disabled = isSending;
    if (chatFileInput) chatFileInput.disabled = isSending;
    if (pendingAttachmentDeleteBtn) pendingAttachmentDeleteBtn.disabled = isSending;
  }

  function showMcpPane() {
    if (!mcpPaneEl) return;
    mcpPaneEl.classList.remove('collapsed');
  }

  function hideMcpPane() {
    if (!mcpPaneEl) return;
    mcpPaneEl.classList.add('collapsed');
  }

  function toggleMcpPane() {
    if (!mcpPaneEl) return;
    if (mcpPaneEl.classList.contains('collapsed')) {
      showMcpPane();
    } else {
      hideMcpPane();
    }
  }

  function showConversationsPane() {
    if (!conversationsPaneEl) return;
    conversationsPaneEl.classList.remove('collapsed');
  }

  function hideConversationsPane() {
    if (!conversationsPaneEl) return;
    conversationsPaneEl.classList.add('collapsed');
  }

  function toggleConversationsPane() {
    if (!conversationsPaneEl) return;
    if (conversationsPaneEl.classList.contains('collapsed')) {
      showConversationsPane();
    } else {
      hideConversationsPane();
    }
  }

  async function refreshMcpPane() {
    if (!mcpPaneEl) return;

    const servers = window.ChatController.getMcpServers();
    const activeServerIds = window.ChatController.getActiveServerIds();
    renderMcpPaneServers(servers, activeServerIds);

    try {
      const tools = await window.ChatController.getAggregatedTools({ includeDisabled: true });
      renderMcpPaneTools(tools);
    } catch (e) {
      renderMcpPaneTools([]);
    }
  }

  function _relayUrlsFromStreamingPage(pageUrl, token) {
    const page = new URL(pageUrl, window.location.href);
    const encodedToken = encodeURIComponent(token);
    const wsProtocol = page.protocol === 'https:' ? 'wss:' : 'ws:';
    const prefix = page.pathname.replace(/\/+$/, '');
    const path = (suffix) => `${prefix}${suffix}`;

    return {
      tokenUrl: new URL(path('/tokens'), page.origin).toString(),
      downloadUrl: new URL(path(`/download/${encodedToken}`), page.origin).toString(),
      wsUrl: `${wsProtocol}//${page.host}${path(`/ws/${encodedToken}`)}`
    };
  }

  function _extractRelayToken(data) {
    if (!data || typeof data !== 'object') return '';
    return data.token || data.relay_token || data.id || data.value || '';
  }

  function _extractRelayDownloadUrl(data) {
    if (!data || typeof data !== 'object') return '';
    return data.download_url || '';
  }

  async function _createFileRelayToken(settings, file) {
    const pageUrl = settings.streamingPageUrl;
    const urls = _relayUrlsFromStreamingPage(pageUrl, 'placeholder');
    const ttl = Number(settings.ttlSeconds) || 600;
    const mime = file && file.type ? file.type : 'application/octet-stream';

    const response = await fetch(urls.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ttl_seconds: ttl,
        mime
      })
    });

    if (!response.ok) {
      throw new Error(`Relay token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const token = _extractRelayToken(data);
    if (!token) {
      throw new Error('Relay token response did not include a token.');
    }
    const downloadUrl = _extractRelayDownloadUrl(data);
    if (!downloadUrl) {
      throw new Error('Relay token response did not include download_url.');
    }

    return Object.assign(_relayUrlsFromStreamingPage(pageUrl, token), { token, downloadUrl });
  }

  function _wireFileRelayWebSocket(file, relay) {
    const session = {
      file,
      ws: null,
      closed: false,
      activeRequestId: null,
      ready: null
    };

    const ws = new WebSocket(relay.wsUrl);
    session.ws = ws;

    session.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out connecting to file relay WebSocket.'));
      }, 10000);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });

      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Failed to connect to file relay WebSocket.'));
      }, { once: true });
    });

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'hello',
        filename: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream'
      }));
      setChatStatus(`File relay connected: ${file.name}`);
    });

    ws.addEventListener('message', async (event) => {
      if (session.closed || typeof event.data !== 'string') return;

      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (message.type === 'start' && message.request_id) {
        session.activeRequestId = message.request_id;
        await _streamFileToRelay(session, message.request_id);
      } else if (message.type === 'reject') {
        setChatStatus(`File relay rejected upload: ${message.reason || 'Rejected'}`);
        _closeFileStreamSession(session);
      } else if (message.type === 'cancel') {
        setChatStatus(`File relay cancelled transfer: ${message.reason || 'Cancelled'}`);
      } else if (message.type === 'error') {
        setChatStatus(`File relay error: ${message.message || 'Unknown error'}`);
      }
    });

    ws.addEventListener('close', () => {
      session.closed = true;
    });

    ws.addEventListener('error', () => {
      setChatStatus('File relay WebSocket error.');
    });

    return session;
  }

  async function _streamFileToRelay(session, requestId) {
    const { file, ws } = session;
    if (!file || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'meta',
      request_id: requestId,
      filename: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream'
    }));

    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      if (session.closed || ws.readyState !== WebSocket.OPEN) return;
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const buffer = await chunk.arrayBuffer();
      ws.send(buffer);
    }

    if (!session.closed && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'end',
        request_id: requestId
      }));
    }
  }

  async function _createStreamingAttachment(file) {
    const settings = window.ChatController.getFileUploadSettings
      ? window.ChatController.getFileUploadSettings()
      : {};
    const pageUrl = (settings.streamingPageUrl || '').trim();
    if (!pageUrl) {
      throw new Error('Configure a file streaming page URL in Settings before uploading files.');
    }

    const relay = await _createFileRelayToken(settings, file);
    const streamSession = _wireFileRelayWebSocket(file, relay);
    await streamSession.ready;

    return {
      kind: 'file',
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      fileUrl: relay.downloadUrl,
      token: relay.token,
      streaming: true,
      streamSession
    };
  }

  // ----- Event binding -----

  function bindEvents() {
    // Pending attachment delete
    if (pendingAttachmentDeleteBtn) {
      pendingAttachmentDeleteBtn.addEventListener('click', () => {
        clearPendingAttachment();
        setChatStatus('Attachment removed.');
      });
    }

    // Upload file button
    if (uploadFileBtn && chatFileInput) {
      uploadFileBtn.addEventListener('click', () => {
        try {
          chatFileInput.click();
        } catch (e) {
          // ignore
        }
      });

      chatFileInput.addEventListener('change', async () => {
        const file = chatFileInput.files && chatFileInput.files[0] ? chatFileInput.files[0] : null;
        if (!file) return;

        setSendingState(true);
        setChatStatus('Preparing streaming upload...');

        try {
          clearPendingAttachment();
          pendingAttachment = await _createStreamingAttachment(file);

          renderPendingAttachment();
          setChatStatus(`Streaming attachment ready: ${file.name}`);
        } catch (err) {
          setChatStatus(`File upload failed: ${err && err.message ? err.message : String(err)}`);
        } finally {
          // Allow selecting the same file again later
          try {
            chatFileInput.value = '';
          } catch (e) {
            // ignore
          }
          setSendingState(false);
        }
      });
    }

    // Settings button
    if (openSettingsBtn && settingsModalInstance) {
      openSettingsBtn.addEventListener('click', async () => {
        try {
          const servers = await window.ChatController.reloadMcpServers();
          renderMcpServerList(servers);

          const models = window.ChatController.getAllModels();
          renderModelList(models);

          const skills = window.ChatController.getAllSkills ? window.ChatController.getAllSkills() : [];
          renderSkillList(skills);
          const uploadSettings = window.ChatController.getFileUploadSettings
            ? window.ChatController.getFileUploadSettings()
            : {};
          renderFileUploadSettings(uploadSettings);

          const activeConfig = window.ChatController.getActiveModelConfig && window.ChatController.getActiveModelConfig();
          renderActiveModelSelect(activeConfig);
        } catch (e) {
          // ignore
        }
        settingsModalInstance.show();
      });
    }

    // Conversations pane toggle
    if (toggleConversationsPaneBtn) {
      toggleConversationsPaneBtn.addEventListener('click', () => {
        toggleConversationsPane();
      });
    }

    if (newConversationBtn) {
      newConversationBtn.addEventListener('click', async () => {
        try {
          const id = await window.ChatController.createConversation();
          const convs = window.ChatController.getAllConversations();
          renderConversationList(convs, id);
          const msgs = await window.ChatController.loadMessages();
          renderMessages(msgs);

          clearPendingAttachment();
        } catch (err) {
          alert(`Failed to create conversation: ${err.message || err}`);
        }
      });
    }

    // MCP pane toggle
    if (toggleMcpPaneBtn) {
      toggleMcpPaneBtn.addEventListener('click', async () => {
        toggleMcpPane();
        if (!mcpPaneEl.classList.contains('collapsed')) {
          await refreshMcpPane();
        }
      });
    }
    if (collapseMcpPaneBtn) {
      collapseMcpPaneBtn.addEventListener('click', () => {
        hideMcpPane();
      });
    }

    // MCP server form
    if (addMcpServerBtn) {
      addMcpServerBtn.addEventListener('click', () => {
        resetMcpServerForm();
        mcpServerFormStatusEl.textContent = 'Adding new server.';
      });
    }

    if (resetMcpServerFormBtn) {
      resetMcpServerFormBtn.addEventListener('click', () => {
        resetMcpServerForm();
      });
    }

    if (testMcpServerBtn) {
      testMcpServerBtn.addEventListener('click', async () => {
        const endpoint = mcpServerEndpointInput.value.trim();
        const apiKey = mcpServerApiKeyInput.value.trim();
        if (!endpoint) {
          mcpServerFormStatusEl.textContent = 'Please enter an endpoint URL before testing.';
          return;
        }
        mcpServerFormStatusEl.textContent = 'Testing server...';
        try {
          const result = await window.ChatController.testMcpServer({ endpoint, apiKey });
          if (result.ok) {
            mcpServerFormStatusEl.textContent = 'Server OK. Tools loaded (if available).';
          } else {
            mcpServerFormStatusEl.textContent = `Test failed: ${result.error}`;
          }
        } catch (err) {
          mcpServerFormStatusEl.textContent = `Test failed: ${err.message || err}`;
        }
      });
    }

    if (mcpServerForm) {
      mcpServerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idStr = mcpServerIdInput.value.trim();
        const name = mcpServerNameInput.value.trim();
        const endpoint = mcpServerEndpointInput.value.trim();
        const apiKey = mcpServerApiKeyInput.value.trim();

        if (!name || !endpoint) {
          mcpServerFormStatusEl.textContent = 'Name and endpoint are required.';
          return;
        }

        const server = { name, endpoint, apiKey: apiKey || null };
        if (idStr) {
          server.id = Number(idStr);
        }

        mcpServerFormStatusEl.textContent = 'Saving server...';
        try {
          await window.ChatController.saveMcpServer(server);
          const updated = await window.ChatController.reloadMcpServers();
          renderMcpServerList(updated);
          mcpServerFormStatusEl.textContent = 'Server saved.';
          resetMcpServerForm();
          if (!mcpPaneEl.classList.contains('collapsed')) {
            await refreshMcpPane();
          }
        } catch (err) {
          mcpServerFormStatusEl.textContent = `Failed to save server: ${err.message || err}`;
        }
      });
    }

    // Model form
    if (modelConfigForm) {
      modelConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idStr = modelIdInput.value.trim();
        const name = modelNameInput.value.trim();
        const providerType = modelProviderSelect.value || 'openai';
        const apiKey = modelApiKeyInput.value.trim();
        const baseUrl = modelBaseUrlInput.value.trim();
        const apiType = modelApiTypeSelect.value === 'chat' ? 'chat' : 'responses';
        const modelName = modelModelNameInput.value.trim();
        const temperatureStr = modelTemperatureInput.value.trim();
        const maxTokensStr = modelMaxTokensInput.value.trim();

        if (!name || !apiKey || !modelName) {
          modelConfigStatusEl.textContent = 'Name, API key, and model are required.';
          return;
        }

        const temperature = temperatureStr ? Number(temperatureStr) : undefined;
        const maxTokens = maxTokensStr ? Number(maxTokensStr) : undefined;

        const config = {
          apiKey,
          baseUrl: baseUrl || undefined,
          apiType,
          model: modelName,
          temperature: Number.isNaN(temperature) ? undefined : temperature,
          maxTokens: Number.isNaN(maxTokens) ? undefined : maxTokens
        };

        const modelInput = {
          id: idStr ? Number(idStr) : undefined,
          name,
          providerType,
          config
        };

        modelConfigStatusEl.textContent = 'Saving model...';
        try {
          const id = await window.ChatController.saveModel(modelInput);
          const models = window.ChatController.getAllModels();
          renderModelList(models);
          modelConfigStatusEl.textContent = 'Model saved.';
          resetModelForm();

          // Optionally set newly created model as active
          await window.ChatController.setActiveModelById(id);
          const activeConfig = window.ChatController.getActiveModelConfig();
          renderActiveModelSelect(activeConfig);
        } catch (err) {
          modelConfigStatusEl.textContent = `Failed to save model: ${err.message || err}`;
        }
      });
    }

    // Skill form
    if (addSkillBtn) {
      addSkillBtn.addEventListener('click', () => {
        resetSkillForm();
        skillFormStatusEl.textContent = 'Adding new skill.';
      });
    }

    if (resetSkillFormBtn) {
      resetSkillFormBtn.addEventListener('click', () => {
        resetSkillForm();
      });
    }

    if (skillForm) {
      skillForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idStr = skillIdInput.value.trim();
        const name = skillNameInput.value.trim();
        const description = skillDescriptionInput.value.trim();
        const instructions = skillInstructionsInput.value.trim();
        const enabled = skillEnabledInput.checked;

        if (!name || !instructions) {
          skillFormStatusEl.textContent = 'Name and instructions are required.';
          return;
        }

        skillFormStatusEl.textContent = 'Saving skill...';
        try {
          await window.ChatController.saveSkill({
            id: idStr ? Number(idStr) : undefined,
            name,
            description,
            instructions,
            enabled
          });
          renderSkillList(window.ChatController.getAllSkills());
          resetSkillForm();
          skillFormStatusEl.textContent = 'Skill saved.';
        } catch (err) {
          skillFormStatusEl.textContent = `Failed to save skill: ${err.message || err}`;
        }
      });
    }

    if (fileUploadSettingsForm) {
      fileUploadSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const streamingPageUrl = fileUploadPageUrlInput.value.trim();
        const ttlSeconds = fileUploadTtlInput.value.trim();

        if (streamingPageUrl) {
          try {
            new URL(streamingPageUrl, window.location.href);
          } catch (err) {
            fileUploadSettingsStatusEl.textContent = 'Enter a valid file streaming page URL.';
            return;
          }
        }

        fileUploadSettingsStatusEl.textContent = 'Saving file upload settings...';
        try {
          const settings = await window.ChatController.saveFileUploadSettings({
            streamingPageUrl,
            ttlSeconds: ttlSeconds ? Number(ttlSeconds) : undefined
          });
          renderFileUploadSettings(settings);
          fileUploadSettingsStatusEl.textContent = 'File upload settings saved.';
        } catch (err) {
          fileUploadSettingsStatusEl.textContent = `Failed to save settings: ${err.message || err}`;
        }
      });
    }

    // Active model dropdown
    if (activeModelSelect) {
      activeModelSelect.addEventListener('change', async () => {
        const val = activeModelSelect.value;
        if (!val) return;
        const id = Number(val);
        if (Number.isNaN(id)) return;
        try {
          const cfg = await window.ChatController.setActiveModelById(id);
          renderActiveModelSelect(cfg);
        } catch (err) {
          alert(`Failed to activate model: ${err.message || err}`);
        }
      });
    }

    // Chat form
    if (chatForm) {
      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value;
        if (!text || !text.trim()) {
          return;
        }

        setSendingState(true);
        setChatStatus('Sending message...');
        try {
          const attachment = _persistableAttachment(pendingAttachment);
          const attachments = attachment ? [attachment] : [];
          const result = await window.ChatController.sendUserMessage(text, { attachments });

          renderMessages(result.messages);
          chatInput.value = '';

          // Keep streaming sessions alive after send so the relay can serve downloads.
          _retainPendingAttachmentStream();
          clearPendingAttachment({ closeStream: false });

          setChatStatus('Ready.');
          if (!mcpPaneEl.classList.contains('collapsed')) {
            await refreshMcpPane();
          }
          // Update conversations list (title may have changed)
          const convs = window.ChatController.getAllConversations();
          renderConversationList(convs, window.ChatController.getActiveConversationId());
        } catch (err) {
          setChatStatus(`Error: ${err.message || err}`);
        } finally {
          setSendingState(false);
        }
      });
    }

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (chatForm) {
            chatForm.requestSubmit();
          }
        }
      });
    }

    if (clearChatBtn) {
      clearChatBtn.addEventListener('click', async () => {
        if (!confirm('Clear all messages in this conversation?')) return;
        try {
          await window.ChatController.clearConversation();
          renderMessages([]);
          setChatStatus('Conversation cleared.');
          clearPendingAttachment();
        } catch (err) {
          setChatStatus(`Failed to clear conversation: ${err.message || err}`);
        }
      });
    }
  }

  async function bootstrap() {
    cacheDom();
    bindEvents();

    // Ensure pending attachment UI starts hidden
    renderPendingAttachment();

    setChatStatus('Initializing...');
    try {
      const initResult = await window.ChatController.init();

      renderMcpServerList(initResult.mcpServers || []);

      const models = window.ChatController.getAllModels();
      renderModelList(models);

      const skills = window.ChatController.getAllSkills ? window.ChatController.getAllSkills() : [];
      renderSkillList(skills);
      renderFileUploadSettings(initResult.fileUploadSettings || {});

      const messages = await window.ChatController.loadMessages();
      renderMessages(messages);

      const activeConfig = initResult.activeModelConfig || window.ChatController.getActiveModelConfig();
      renderActiveModelSelect(activeConfig);

      const conversations = window.ChatController.getAllConversations();
      renderConversationList(conversations, window.ChatController.getActiveConversationId());

      setChatStatus('Ready.');
    } catch (err) {
      setChatStatus(`Initialization error: ${err.message || err}`);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
