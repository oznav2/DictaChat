# MCP-DOCLING COMPREHENSIVE IMPLEMENTATION PLAN

## Document Information

- **Created**: 2025-12-29
- **Reference**: `/home/ilan/BricksLLM/add_mcp_guidelines.md` (4,431 lines, 24 sections)
- **Target Directory**: `/home/ilan/BricksLLM/docling-mcp/`
- **Existing Docling Service**: `localhost:5001` (already running in Docker)

---

## PART 1: PRE-INTEGRATION ANALYSIS (Sections 1-4)

### Section 1: What Makes Enterprise-Grade Integration

The Docling MCP MUST implement all 7 enterprise features:

| Feature | Docling Implementation |
|---------|----------------------|
| **Graceful Error Handling** | All errors wrapped in Hebrew guidance with WHAT/WHY/WHAT TO DO format |
| **Cascade Fallback** | `docling_convert` → `docling_ocr` → `fetch` chain |
| **Parameter Normalization** | Auto-fix `file_path`/`path`/`document`, format aliases |
| **Hebrew Intent Detection** | Document-related Hebrew patterns (המר מסמך, חלץ טבלאות) |
| **Smart Tool Selection** | Priority-based selection for document operations |
| **Progress Indicators** | Hebrew messages during conversion (מעבד את המסמך...) |
| **Tool Capability Awareness** | Model can describe document processing capabilities |

### Section 2: Pre-Integration Analysis Checklist

**2.1 API Documentation**
- **Base URL**: `http://dicta-docling:5001/v1` (internal Docker)
- **Documentation**: Docling API endpoints
- **Auth Method**: None (internal service)

**2.2 Tools to Expose**

| Tool Name | Description | Parameters | Response Type |
|-----------|-------------|------------|---------------|
| `docling_convert` | Convert document to markdown/JSON/text | `file_path`, `format`, `ocr_enabled` | markdown/json |
| `docling_convert_url` | Convert document from URL | `url`, `format`, `ocr_enabled` | markdown/json |
| `docling_extract_tables` | Extract tables from document | `file_path`, `output_format` | json/csv/markdown |
| `docling_extract_images` | Extract and describe images | `file_path`, `classify` | json with base64 |
| `docling_ocr` | OCR scanned document | `file_path`, `language` | text |
| `docling_status` | Check async job status | `task_id` | json |
| `docling_list_formats` | List supported formats | None | json |

**2.3 Intent Signals**

- **Hebrew**: המר, קרא, חלץ, סרוק, פתח, מסמך, קובץ, טבלה, תמונה, PDF
- **English**: convert, read, extract, scan, open, document, file, table, image, PDF

**2.4 Fallback Chain**

```
Primary: docling_convert
  → Fallback 1: docling_ocr (if conversion fails)
  → Fallback 2: fetch (if URL-based document)
```

**2.5 Latency Characteristics**

| Tool | Typical | Timeout | Category |
|------|---------|---------|----------|
| `docling_convert` | 5s | 300s | slow |
| `docling_extract_tables` | 3s | 120s | medium |
| `docling_ocr` | 10s | 300s | slow |
| `docling_list_formats` | 100ms | 5s | fast |

### Section 3: Architecture Understanding

**3.1 Integration Points in runMcpFlow.ts**

The Docling MCP integrates at the same level as DataGov:
1. Tools listed via `getOpenAiToolsForMcp()` from MCP server
2. Intent detection via `filterToolsByIntent()` with Hebrew patterns
3. Execution via `executeToolCalls()` through MCP SSE proxy
4. Error handling via `toGracefulError()` with Hebrew messages

**3.2 Data Flow**

```
User uploads document
    ↓
Frontend (prepareFiles.ts)
    ↓
Detects document MIME type (PDF, DOCX, etc.)
    ↓
Calls Docling MCP via MCP-SSE-Proxy
    ↓
docling-mcp/server.py receives request
    ↓
query_helper.py processes intent
    ↓
Calls Docling REST API at :5001
    ↓
Returns structured markdown/JSON
    ↓
runMcpFlow.ts injects into conversation
```

### Section 4: Step-by-Step Integration Process

**Step 1: Create MCP Server Folder Structure**
```
docling-mcp/
├── __init__.py
├── server.py                    # FastMCP server (main entry)
├── query_helper.py              # Document intelligence & routing
├── document_expansions.py       # Hebrew↔English semantic terms
├── requirements.txt             # Python dependencies
├── README.md                    # Documentation
└── tests/
    ├── test_server.py
    └── test_query_helper.py
```

**Step 2: Implement MCP Server** (see Section 5)

**Step 3: Register Tool Intelligence** (see Section 6)

**Step 4: Register Parameter Schema** (see Section 6)

**Step 5: Update Hebrew Intent Detector** (see Section 11)

**Step 6: Configure Docker** (see Section 7)

**Step 7: Add to MCP_SERVERS** (see Section 7)

**Step 8: Test & Validate** (see Section 8)

---

## PART 2: IMPLEMENTATION (Sections 5-10)

### Section 5: Helper Scripts to Create

#### 5.1 server.py - FastMCP Server

```python
#!/usr/bin/env python3
"""
Docling MCP Server - Enterprise Document Processing

Provides intelligent document conversion, table extraction, OCR,
and image classification via the Docling REST API.
"""

from mcp.server.fastmcp import FastMCP
import httpx
import asyncio
import os
from typing import Optional
from query_helper import DocumentHelper
from document_expansions import DOCUMENT_EXPANSIONS

mcp = FastMCP("docling")

DOCLING_BASE_URL = os.environ.get("DOCLING_BASE_URL", "http://dicta-docling:5001")
DOCLING_TIMEOUT = int(os.environ.get("DOCLING_TIMEOUT_MS", "300000")) / 1000

helper = DocumentHelper()

@mcp.tool()
async def docling_convert(
    file_path: str,
    format: str = "markdown",
    ocr_enabled: bool = True
) -> str:
    """
    Convert a document to structured text format.

    Supports: PDF, DOCX, PPTX, XLSX, HTML, images (PNG, JPG, TIFF)

    Args:
        file_path: Path to the document file
        format: Output format - "markdown", "json", or "text"
        ocr_enabled: Enable OCR for scanned documents (default: True)

    Returns:
        Converted document content in requested format

    Examples:
        - docling_convert("/uploads/report.pdf", "markdown")
        - docling_convert("/uploads/scan.jpg", "text", ocr_enabled=True)
    """
    return await helper.convert_document(file_path, format, ocr_enabled)


@mcp.tool()
async def docling_convert_url(
    url: str,
    format: str = "markdown",
    ocr_enabled: bool = True
) -> str:
    """
    Convert a document from URL to structured text format.

    Args:
        url: URL of the document to convert
        format: Output format - "markdown", "json", or "text"
        ocr_enabled: Enable OCR for scanned documents

    Returns:
        Converted document content
    """
    return await helper.convert_url(url, format, ocr_enabled)


@mcp.tool()
async def docling_extract_tables(
    file_path: str,
    output_format: str = "json"
) -> str:
    """
    Extract tables from a document.

    Args:
        file_path: Path to the document file
        output_format: Output format - "json", "csv", or "markdown"

    Returns:
        Extracted tables in requested format
    """
    return await helper.extract_tables(file_path, output_format)


@mcp.tool()
async def docling_extract_images(
    file_path: str,
    classify: bool = True
) -> str:
    """
    Extract and classify images from a document.

    Args:
        file_path: Path to the document file
        classify: Whether to classify image types (default: True)

    Returns:
        JSON with image metadata and optional classifications
    """
    return await helper.extract_images(file_path, classify)


@mcp.tool()
async def docling_ocr(
    file_path: str,
    language: str = "heb+eng"
) -> str:
    """
    Perform OCR on a scanned document or image.

    Args:
        file_path: Path to the scanned document or image
        language: OCR language(s) - "heb", "eng", "heb+eng", "ara+heb+eng"

    Returns:
        Recognized text content
    """
    return await helper.ocr_document(file_path, language)


@mcp.tool()
async def docling_status(task_id: str) -> str:
    """
    Check the status of an async conversion job.

    Args:
        task_id: The task ID returned from an async conversion

    Returns:
        Job status including progress and result if complete
    """
    return await helper.check_status(task_id)


@mcp.tool()
async def docling_list_formats() -> str:
    """
    List all supported document formats.

    Returns:
        JSON with supported input and output formats
    """
    return await helper.list_formats()


if __name__ == "__main__":
    mcp.run()
```

#### 5.2 query_helper.py - Document Intelligence

```python
#!/usr/bin/env python3
"""
Document Query Helper - Enterprise Document Intelligence

Provides:
- Document intent detection (Hebrew + English)
- Format detection and optimization
- Async polling for long conversions
- Result caching
- Error handling with Hebrew messages
"""

import os
import json
import re
import asyncio
import hashlib
import time
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import httpx
from document_expansions import DOCUMENT_EXPANSIONS

DOCLING_BASE_URL = os.environ.get("DOCLING_BASE_URL", "http://dicta-docling:5001")
DOCLING_TIMEOUT = int(os.environ.get("DOCLING_TIMEOUT_MS", "300000")) / 1000
CACHE_DIR = os.environ.get("DOCLING_CACHE_DIR", "/app/data/docling/cache")


class DocumentHelperError(Exception):
    """Base exception with Hebrew/English messages."""
    def __init__(self, message: str, hebrew_message: str, recovery_hint: str = None):
        self.message = message
        self.hebrew_message = hebrew_message
        self.recovery_hint = recovery_hint
        super().__init__(message)


class DocumentConversionError(DocumentHelperError):
    """Error during document conversion."""
    pass


class UnsupportedFormatError(DocumentHelperError):
    """Unsupported document format."""
    pass


class TimeoutError(DocumentHelperError):
    """Conversion timeout."""
    pass


# ============================================================================
# Section 21.1 Equivalent: Document Format Detection
# ============================================================================

SUPPORTED_FORMATS = {
    # Documents
    ".pdf": {"handler": "pdf", "ocr_default": True, "description": "PDF document"},
    ".docx": {"handler": "docx", "ocr_default": False, "description": "Word document"},
    ".doc": {"handler": "doc", "ocr_default": False, "description": "Legacy Word"},
    ".pptx": {"handler": "pptx", "ocr_default": False, "description": "PowerPoint"},
    ".ppt": {"handler": "ppt", "ocr_default": False, "description": "Legacy PowerPoint"},
    ".xlsx": {"handler": "xlsx", "ocr_default": False, "description": "Excel spreadsheet"},
    ".xls": {"handler": "xls", "ocr_default": False, "description": "Legacy Excel"},
    ".html": {"handler": "html", "ocr_default": False, "description": "HTML page"},
    ".htm": {"handler": "html", "ocr_default": False, "description": "HTML page"},

    # Images (OCR capable)
    ".png": {"handler": "image", "ocr_default": True, "description": "PNG image"},
    ".jpg": {"handler": "image", "ocr_default": True, "description": "JPEG image"},
    ".jpeg": {"handler": "image", "ocr_default": True, "description": "JPEG image"},
    ".tiff": {"handler": "image", "ocr_default": True, "description": "TIFF image"},
    ".tif": {"handler": "image", "ocr_default": True, "description": "TIFF image"},
    ".bmp": {"handler": "image", "ocr_default": True, "description": "BMP image"},

    # Audio (transcription)
    ".wav": {"handler": "audio", "ocr_default": False, "description": "WAV audio"},
    ".mp3": {"handler": "audio", "ocr_default": False, "description": "MP3 audio"},
    ".vtt": {"handler": "vtt", "ocr_default": False, "description": "VTT subtitles"},
}


# ============================================================================
# Section 21.2 Equivalent: Query Decomposition for Documents
# ============================================================================

def detect_document_intent(query: str) -> Dict[str, Any]:
    """
    Decompose query into document intent (WHAT) and target (WHERE).

    Example:
    "המר את המסמך לפורמט JSON" →
    {
        "intent": "CONVERT",
        "format": "json",
        "confidence": 0.95,
        "is_hebrew": True
    }
    """
    query_lower = query.lower()

    intents = {
        "CONVERT": {
            "hebrew": [r"המר", r"הפוך", r"שנה\s*פורמט", r"ייצא"],
            "english": [r"convert", r"transform", r"export", r"change.*format"]
        },
        "READ": {
            "hebrew": [r"קרא", r"הצג", r"פתח", r"ראה"],
            "english": [r"read", r"show", r"open", r"display", r"view"]
        },
        "EXTRACT_TABLES": {
            "hebrew": [r"חלץ\s*טבל", r"הוצא\s*טבל", r"מצא\s*טבל"],
            "english": [r"extract.*table", r"get.*table", r"find.*table"]
        },
        "EXTRACT_IMAGES": {
            "hebrew": [r"חלץ\s*תמונ", r"הוצא\s*תמונ"],
            "english": [r"extract.*image", r"get.*image", r"find.*image"]
        },
        "OCR": {
            "hebrew": [r"זהה\s*טקסט", r"סרוק", r"המר\s*תמונה\s*לטקסט", r"זיהוי\s*תווים"],
            "english": [r"ocr", r"recognize.*text", r"scan", r"text.*from.*image"]
        },
        "SUMMARIZE": {
            "hebrew": [r"סכם", r"תמצת", r"קצר"],
            "english": [r"summarize", r"brief", r"summary"]
        }
    }

    # Detect intent
    detected_intent = None
    confidence = 0.0
    is_hebrew = any(ord(c) >= 0x0590 and ord(c) <= 0x05FF for c in query)

    for intent_name, patterns in intents.items():
        all_patterns = patterns["hebrew"] + patterns["english"]
        for pattern in all_patterns:
            if re.search(pattern, query_lower, re.IGNORECASE):
                detected_intent = intent_name
                confidence = 0.9 if pattern in patterns["hebrew" if is_hebrew else "english"] else 0.7
                break
        if detected_intent:
            break

    # Detect target format
    format_patterns = {
        "markdown": [r"markdown", r"md", r"מרקדאון"],
        "json": [r"json", r"ג'ייסון"],
        "text": [r"text", r"txt", r"טקסט"],
        "csv": [r"csv"],
        "html": [r"html"]
    }

    target_format = "markdown"  # default
    for fmt, patterns in format_patterns.items():
        for pattern in patterns:
            if re.search(pattern, query_lower, re.IGNORECASE):
                target_format = fmt
                break

    return {
        "intent": detected_intent or "CONVERT",
        "format": target_format,
        "confidence": confidence if detected_intent else 0.5,
        "is_hebrew": is_hebrew,
        "original_query": query
    }


# ============================================================================
# Section 21.3 Equivalent: Hebrew Morphological Normalization
# ============================================================================

HEBREW_PREFIXES = ['ל', 'ב', 'מ', 'ה', 'ו', 'ש', 'כ']
HEBREW_PLURAL_SUFFIXES = ['ים', 'ות']


def get_hebrew_variants(word: str) -> List[str]:
    """
    Generate all morphological variants of a Hebrew word.

    Examples:
    "למסמך" → ["למסמך", "מסמך"]
    "קבצים" → ["קבצים", "קובץ"]
    """
    variants = [word]
    current = word

    # Strip prefixes
    for prefix in HEBREW_PREFIXES:
        if current.startswith(prefix) and len(current) > len(prefix) + 1:
            stripped = current[len(prefix):]
            variants.append(stripped)
            current = stripped

    # Strip plural suffixes
    for suffix in HEBREW_PLURAL_SUFFIXES:
        if current.endswith(suffix) and len(current) > len(suffix) + 1:
            singular = current[:-len(suffix)]
            variants.append(singular)

    return list(set(variants))


# ============================================================================
# Section 21.4 Equivalent: Bidirectional Expansion for Documents
# ============================================================================

def get_document_expansions(term: str) -> set:
    """
    Get bidirectional expansions for document-related terms.
    """
    from document_expansions import BIDIRECTIONAL_INDEX
    return BIDIRECTIONAL_INDEX.get(term.lower(), {term})


# ============================================================================
# Section 21.5 Equivalent: File Type Detection
# ============================================================================

def detect_file_type(file_path: str) -> Dict[str, Any]:
    """
    Detect file type and recommended processing options.
    """
    ext = Path(file_path).suffix.lower()

    if ext in SUPPORTED_FORMATS:
        info = SUPPORTED_FORMATS[ext]
        return {
            "supported": True,
            "extension": ext,
            "handler": info["handler"],
            "ocr_default": info["ocr_default"],
            "description": info["description"]
        }

    return {
        "supported": False,
        "extension": ext,
        "error": f"Unsupported format: {ext}",
        "hebrew_error": f"פורמט לא נתמך: {ext}",
        "suggestion": "Supported: PDF, DOCX, XLSX, PPTX, HTML, PNG, JPG, TIFF"
    }


# ============================================================================
# Section 21.6 Equivalent: Schema and Metadata
# ============================================================================

def get_document_schema(file_path: str) -> Dict[str, Any]:
    """
    Get metadata schema for a document.
    """
    file_info = detect_file_type(file_path)

    return {
        "file_path": file_path,
        "file_name": Path(file_path).name,
        "file_type": file_info,
        "processing_options": {
            "formats_available": ["markdown", "json", "text"],
            "ocr_available": file_info.get("handler") in ["image", "pdf"],
            "table_extraction": file_info.get("handler") in ["pdf", "docx", "xlsx", "html"],
            "image_extraction": file_info.get("handler") in ["pdf", "docx", "pptx"]
        }
    }


# ============================================================================
# Main DocumentHelper Class
# ============================================================================

class DocumentHelper:
    """Enterprise document processing with intelligent parsing."""

    def __init__(self):
        self.base_url = DOCLING_BASE_URL
        self.timeout = DOCLING_TIMEOUT
        self.cache = DocumentCache()

    async def convert_document(
        self,
        file_path: str,
        format: str = "markdown",
        ocr_enabled: bool = True
    ) -> str:
        """
        Convert document with enterprise features.

        1. Detect document type
        2. Check cache
        3. Apply format-specific optimizations
        4. Handle Hebrew/English content
        5. Cache results for reuse
        """
        # Validate file type
        file_info = detect_file_type(file_path)
        if not file_info["supported"]:
            raise UnsupportedFormatError(
                file_info["error"],
                file_info["hebrew_error"],
                file_info["suggestion"]
            )

        # Check cache
        cache_key = self.cache.get_cache_key(file_path, format, ocr_enabled)
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        # Call Docling API
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                # Start async conversion
                response = await client.post(
                    f"{self.base_url}/v1/convert/source/async",
                    json={
                        "source": file_path,
                        "options": {
                            "output_format": format,
                            "ocr_enabled": ocr_enabled,
                            "ocr_languages": ["heb", "eng"]
                        }
                    }
                )
                response.raise_for_status()
                task = response.json()
                task_id = task["task_id"]

                # Poll for completion
                result = await self._poll_until_complete(client, task_id)

                # Cache and return
                await self.cache.set(cache_key, result)
                return result

            except httpx.TimeoutException:
                raise TimeoutError(
                    f"Conversion timeout after {self.timeout}s",
                    f"עיבוד המסמך חרג מהזמן המותר ({int(self.timeout)} שניות)",
                    "Try a smaller document or simpler format"
                )
            except httpx.HTTPStatusError as e:
                raise DocumentConversionError(
                    f"Conversion failed: {e.response.status_code}",
                    "נכשל בהמרת המסמך",
                    "Ensure the file is not corrupted"
                )

    async def convert_url(
        self,
        url: str,
        format: str = "markdown",
        ocr_enabled: bool = True
    ) -> str:
        """Convert document from URL."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/v1/convert/url/async",
                json={
                    "url": url,
                    "options": {
                        "output_format": format,
                        "ocr_enabled": ocr_enabled
                    }
                }
            )
            response.raise_for_status()
            task = response.json()
            return await self._poll_until_complete(client, task["task_id"])

    async def extract_tables(
        self,
        file_path: str,
        output_format: str = "json"
    ) -> str:
        """Extract tables from document."""
        # First convert to get structured content
        result = await self.convert_document(file_path, "json", ocr_enabled=False)

        # Parse and extract tables
        doc = json.loads(result) if isinstance(result, str) else result
        tables = doc.get("tables", [])

        if output_format == "json":
            return json.dumps({"tables": tables, "count": len(tables)}, ensure_ascii=False, indent=2)
        elif output_format == "csv":
            return self._tables_to_csv(tables)
        elif output_format == "markdown":
            return self._tables_to_markdown(tables)

        return json.dumps(tables, ensure_ascii=False)

    async def extract_images(
        self,
        file_path: str,
        classify: bool = True
    ) -> str:
        """Extract and classify images from document."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/v1/extract/images",
                json={
                    "source": file_path,
                    "classify": classify
                }
            )
            response.raise_for_status()
            return json.dumps(response.json(), ensure_ascii=False, indent=2)

    async def ocr_document(
        self,
        file_path: str,
        language: str = "heb+eng"
    ) -> str:
        """Perform OCR on scanned document."""
        return await self.convert_document(
            file_path,
            format="text",
            ocr_enabled=True
        )

    async def check_status(self, task_id: str) -> str:
        """Check async job status."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{self.base_url}/v1/status/poll/{task_id}")
            response.raise_for_status()
            return json.dumps(response.json(), ensure_ascii=False, indent=2)

    async def list_formats(self) -> str:
        """List supported formats."""
        return json.dumps({
            "input_formats": list(SUPPORTED_FORMATS.keys()),
            "output_formats": ["markdown", "json", "text", "html"],
            "ocr_languages": ["heb", "eng", "ara", "heb+eng", "ara+heb+eng"],
            "features": {
                "table_extraction": True,
                "image_extraction": True,
                "ocr": True,
                "page_layout": True,
                "reading_order": True
            }
        }, ensure_ascii=False, indent=2)

    async def _poll_until_complete(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        poll_interval: float = 2.0
    ) -> str:
        """Poll conversion status until complete."""
        start = time.time()

        while time.time() - start < self.timeout:
            response = await client.get(f"{self.base_url}/v1/status/poll/{task_id}")
            status = response.json()

            if status["state"] == "completed":
                result_response = await client.get(f"{self.base_url}/v1/result/{task_id}")
                return result_response.text

            if status["state"] == "failed":
                raise DocumentConversionError(
                    status.get("error", "Unknown conversion error"),
                    "שגיאה בהמרת המסמך",
                    "Try a different format or check if file is corrupted"
                )

            await asyncio.sleep(poll_interval)

        raise TimeoutError(
            f"Polling timeout after {self.timeout}s",
            "עיבוד המסמך לקח יותר מדי זמן",
            "Try a smaller document"
        )

    def _tables_to_markdown(self, tables: List[dict]) -> str:
        """Convert tables to markdown format."""
        result = []
        for i, table in enumerate(tables):
            result.append(f"### Table {i+1}\n")
            if table.get("headers"):
                result.append("| " + " | ".join(table["headers"]) + " |")
                result.append("| " + " | ".join(["---"] * len(table["headers"])) + " |")
            for row in table.get("rows", []):
                result.append("| " + " | ".join(str(cell) for cell in row) + " |")
            result.append("")
        return "\n".join(result)

    def _tables_to_csv(self, tables: List[dict]) -> str:
        """Convert tables to CSV format."""
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)

        for table in tables:
            if table.get("headers"):
                writer.writerow(table["headers"])
            for row in table.get("rows", []):
                writer.writerow(row)
            writer.writerow([])  # Empty row between tables

        return output.getvalue()


# ============================================================================
# Section 21.17 Equivalent: Document Caching
# ============================================================================

class DocumentCache:
    """Cache converted documents to avoid redundant processing."""

    def __init__(self, cache_dir: str = CACHE_DIR):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_cache_key(self, file_path: str, format: str, ocr: bool) -> str:
        """Generate cache key from parameters."""
        try:
            file_hash = hashlib.md5(Path(file_path).read_bytes()).hexdigest()
        except Exception:
            file_hash = hashlib.md5(file_path.encode()).hexdigest()
        return f"{file_hash}_{format}_{ocr}"

    async def get(self, key: str) -> Optional[str]:
        """Get cached result if exists and not expired (24h)."""
        cache_file = self.cache_dir / f"{key}.cache"
        if cache_file.exists():
            if time.time() - cache_file.stat().st_mtime < 86400:
                return cache_file.read_text(encoding="utf-8")
        return None

    async def set(self, key: str, content: str) -> None:
        """Cache conversion result."""
        cache_file = self.cache_dir / f"{key}.cache"
        cache_file.write_text(content, encoding="utf-8")
```

#### 5.3 document_expansions.py - Semantic Terms

```python
#!/usr/bin/env python3
"""
Document Enterprise Expansions

Bidirectional semantic mappings for Hebrew↔English document processing.
Following the pattern from datagov/enterprise_expansions.py with 22 domains.
"""

from typing import Dict, Set, List

# ============================================================================
# Document-Related Semantic Domains (5 domains, ~200+ terms)
# ============================================================================

DOCUMENT_EXPANSIONS = {
    # Domain 1: Document Types
    "document_types": [
        "document", "מסמך", "file", "קובץ", "form", "טופס",
        "report", "דוח", "letter", "מכתב", "contract", "חוזה",
        "invoice", "חשבונית", "receipt", "קבלה", "certificate", "תעודה",
        "proposal", "הצעה", "memo", "תזכיר", "article", "מאמר",
        "thesis", "עבודה", "dissertation", "דיסרטציה", "book", "ספר",
        "manual", "מדריך", "guide", "הנחיות", "policy", "מדיניות",
        "agreement", "הסכם", "application", "בקשה", "license", "רישיון"
    ],

    # Domain 2: Document Actions
    "document_actions": [
        "convert", "המר", "transform", "הפוך", "export", "ייצא",
        "read", "קרא", "open", "פתח", "view", "הצג",
        "extract", "חלץ", "scan", "סרוק", "parse", "נתח",
        "analyze", "ניתוח", "summarize", "סכם", "translate", "תרגם",
        "edit", "ערוך", "save", "שמור", "print", "הדפס",
        "share", "שתף", "upload", "העלה", "download", "הורד",
        "merge", "מזג", "split", "פצל", "compress", "דחס"
    ],

    # Domain 3: Document Formats
    "document_formats": [
        "pdf", "PDF", "פי די אף",
        "word", "וורד", "docx", "doc",
        "excel", "אקסל", "xlsx", "xls", "spreadsheet", "גיליון",
        "powerpoint", "פאוורפוינט", "pptx", "ppt", "presentation", "מצגת",
        "image", "תמונה", "png", "jpg", "jpeg", "tiff",
        "text", "טקסט", "txt", "plain text",
        "html", "web", "אתר",
        "markdown", "md", "מרקדאון",
        "json", "ג'ייסון", "xml"
    ],

    # Domain 4: Document Content
    "document_content": [
        "table", "טבלה", "chart", "תרשים", "graph", "גרף",
        "image", "תמונה", "figure", "איור", "diagram", "דיאגרמה",
        "text", "טקסט", "paragraph", "פסקה", "sentence", "משפט",
        "heading", "כותרת", "title", "שם", "header", "ראש עמוד",
        "footer", "תחתית עמוד", "page", "עמוד", "section", "סעיף",
        "formula", "נוסחה", "equation", "משוואה", "code", "קוד",
        "list", "רשימה", "bullet", "תבליט", "number", "מספר",
        "footnote", "הערת שוליים", "reference", "הפניה", "citation", "ציטוט"
    ],

    # Domain 5: OCR Related
    "ocr_related": [
        "ocr", "זיהוי תווים", "optical character recognition",
        "scan", "סריקה", "scanned", "סרוק",
        "recognize", "זהה", "recognition", "זיהוי",
        "text from image", "טקסט מתמונה",
        "handwriting", "כתב יד", "printed", "מודפס",
        "hebrew", "עברית", "english", "אנגלית", "arabic", "ערבית",
        "language", "שפה", "multilingual", "רב לשוני"
    ]
}


# ============================================================================
# Section 21.4 Equivalent: Build Bidirectional Index
# ============================================================================

def _build_bidirectional_index(expansions: Dict[str, List[str]]) -> Dict[str, Set[str]]:
    """
    Build bidirectional mapping from unidirectional expansions.

    Input:
    {"document_types": ["document", "מסמך", "file", "קובץ"]}

    Output:
    {
        "document": {"document", "מסמך", "file", "קובץ", ...},
        "מסמך": {"document", "מסמך", "file", "קובץ", ...},
        ...
    }
    """
    bidirectional = {}

    for domain, values in expansions.items():
        all_terms = {v.lower() for v in values}

        for term in all_terms:
            if term in bidirectional:
                bidirectional[term].update(all_terms)
            else:
                bidirectional[term] = all_terms.copy()

    return bidirectional


# Pre-built at startup
BIDIRECTIONAL_INDEX = _build_bidirectional_index(DOCUMENT_EXPANSIONS)


def get_bidirectional_expansions(term: str) -> Set[str]:
    """Get all related terms for a given term."""
    return BIDIRECTIONAL_INDEX.get(term.lower(), {term})


def get_all_terms() -> int:
    """Count total terms across all domains."""
    return sum(len(terms) for terms in DOCUMENT_EXPANSIONS.values())


def expand_query(query: str) -> Set[str]:
    """
    Expand query with related terms from all matching domains.

    Args:
        query: User query in Hebrew or English

    Returns:
        Set of expanded terms
    """
    expanded = set()
    query_lower = query.lower()

    for domain, terms in DOCUMENT_EXPANSIONS.items():
        terms_lower = [t.lower() for t in terms]
        if any(term in query_lower for term in terms_lower):
            expanded.update(terms)

    return expanded


# Statistics
TOTAL_TERMS = get_all_terms()
TOTAL_DOMAINS = len(DOCUMENT_EXPANSIONS)
print(f"Document Expansions: {TOTAL_TERMS} terms in {TOTAL_DOMAINS} domains")
```

### Section 6: Frontend Integration Files

#### 6.1 toolIntelligenceRegistry.ts Entries

Add to `frontend-huggingface/src/lib/server/textGeneration/mcp/toolIntelligenceRegistry.ts`:

```typescript
// ============================================================================
// DOCLING MCP TOOLS (Following Section 18 Complete Specification)
// ============================================================================

docling_convert: {
    name: "docling_convert",
    patterns: [/^docling[_-]?convert$/i, /^convert[_-]?document$/i],
    mcpServer: "docling",
    displayName: "Document Converter",
    displayNameHebrew: "ממיר מסמכים",
    priority: 88,
    fallbackChain: ["docling_ocr", "fetch"],
    conflictsWith: [],
    latency: {
        typical: 5000,
        timeout: 300000,  // 5 minutes for large PDFs
        userFeedbackDelay: 2000,
        tier: "slow",
    },
    response: {
        typicalTokens: 5000,
        maxTokens: 50000,
        structured: false,
        requiresSummarization: true,
    },
    messages: {
        progress: "מעבד את המסמך...",
        progressEnglish: "Processing document...",
        noResults: "לא ניתן לעבד את המסמך. ודא שהקובץ תקין.",
        noResultsEnglish: "Could not process document. Ensure file is valid.",
        suggestion: "נסה פורמט אחר או ודא שהמסמך לא פגום",
        suggestionEnglish: "Try a different format or ensure document is not corrupted",
        gracefulFailure: "עיבוד המסמך נכשל. הנה מידע חלקי:",
        gracefulFailureEnglish: "Document processing failed. Here is partial info:",
    },
    intentSignals: {
        keywords: /convert|document|pdf|docx|המר|מסמך|קובץ|pdf|וורד/i,
        weight: 90,
        exclusive: false,
    },
},

docling_extract_tables: {
    name: "docling_extract_tables",
    patterns: [/^docling[_-]?extract[_-]?tables$/i, /^extract[_-]?tables$/i],
    mcpServer: "docling",
    displayName: "Table Extractor",
    displayNameHebrew: "מחלץ טבלאות",
    priority: 92,  // High priority for explicit table requests
    fallbackChain: ["docling_convert"],
    conflictsWith: [],
    latency: {
        typical: 3000,
        timeout: 120000,
        userFeedbackDelay: 1500,
        tier: "medium",
    },
    response: {
        typicalTokens: 3000,
        maxTokens: 30000,
        structured: true,
        requiresSummarization: false,
    },
    messages: {
        progress: "מחלץ טבלאות מהמסמך...",
        progressEnglish: "Extracting tables from document...",
        noResults: "לא נמצאו טבלאות במסמך.",
        noResultsEnglish: "No tables found in document.",
        suggestion: "ודא שהמסמך מכיל טבלאות בפורמט מובנה",
        gracefulFailure: "לא ניתן לחלץ טבלאות מהמסמך.",
    },
    intentSignals: {
        keywords: /table|טבלה|extract.*table|חלץ.*טבל|הוצא.*טבל/i,
        weight: 95,
        exclusive: false,
    },
},

docling_extract_images: {
    name: "docling_extract_images",
    patterns: [/^docling[_-]?extract[_-]?images$/i],
    mcpServer: "docling",
    displayName: "Image Extractor",
    displayNameHebrew: "מחלץ תמונות",
    priority: 85,
    fallbackChain: ["docling_convert"],
    conflictsWith: [],
    latency: {
        typical: 4000,
        timeout: 180000,
        userFeedbackDelay: 2000,
        tier: "medium",
    },
    response: {
        typicalTokens: 2000,
        maxTokens: 20000,
        structured: true,
        requiresSummarization: false,
    },
    messages: {
        progress: "מחלץ תמונות מהמסמך...",
        progressEnglish: "Extracting images from document...",
        noResults: "לא נמצאו תמונות במסמך.",
        suggestion: "ודא שהמסמך מכיל תמונות",
        gracefulFailure: "לא ניתן לחלץ תמונות.",
    },
    intentSignals: {
        keywords: /image|תמונה|extract.*image|חלץ.*תמונ/i,
        weight: 90,
        exclusive: false,
    },
},

docling_ocr: {
    name: "docling_ocr",
    patterns: [/^docling[_-]?ocr$/i, /^ocr$/i],
    mcpServer: "docling",
    displayName: "OCR Scanner",
    displayNameHebrew: "סורק OCR",
    priority: 90,
    fallbackChain: ["docling_convert"],
    conflictsWith: [],
    latency: {
        typical: 10000,
        timeout: 300000,
        userFeedbackDelay: 3000,
        tier: "slow",
    },
    response: {
        typicalTokens: 4000,
        maxTokens: 40000,
        structured: false,
        requiresSummarization: false,
    },
    messages: {
        progress: "מזהה טקסט במסמך הסרוק...",
        progressEnglish: "Recognizing text in scanned document...",
        noResults: "לא זוהה טקסט במסמך.",
        suggestion: "ודא שהתמונה ברורה ובאיכות טובה",
        gracefulFailure: "זיהוי הטקסט נכשל.",
    },
    intentSignals: {
        keywords: /ocr|scan|סרוק|זהה.*טקסט|recognize.*text|זיהוי\s*תווים/i,
        weight: 95,
        exclusive: false,
    },
},

docling_list_formats: {
    name: "docling_list_formats",
    patterns: [/^docling[_-]?list[_-]?formats$/i],
    mcpServer: "docling",
    displayName: "Format Lister",
    displayNameHebrew: "רשימת פורמטים",
    priority: 50,
    fallbackChain: [],
    conflictsWith: [],
    latency: {
        typical: 100,
        timeout: 5000,
        userFeedbackDelay: 500,
        tier: "fast",
    },
    response: {
        typicalTokens: 200,
        maxTokens: 500,
        structured: true,
        requiresSummarization: false,
    },
    messages: {
        progress: "מביא רשימת פורמטים נתמכים...",
        noResults: "לא ניתן לקבל רשימת פורמטים.",
        gracefulFailure: "שירות Docling אינו זמין.",
    },
    intentSignals: {
        keywords: /format|פורמט|supported|נתמך|list.*format/i,
        weight: 70,
        exclusive: false,
    },
},
```

#### 6.2 toolParameterRegistry.ts Entries

Add to `frontend-huggingface/src/lib/server/textGeneration/mcp/toolParameterRegistry.ts`:

```typescript
// ============================================================================
// DOCLING MCP PARAMETER SCHEMAS (Following Section 19)
// ============================================================================

{
    patterns: [/^docling[_-]?convert$/i],
    parameters: [
        {
            name: "file_path",
            type: "string",
            aliases: ["path", "file", "document", "source", "קובץ", "מסמך", "נתיב"],
            required: true,
            transform: "toString",
            description: "Path to the document file",
        },
        {
            name: "format",
            type: "string",
            aliases: ["output", "output_format", "type", "פורמט", "סוג"],
            default: "markdown",
            enum: ["markdown", "json", "text", "html"],
            transform: "toString",
            description: "Output format",
        },
        {
            name: "ocr_enabled",
            type: "boolean",
            aliases: ["ocr", "scan", "recognize", "סריקה", "זיהוי"],
            default: true,
            transform: "toBoolean",
            description: "Enable OCR for scanned documents",
        },
    ],
},

{
    patterns: [/^docling[_-]?convert[_-]?url$/i],
    parameters: [
        {
            name: "url",
            type: "string",
            aliases: ["link", "source", "קישור", "כתובת"],
            required: true,
            transform: "toString",
            description: "URL of the document",
        },
        {
            name: "format",
            type: "string",
            aliases: ["output", "output_format", "פורמט"],
            default: "markdown",
            enum: ["markdown", "json", "text"],
            transform: "toString",
        },
        {
            name: "ocr_enabled",
            type: "boolean",
            aliases: ["ocr", "scan"],
            default: true,
            transform: "toBoolean",
        },
    ],
},

{
    patterns: [/^docling[_-]?extract[_-]?tables$/i],
    parameters: [
        {
            name: "file_path",
            type: "string",
            aliases: ["path", "file", "document", "קובץ", "מסמך"],
            required: true,
            transform: "toString",
        },
        {
            name: "output_format",
            type: "string",
            aliases: ["format", "type", "פורמט"],
            default: "json",
            enum: ["json", "csv", "markdown"],
            transform: "toString",
        },
    ],
},

{
    patterns: [/^docling[_-]?extract[_-]?images$/i],
    parameters: [
        {
            name: "file_path",
            type: "string",
            aliases: ["path", "file", "document", "קובץ"],
            required: true,
            transform: "toString",
        },
        {
            name: "classify",
            type: "boolean",
            aliases: ["classification", "סיווג"],
            default: true,
            transform: "toBoolean",
        },
    ],
},

{
    patterns: [/^docling[_-]?ocr$/i],
    parameters: [
        {
            name: "file_path",
            type: "string",
            aliases: ["path", "file", "image", "קובץ", "תמונה"],
            required: true,
            transform: "toString",
        },
        {
            name: "language",
            type: "string",
            aliases: ["lang", "languages", "שפה", "שפות"],
            default: "heb+eng",
            enum: ["heb", "eng", "ara", "heb+eng", "ara+heb+eng"],
            transform: "toString",
        },
    ],
},

{
    patterns: [/^docling[_-]?status$/i],
    parameters: [
        {
            name: "task_id",
            type: "string",
            aliases: ["id", "job_id", "task"],
            required: true,
            transform: "toString",
        },
    ],
},
```

#### 6.3 TOOL_CATEGORIES Update

Add to `toolIntelligenceRegistry.ts` TOOL_CATEGORIES:

```typescript
documents: {
    name: "Document Processing",
    hebrewName: "עיבוד מסמכים",
    description: "Convert, extract, and analyze documents",
    tools: [
        "docling_convert",
        "docling_convert_url",
        "docling_extract_tables",
        "docling_extract_images",
        "docling_ocr",
        "docling_list_formats"
    ],
},
```

#### 6.4 TOOL_PATTERNS Update

Add to `toolFilter.ts` TOOL_PATTERNS:

```typescript
docling: /^docling[_-]/i,
```

### Section 7: Docker Configuration

#### 7.1 MCP-SSE-Proxy Configuration

Add to `mcp-sse-proxy/config/servers.json`:

```json
"docling-mcp": {
    "type": "stdio",
    "command": "sh",
    "args": [
        "-c",
        ". /opt/docling-mcp-venv/bin/activate && python -m docling_mcp.server"
    ],
    "env": {
        "DOCLING_BASE_URL": "http://dicta-docling:5001",
        "DOCLING_TIMEOUT_MS": "300000",
        "DOCLING_CACHE_DIR": "/app/data/docling",
        "PYTHONIOENCODING": "utf-8"
    }
}
```

#### 7.2 Docker Compose Updates

Add volume mounts to `mcp-sse-proxy` service in `docker-compose.yml`:

```yaml
volumes:
  - ./docling-mcp:/opt/docling-mcp:ro
  - docling_cache:/app/data/docling
```

#### 7.3 requirements.txt

```
mcp>=1.0.0
httpx>=0.27.0
aiofiles>=23.0.0
```

### Section 8: Testing & Validation

#### 8.1 Unit Tests (test_server.py)

```python
import pytest
from docling_mcp.server import mcp
from docling_mcp.query_helper import detect_document_intent, get_hebrew_variants

class TestDocumentIntentDetection:
    def test_convert_intent_hebrew(self):
        result = detect_document_intent("המר את המסמך לפורמט JSON")
        assert result["intent"] == "CONVERT"
        assert result["format"] == "json"
        assert result["is_hebrew"] == True

    def test_extract_tables_intent_english(self):
        result = detect_document_intent("extract tables from this PDF")
        assert result["intent"] == "EXTRACT_TABLES"

    def test_ocr_intent(self):
        result = detect_document_intent("סרוק את התמונה וזהה טקסט")
        assert result["intent"] == "OCR"

class TestHebrewVariants:
    def test_strip_prefix(self):
        variants = get_hebrew_variants("למסמך")
        assert "מסמך" in variants

    def test_strip_plural(self):
        variants = get_hebrew_variants("קבצים")
        assert "קבצ" in variants or "קובץ" in variants

@pytest.mark.asyncio
async def test_list_formats():
    result = await mcp.call_tool("docling_list_formats", {})
    assert "input_formats" in result
    assert ".pdf" in result["input_formats"]
```

#### 8.2 Integration Tests

```bash
# Test MCP connection
curl -X POST http://localhost:3010/mcp/docling-mcp/tools/docling_list_formats \
  -H 'Content-Type: application/json'

# Test document conversion
curl -X POST http://localhost:3010/mcp/docling-mcp/tools/docling_convert \
  -H 'Content-Type: application/json' \
  -d '{"file_path": "/app/uploads/test.pdf", "format": "markdown"}'
```

### Section 9: Common Pitfalls to Avoid

| Pitfall | Prevention |
|---------|------------|
| Missing tool in registry | Add complete entry to `toolIntelligenceRegistry.ts` |
| Wrong parameter schema | Test all parameter aliases |
| Missing Hebrew patterns | Add to `hebrewIntentDetector.ts` |
| No fallback chain | Define `docling_convert` → `docling_ocr` → `fetch` |
| Raw error exposure | Use `toGracefulError()` pattern |
| UTF-8 encoding issues | Use `ensure_ascii=False` in all JSON responses |
| Timeout too short | Set 300s for OCR operations |

### Section 10: Reference - DataGov Implementation

Follow these patterns from DataGov:

1. **Browser Impersonation** - Not needed for internal Docling service
2. **Query Decomposition** - Implemented in `detect_document_intent()`
3. **Hebrew Morphology** - Implemented in `get_hebrew_variants()`
4. **Bidirectional Index** - Implemented in `document_expansions.py`
5. **Caching** - Implemented in `DocumentCache` class
6. **Graceful Errors** - Implemented with Hebrew messages

---

## PART 3: ENTERPRISE FEATURES (Sections 11-16)

### Section 11: Hebrew Intent Detection System

**Document-Specific Hebrew Patterns:**

```typescript
// Add to hebrewIntentDetector.ts

const DOCUMENT_SEMANTIC_EXPANSIONS = {
    "document_processing": [
        "מסמך", "document", "קובץ", "file", "pdf", "וורד", "word",
        "אקסל", "excel", "מצגת", "powerpoint", "תמונה", "image"
    ],
    "document_actions": [
        "המר", "convert", "קרא", "read", "חלץ", "extract",
        "סרוק", "scan", "פתח", "open", "הצג", "display"
    ],
    "document_content": [
        "טבלה", "table", "תמונה", "image", "טקסט", "text",
        "כותרת", "heading", "עמוד", "page", "פסקה", "paragraph"
    ],
};
```

### Section 12: Parameter Normalization System

**Docling-Specific Transforms:**

| Parameter | Aliases | Transform |
|-----------|---------|-----------|
| `file_path` | path, file, document, source, קובץ, מסמך, נתיב | toString |
| `format` | output, output_format, type, פורמט, סוג | toString |
| `ocr_enabled` | ocr, scan, recognize, סריקה, זיהוי | toBoolean |
| `language` | lang, languages, שפה, שפות | toString |

### Section 13: Cascade Fallback System

```typescript
// Docling fallback chains
const DOCLING_FALLBACK_CHAINS = {
    "docling_convert": ["docling_ocr", "fetch"],
    "docling_extract_tables": ["docling_convert"],
    "docling_extract_images": ["docling_convert"],
    "docling_ocr": ["docling_convert"],
};
```

### Section 14: Graceful Error Handling

```python
# Error messages for Docling
DOCLING_ERROR_MESSAGES = {
    "conversion_failed": {
        "english": "Failed to convert document: {details}",
        "hebrew": "נכשל בהמרת המסמך: {details}",
        "recovery": "Try a different format or ensure the file is not corrupted"
    },
    "unsupported_format": {
        "english": "Unsupported document format: {format}",
        "hebrew": "פורמט מסמך לא נתמך: {format}",
        "recovery": "Supported formats: PDF, DOCX, XLSX, PPTX, HTML, images"
    },
    "ocr_failed": {
        "english": "OCR processing failed: {details}",
        "hebrew": "עיבוד OCR נכשל: {details}",
        "recovery": "Ensure the image is clear and properly oriented"
    },
    "timeout": {
        "english": "Document processing timed out after {seconds}s",
        "hebrew": "עיבוד המסמך חרג מהזמן המותר ({seconds} שניות)",
        "recovery": "Try a smaller document or simpler format"
    },
    "file_not_found": {
        "english": "File not found: {path}",
        "hebrew": "הקובץ לא נמצא: {path}",
        "recovery": "Check the file path and ensure the file exists"
    }
}
```

### Section 15: Tool Capability Awareness

```typescript
// Add to capability manifest generation
const DOCLING_CAPABILITIES = {
    category: "documents",
    hebrewName: "עיבוד מסמכים",
    description: "Converts and analyzes documents (PDF, Word, Excel, images)",
    hebrewDescription: "ממיר ומנתח מסמכים (PDF, וורד, אקסל, תמונות)",
    tools: [
        {
            name: "docling_convert",
            description: "Convert documents to markdown/JSON/text",
            hebrewDescription: "המר מסמכים לפורמט מרקדאון/JSON/טקסט"
        },
        {
            name: "docling_extract_tables",
            description: "Extract tables from documents",
            hebrewDescription: "חלץ טבלאות ממסמכים"
        },
        {
            name: "docling_ocr",
            description: "OCR for scanned documents (Hebrew/English)",
            hebrewDescription: "זיהוי טקסט במסמכים סרוקים (עברית/אנגלית)"
        }
    ]
};
```

### Section 16: Loop Detection & Safety

**Docling-specific loop prevention:**

```typescript
// Semantic hash for document operations
function generateDoclingHash(toolCall: ToolCall): string {
    const { file_path, format, ocr_enabled } = toolCall.arguments;
    return `docling:${file_path}:${format}:${ocr_enabled}`;
}

// Max repeated calls
const MAX_DOCLING_RETRIES = 2;  // Don't retry OCR more than twice
```

---

## PART 4: COMPLETE SPECIFICATIONS (Sections 17-21)

### Section 17: Complete Data Flow Architecture

```
User uploads document to Frontend (8003)
    │
    ├── prepareFiles.ts detects MIME type
    │   (PDF, DOCX, XLSX, PPTX, PNG, JPG)
    │
    ├── If document type → Call Docling MCP
    │   │
    │   └── runMcpFlow.ts orchestrates
    │       │
    │       ├── filterToolsByIntent() selects docling tools
    │       ├── buildToolPreprompt() includes docling in capabilities
    │       ├── LLM decides: docling_convert or docling_extract_tables
    │       │
    │       └── executeToolCalls() via toolInvocation.ts
    │           │
    │           ├── normalizeToolArgs() fixes parameters
    │           ├── callMcpTool() → MCP-SSE-Proxy
    │           │   │
    │           │   └── docling-mcp/server.py
    │           │       │
    │           │       ├── query_helper.py processes intent
    │           │       └── Calls Docling REST API (:5001)
    │           │           │
    │           │           ├── POST /v1/convert/source/async
    │           │           ├── GET /v1/status/poll/{task_id}
    │           │           └── GET /v1/result/{task_id}
    │           │
    │           └── Returns structured markdown/JSON
    │
    └── Result injected into conversation context
```

### Section 18: ToolIntelligence Interface - Docling Complete

See Section 6.1 for complete `docling_convert`, `docling_extract_tables`, `docling_extract_images`, `docling_ocr`, and `docling_list_formats` specifications.

### Section 19: Parameter Normalization Reference

See Section 6.2 for complete parameter schemas with all aliases and transforms.

### Section 20: All Error Categories

| Error Type | Detection | Hebrew Message | Recovery |
|------------|-----------|----------------|----------|
| Timeout | `ETIMEDOUT`, `timeout` | עיבוד המסמך חרג מהזמן | Try smaller document |
| Connection | `ECONNREFUSED` | שירות Docling אינו זמין | Wait and retry |
| Not Found | `404`, file not found | הקובץ לא נמצא | Check file path |
| Validation | `400`, invalid params | חסר מידע לביצוע הפעולה | Provide all required params |
| Format | unsupported format | פורמט לא נתמך | Use PDF, DOCX, etc. |
| OCR | OCR failed | זיהוי טקסט נכשל | Use clearer image |

### Section 21: DataGov Enterprise Methods - Docling Equivalents

| DataGov Method | Docling Equivalent |
|----------------|-------------------|
| 21.1 Browser Impersonation | Not needed (internal service) |
| 21.2 Query Decomposition | `detect_document_intent()` |
| 21.3 Hebrew Morphology | `get_hebrew_variants()` |
| 21.4 Bidirectional Index | `BIDIRECTIONAL_INDEX` in document_expansions.py |
| 21.5 Count Query Detection | Not applicable |
| 21.6 Enterprise Schemas | `get_document_schema()` |
| 21.7 Semantic Field Mapping | Format detection |
| 21.8 Field Intent Extraction | `detect_document_intent()` |
| 21.9 Field Availability Filtering | `detect_file_type()` |
| 21.10 Query Rephrasing | Format fallback suggestions |
| 21.11 Subject-First Scoring | Intent-based tool selection |
| 21.12 Location Filter Values | Not applicable |
| 21.13 Hebrew Prefix Stripping | `get_hebrew_variants()` |
| 21.14 Format Preference | OCR default settings |
| 21.15 Keyword Index | Document expansion terms |
| 21.16 Category Suggestion | Suggest supported formats |
| 21.17 Resource Scoring | Tool priority scoring |
| 21.18 Markdown Formatting | `_tables_to_markdown()` |
| 21.19 Retry Logic | `_poll_until_complete()` with retries |
| 21.20 Pre-loaded Map | `SUPPORTED_FORMATS` dictionary |

---

## PART 5: OPERATIONS & TESTING (Sections 22-24)

### Section 22: Troubleshooting Guide

#### Common Issues

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Docling container not running | `docker ps \| grep docling` | `docker restart dicta-docling` |
| MCP-SSE-Proxy can't reach Docling | Check Docker network | Ensure both on `bricksllm-network` |
| OCR returns empty | Check image quality | Use higher resolution image |
| Hebrew text garbled | Check encoding | Use `ensure_ascii=False` |
| Timeout on large PDFs | Check VRAM/memory | Increase timeout or split PDF |

### Section 23: Statistics & Metrics

| Metric | Target |
|--------|--------|
| Conversion Success Rate | >95% |
| OCR Accuracy (Hebrew) | >90% |
| Average Conversion Time | <10s for <10 page docs |
| Table Extraction Accuracy | >90% |
| First-Call Success | >90% |

### Section 24: Final Summary

#### Implementation Checklist

**Layer 1: MCP Server**
- [ ] Create `docling-mcp/server.py` with 7 tools
- [ ] Create `docling-mcp/query_helper.py` with DocumentHelper class
- [ ] Create `docling-mcp/document_expansions.py` with 5 domains
- [ ] Create `docling-mcp/requirements.txt`

**Layer 2: Frontend Integration**
- [ ] Add 5 entries to `toolIntelligenceRegistry.ts`
- [ ] Add 6 parameter schemas to `toolParameterRegistry.ts`
- [ ] Add document category to `TOOL_CATEGORIES`
- [ ] Add docling pattern to `TOOL_PATTERNS`
- [ ] Add document expansions to `hebrewIntentDetector.ts`

**Layer 3: Docker Configuration**
- [ ] Add docling-mcp to `mcp-sse-proxy/config/servers.json`
- [ ] Add volume mounts to `docker-compose.yml`
- [ ] Create Python virtual environment in mcp-sse-proxy

**Layer 4: Testing**
- [ ] Unit tests for intent detection
- [ ] Unit tests for Hebrew variants
- [ ] Integration tests via curl
- [ ] End-to-end test with PDF upload

#### Key File Locations

| Purpose | Path |
|---------|------|
| MCP Server | `docling-mcp/server.py` |
| Query Helper | `docling-mcp/query_helper.py` |
| Expansions | `docling-mcp/document_expansions.py` |
| Tool Registry | `frontend-huggingface/.../toolIntelligenceRegistry.ts` |
| Parameter Registry | `frontend-huggingface/.../toolParameterRegistry.ts` |
| MCP Config | `mcp-sse-proxy/config/servers.json` |

#### Success Criteria

1. **Never show raw errors** - All wrapped in Hebrew guidance
2. **Auto-fix parameters** - file_path/path/document all work
3. **Cascade on failure** - convert → ocr → fetch
4. **Support Hebrew** - Intent detection + OCR + messages
5. **Provide progress** - "מעבד את המסמך..."
6. **Describe capabilities** - Model knows what Docling can do
7. **Handle timeouts** - 5 minutes for large OCR jobs
8. **Prevent loops** - Max 2 retries for same operation
9. **Format results** - Clean markdown tables
10. **Cache results** - 24-hour cache for conversions

---

**END OF COMPREHENSIVE DOCLING MCP IMPLEMENTATION PLAN**

*This plan maps all 24 sections and 20+ enterprise methods from add_mcp_guidelines.md to the Docling MCP implementation.*
