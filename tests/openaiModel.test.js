const test = require('node:test');
const assert = require('node:assert/strict');

global.window = globalThis;
require('../js/config.js');
require('../js/models/baseModel.js');
require('../js/models/openaiModel.js');

async function sendMockResponse(responseBody) {
  let request;
  global.fetch = async (url, init) => {
    request = {
      url,
      headers: new Headers(init.headers),
      body: JSON.parse(init.body)
    };
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const model = new OpenAIChatModel({
    apiKey: 'test-key',
    model: 'test-model',
    apiType: 'responses'
  });
  const result = await model.sendMessage([{ role: 'user', content: 'Hello' }]);
  return { request, result };
}

test('sends requests to the Responses API and extracts a standard message', async () => {
  const { request, result } = await sendMockResponse({
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: 'Hello back' }]
    }]
  });

  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.model, 'test-model');
  assert.deepEqual(request.body.input, [{ role: 'user', content: 'Hello' }]);
  assert.equal(result.message.content, 'Hello back');
});

test('skips reasoning items and extracts the following message', async () => {
  const responseBody = {
    output: [
      { type: 'reasoning', id: 'reasoning-1', summary: [] },
      {
        type: 'message',
        content: [{ type: 'output_text', text: 'The final answer' }]
      }
    ]
  };

  const { result } = await sendMockResponse(responseBody);
  assert.equal(result.message.content, 'The final answer');
  assert.deepEqual(result.raw, responseBody);
});

test('concatenates text across message items and output_text parts', async () => {
  const { result } = await sendMockResponse({
    output: [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: 'Part one' },
          { type: 'output_text', text: ' and part two.' }
        ]
      },
      { type: 'reasoning', summary: [] },
      {
        type: 'message',
        content: [{ type: 'output_text', text: ' Part three.' }]
      }
    ]
  });

  assert.equal(result.message.content, 'Part one and part two. Part three.');
});
