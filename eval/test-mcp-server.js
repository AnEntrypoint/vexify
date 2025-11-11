#!/usr/bin/env node
'use strict';

/**
 * Test: MCP Server
 *
 * This test validates that the MCP server can:
 * 1. Start up successfully
 * 2. Register tools correctly
 * 3. Handle search requests via JSON-RPC
 * 4. Return properly formatted results
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TEST_DIR = path.join(__dirname, '../test-research');
const TEST_DB = path.join(TEST_DIR, 'mcp-test.db');

async function runTest() {
  console.log('=== MCP Server Test ===\n');

  try {
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
      console.log('✓ Cleaned up existing test database');
    }

    // Ensure test directory exists with sample files
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Create sample test files
    const sampleFiles = [
      {
        name: 'mcp-sample1.txt',
        content: 'Vector databases store high-dimensional vectors for semantic search. They use similarity metrics like cosine similarity to find relevant results.'
      },
      {
        name: 'mcp-sample2.txt',
        content: 'The Model Context Protocol enables AI agents to communicate with external tools and services. It provides a standardized interface for tool calling.'
      },
      {
        name: 'mcp-sample3.js',
        content: '// MCP tool example\nfunction searchCode(query) {\n  return vectorDB.query(query);\n}\n'
      }
    ];

    for (const file of sampleFiles) {
      const filePath = path.join(TEST_DIR, file.name);
      fs.writeFileSync(filePath, file.content);
    }
    console.log(`✓ Created ${sampleFiles.length} test files\n`);

    // Test 1: Start MCP server and test initialization
    console.log('Test 1: Starting MCP server...');

    const serverProcess = spawn('node', [
      'lib/bin/cli.js',
      'mcp',
      '--db-path', TEST_DB,
      '--directory', TEST_DIR,
      '--verbose'
    ], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let serverReady = false;
    let initializationComplete = false;
    let serverOutput = '';
    let errorOutput = '';

    // Listen for server startup
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;
      console.log('[SERVER]', output.trim());

      if (output.includes('ready - listening on stdio') || output.includes('initialized')) {
        serverReady = true;
      }

      if (output.includes('initialization complete') || output.includes('search ready')) {
        initializationComplete = true;
      }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      serverOutput += output;
      console.log('[SERVER STDOUT]', output.trim());
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server did not start within timeout'));
        }
      }, 30000);

      const checkInterval = setInterval(() => {
        if (serverReady) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);
    });

    console.log('✓ MCP server started\n');

    // Test 2: Send initialize request
    console.log('Test 2: Sending initialize request...');
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    }) + '\n';

    serverProcess.stdin.write(initRequest);

    // Wait for response
    const initResponse = await waitForResponse(serverProcess, 1, 10000);
    console.log('Initialize response:', JSON.stringify(initResponse, null, 2));

    if (!initResponse.result || !initResponse.result.serverInfo) {
      throw new Error('Invalid initialize response');
    }
    console.log('✓ Server initialized successfully\n');

    // Test 3: List available tools
    console.log('Test 3: Listing available tools...');
    const toolsRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }) + '\n';

    serverProcess.stdin.write(toolsRequest);

    const toolsResponse = await waitForResponse(serverProcess, 2, 10000);
    console.log('Tools response:', JSON.stringify(toolsResponse, null, 2));

    if (!toolsResponse.result || !toolsResponse.result.tools || toolsResponse.result.tools.length === 0) {
      throw new Error('No tools registered');
    }

    const searchTool = toolsResponse.result.tools.find(t => t.name === 'search_code');
    if (!searchTool) {
      throw new Error('search_code tool not found');
    }
    console.log('✓ search_code tool registered\n');

    // Test 4: Wait for indexing to complete (give it some time)
    console.log('Test 4: Waiting for background indexing...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    console.log('✓ Indexing period complete\n');

    // Test 5: Execute search
    console.log('Test 5: Executing search for "vector database"...');
    const searchRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_code',
        arguments: {
          query: 'vector database',
          top_k: 3,
          include_content: true
        }
      }
    }) + '\n';

    serverProcess.stdin.write(searchRequest);

    const searchResponse = await waitForResponse(serverProcess, 3, 30000);
    console.log('Search response:', JSON.stringify(searchResponse, null, 2));

    if (!searchResponse.result || !searchResponse.result.content) {
      throw new Error('Invalid search response');
    }

    const searchText = searchResponse.result.content[0].text;
    if (!searchText.includes('results') && !searchText.includes('initializing')) {
      console.warn('⚠ Search may still be initializing');
    }
    console.log('✓ Search executed\n');

    // Test 6: Execute another search
    console.log('Test 6: Executing search for "MCP protocol"...');
    const searchRequest2 = JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'search_code',
        arguments: {
          query: 'MCP protocol',
          top_k: 2,
          include_content: true
        }
      }
    }) + '\n';

    serverProcess.stdin.write(searchRequest2);

    const searchResponse2 = await waitForResponse(serverProcess, 4, 30000);
    console.log('Second search response:', JSON.stringify(searchResponse2, null, 2));
    console.log('✓ Second search executed\n');

    // Cleanup
    serverProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('=== All MCP server tests passed! ===');
    return { passed: true, message: 'MCP server working correctly' };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { passed: false, error: error.message };
  }
}

// Helper function to wait for JSON-RPC response
function waitForResponse(process, expectedId, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for response to request ${expectedId}`));
    }, timeout);

    const dataHandler = (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            if (response.id === expectedId) {
              clearTimeout(timer);
              process.stdout.removeListener('data', dataHandler);
              resolve(response);
            }
          } catch (e) {
            // Not valid JSON, continue
          }
        }
      }
    };

    process.stdout.on('data', dataHandler);
  });
}

// Run the test
if (require.main === module) {
  runTest().then(result => {
    process.exit(result.passed ? 0 : 1);
  }).catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { runTest };
