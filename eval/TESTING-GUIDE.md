# Vexify Dual-Mode Testing Guide

## Quick Start

This guide enables anyone to test vexify's dual-mode functionality (CLI + MCP) with minimal setup.

## Prerequisites

### 1. Install Ollama (Choose One Method)

#### Method A: Portable Binary (Recommended for Testing)
```bash
# Create local bin directory
mkdir -p ~/.local/bin

# Download Ollama
wget -O ~/.local/bin/ollama \
  https://github.com/ollama/ollama/releases/download/v0.1.26/ollama-linux-amd64

# Make executable
chmod +x ~/.local/bin/ollama

# Add to PATH
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

#### Method B: System Installation
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

#### Method C: Docker
```bash
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```

### 2. Start Ollama Server
```bash
# Start in background
ollama serve > /tmp/ollama.log 2>&1 &

# Wait for startup
sleep 3

# Verify running
curl http://localhost:11434/api/tags
```

### 3. Pull Embedding Model
```bash
# Default model (fast, 384-dimensional embeddings)
ollama pull nomic-embed-text

# OR code-specific model (better for source code)
ollama pull unclemusclez/jina-embeddings-v2-base-code

# Verify model is available
ollama list | grep nomic-embed-text
```

## Running Tests

### Test Suite Overview

| Test | Purpose | Duration | Requires Ollama |
|------|---------|----------|-----------------|
| Architecture | Code analysis & validation | ~5s | No |
| CLI | Sync & query operations | ~30-60s | Yes |
| MCP | Server lifecycle & search | ~45-90s | Yes |

### Test 1: Architecture (No Ollama Required)

Validates code structure, component sharing, and mode independence.

```bash
cd /home/user/vexify
node eval/test-dual-mode-architecture.js
```

**Expected Output:**
```
=== Dual-Mode Architecture Research Test ===

Test 1: Analyzing core module structure...
✓ Both modes use shared VecStoreFactory
  - CLI uses VecStoreFactory: true
  - MCP uses VecStoreFactory: true

[... 7 tests total ...]

Overall: ✓ All tests passed
Total: 7/7 tests passed

Detailed results written to: eval/dual-mode-architecture-results.json
```

**Success Criteria:** All 7 tests pass

### Test 2: CLI Sync and Query

Validates command-line interface for syncing documents and executing searches.

```bash
cd /home/user/vexify
node eval/test-cli-sync-query.js
```

**What It Tests:**
1. Creates sample documents (txt files)
2. Syncs documents to SQLite database
3. Generates embeddings via Ollama
4. Executes multiple queries
5. Validates result format and scores

**Expected Output:**
```
=== CLI Sync and Query Test ===

✓ Created 3 test files

Test 1: Syncing folder to database...
Syncing folder: /home/user/vexify/test-research
...
✓ Database created successfully

Test 2: Querying database for "vector search"...
Top 3 results:
1. [sample1.txt] (score: 0.8234)
   Vector databases are specialized systems...
...
✓ Query executed successfully

=== All CLI tests passed! ===
```

**Success Criteria:**
- Database file created
- Documents synced (added > 0)
- Queries return relevant results
- Scores between 0.0 and 1.0

### Test 3: MCP Server

Validates Model Context Protocol server implementation.

```bash
cd /home/user/vexify
node eval/test-mcp-server.js
```

**What It Tests:**
1. MCP server startup
2. JSON-RPC initialize handshake
3. Tool registration (search_code)
4. Background indexing
5. Search execution
6. Multiple search requests
7. Graceful shutdown

**Expected Output:**
```
=== MCP Server Test ===

✓ Created 3 test files

Test 1: Starting MCP server...
[SERVER] Vexify MCP Server initializing...
[SERVER] Vexify MCP Server ready - listening on stdio...
✓ MCP server started

Test 2: Sending initialize request...
Initialize response: {
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": { "name": "vexify-mcp", "version": "0.16.28" }
  }
}
✓ Server initialized successfully

[... more tests ...]

=== All MCP server tests passed! ===
```

**Success Criteria:**
- Server starts without errors
- Initialize returns valid response
- search_code tool registered
- Searches return results
- Server responds to multiple requests

## Manual Testing

If automated tests fail or you want to test interactively:

### Manual CLI Testing

```bash
# 1. Create test directory with documents
mkdir -p /tmp/vexify-test
echo "Vector databases store embeddings for semantic search" > /tmp/vexify-test/doc1.txt
echo "Ollama provides local LLM and embedding models" > /tmp/vexify-test/doc2.txt

# 2. Sync documents to database
vexify sync /tmp/test.db /tmp/vexify-test

# Expected output:
# Syncing folder: /tmp/vexify-test
# ✓ Sync completed:
#   Added: 2 documents
#   Skipped: 0 duplicates

# 3. Query the database
vexify query /tmp/test.db "vector search" 3

# Expected output:
# Top 3 results:
# 1. [doc1.txt] (score: 0.8532)
#    Vector databases store embeddings...

# 4. Query with different term
vexify query /tmp/test.db "ollama models" 2

# 5. Verify database exists
ls -lh /tmp/test.db
# Should show database file (~2-5MB)
```

### Manual MCP Testing

**Terminal 1: Start MCP Server**
```bash
# Start with verbose logging
vexify mcp --directory /tmp/vexify-test --db-path /tmp/mcp-test.db --verbose
```

**Expected Output:**
```
Vexify MCP Server initializing...
✓ VecStore initialized successfully
Vexify MCP Server ready - listening on stdio...
Starting background indexing...
✓ Background indexing complete
```

**Terminal 2: Test JSON-RPC (via stdin simulation)**
```bash
# Create test request file
cat > /tmp/mcp-init.json << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
EOF

# Send to MCP server (conceptual - actual MCP clients handle this)
cat /tmp/mcp-init.json | vexify mcp --directory /tmp/vexify-test --db-path /tmp/mcp-test.db

# Note: In production, MCP clients like Claude Desktop handle the JSON-RPC protocol
```

**Verify MCP Server:**
```bash
# Check if server process is running
ps aux | grep "vexify mcp"

# Check database was created
ls -lh /tmp/mcp-test.db

# Kill server when done
pkill -f "vexify mcp"
```

## Troubleshooting

### Issue: "Ollama not running"

**Solution:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not, start Ollama
ollama serve > /tmp/ollama.log 2>&1 &

# Wait and verify
sleep 2
curl http://localhost:11434/api/tags
```

### Issue: "Model not found"

**Solution:**
```bash
# Check available models
ollama list

# Pull default model
ollama pull nomic-embed-text

# Verify
ollama list | grep nomic-embed-text
```

### Issue: "Cannot find module 'better-sqlite3'"

**Solution:**
```bash
cd /home/user/vexify
npm install
node lib/install.js
```

### Issue: "Test timeout"

**Cause:** Embedding generation is slow on CPU
**Solution:**
- Increase test timeout values
- Use smaller embedding model
- Test with fewer documents
- Use GPU if available

### Issue: "MCP server not responding"

**Debugging:**
```bash
# Run with verbose logging
vexify mcp --directory . --db-path ./test.db --verbose

# Check stderr output for errors

# Verify database isn't locked
lsof ./test.db

# Try with fresh database
rm ./test.db
vexify mcp --directory . --db-path ./test.db --verbose
```

## Performance Benchmarks

### Expected Timing (CPU-only, typical laptop)

| Operation | Time | Notes |
|-----------|------|-------|
| Sync 10 files | ~5-10s | First time includes model loading |
| Sync 100 files | ~30-60s | Depends on file size |
| CLI query (cold) | ~2-3s | Includes initialization |
| MCP first query | ~2-5s | May wait for indexing |
| MCP subsequent queries | ~300-800ms | No initialization |
| Embedding generation | ~100-300ms per doc | nomic-embed-text |

### With GPU Acceleration

- 5-10x faster embedding generation
- Sync 100 files: ~5-10s
- Query latency: ~100-200ms

## Test Results Interpretation

### Architecture Test Results

**File:** `eval/dual-mode-architecture-results.json`

```json
{
  "passed": true,
  "tests": [
    { "name": "Core module structure", "passed": true },
    { "name": "CLI query implementation", "passed": true },
    ...
  ],
  "summary": {
    "totalTests": 7,
    "passed": 7,
    "failed": 0
  }
}
```

### CLI Test Success Indicators

- ✓ Database file created (test-research/cli-test.db)
- ✓ Added documents > 0
- ✓ Query results contain scores
- ✓ Scores are between 0.0 and 1.0
- ✓ Content snippets match queries
- ✓ Exit code 0

### MCP Test Success Indicators

- ✓ Server starts and listens on stdio
- ✓ Initialize response has serverInfo
- ✓ tools/list includes search_code tool
- ✓ search_code has correct input schema
- ✓ Search returns formatted results
- ✓ Multiple searches succeed
- ✓ Server shuts down cleanly

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Test Vexify Dual Mode

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Install Ollama
        run: |
          curl -fsSL https://ollama.com/install.sh | sh
          ollama serve &
          sleep 5
          ollama pull nomic-embed-text

      - name: Run architecture test
        run: node eval/test-dual-mode-architecture.js

      - name: Run CLI test
        run: node eval/test-cli-sync-query.js

      - name: Run MCP test
        run: node eval/test-mcp-server.js
```

## Development Testing

### Watch Mode (Continuous Testing)

```bash
# Install nodemon if not available
npm install -g nodemon

# Watch and re-run architecture tests on code changes
nodemon --watch lib --exec "node eval/test-dual-mode-architecture.js"

# Watch and re-run all tests
nodemon --watch lib --exec "npm test"
```

### Quick Validation (No Ollama)

```bash
# Fast validation of code structure
node eval/test-dual-mode-architecture.js

# Should complete in <5 seconds
# All 7 tests should pass
```

## Advanced Testing

### Load Testing MCP Server

```bash
# Install autocannon for load testing
npm install -g autocannon

# Test MCP server with concurrent requests
# (requires custom JSON-RPC client)

# Manual concurrent test:
for i in {1..10}; do
  node eval/test-mcp-server.js &
done
wait
```

### Cross-Platform Testing

```bash
# Linux (current)
uname -a  # Verify platform
node eval/test-cli-sync-query.js

# macOS
# Same commands, Ollama downloads darwin binary

# Windows (WSL required for vexify)
wsl node eval/test-cli-sync-query.js
```

## Summary

**Minimal Test Run (No Ollama):**
```bash
node eval/test-dual-mode-architecture.js
# Takes ~5 seconds, validates code structure
```

**Full Test Run (With Ollama):**
```bash
ollama serve &
sleep 3
ollama pull nomic-embed-text
node eval/test-dual-mode-architecture.js
node eval/test-cli-sync-query.js
node eval/test-mcp-server.js
# Takes ~2-3 minutes total
```

**Success Criteria:**
- All architecture tests pass (7/7)
- CLI successfully syncs and queries documents
- MCP server starts, registers tools, and executes searches
- No errors or exceptions

---

For detailed findings and analysis, see `eval/RESEARCH-FINDINGS.md`.
