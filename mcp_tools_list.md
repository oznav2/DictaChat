# MCP Tools List

## 1. Everything
**Server URL:** `http://mcp-sse-proxy:3100/everything/sse`
- `echo`
  - Description: Echo the input back
  - Parameters: `message`
- `add`
  - Description: Add two numbers
  - Parameters: `a`, `b`
- `longRunningOperation`
  - Description: Demonstrate a long running operation
  - Parameters: `duration`, `steps`
- `printEnv`
  - Description: Print environment variables
  - Parameters: None
- `sampleLLM`
  - Description: Sample LLM sampling
  - Parameters: `prompt`, `maxTokens`

## 2. Context7
**Server URL:** `https://mcp.context7.com/mcp`
- `search`
  - Description: Search Context7's database of information
  - Parameters: `query`, `limit` (optional)

## 3. Docker
**Server URL:** `http://mcp-sse-proxy:3100/docker/sse`
- `docker_container_ls`
  - Description: List Docker containers
  - Parameters: `all` (boolean, optional)
- `docker_container_inspect`
  - Description: Inspect a Docker container
  - Parameters: `container_id`
- `docker_logs`
  - Description: Get logs from a Docker container
  - Parameters: `container_id`, `tail` (optional)
- `docker_compose_up`
  - Description: Run docker-compose up
  - Parameters: `file_path` (optional), `detached` (optional)
- `docker_compose_down`
  - Description: Run docker-compose down
  - Parameters: `file_path` (optional)

## 4. Sequential Thinking
**Server URL:** `http://mcp-sse-proxy:3100/sequential-thinking/sse`
- `sequentialthinking`
  - Description: A tool for dynamic, recursive problem-solving that allows the model to organize its thoughts in a sequence.
  - Parameters: `thought`, `nextThoughtNeeded`, `thoughtNumber`, `totalThoughts`, `isRevision`

## 5. Git
**Server URL:** `http://mcp-sse-proxy:3100/git/sse`
- `git_status`
  - Description: Show the working tree status
  - Parameters: `repo_path` (optional)
- `git_diff`
  - Description: Show changes between commits, commit and working tree, etc
  - Parameters: `repo_path` (optional), `target` (optional)
- `git_log`
  - Description: Show commit logs
  - Parameters: `repo_path` (optional), `max_count` (optional)
- `git_add`
  - Description: Add file contents to the index
  - Parameters: `repo_path` (optional), `files` (array of strings)
- `git_commit`
  - Description: Record changes to the repository
  - Parameters: `repo_path` (optional), `message`
- `git_push`
  - Description: Update remote refs along with associated objects
  - Parameters: `repo_path` (optional), `remote` (optional), `branch` (optional)
- `git_pull`
  - Description: Fetch from and integrate with another repository or a local branch
  - Parameters: `repo_path` (optional), `remote` (optional), `branch` (optional)

## 6. Fetch
**Server URL:** `http://mcp-sse-proxy:3100/fetch/sse`
- `fetch`
  - Description: Fetch a URL and return its content converted to Markdown
  - Parameters: `url`, `raw` (boolean, optional)

## 7. Time
**Server URL:** `http://mcp-sse-proxy:3100/time/sse`
- `get_current_time`
  - Description: Get the current time in a specific timezone
  - Parameters: `timezone` (optional)

## 8. Memory
**Server URL:** `http://mcp-sse-proxy:3100/memory/sse`
- `memory_store`
  - Description: Store a key-value pair in memory
  - Parameters: `key`, `value`
- `memory_retrieve`
  - Description: Retrieve a value from memory by key
  - Parameters: `key`
- `memory_list`
  - Description: List all keys in memory
  - Parameters: None
- `memory_clear`
  - Description: Clear all memory
  - Parameters: None

## 9. Filesystem
**Server URL:** `http://mcp-sse-proxy:3100/filesystem/sse`
- `read_file`
  - Description: Read the contents of a file
  - Parameters: `path`
- `read_multiple_files`
  - Description: Read the contents of multiple files
  - Parameters: `paths` (array)
- `write_file`
  - Description: Write content to a file
  - Parameters: `path`, `content`
- `edit_file`
  - Description: Edit a file by replacing a segment of text
  - Parameters: `path`, `old_text`, `new_text`
- `create_directory`
  - Description: Create a new directory
  - Parameters: `path`
- `list_directory`
  - Description: List files and directories in a path
  - Parameters: `path`
- `directory_tree`
  - Description: Get a recursive tree view of a directory
  - Parameters: `path`
- `move_file`
  - Description: Move or rename a file or directory
  - Parameters: `source`, `destination`
- `search_files`
  - Description: Search for files matching a pattern
  - Parameters: `path`, `pattern`, `exclude` (optional)
- `get_file_info`
  - Description: Get metadata about a file or directory
  - Parameters: `path`
- `list_allowed_directories`
  - Description: List the directories that this server is allowed to access
  - Parameters: None

## 10. Perplexity
**Server URL:** `http://mcp-sse-proxy:3100/perplexity/sse`
- `perplexity_ask`
  - Description: Ask Perplexity a question and get a researched answer
  - Parameters: `query`, `model` (optional)

## 11. Tavily Search
**Server URL:** `http://mcp-sse-proxy:3100/Tavily/sse`
- `tavily_search`
  - Description: A powerful search engine optimized for LLMs and RAG.
  - Parameters: `query`, `topic`, `days`, `max_results`, `include_domains`, `exclude_domains`, `include_answer`, `include_raw_content`, `include_images`, `search_depth`
- `tavily_extract`
  - Description: A powerful web scraper that extracts content from URLs and converts it into clean, LLM-ready formats (Markdown/JSON).
  - Parameters: `urls`, `include_images`, `extract_depth`
- `tavily_context`
  - Description: A dedicated context search tool that generates concise, fact-based context for RAG applications.
  - Parameters: `query`, `topic`, `days`, `max_results`
- `tavily_qna`
  - Description: A specialized Question & Answer tool that performs a search and returns a direct, concise answer to the user's query.
  - Parameters: `query`, `topic`, `days`, `max_results`
- `tavily-search`
  - Description: A search engine optimized for LLMs that connects AI to real-time, accurate, and trusted knowledge.
  - Parameters: `query`, `search_depth`, `topic`, `days`, `max_results`, `include_domains`, `exclude_domains`, `include_answer`, `include_raw_content`, `include_images`
- `tavily-extract`
  - Description: A powerful web scraper that extracts content from URLs and converts it into clean, LLM-ready formats (Markdown/JSON).
  - Parameters: `urls`, `include_images`, `extract_depth`
- `tavily-map`
  - Description: A powerful web mapping tool that creates a structured map of website URLs, allowing you to discover and analyze site structure.
  - Parameters: `url`, `max_depth`, `max_breadth`, `limit`

## 12. YouTube Summarizer
**Server URL:** `http://mcp-sse-proxy:3100/youtube-video-summarizer/sse`
- `get-video-info-for-summary-from-url`
  - Description: Get details or explanation about a YouTube video, get captions or subtitles of Youtube video from a URL
  - Parameters: `videoUrl`, `languageCode` (optional)
