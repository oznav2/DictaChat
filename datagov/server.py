import os
import json
import time
from typing import Any, Dict, List, Optional
from fastmcp import FastMCP, Context
from curl_cffi import requests
from .query_builder import (
    suggest_for_query,
    _decompose_query,
    LOCATION_COLUMN_NAMES,
    LOCATION_FILTER_VALUES,
    extract_field_intents,
    match_fields_to_schema,
    FIELD_INTENT_MAPPING,
    # Phase 1-4 Enterprise Enhancements
    filter_by_field_availability,
    get_resource_schema,
    get_semantic_field_name,
    get_all_semantic_fields,
    get_resource_metadata_fast,
    check_field_availability,
    # Enterprise Fallback
    rephrase_query,
    get_category_suggestion,
)

mcp = FastMCP("DataGovIL")

BASE_URL = os.getenv("BASE_URL", "https://data.gov.il/api/3")
CACHE_DIR = os.getenv("DATAGOV_CACHE_DIR", "/app/data/datagov")
DEFAULT_LIMIT = int(os.getenv("DATAGOV_DEFAULT_LIMIT", "500"))
MAX_LIMIT = int(os.getenv("DATAGOV_MAX_LIMIT", "1000"))
TIMEOUT_MS = int(os.getenv("DATAGOV_TIMEOUT_MS", "60000"))
LOG_PAYLOADS = os.getenv("DATAGOV_LOG_PAYLOADS", "false").lower() == "true"
MAP_PATH = os.getenv("DATAGOV_MAP_PATH", "/app/datagov/resources_map.json")
PROXY_URL = os.getenv("DATAGOV_PROXY_URL", "")

# Create a session with browser impersonation to bypass 403 blocks
# We use chrome120 fingerprint which mimics a real browser
session = requests.Session(impersonate="chrome120")
session.headers.update({
    "Referer": "https://data.gov.il/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 datagov-external-client",
})

if PROXY_URL:
    session.proxies = {"http": PROXY_URL, "https": PROXY_URL}

# Load map at startup
RESOURCES_MAP = {}
if os.path.exists(MAP_PATH):
    try:
        with open(MAP_PATH, "r", encoding="utf-8") as f:
            RESOURCES_MAP = json.load(f)
        print(f"Loaded resources map from {MAP_PATH} ({len(RESOURCES_MAP.get('datasets', []))} datasets)")
    except Exception as e:
        print(f"Failed to load resources map: {e}")

def _ensure_cache():
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
    except Exception:
        pass

def _clamp_limit(value: Optional[int]) -> int:
    try:
        v = int(value or DEFAULT_LIMIT)
    except Exception:
        v = DEFAULT_LIMIT
    if v <= 0:
        v = DEFAULT_LIMIT
    if v > MAX_LIMIT:
        v = MAX_LIMIT
    return v

def _http(method: str, path: str, *, params: Dict[str, Any] = None, data: Dict[str, Any] = None) -> requests.Response:
    url = f"{BASE_URL}{path}"
    timeout = TIMEOUT_MS / 1000.0
    if method.upper() == "GET":
        return session.get(url, params=params or {}, timeout=timeout)
    if method.upper() == "POST":
        return session.post(url, json=data or {}, timeout=timeout)
    raise ValueError("unsupported method")

def _score_resource(query: str, ds_title: str, res_title: str, fmt: str, last_modified: Optional[str], tags: List[str]) -> float:
    q = (query or "").lower()
    base = 0.0
    if q:
        if q in (ds_title or "").lower():
            base += 0.4
        if q in (res_title or "").lower():
            base += 0.3
        if any(q in (t or "").lower() for t in tags or []):
            base += 0.2
    fmt_bonus = {"CSV": 0.3, "XLSX": 0.25, "JSON": 0.15, "XML": 0.1, "PDF": 0.05}.get((fmt or "").upper(), 0.0)
    return min(1.0, base + fmt_bonus)

@mcp.tool()
async def status_show(ctx: Context):
    """Get the CKAN version and a list of installed extensions."""
    await ctx.info("Fetching CKAN status...")
    response = _http("POST", "/action/status_show")
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def license_list(ctx: Context):
    """Get the list of licenses available for datasets on the site."""
    await ctx.info("Fetching license list...")
    response = _http("GET", "/action/license_list")
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def package_list(ctx: Context):
    """Get a list of all package IDs (datasets)."""
    await ctx.info("Fetching package list...")
    response = _http("GET", "/action/package_list")
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def package_search(ctx: Context, q: str = "", fq: str = "", sort: str = "", rows: int = 20, start: int = 0, include_private: bool = False):
    """Find packages (datasets) matching query terms."""
    await ctx.info("Searching for packages...")
    rows = _clamp_limit(rows)
    params = {
        "q": q,
        "fq": fq,
        "sort": sort,
        "rows": rows,
        "start": max(0, int(start or 0)),
        "include_private": bool(include_private),
    }
    response = _http("GET", "/action/package_search", params=params)
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def package_show(ctx: Context, id: str):
    """Get metadata about one specific package (dataset)."""
    await ctx.info(f"Fetching metadata for package: {id}")
    response = _http("GET", "/action/package_show", params={"id": id})
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def organization_list(ctx: Context):
    """Get names of all organizations."""
    await ctx.info("Fetching organization list...")
    response = _http("GET", "/action/organization_list")
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def organization_show(ctx: Context, id: str):
    """Get details of a specific organization."""
    await ctx.info(f"Fetching details for organization: {id}")
    response = _http("GET", "/action/organization_show", params={"id": id})
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def resource_search(ctx: Context, query: str = "", order_by: str = "", offset: int = 0, limit: int = 100):
    """Find resources based on their field values."""
    await ctx.info("Searching for resources...")
    limit = _clamp_limit(limit)
    params = {
        "query": query,
        "order_by": order_by,
        "offset": max(0, int(offset or 0)),
        "limit": limit,
    }
    response = _http("GET", "/action/resource_search", params=params)
    response.raise_for_status()
    return response.json()

@mcp.tool()
async def datastore_search(ctx: Context, resource_id: str, q: str = "", distinct: bool = False, plain: bool = True, limit: int = 100, offset: int = 0, fields: str = "", sort: str = "", include_total: bool = True, records_format: str = "objects"):
    """Search a datastore resource."""
    await ctx.info(f"Searching datastore for resource: {resource_id}")
    limit = _clamp_limit(limit)
    params = {
        "resource_id": resource_id,
        "q": q,
        "distinct": bool(distinct),
        "plain": bool(plain),
        "limit": limit,
        "offset": max(0, int(offset or 0)),
        "fields": fields,
        "sort": sort,
        "include_total": bool(include_total),
        "records_format": records_format or "objects",
    }
    response = _http("GET", "/action/datastore_search", params=params)
    response.raise_for_status()
    return response.json()

def _write_json(path: str, obj: Dict[str, Any]):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
    except Exception:
        pass

def _read_json(path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def _get_dataset_first_resource_id(dataset_id_or_name: str) -> Optional[str]:
    r = _http("GET", "/action/package_show", params={"id": dataset_id_or_name})
    if r.status_code == 200:
        data = r.json()
        res = (data.get("result", {}) or {}).get("resources", []) or []
        if res:
            return res[0].get("id")
    return None


def _fetch_resource_schema(resource_id: str) -> Dict[str, Any]:
    """
    Fetch schema (field names and types) for a resource.

    ENTERPRISE ENHANCEMENT (Phase 2):
    Uses pre-computed schema from enterprise_schemas.json FIRST (instant, no API call).
    Falls back to API call if not found (original behavior preserved).

    Returns:
        Dict with 'fields' list, 'field_names' list, and 'source' indicator.
    """
    # Phase 2: Try pre-computed schema first (instant, no API call)
    precomputed = get_resource_schema(resource_id)
    if precomputed:
        fields = precomputed.get("fields", [])
        # Handle both "name" and "id" field name conventions
        field_names = []
        for f in fields:
            name = f.get("name") or f.get("id")
            if name and name != "_id":
                field_names.append(name)

        return {
            "fields": fields,
            "field_names": field_names,
            "total_records": precomputed.get("total_records", 0),
            "source": "enterprise_schemas",  # Debug flag
            "semantic_types": {f.get("name"): f.get("semantic") for f in fields if f.get("semantic")},
        }

    # Original API fallback (unchanged)
    try:
        params = {
            "resource_id": resource_id,
            "limit": 0,  # Don't fetch any records, just schema
            "include_total": True,
        }
        response = _http("GET", "/action/datastore_search", params=params)

        if response.status_code != 200:
            return {"error": f"HTTP {response.status_code}", "fields": [], "field_names": [], "source": "api_error"}

        data = response.json()
        if not data.get("success"):
            return {"error": data.get("error", {}).get("message", "Unknown"), "fields": [], "field_names": [], "source": "api_error"}

        result = data.get("result", {})
        fields = result.get("fields", [])

        # Extract field names (skip internal _id field)
        field_names = [f.get("id") for f in fields if f.get("id") and f.get("id") != "_id"]

        return {
            "fields": fields,
            "field_names": field_names,
            "total_records": result.get("total", 0),
            "source": "api",  # Debug flag
        }
    except Exception as e:
        return {"error": str(e), "fields": [], "field_names": [], "source": "api_exception"}

@mcp.tool()
def fetch_data(dataset_name: str, limit: int = 100, offset: int = 0):
    _ensure_cache()
    resource_id = _get_dataset_first_resource_id(dataset_name)
    if not resource_id:
        return {"error": f"No dataset found matching '{dataset_name}'"}
    limit = _clamp_limit(limit)
    params = {"resource_id": resource_id, "limit": limit, "offset": max(0, int(offset or 0))}
    t0 = time.time()
    r = _http("GET", "/action/datastore_search", params=params)
    dur = int((time.time() - t0) * 1000)
    r.raise_for_status()
    data = r.json()
    meta = {
        "resource_id": resource_id,
        "limit": limit,
        "offset": int(offset or 0),
        "duration_ms": dur,
        "downloaded_at": int(time.time()),
    }
    _write_json(os.path.join(CACHE_DIR, f"{resource_id}.meta.json"), meta)
    if LOG_PAYLOADS:
        _write_json(os.path.join(CACHE_DIR, f"{resource_id}.payload.json"), data)
    if data.get("success"):
        result = data.get("result", {}) or {}
        fields_list = result.get("fields", []) or []
        headers = [f.get("id") or "" for f in fields_list]
        has_hebrew = any(any("\u0590" <= ch <= "\u05FF" for ch in h) for h in headers)
        meta["rows"] = len(result.get("records", []))
        meta["language_hint"] = "hebrew" if has_hebrew else "mixed_or_english"
        return {
            "records": result.get("records", []),
            "fields": fields_list,
            "resource_id": resource_id,
            "meta": meta,
        }
    return {"error": data.get("error", "Unknown error")}

@mcp.tool()
async def datagov_helper_map(ctx: Context, query: str, category: str = "", limit: int = 20):
    await ctx.info("datagov_helper.map")
    limit = _clamp_limit(limit)
    r = _http("GET", "/action/package_search", params={"q": query or "", "rows": limit})
    r.raise_for_status()
    pk = r.json()
    results = []
    for pkg in (pk.get("result", {}) or {}).get("results", []) or []:
        ds_id = pkg.get("id")
        ds_title = pkg.get("title") or pkg.get("name") or ""
        tags = [t.get("display_name") or t.get("name") or "" for t in pkg.get("tags", []) or []]
        r2 = _http("GET", "/action/package_show", params={"id": ds_id})
        r2.raise_for_status()
        full = r2.json()
        resources = (full.get("result", {}) or {}).get("resources", []) or []
        for res in resources:
            rid = res.get("id")
            rtitle = res.get("name") or res.get("title") or ""
            fmt = res.get("format") or ""
            lm = res.get("last_modified") or res.get("revision_timestamp") or ""
            score = _score_resource(query, ds_title, rtitle, fmt, lm, tags)
            results.append({
                "dataset_id": ds_id,
                "dataset_title": ds_title,
                "resource_id": rid,
                "resource_title": rtitle,
                "format": fmt,
                "last_modified": lm,
                "organization": (pkg.get("organization") or {}).get("title", ""),
                "tags": tags,
                "score": round(score, 3),
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"query": query, "category": category, "resources": results[:limit], "generated_at": int(time.time())}

@mcp.tool()
async def datagov_helper_pick(ctx: Context, query: str, candidates: List[Dict[str, Any]]):
    await ctx.info("datagov_helper.pick")
    if not candidates:
        return {"error": "no candidates"}
    best = max(candidates, key=lambda x: float(x.get("score") or 0.0))
    if float(best.get("score") or 0.0) < 0.6:
        return {"low_confidence": True, "choice": best, "alternatives": candidates[:5], "rationale": "low score"}
    alts = [c for c in candidates if c is not best]
    return {"choice": best, "alternatives": alts[:5], "rationale": "format preference and relevance score"}

@mcp.tool()
async def datagov_helper(ctx: Context, query: str, category: str = "", limit: int = 20):
    await ctx.info("datagov_helper")
    limit = _clamp_limit(limit)
    r = _http("GET", "/action/package_search", params={"q": query or "", "rows": limit})
    r.raise_for_status()
    pk = r.json()
    results = []
    for pkg in (pk.get("result", {}) or {}).get("results", []) or []:
        ds_id = pkg.get("id")
        ds_title = pkg.get("title") or pkg.get("name") or ""
        tags = [t.get("display_name") or t.get("name") or "" for t in pkg.get("tags", []) or []]
        r2 = _http("GET", "/action/package_show", params={"id": ds_id})
        r2.raise_for_status()
        full = r2.json()
        resources = (full.get("result", {}) or {}).get("resources", []) or []
        for res in resources:
            rid = res.get("id")
            rtitle = res.get("name") or res.get("title") or ""
            fmt = res.get("format") or ""
            lm = res.get("last_modified") or res.get("revision_timestamp") or ""
            score = _score_resource(query, ds_title, rtitle, fmt, lm, tags)
            results.append({
                "dataset_id": ds_id,
                "dataset_title": ds_title,
                "resource_id": rid,
                "resource_title": rtitle,
                "format": fmt,
                "last_modified": lm,
                "organization": (pkg.get("organization") or {}).get("title", ""),
                "tags": tags,
                "score": round(score, 3),
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    choice = results[0] if results else None
    low_conf = bool(choice and float(choice.get("score") or 0.0) < 0.6)
    return {
        "query": query,
        "category": category,
        "resources": results[:limit],
        "choice": choice,
        "low_confidence": low_conf,
        "rationale": "low score" if low_conf else "format preference and relevance score",
        "generated_at": int(time.time())
    }

@mcp.tool()
async def datagov_resource_map(ctx: Context, query: str, limit: int = 10):
    """
    Offline search for datasets/resources using the local map index.
    
    Args:
        query: The search term to find relevant datasets and resources (Required).
        limit: Max number of results to return (default: 10).
    """
    await ctx.info("datagov_resource_map")
    if not query:
        return {"error": "Missing required argument: query"}
    try:
        if RESOURCES_MAP:
            res = suggest_for_query(query, RESOURCES_MAP, limit=limit)
            return res
        return {"error": "map file not found or empty"}
    except Exception as e:
        return {"error": str(e)}

@mcp.tool()
async def get_resource_metadata_offline(ctx: Context, resource_id: str):
    """Get metadata for a resource from the local map without API calls."""
    await ctx.info(f"Looking up resource {resource_id} in offline map")
    if not RESOURCES_MAP:
        return {"error": "map file not loaded"}

    index = RESOURCES_MAP.get("resource_index", {})
    if resource_id in index:
        return {"found": True, "metadata": index[resource_id]}

    return {"found": False, "error": "resource not found in local index"}


def _is_count_query(query: str) -> bool:
    """
    Detect if query is asking for a COUNT/TOTAL/SUM (not just listing data).
    These queries need ALL records to calculate aggregates.
    """
    count_patterns = [
        r'\bכמה\b',           # "how many" in Hebrew
        r'\bסה"כ\b',          # "total" in Hebrew
        r'\bסהכ\b',           # "total" without quotes
        r'\bמספר\b',          # "number of" in Hebrew
        r'\bסכום\b',          # "sum" in Hebrew
        r'\bhow many\b',
        r'\btotal\b',
        r'\bcount\b',
        r'\bsum of\b',
        r'\bhow much\b',
    ]
    import re
    q_lower = query.lower()
    return any(re.search(p, q_lower) for p in count_patterns)


def _calculate_aggregates(records: list, fields: list) -> dict:
    """
    Calculate SUM/COUNT aggregates for numeric columns.
    Returns a summary dict with totals.
    """
    if not records:
        return {}

    # Find numeric fields
    numeric_fields = []
    for f in fields:
        fid = f.get("id", "")
        ftype = (f.get("type") or "").lower()
        if fid == "_id":
            continue
        # Check if it's a numeric type or if values look numeric
        if ftype in ("int", "int4", "int8", "float", "float8", "numeric", "integer", "number"):
            numeric_fields.append(fid)
        elif records:
            # Check first non-null value
            for r in records[:5]:
                val = r.get(fid)
                if val is not None and str(val).replace(",", "").replace(".", "").replace("-", "").isdigit():
                    numeric_fields.append(fid)
                    break

    # Calculate sums
    sums = {}
    for fid in numeric_fields:
        total = 0
        count = 0
        for r in records:
            val = r.get(fid)
            if val is not None:
                try:
                    # Handle string numbers with commas
                    if isinstance(val, str):
                        val = val.replace(",", "")
                    total += float(val)
                    count += 1
                except (ValueError, TypeError):
                    pass
        if count > 0:
            sums[fid] = {
                "sum": int(total) if total == int(total) else round(total, 2),
                "count": count,
            }

    return sums


def _format_as_markdown(records: list, fields: list, resource: dict, total: int, limit: int, offset: int, aggregates: dict = None) -> str:
    """Format datastore records as a readable markdown table."""
    if not records:
        return "No records found."

    # Get field names (skip internal _id field)
    field_names = [f.get("id", str(i)) for i, f in enumerate(fields) if f.get("id") != "_id"]

    # Limit to first 8 columns for readability
    display_fields = field_names[:8]

    # Build header
    header = "| " + " | ".join(display_fields) + " |"
    separator = "| " + " | ".join(["---"] * len(display_fields)) + " |"

    # Build rows (limit cell content to 40 chars)
    rows = []
    for record in records[:limit]:
        cells = []
        for f in display_fields:
            val = str(record.get(f, ""))[:40]
            val = val.replace("|", "\\|").replace("\n", " ")
            cells.append(val)
        rows.append("| " + " | ".join(cells) + " |")

    # Build footer with metadata
    footer = f"\n\n**Source**: {resource.get('dataset_title', 'Unknown')} - {resource.get('resource_title', '')}\n"
    footer += f"**Records**: {offset+1}-{offset+len(records)} of {total} | **Format**: {resource.get('format', 'N/A')}"

    # Add aggregates summary if available (important for "how many" queries)
    if aggregates:
        footer += "\n\n**📊 SUMMARY TOTALS:**\n"
        for field_name, stats in aggregates.items():
            footer += f"- **{field_name}**: {stats['sum']:,} (from {stats['count']} records)\n"
        footer += "\n*☝️ Use these totals to answer 'how many' questions directly. No need to paginate.*"

    if (offset + len(records)) < total and not aggregates:
        footer += f"\n*More records available. Use offset={offset+limit} to get next page.*"

    return header + "\n" + separator + "\n" + "\n".join(rows) + footer


@mcp.tool()
async def datagov_query(
    ctx: Context,
    query: str,
    limit: int = 20,
    offset: int = 0,
    format_output: bool = True
):
    """
    חיפוש במאגרי המידע הרשמיים של ממשלת ישראל (data.gov.il).
    Search Israeli government official data repositories.

    USE THIS TOOL FIRST when user asks about:
    - מאגרים רשמיים / מידע רשמי / נתונים רשמיים (official repositories/data)
    - נתוני ממשלה / מידע ממשלתי (government data)
    - סטטיסטיקה רשמית / נתונים סטטיסטיים (official statistics)
    - data.gov.il / דאטה גוב / הממשלה הפתוחה (open government)
    - Israeli vehicles, transportation, health, education, budget, courts, water, environment

    This is the PRIMARY and AUTHORITATIVE source for Israeli government open data.
    Contains 1187+ official datasets covering all government ministries.

    TRIGGER PHRASES (use this tool when user mentions):
    - "בדוק במאגרים רשמיים" → USE THIS TOOL
    - "נתונים ממשלתיים" → USE THIS TOOL
    - "כמה רכבים / בתי חולים / בתי ספר" → USE THIS TOOL
    - "סטטיסטיקה על ישראל" → USE THIS TOOL

    ENTERPRISE FEATURES:
    - Automatic Hebrew prefix handling (בירושלים → ירושלים)
    - Schema-aware field selection
    - Semantic expansion (courts → בית משפט)
    - Query rephrasing fallback for better matching
    - **AUTO-AGGREGATION**: For "כמה/how many" queries, automatically fetches ALL records
      and calculates SUMS. No pagination needed - totals are in the response!

    Args:
        query: Natural language search in Hebrew or English (REQUIRED).
               Examples:
               - "כמה כלי רכב חשמליים בישראל" (electric vehicles in Israel)
               - "בתי חולים בירושלים" (hospitals in Jerusalem)
               - "תקציב משרד החינוך" (education ministry budget)
               - "trauma centers", "schools", "water quality"
        limit: Maximum records to return (1-100, default: 20).
               **NOTE**: For "כמה/how many" queries, limit is auto-increased to get ALL data.
        offset: Starting record for pagination (default: 0)
        format_output: Return markdown table (True) or raw JSON (False)

    Returns:
        Formatted data with metadata, pagination info, and source citation.
        **For count queries**: Includes SUMMARY TOTALS with pre-calculated sums.
        No need to paginate - use the totals directly!
        If no matching data found, suggests using perplexity_ask for web search.
    """
    await ctx.info(f"datagov_query: {query[:50] if query else 'empty'}...")

    # CRITICAL: Detect count/aggregation queries EARLY
    # For "כמה" (how many) queries, auto-increase limit to get ALL records for accurate sums
    is_count_query = _is_count_query(query)

    # Validate required parameter
    if not query or not query.strip():
        return {
            "error": "Query is required. Please provide a search term.",
            "examples": [
                "בתי חולים בירושלים",
                "trauma centers",
                "courts in Jerusalem with addresses",
                "תקציב משרד החינוך"
            ]
        }

    # For count queries, auto-increase limit to fetch ALL records for accurate totals
    if is_count_query:
        limit = 100  # Max allowed - get as many as possible for aggregation
        await ctx.info(f"Count query detected ('כמה/how many'), using limit={limit} for aggregation")
    else:
        limit = min(max(1, limit), 100)
    offset = max(0, offset)

    # Step 1: Find relevant resources from local map
    if not RESOURCES_MAP:
        return {"error": "Resource map not loaded. DataGov offline search unavailable."}

    try:
        candidates = suggest_for_query(query, RESOURCES_MAP, limit=5)
    except Exception as e:
        # Graceful error - never expose raw exceptions to user
        await ctx.info(f"Query processing error: {str(e)}")
        return {
            "status": "error",
            "message": "Unable to process query. Please try rephrasing your question.",
            "suggestion": "Use simpler terms or try the perplexity_ask tool for general queries.",
            "recommended_tool": "perplexity_ask",
            "recommended_query": f"{query} Israel government data"
        }

    # =========================================================================
    # ENTERPRISE FALLBACK: Query Rephrasing on No/Low Match
    # =========================================================================
    MIN_CONFIDENCE = 0.35  # Below this, try rephrasing

    # Check if we need fallback
    initial_candidates = candidates.get("candidates", [])
    initial_score = initial_candidates[0].get("score", 0) if initial_candidates else 0
    used_rephrase = None

    if not initial_candidates or initial_score < MIN_CONFIDENCE:
        # Try query rephrasing before giving up
        await ctx.info(f"Low confidence ({initial_score:.2f}), trying rephrased queries...")

        for alt_query in rephrase_query(query):
            try:
                alt_result = suggest_for_query(alt_query, RESOURCES_MAP, limit=5)
                alt_candidates = alt_result.get("candidates", [])

                if alt_candidates and alt_candidates[0].get("score", 0) >= MIN_CONFIDENCE:
                    # Found a better match with rephrased query
                    await ctx.info(f"✓ Matched via rephrased query: '{alt_query}' (score: {alt_candidates[0].get('score', 0):.2f})")
                    candidates = alt_result
                    used_rephrase = alt_query
                    break
            except Exception:
                continue  # Skip failed rephrase attempts

    # After rephrasing attempts, check if we still have no good match
    final_candidates = candidates.get("candidates", [])
    final_score = final_candidates[0].get("score", 0) if final_candidates else 0

    if not final_candidates or final_score < MIN_CONFIDENCE:
        # Check if query is too vague
        vague_suggestion = get_category_suggestion(query)
        if vague_suggestion:
            return {
                "status": "query_too_vague",
                "message": vague_suggestion,
                "suggestion": "Please provide more specific search terms."
            }

        # Truly no match - suggest Perplexity as fallback
        return {
            "status": "not_in_datagov",
            "message": f"No matching datasets found in the 1187 DataGov resources for: '{query}'",
            "explanation": "This information may not be available in Israeli government open data.",
            "suggestion": "Use perplexity_ask tool to search the web for this information.",
            "recommended_tool": "perplexity_ask",
            "recommended_query": f"{query} ישראל נתונים סטטיסטיקה",
            "decomposition": candidates.get("decomposition", {})
        }

    # Phase 1 Enhancement: Extract field intents EARLY for filtering
    early_field_intents = extract_field_intents(query)

    # Phase 1 Enhancement: Filter candidates by field availability BEFORE selection
    if early_field_intents:
        original_count = len(candidates["candidates"])
        candidates["candidates"] = filter_by_field_availability(
            candidates["candidates"],
            early_field_intents
        )
        filtered_count = len(candidates["candidates"])
        if filtered_count < original_count:
            await ctx.info(f"Filtered {original_count} -> {filtered_count} resources (require: {early_field_intents})")

    # Step 2: Select best resource (prefer CSV/JSON with datastore support)
    best = None
    for c in candidates["candidates"]:
        fmt = (c.get("format") or "").upper()
        if fmt in ("CSV", "JSON", "XLSX") and c.get("score", 0) > 0.1:
            best = c
            break

    if not best:
        best = candidates["candidates"][0]

    resource_id = best.get("resource_id")
    if not resource_id:
        return {"error": "No valid resource_id found in candidates"}

    # Confidence-based warning for low scores
    best_score = best.get("score", 0)
    confidence_warning = None
    if best_score < 0.35:
        confidence_warning = {
            "level": "low",
            "message": "No dataset closely matches your query. Results may not be relevant.",
            "suggestion": "Try more specific Hebrew terms or different keywords.",
            "alternatives": [c.get("dataset_title", "?")[:40] for c in candidates["candidates"][:3]]
        }
        await ctx.info(f"⚠️ Low confidence match (score: {best_score:.2f})")
    elif best_score < 0.5:
        confidence_warning = {
            "level": "medium",
            "message": "Partial match found. Review results to confirm relevance.",
            "score": best_score
        }
        await ctx.info(f"⚠️ Medium confidence match (score: {best_score:.2f})")

    await ctx.info(f"Selected resource: {best.get('dataset_title', 'Unknown')[:40]}... (score: {best.get('score')})")

    # Step 2.5: Extract query components
    decomposed = _decompose_query(query)
    location_tokens = decomposed.get("location_tokens", [])
    # subject_tokens available in decomposed for debugging if needed

    # Step 2.6: Extract field intents (what columns user wants)
    field_intents = extract_field_intents(query)
    await ctx.info(f"Field intents detected: {field_intents}")

    # Step 2.7: Fetch schema and validate requested fields
    schema_info = _fetch_resource_schema(resource_id)
    schema_fields = schema_info.get("field_names", [])
    missing_fields_warning = None
    selected_fields = None

    if field_intents and schema_fields:
        # Phase 4 Enhancement: Try semantic field mapping FIRST (most accurate)
        matched_fields = []
        missing_intents = []

        for intent in field_intents:
            # Try semantic matching first (e.g., "phone" -> "טלפון_מוסד")
            semantic_name = get_semantic_field_name(resource_id, intent)
            if semantic_name and semantic_name in schema_fields:
                matched_fields.append(semantic_name)
                await ctx.info(f"Semantic match: {intent} -> {semantic_name}")
            else:
                # Fallback to pattern matching
                field_match_result = match_fields_to_schema([intent], schema_fields)
                pattern_matched = field_match_result.get("matched_fields", [])
                if pattern_matched:
                    matched_fields.extend(pattern_matched)
                else:
                    missing_intents.append(intent)

        if missing_intents:
            # User requested fields that don't exist in this dataset
            missing_fields_warning = {
                "warning": f"The requested fields ({', '.join(missing_intents)}) are not available in this dataset.",
                "available_fields": schema_fields,
                "matched_fields": matched_fields if matched_fields else "None",
                "suggestion": "This dataset may not contain the information you're looking for. "
                              "Consider searching for a different dataset or removing field requirements."
            }
            await ctx.info(f"Missing fields: {missing_intents}. Available: {schema_fields[:5]}...")

        if matched_fields:
            # Use matched fields for selective query (reduces data transfer)
            selected_fields = matched_fields
            await ctx.info(f"Will select fields: {selected_fields}")

    # Build location filter values (Hebrew and English variants)
    location_filter_values = []
    for loc in location_tokens:
        loc_lower = loc.lower()
        if loc_lower in LOCATION_FILTER_VALUES:
            location_filter_values.extend(LOCATION_FILTER_VALUES[loc_lower])
        else:
            # Add the original token as-is
            location_filter_values.append(loc)

    await ctx.info(f"Location filter: {location_tokens} -> {location_filter_values[:5] if location_filter_values else 'none'}...")

    # Step 3: Fetch data from datastore with retry logic
    max_retries = 2
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            params = {
                "resource_id": resource_id,
                "limit": limit,
                "offset": offset,
                "include_total": True,
            }

            # Apply field selection if we have matched fields
            if selected_fields:
                params["fields"] = ",".join(selected_fields)

            # Apply location filtering if we have location tokens
            if location_filter_values:
                # Use simple full-text search with Hebrew location name
                # CKAN's full-text search works best with plain text (not OR syntax)
                # Prioritize Hebrew location name for Israeli government data
                hebrew_location = None
                for val in location_filter_values:
                    # Find the first Hebrew value (non-ASCII)
                    if any(ord(c) > 127 for c in val):
                        hebrew_location = val
                        break

                if hebrew_location:
                    params["q"] = hebrew_location
                    # Use plain=True for simple substring matching
                    params["plain"] = True

            response = _http("GET", "/action/datastore_search", params=params)

            if response.status_code == 403:
                last_error = "Access denied (403). The resource may require special permissions or IP is blocked."
                await ctx.info(f"403 error on attempt {attempt + 1}, retrying...")
                time.sleep(0.5)
                continue

            if response.status_code == 404:
                return {
                    "error": "Resource not found in datastore. It may not support direct queries.",
                    "resource_id": resource_id,
                    "dataset": best.get("dataset_title"),
                    "suggestion": "Try a different resource format (CSV/JSON) or use package_show for metadata."
                }

            response.raise_for_status()
            data = response.json()
            break

        except Exception as e:
            last_error = str(e)
            if attempt < max_retries:
                await ctx.info(f"Error on attempt {attempt + 1}: {last_error}, retrying...")
                time.sleep(0.5)
            continue
    else:
        return {
            "error": f"Failed to fetch data after {max_retries + 1} attempts: {last_error}",
            "resource_id": resource_id,
            "dataset": best.get("dataset_title"),
        }

    if not data.get("success"):
        return {"error": data.get("error", {}).get("message", "Unknown API error")}

    result = data.get("result", {})
    records = result.get("records", [])
    fields = result.get("fields", [])
    total = result.get("total", len(records))

    # Step 4: Calculate aggregates for count queries (כמה/how many)
    aggregates = None
    if is_count_query and records:
        aggregates = _calculate_aggregates(records, fields)
        if aggregates:
            await ctx.info(f"Calculated aggregates for {len(aggregates)} numeric fields")

    # Step 5: Format output
    if format_output:
        output = _format_as_markdown(records, fields, best, total, limit, offset, aggregates)
    else:
        output = {
            "records": records,
            "fields": [f.get("id") for f in fields if f.get("id") != "_id"],
            "total": total,
        }
        # Include aggregates in JSON output too
        if aggregates:
            output["aggregates"] = aggregates

    response_data = {
        "data": output,
        "metadata": {
            "query": query,
            "resource_id": resource_id,
            "dataset_title": best.get("dataset_title"),
            "resource_title": best.get("resource_title"),
            "format": best.get("format"),
            "organization": best.get("organization"),
            "total_records": total,
            "returned": len(records),
            "offset": offset,
            "has_more": (offset + len(records)) < total,
            "score": best.get("score"),
            "location_filter": location_tokens if location_tokens else None,
            "filter_applied": bool(location_filter_values),
            "schema_fields": schema_fields[:15] if schema_fields else None,  # Show first 15 fields
            "field_intents_detected": field_intents if field_intents else None,
            "is_count_query": is_count_query,  # Flag for the model
        }
    }

    # Add aggregates summary to metadata for easy access
    if aggregates:
        response_data["summary_totals"] = aggregates
        response_data["metadata"]["aggregation_note"] = (
            "SUMMARY TOTALS are pre-calculated above. "
            "Use these values directly to answer 'how many' questions. "
            "DO NOT paginate to recalculate - the totals are already computed!"
        )

    # Add missing fields warning if applicable
    if missing_fields_warning:
        response_data["field_availability"] = missing_fields_warning

    # Add confidence warning if applicable
    if confidence_warning:
        response_data["confidence_warning"] = confidence_warning

    # Add rephrase info if query was rephrased for better match
    if used_rephrase:
        response_data["metadata"]["rephrased_query"] = used_rephrase
        response_data["metadata"]["original_query"] = query

    return response_data


if __name__ == "__main__":
    mcp.run()
