const test = require('node:test');
const assert = require('node:assert/strict');

global.window = globalThis;
require('../js/config.js');

const messages = [];
const conversations = [{ id: 1, title: 'Test' }];
let nextMessageId = 1;
const modelCalls = [];
const queuedResponses = [];

global.DB = {
  async openDb() {},
  async getAllServers() { return []; },
  async getAllModels() {
    return [{
      id: 1,
      name: 'Test model',
      providerType: 'openai',
      config: { apiKey: 'test', model: 'test-model', apiType: 'responses' }
    }];
  },
  async getAllSkills() { return []; },
  async getAllConversations() { return structuredClone(conversations); },
  async updateConversation(conversation) {
    const index = conversations.findIndex((item) => item.id === conversation.id);
    conversations[index] = structuredClone(conversation);
  },
  async getMeta(key, fallback) { return key === 'activeModelId' ? 1 : fallback; },
  async setMeta() {},
  async getMessagesByConversation(conversationId) {
    return messages.filter((message) => message.conversationId === conversationId);
  },
  async addMessage(message) {
    const record = structuredClone(message);
    record.id = nextMessageId++;
    messages.push(record);
    return record.id;
  },
  async getMessage(id) { return messages.find((message) => message.id === id) || null; },
  async updateMessage(message) {
    const index = messages.findIndex((item) => item.id === message.id);
    messages[index] = structuredClone(message);
  },
  async deleteMessage(id) {
    const index = messages.findIndex((message) => message.id === id);
    if (index >= 0) messages.splice(index, 1);
  }
};

global.OpenAIChatModel = class {
  async sendMessage(input) {
    modelCalls.push(structuredClone(input));
    return queuedResponses.shift();
  }
};

require('../js/chatController.js');

function responseState(label) {
  return {
    version: 1,
    apiType: 'responses',
    endpoint: 'https://api.openai.com/v1/responses',
    model: 'test-model',
    continuationLevel: 'encrypted',
    output: [{ type: 'reasoning', encrypted_content: label }]
  };
}

test('persists response state, restores it into later turns, and invalidates it after edits', async () => {
  await ChatController.init();
  queuedResponses.push({
    message: { role: 'assistant', content: 'First answer' },
    raw: {},
    responseState: responseState('first')
  });
  await ChatController.sendUserMessage('First question');

  const storedAssistant = messages.find((message) => message.role === 'assistant');
  assert.deepEqual(storedAssistant.responseState, responseState('first'));

  queuedResponses.push({
    message: { role: 'assistant', content: 'Second answer' },
    raw: {},
    responseState: responseState('second')
  });
  await ChatController.sendUserMessage('Follow-up');
  assert.deepEqual(
    modelCalls[1].find((message) => message.content === 'First answer').responseState,
    responseState('first')
  );

  const firstUser = messages.find((message) => message.role === 'user');
  await ChatController.updateMessage(firstUser.id, 'Edited question');
  assert.equal(messages.some((message) => message.responseState), false);
});
