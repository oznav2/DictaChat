DataGov Israel MCP Server (BricksLLM Integration)

Tools: status_show, license_list, package_list, package_search, package_show, organization_list, organization_show, resource_search, datastore_search, fetch_data, datagov_helper_map, datagov_helper_pick
Helper tool: datagov_helper (maps + picks, structured JSON)

Runtime env:
- BASE_URL=https://data.gov.il/api/3
- DATAGOV_CACHE_DIR=/app/data/datagov
- DATAGOV_DEFAULT_LIMIT=500
- DATAGOV_MAX_LIMIT=1000
- DATAGOV_TIMEOUT_MS=60000
- DATAGOV_LOG_PAYLOADS=true

Startup:
uv venv && source .venv/bin/activate && uv pip install -r pyproject.toml && uv lock && python server.py

Resource pre-map:
- Run `python datagov/resources_mapper.py` to generate `datagov/resources_map.json`
- Query building helpers: `datagov/query_builder.py` can construct canonical URLs for datastore_search/package_show/search and organization endpoints
