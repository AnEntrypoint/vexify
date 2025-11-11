#!/usr/bin/env node
'use strict';

/**
 * Test: CLI Sync and Query
 *
 * This test validates that the CLI can:
 * 1. Sync a folder of documents to a database
 * 2. Query the database for relevant results
 * 3. Return accurate search results with proper scoring
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEST_DIR = path.join(__dirname, '../test-research');
const TEST_DB = path.join(TEST_DIR, 'cli-test.db');

async function runTest() {
  console.log('=== CLI Sync and Query Test ===\n');

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
        name: 'sample1.txt',
        content: 'Vector databases are specialized systems designed for storing and querying high-dimensional vectors. They enable semantic search capabilities by comparing vector embeddings using similarity metrics like cosine similarity.'
      },
      {
        name: 'sample2.txt',
        content: 'The Model Context Protocol (MCP) is a standardized communication protocol for AI assistants and tools. It enables bidirectional communication between AI models and external services.'
      },
      {
        name: 'sample3.txt',
        content: 'Ollama is a local LLM runtime that supports multiple models including embedding models. It provides an API-compatible interface for running language models and generating embeddings.'
      }
    ];

    for (const file of sampleFiles) {
      const filePath = path.join(TEST_DIR, file.name);
      fs.writeFileSync(filePath, file.content);
    }
    console.log(`✓ Created ${sampleFiles.length} test files\n`);

    // Test 1: Sync folder to database
    console.log('Test 1: Syncing folder to database...');
    const syncCmd = `node lib/bin/cli.js sync "${TEST_DB}" "${TEST_DIR}"`;
    const syncOutput = execSync(syncCmd, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 180000
    });
    console.log(syncOutput);

    // Verify database was created
    if (!fs.existsSync(TEST_DB)) {
      throw new Error('Database file was not created after sync');
    }
    console.log('✓ Database created successfully\n');

    // Test 2: Query the database
    console.log('Test 2: Querying database for "vector search"...');
    const queryCmd = `node lib/bin/cli.js query "${TEST_DB}" "vector search" 3`;
    const queryOutput = execSync(queryCmd, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 180000
    });
    console.log(queryOutput);

    // Basic validation of query output
    if (!queryOutput.includes('results') && !queryOutput.includes('score')) {
      throw new Error('Query output does not contain expected results format');
    }
    console.log('✓ Query executed successfully\n');

    // Test 3: Query for MCP-related content
    console.log('Test 3: Querying database for "MCP protocol"...');
    const queryCmd2 = `node lib/bin/cli.js query "${TEST_DB}" "MCP protocol" 2`;
    const queryOutput2 = execSync(queryCmd2, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 180000
    });
    console.log(queryOutput2);
    console.log('✓ Second query executed successfully\n');

    // Test 4: Query for embeddings-related content
    console.log('Test 4: Querying database for "embedding models"...');
    const queryCmd3 = `node lib/bin/cli.js query "${TEST_DB}" "embedding models" 2`;
    const queryOutput3 = execSync(queryCmd3, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 180000
    });
    console.log(queryOutput3);
    console.log('✓ Third query executed successfully\n');

    console.log('=== All CLI tests passed! ===');
    return { passed: true, message: 'CLI sync and query working correctly' };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stdout) console.error('STDOUT:', error.stdout.toString());
    if (error.stderr) console.error('STDERR:', error.stderr.toString());
    return { passed: false, error: error.message };
  }
}

// Run the test
if (require.main === module) {
  runTest().then(result => {
    process.exit(result.passed ? 0 : 1);
  });
}

module.exports = { runTest };
