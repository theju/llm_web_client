const test = require('node:test');
const assert = require('node:assert/strict');

global.window = globalThis;
require('../js/config.js');
require('../js/models/baseModel.js');
require('../js/models/openaiModel.js');

async function sendMockResponse(responseBody, options = {}) {
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
    model: options.model || 'test-model',
    apiType: 'responses',
    baseUrl: options.baseUrl
  });
  const messages = options.messages || [{ role: 'user', content: 'Hello' }];
  const result = await model.sendMessage(messages);
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
  assert.equal(request.body.store, false);
  assert.deepEqual(request.body.include, ['reasoning.encrypted_content']);
  assert.equal(result.message.content, 'Hello back');
  assert.equal(result.responseState.continuationLevel, 'message');
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
  assert.equal(result.responseState.continuationLevel, 'message');
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

test('replays encrypted reasoning and message output items byte-for-byte', async () => {
  const first = await sendMockResponse({
    output: [
      {
        type: 'reasoning',
        id: 'reasoning-1',
        encrypted_content: 'opaque-ciphertext',
        summary: [{ type: 'summary_text', text: 'A short summary' }]
      },
      {
        type: 'message',
        id: 'message-1',
        content: [{ type: 'output_text', text: 'First answer' }]
      }
    ]
  });
  assert.equal(first.result.responseState.continuationLevel, 'encrypted');

  const second = await sendMockResponse({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Second answer' }] }]
  }, {
    messages: [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer', responseState: first.result.responseState },
      { role: 'user', content: 'Follow-up' }
    ]
  });

  assert.deepEqual(second.request.body.input, [
    { role: 'user', content: 'First question' },
    ...first.result.responseState.output,
    { role: 'user', content: 'Follow-up' }
  ]);
});

test('replays summary-only reasoning items without requiring encrypted content', async () => {
  const first = await sendMockResponse({
    output: [
      {
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'Summary only' }]
      },
      {
        type: 'message',
        content: [{ type: 'output_text', text: 'Answer' }]
      }
    ]
  });
  assert.equal(first.result.responseState.continuationLevel, 'summary');

  const second = await sendMockResponse({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Continued' }] }]
  }, {
    messages: [{ role: 'assistant', content: 'Answer', responseState: first.result.responseState }]
  });
  assert.deepEqual(second.request.body.input, first.result.responseState.output);
});

test('turns a standalone provider summary into hidden portable context', async () => {
  const first = await sendMockResponse({
    reasoning_summary: [{ text: 'Portable summary' }],
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Answer' }] }]
  });
  assert.equal(first.result.responseState.continuationLevel, 'summary');
  assert.equal(first.result.responseState.fallbackSummary, 'Portable summary');

  const second = await sendMockResponse({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Continued' }] }]
  }, {
    messages: [{ role: 'assistant', content: 'Answer', responseState: first.result.responseState }]
  });
  assert.deepEqual(second.request.body.input, [
    { role: 'assistant', content: 'Reasoning summary from the previous turn:\nPortable summary' },
    ...first.result.responseState.output
  ]);
});

test('falls back to visible text for continuation state from another model', async () => {
  const state = {
    version: 1,
    apiType: 'responses',
    endpoint: 'https://api.openai.com/v1/responses',
    model: 'different-model',
    continuationLevel: 'encrypted',
    output: [{ type: 'reasoning', encrypted_content: 'must-not-leak' }]
  };
  const { request } = await sendMockResponse({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'New answer' }] }]
  }, {
    messages: [{ role: 'assistant', content: 'Visible fallback', responseState: state }]
  });
  assert.deepEqual(request.body.input, [{ role: 'assistant', content: 'Visible fallback' }]);
});

test('renders refusals and rejects incomplete responses and unsupported media', async () => {
  const refusal = await sendMockResponse({
    output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot help with that.' }] }]
  });
  assert.equal(refusal.result.message.content, 'Cannot help with that.');

  await assert.rejects(
    () => sendMockResponse({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: []
    }),
    /incomplete response: max_output_tokens/
  );

  await assert.rejects(
    () => sendMockResponse({ output: [] }, {
      messages: [{
        role: 'user',
        content: [{ type: 'input_audio', audio_url: 'data:audio/wav;base64,AAAA' }]
      }]
    }),
    /input_audio attachments are not supported/
  );
});

test('normalizes local files only for Responses API requests', async () => {
  const localFile = {
    type: 'input_file',
    file_url: 'data:application/pdf;base64,AAAA',
    filename: 'document.pdf',
    mime_type: 'application/pdf'
  };
  const { request } = await sendMockResponse({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Read it' }] }]
  }, {
    messages: [{ role: 'user', content: [{ type: 'input_text', text: 'Read' }, localFile] }]
  });
  assert.deepEqual(request.body.input[0].content[1], {
    type: 'input_file',
    file_data: 'data:application/pdf;base64,AAAA',
    filename: 'document.pdf'
  });

  let chatBody;
  global.fetch = async (_url, init) => {
    chatBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'Done' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const chatModel = new OpenAIChatModel({
    apiKey: 'test-key',
    model: 'test-model',
    apiType: 'chat'
  });
  await chatModel.sendMessage([{ role: 'user', content: [localFile] }]);
  assert.deepEqual(chatBody.messages[0].content[0], localFile);
});
