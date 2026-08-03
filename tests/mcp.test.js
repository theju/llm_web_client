const test = require('node:test');
const assert = require('node:assert/strict');

global.window = globalThis;
require('../js/config.js');
require('../js/mcpTransport.js');
require('../js/mcpClient.js');

function jsonResponse(id, result, init = {}) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function errorResponse(id, code, message, status = 400, data) {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message, data }
  }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function discoverResult(overrides = {}) {
  return Object.assign({
    resultType: 'complete',
    supportedVersions: ['2026-07-28'],
    capabilities: { tools: {} },
    ttlMs: 60000,
    cacheScope: 'private'
  }, overrides);
}

function listResult(tools, overrides = {}) {
  return Object.assign({
    resultType: 'complete',
    tools,
    ttlMs: 60000,
    cacheScope: 'private'
  }, overrides);
}

function parseCall(init) {
  return JSON.parse(init.body);
}

test('sends exact-version metadata and mandatory routing headers without a handshake', async () => {
  const calls = [];
  global.fetch = async (_url, init) => {
    const body = parseCall(init);
    calls.push({ body, headers: new Headers(init.headers) });
    if (body.method === 'server/discover') return jsonResponse(body.id, discoverResult());
    return jsonResponse(body.id, listResult([]));
  };

  const client = new MCPClient({ endpoint: 'https://mcp.test/endpoint' });
  await client.listTools();

  assert.deepEqual(calls.map((call) => call.body.method), ['server/discover', 'tools/list']);
  for (const call of calls) {
    assert.equal(call.headers.get('MCP-Protocol-Version'), '2026-07-28');
    assert.equal(call.headers.get('Mcp-Method'), call.body.method);
    assert.equal(call.body.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
    assert.deepEqual(call.body.params._meta['io.modelcontextprotocol/clientCapabilities'], {});
    assert.equal(call.body.params._meta['io.modelcontextprotocol/clientInfo'].name, 'MCP Browser Client');
  }
  assert.equal(calls.some((call) => call.body.method === 'initialize'), false);
});

test('paginates tools, filters invalid header annotations, and caches the aggregate', async () => {
  let requests = 0;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  global.fetch = async (_url, init) => {
    requests += 1;
    const body = parseCall(init);
    if (body.method === 'server/discover') return jsonResponse(body.id, discoverResult());
    if (!body.params.cursor) {
      return jsonResponse(body.id, listResult([
        { name: 'first', inputSchema: { type: 'object', properties: {} } }
      ], { nextCursor: 'page-2', ttlMs: 5000, cacheScope: 'public' }));
    }
    return jsonResponse(body.id, listResult([
      {
        name: 'invalid',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'number', 'x-mcp-header': 'Value' } }
        }
      },
      { name: 'second', inputSchema: { type: 'object', properties: {} } }
    ], { ttlMs: 2000, cacheScope: 'private' }));
  };

  try {
    const client = new MCPClient({ endpoint: 'https://mcp.test/endpoint' });
    const first = await client.listTools();
    const second = await client.listTools();
    assert.deepEqual(first.tools.map((tool) => tool.name), ['first', 'second']);
    assert.equal(first.ttlMs, 2000);
    assert.equal(first.cacheScope, 'private');
    assert.equal(second, first);
    assert.equal(requests, 3);
    assert.match(warnings[0], /invalid x-mcp-header/);
  } finally {
    console.warn = originalWarn;
  }
});

test('mirrors nested tool parameters with type conversion and Base64 sentinel encoding', async () => {
  let callRequest;
  global.fetch = async (_url, init) => {
    const body = parseCall(init);
    if (body.method === 'server/discover') return jsonResponse(body.id, discoverResult());
    if (body.method === 'tools/list') {
      return jsonResponse(body.id, listResult([{
        name: 'search 世界',
        inputSchema: {
          type: 'object',
          properties: {
            context: {
              type: 'object',
              properties: {
                tenant: { type: 'string', 'x-mcp-header': 'Tenant' },
                enabled: { type: 'boolean', 'x-mcp-header': 'Enabled' },
                count: { type: 'integer', 'x-mcp-header': 'Count' }
              }
            }
          }
        }
      }]));
    }
    callRequest = { body, headers: new Headers(init.headers) };
    return jsonResponse(body.id, { resultType: 'complete', content: [] });
  };

  const client = new MCPClient({ endpoint: 'https://mcp.test/endpoint' });
  await client.callTool({
    name: 'search 世界',
    arguments: { context: { tenant: ' padded ', enabled: true, count: 42 } }
  });

  assert.match(callRequest.headers.get('Mcp-Name'), /^=\?base64\?.+\?=$/);
  assert.match(callRequest.headers.get('Mcp-Param-Tenant'), /^=\?base64\?.+\?=$/);
  assert.equal(callRequest.headers.get('Mcp-Param-Enabled'), 'true');
  assert.equal(callRequest.headers.get('Mcp-Param-Count'), '42');
  assert.equal(callRequest.body.params._meta['io.modelcontextprotocol/protocolVersion'], '2026-07-28');
});

test('refreshes tool schemas and retries once after HeaderMismatch', async () => {
  let listCount = 0;
  let callCount = 0;
  global.fetch = async (_url, init) => {
    const body = parseCall(init);
    if (body.method === 'server/discover') return jsonResponse(body.id, discoverResult({ ttlMs: 0 }));
    if (body.method === 'tools/list') {
      listCount += 1;
      return jsonResponse(body.id, listResult([{
        name: 'lookup',
        inputSchema: {
          type: 'object',
          properties: listCount === 1
            ? {}
            : { region: { type: 'string', 'x-mcp-header': 'Region' } }
        }
      }], { ttlMs: 60000 }));
    }
    callCount += 1;
    if (callCount === 1) return errorResponse(body.id, -32020, 'Header mismatch');
    assert.equal(new Headers(init.headers).get('Mcp-Param-Region'), 'us-east-1');
    return jsonResponse(body.id, { resultType: 'complete', content: [] });
  };

  const client = new MCPClient({ endpoint: 'https://mcp.test/endpoint' });
  await client.callTool({ name: 'lookup', arguments: { region: 'us-east-1' } });
  assert.equal(listCount, 2);
  assert.equal(callCount, 2);
});

test('parses chunked SSE, ignores notifications, and selects the matching response', async () => {
  global.fetch = async (_url, init) => {
    const body = parseCall(init);
    const text = [
      'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n',
      `data: {"jsonrpc":"2.0","id":${body.id + 100},"result":{"ignored":true}}\n\n`,
      `data: {"jsonrpc":"2.0","id":${body.id},"result":{"resultType":"complete","ok":true}}\n\n`
    ].join('');
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 17));
        controller.enqueue(bytes.slice(17, 63));
        controller.enqueue(bytes.slice(63));
        controller.close();
      }
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
  };

  const transport = new MCPHttpTransport({
    endpoint: 'https://mcp.test/endpoint',
    protocolVersion: '2026-07-28'
  });
  const result = await transport.sendRequest('server/discover', { _meta: {} });
  assert.deepEqual(result, { resultType: 'complete', ok: true });
});

test('rejects unsupported discovery and input-required tool results', async () => {
  let phase = 'discover';
  global.fetch = async (_url, init) => {
    const body = parseCall(init);
    if (phase === 'discover') {
      return jsonResponse(body.id, discoverResult({ supportedVersions: ['2025-11-25'] }));
    }
    if (body.method === 'server/discover') return jsonResponse(body.id, discoverResult());
    if (body.method === 'tools/list') {
      return jsonResponse(body.id, listResult([
        { name: 'needs-input', inputSchema: { type: 'object', properties: {} } }
      ]));
    }
    return jsonResponse(body.id, {
      resultType: 'input_required',
      inputRequests: {},
      requestState: 'opaque'
    });
  };

  const unsupported = new MCPClient({ endpoint: 'https://mcp.test/endpoint' });
  await assert.rejects(() => unsupported.discover(), /does not support protocol version/);

  phase = 'call';
  const client = new MCPClient({ endpoint: 'https://mcp.test/endpoint' });
  await assert.rejects(
    () => client.callTool({ name: 'needs-input', arguments: {} }),
    /unsupported resultType "input_required"/
  );
});

test('controller server testing uses discovery and treats tool-list failures as fatal', async () => {
  require('../js/chatController.js');
  const RealClient = global.MCPClient;
  const operations = [];

  global.MCPClient = class {
    async discover() {
      operations.push('discover');
      return discoverResult();
    }

    async listTools() {
      operations.push('listTools');
      throw new Error('tool listing failed');
    }
  };

  try {
    const result = await ChatController.testMcpServer({ endpoint: 'https://mcp.test/endpoint' });
    assert.deepEqual(operations, ['discover', 'listTools']);
    assert.equal(result.ok, false);
    assert.match(result.error, /tool listing failed/);
  } finally {
    global.MCPClient = RealClient;
  }
});
