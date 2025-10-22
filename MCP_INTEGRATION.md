# MCP Server Integration Guide

Vexify includes a Model Context Protocol (MCP) server that allows AI agents like Claude Code to search through your code repositories and documents using semantic search.

## Features

- 🔍 **Semantic Search**: Search through code and documents using natural language queries
- 🔄 **Automatic Sync**: Always searches the latest version of files (syncs before every search)
- 🧠 **Smart Detection**: Automatically detects code repositories vs document folders
- 🚫 **Intelligent Filtering**: Respects .gitignore, .dockerignore, and other ignore patterns
- ⚡ **Fast Performance**: Uses local Ollama server for embeddings
- 🔌 **MCP Compliant**: Full JSON-RPC 2.0 protocol support

## Quick Start

### 1. Start the MCP Server

```bash
# For current directory
npx vexify mcp

# For specific project
npx vexify mcp --directory ./my-project --db-path ./project.db

# With custom model
npx vexify mcp --directory ~/docstudio --model nomic-embed-text
```

### 2. Add to Claude Code

Create or edit your Claude Code configuration file to add the vexify MCP server:

**Location**: `~/.claude/claude_desktop.json`

```json
{
  "mcpServers": {
    "vexify": {
      "command": "npx",
      "args": [
        "vexify@latest",
        "mcp",
        "--directory", "/path/to/your/project",
        "--db-path", "/path/to/your/project/vexify.db"
      ]
    }
  }
}
```

**Example Configuration**:

```json
{
  "mcpServers": {
    "vexify-docstudio": {
      "command": "npx",
      "args": [
        "vexify@latest",
        "mcp",
        "--directory", "/home/user/docstudio",
        "--db-path", "/home/user/docstudio/.vexify.db",
        "--model", "unclemusclez/jina-embeddings-v2-base-code"
      ]
    },
    "vexify-current": {
      "command": "npx",
      "args": [
        "vexify@latest",
        "mcp",
        "--directory", ".",
        "--db-path", "./.vexify.db"
      ]
    }
  }
}
```

### 3. Restart Claude Code

After adding the configuration, restart Claude Code to load the MCP server.

## Usage in Claude Code

Once configured, you can ask Claude Code to search through your code:

```
"Search for authentication functions in the codebase"
"Find all TypeScript files that handle user input"
"Look for database connection configuration"
"Search for error handling patterns"
```

Claude Code will automatically use the vexify MCP server to find relevant code and documents.

## Configuration Options

### MCP Server Options

- `--db-path <path>`: Database file location (default: ./vexify-mcp.db)
- `--directory <path>`: Directory to index and search (default: current directory)
- `--model <name>`: Embedding model to use (default: unclemusclez/jina-embeddings-v2-base-code)

### Available Models

- `unclemusclez/jina-embeddings-v2-base-code` - Best for code repositories (768 dimensions)
- `nomic-embed-text` - Fast, good for general text (768 dimensions)
- `embeddinggemma` - Good for mixed content (768 dimensions)

## Multiple Projects

You can configure multiple vexify MCP servers for different projects:

```json
{
  "mcpServers": {
    "vexify-frontend": {
      "command": "npx",
      "args": [
        "vexify@latest",
        "mcp",
        "--directory", "/path/to/frontend",
        "--db-path", "/path/to/frontend/.vexify.db"
      ]
    },
    "vexify-backend": {
      "command": "npx",
      "args": [
        "vexify@latest",
        "mcp",
        "--directory", "/path/to/backend",
        "--db-path", "/path/to/backend/.vexify.db"
      ]
    },
    "vexify-docs": {
      "command": "npx",
      "args": [
        "vexify@latest",
        "mcp",
        "--directory", "/path/to/documentation",
        "--db-path", "/path/to/documentation/.vexify.db"
      ]
    }
  }
}
```

## How It Works

1. **Initial Sync**: When first started, the MCP server indexes all supported files in the specified directory
2. **Smart Filtering**: Automatically skips build artifacts, dependencies, and ignored files
3. **Pre-Search Sync**: Before every search query, the server checks for file changes and updates the index
4. **Semantic Search**: Uses vector embeddings to find code/documents based on meaning, not just keywords
5. **Contextual Results**: Returns relevant snippets with file paths and similarity scores

## File Types Supported

### Code Repositories
- JavaScript/TypeScript (.js, .ts, .jsx, .tsx)
- Python (.py)
- Java (.java)
- Go (.go)
- Rust (.rs)
- C/C++ (.c, .cpp, .h)
- And many more...

### Documents
- Markdown (.md)
- Text files (.txt)
- JSON (.json)
- YAML (.yml, .yaml)
- Environment files (.env)
- Configuration files

### Automatically Ignored
- `node_modules/`
- `.git/`
- Build artifacts (`.next/`, `dist/`, `build/`)
- Cache directories
- Test files
- IDE files
- Dependencies and lock files

## Troubleshooting

### Server Not Starting
- Ensure Ollama is running: `ollama list`
- Check that the directory path exists and is accessible
- Verify the model is available: `ollama pull unclemusclez/jina-embeddings-v2-base-code`

### No Search Results
- First search may take longer as it syncs the index
- Check that files exist in the specified directory
- Verify files meet the minimum length requirement (150+ characters)
- Some file types may be ignored by default

### Performance Issues
- Use appropriate model size (code models for code, text models for docs)
- Consider database location for faster I/O
- Large repositories may take time to index initially

## Example Use Cases

### Code Navigation
```
"Find the user authentication service"
"Where is the database connection logic?"
"Search for API endpoint handlers"
```

### Documentation Search
```
"Find setup instructions for the development environment"
"Look for deployment configuration"
"Search for API documentation"
```

### Debugging
```
"Find error handling in payment processing"
"Search for logging configuration"
"Look for validation functions"
```

## Security & Privacy

- ✅ **Local Processing**: All indexing and searching happens locally
- ✅ **No Data Upload**: Your code never leaves your machine
- ✅ **Respects Ignore Files**: Won't index sensitive or ignored files
- ✅ **User Control**: You choose which directories to index

## Integration with Other AI Assistants

The vexify MCP server works with any MCP-compatible AI assistant:

- **Claude Code**: Configure in `~/.claude/claude_desktop.json`
- **Cursor**: Add to MCP server settings
- **Continue.dev**: Configure in MCP settings
- **Custom implementations**: Use standard MCP JSON-RPC protocol

For custom implementations, the server provides:

**Tool**: `search_code`
**Parameters**:
- `query` (string, required): Search query
- `top_k` (number, optional): Maximum results (default: 5)
- `include_content` (boolean, optional): Include full content (default: true)

**Response**: Array of search results with file paths, content snippets, and similarity scores.