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
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Set
import httpx

from .document_expansions import BIDIRECTIONAL_INDEX

# Configuration
DOCLING_BASE_URL = os.environ.get("DOCLING_BASE_URL", "http://dicta-docling:5001")
DOCLING_TIMEOUT = int(os.environ.get("DOCLING_TIMEOUT_MS", "300000")) / 1000
CACHE_DIR = os.environ.get("DOCLING_CACHE_DIR", "/app/data/docling/cache")

logger = logging.getLogger(__name__)


# ============================================================================
# Exception Classes with Hebrew/English Messages
# ============================================================================

class DocumentHelperError(Exception):
    """Base exception with Hebrew/English messages."""

    def __init__(
        self,
        message: str,
        hebrew_message: str,
        recovery_hint: Optional[str] = None
    ):
        self.message = message
        self.hebrew_message = hebrew_message
        self.recovery_hint = recovery_hint
        super().__init__(message)

    def to_user_message(self) -> str:
        """Format error for end user with Hebrew message."""
        parts = [
            f"שגיאה: {self.hebrew_message}",
            f"Error: {self.message}"
        ]
        if self.recovery_hint:
            parts.append(f"הצעה: {self.recovery_hint}")
        return "\n".join(parts)


class DocumentConversionError(DocumentHelperError):
    """Error during document conversion."""
    pass


class UnsupportedFormatError(DocumentHelperError):
    """Unsupported document format."""
    pass


class DocumentTimeoutError(DocumentHelperError):
    """Conversion timeout."""
    pass


class DocumentFileNotFoundError(DocumentHelperError):
    """File not found."""
    pass


# ============================================================================
# Supported Formats (Section 21.1 Equivalent)
# ============================================================================

SUPPORTED_FORMATS: Dict[str, Dict[str, Any]] = {
    # Documents
    ".pdf": {"handler": "pdf", "ocr_default": True, "description": "PDF document"},
    ".docx": {"handler": "docx", "ocr_default": False, "description": "Word document"},
    ".doc": {"handler": "docx", "ocr_default": False, "description": "Legacy Word"},
    ".pptx": {"handler": "pptx", "ocr_default": False, "description": "PowerPoint"},
    ".ppt": {"handler": "pptx", "ocr_default": False, "description": "Legacy PowerPoint"},
    ".xlsx": {"handler": "xlsx", "ocr_default": False, "description": "Excel spreadsheet"},
    ".xls": {"handler": "xlsx", "ocr_default": False, "description": "Legacy Excel"},
    ".html": {"handler": "html", "ocr_default": False, "description": "HTML page"},
    ".htm": {"handler": "html", "ocr_default": False, "description": "HTML page"},
    ".md": {"handler": "md", "ocr_default": False, "description": "Markdown"},
    ".csv": {"handler": "csv", "ocr_default": False, "description": "CSV file"},

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

# Output format mapping
OUTPUT_FORMAT_MAP: Dict[str, str] = {
    "markdown": "md",
    "md": "md",
    "json": "json",
    "text": "text",
    "txt": "text",
    "html": "html",
    "docx": "docx",
}


# ============================================================================
# Query Decomposition (Section 21.2 Equivalent)
# ============================================================================

def detect_document_intent(query: str) -> Dict[str, Any]:
    """
    Decompose query into document intent (WHAT) and target (WHERE).

    Example:
    "המר את המסמך לפורמט JSON" ->
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
                lang_patterns = patterns["hebrew"] if is_hebrew else patterns["english"]
                confidence = 0.9 if pattern in lang_patterns else 0.7
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
# Hebrew Morphological Normalization (Section 21.3 Equivalent)
# ============================================================================

HEBREW_PREFIXES = ['ל', 'ב', 'מ', 'ה', 'ו', 'ש', 'כ']
HEBREW_PLURAL_SUFFIXES = ['ים', 'ות']


def get_hebrew_variants(word: str) -> List[str]:
    """
    Generate all morphological variants of a Hebrew word.

    Examples:
    "למסמך" -> ["למסמך", "מסמך"]
    "קבצים" -> ["קבצים", "קבצ"]
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
# Bidirectional Expansion (Section 21.4 Equivalent)
# ============================================================================

def get_document_expansions(term: str) -> Set[str]:
    """Get bidirectional expansions for document-related terms."""
    return BIDIRECTIONAL_INDEX.get(term.lower(), {term})


# ============================================================================
# File Type Detection (Section 21.5 Equivalent)
# ============================================================================

def detect_file_type(file_path: str) -> Dict[str, Any]:
    """Detect file type and recommended processing options."""
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
# Schema and Metadata (Section 21.6 Equivalent)
# ============================================================================

def get_document_schema(file_path: str) -> Dict[str, Any]:
    """Get metadata schema for a document."""
    file_info = detect_file_type(file_path)

    return {
        "file_path": file_path,
        "file_name": Path(file_path).name,
        "file_type": file_info,
        "processing_options": {
            "formats_available": ["markdown", "json", "text"],
            "ocr_available": file_info.get("handler") in ["image", "pdf"],
            "table_extraction": file_info.get("handler") in [
                "pdf", "docx", "xlsx", "html"
            ],
            "image_extraction": file_info.get("handler") in ["pdf", "docx", "pptx"]
        }
    }


# ============================================================================
# Document Caching (Section 21.17 Equivalent)
# ============================================================================

class DocumentCache:
    """Cache converted documents to avoid redundant processing."""

    def __init__(self, cache_dir: str = CACHE_DIR):
        self.cache_dir = Path(cache_dir)
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            # If we can't create cache dir, disable caching
            self.cache_dir = None

    def get_cache_key(self, file_path: str, fmt: str, ocr: bool) -> str:
        """Generate cache key from parameters using SHA256."""
        try:
            file_hash = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
        except Exception:
            file_hash = hashlib.sha256(file_path.encode()).hexdigest()
        return f"{file_hash}_{fmt}_{ocr}"

    async def get(self, key: str) -> Optional[str]:
        """Get cached result if exists and not expired (24h)."""
        if not self.cache_dir:
            return None
        cache_file = self.cache_dir / f"{key}.cache"
        if cache_file.exists():
            if time.time() - cache_file.stat().st_mtime < 86400:
                return cache_file.read_text(encoding="utf-8")
        return None

    async def set(self, key: str, content: str) -> None:
        """Cache conversion result."""
        if not self.cache_dir:
            return
        cache_file = self.cache_dir / f"{key}.cache"
        try:
            cache_file.write_text(content, encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to cache result: {e}")


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
        output_format: str = "markdown",
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
        import base64

        # Validate file type
        file_info = detect_file_type(file_path)
        if not file_info["supported"]:
            raise UnsupportedFormatError(
                file_info["error"],
                file_info["hebrew_error"],
                file_info["suggestion"]
            )

        # Check file exists
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise DocumentFileNotFoundError(
                f"File not found: {file_path}",
                f"הקובץ לא נמצא: {file_path}",
                "Check the file path and ensure the file exists"
            )

        # Normalize output format
        to_format = OUTPUT_FORMAT_MAP.get(output_format.lower(), "md")

        # Check cache
        cache_key = self.cache.get_cache_key(file_path, to_format, ocr_enabled)
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        # Read file and encode as base64 (Docling API requires base64_string, not path)
        try:
            file_content = file_path_obj.read_bytes()
            base64_content = base64.b64encode(file_content).decode('utf-8')
            filename = file_path_obj.name
        except Exception as e:
            raise DocumentConversionError(
                f"Failed to read file: {e}",
                "נכשל בקריאת הקובץ",
                "Ensure you have permission to read the file"
            )

        # Build request for Docling API (matching Gradio UI defaults exactly)
        # Reference: /home/ilan/BricksLLM/docling/gradio_ui.py lines 658-678
        request_body = {
            "sources": [{
                "kind": "file",
                "base64_string": base64_content,
                "filename": filename
            }],
            "options": {
                "to_formats": [to_format],
                # Pipeline settings - standard first, OCR as fallback only
                "pipeline": "standard",
                "pdf_backend": "dlparse_v4",
                # OCR settings - enabled as fallback, NOT forced
                "ocr": ocr_enabled,
                "force_ocr": False,
                "ocr_engine": "auto",
                "ocr_lang": ["en", "he"],
                # Table extraction - accurate mode
                "table_mode": "accurate",
                # Image handling - placeholder to avoid large base64 in response
                "image_export_mode": "placeholder",
                # Additional options
                "abort_on_error": False,
                "return_as_file": False,
                "do_code_enrichment": False,
                "do_formula_enrichment": False,
                "do_picture_classification": False,
                "do_picture_description": False,
            },
            "target": {"kind": "inbody"}
        }

        # Call Docling API
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                # Start async conversion
                response = await client.post(
                    f"{self.base_url}/v1/convert/source/async",
                    json=request_body
                )
                response.raise_for_status()
                task = response.json()
                task_id = task.get("task_id")

                if not task_id:
                    # Synchronous response
                    result = self._extract_result(task, to_format)
                    await self.cache.set(cache_key, result)
                    return result

                # Poll for completion
                result = await self._poll_until_complete(client, task_id, to_format)
                await self.cache.set(cache_key, result)
                return result

            except httpx.TimeoutException:
                raise DocumentTimeoutError(
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
        output_format: str = "markdown",
        ocr_enabled: bool = True
    ) -> str:
        """Convert document from URL."""
        to_format = OUTPUT_FORMAT_MAP.get(output_format.lower(), "md")

        # Build request for Docling API (matching Gradio UI defaults exactly)
        request_body = {
            "sources": [{
                "kind": "http",
                "url": url
            }],
            "options": {
                "to_formats": [to_format],
                "pipeline": "standard",
                "pdf_backend": "dlparse_v4",
                "ocr": ocr_enabled,
                "force_ocr": False,
                "ocr_engine": "auto",
                "ocr_lang": ["en", "he"],
                "table_mode": "accurate",
                "image_export_mode": "placeholder",
                "abort_on_error": False,
                "return_as_file": False,
            },
            "target": {"kind": "inbody"}
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/v1/convert/source/async",
                json=request_body
            )
            response.raise_for_status()
            task = response.json()
            task_id = task.get("task_id")

            if not task_id:
                return self._extract_result(task, to_format)

            return await self._poll_until_complete(client, task_id, to_format)

    async def extract_tables(
        self,
        file_path: str,
        output_format: str = "json"
    ) -> str:
        """Extract tables from document."""
        # First convert to get structured content
        result = await self.convert_document(file_path, "json", ocr_enabled=False)

        # Parse and extract tables
        try:
            doc = json.loads(result) if isinstance(result, str) else result
            tables = doc.get("tables", [])

            if output_format == "json":
                return json.dumps(
                    {"tables": tables, "count": len(tables)},
                    ensure_ascii=False,
                    indent=2
                )
            elif output_format == "csv":
                return self._tables_to_csv(tables)
            elif output_format == "markdown":
                return self._tables_to_markdown(tables)

            return json.dumps(tables, ensure_ascii=False)
        except json.JSONDecodeError:
            # Return as-is if not JSON
            return result

    async def extract_images(
        self,
        file_path: str,
        classify: bool = True
    ) -> str:
        """Extract and classify images from document."""
        import base64

        # Check file exists and read it
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise DocumentFileNotFoundError(
                f"File not found: {file_path}",
                f"הקובץ לא נמצא: {file_path}",
                "Check the file path and ensure the file exists"
            )

        file_content = file_path_obj.read_bytes()
        base64_content = base64.b64encode(file_content).decode('utf-8')
        filename = file_path_obj.name

        # Build request with correct Docling API parameters
        request_body = {
            "sources": [{
                "kind": "file",
                "base64_string": base64_content,
                "filename": filename
            }],
            "options": {
                "to_formats": ["json"],
                "pipeline": "standard",
                "pdf_backend": "dlparse_v4",
                "image_export_mode": "embedded",  # Need embedded for image extraction
                "do_picture_classification": classify,
                "do_picture_description": False,
                "ocr": False,
                "force_ocr": False,
            },
            "target": {"kind": "inbody"}
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            # Use async endpoint for consistency
            response = await client.post(
                f"{self.base_url}/v1/convert/source/async",
                json=request_body
            )
            response.raise_for_status()
            task = response.json()
            task_id = task.get("task_id")

            if not task_id:
                # Synchronous response
                result = task
            else:
                # Poll for completion
                result_response = await self._poll_until_complete_raw(client, task_id)
                result = result_response

            # Extract image information from document
            document = result.get("document", {})
            images = document.get("pictures", [])
            return json.dumps(
                {"images": images, "count": len(images)},
                ensure_ascii=False,
                indent=2
            )

    async def ocr_document(
        self,
        file_path: str,
        language: str = "heb+eng"
    ) -> str:
        """Perform OCR on scanned document."""
        return await self.convert_document(
            file_path,
            output_format="text",
            ocr_enabled=True
        )

    async def check_status(self, task_id: str) -> str:
        """Check async job status."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{self.base_url}/v1/status/poll/{task_id}"
            )
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
        to_format: str,
        poll_interval: float = 5.0
    ) -> str:
        """
        Poll conversion status until complete.

        Matches Gradio UI polling logic exactly:
        - Uses ?wait=5 parameter for long polling
        - Checks task_status field (not status/state)
        - Handles "success", "failure", "revoked" states

        Reference: /home/ilan/BricksLLM/docling/gradio_ui.py lines 485-534
        """
        start = time.time()
        logger.info(f"Starting poll for task {task_id}")

        while time.time() - start < self.timeout:
            try:
                # Use ?wait=5 for long polling (matches Gradio UI)
                response = await client.get(
                    f"{self.base_url}/v1/status/poll/{task_id}?wait=5",
                    timeout=15.0  # Short timeout for individual poll requests
                )
                response_data = response.json()

                # Gradio UI uses "task_status" field
                task_status = response_data.get("task_status", "")
                logger.info(f"Task {task_id} status: {task_status}")

                if task_status == "success":
                    logger.info(f"Task {task_id} completed successfully, fetching result")
                    result_response = await client.get(
                        f"{self.base_url}/v1/result/{task_id}",
                        timeout=30.0
                    )
                    return self._extract_result(result_response.json(), to_format)

                if task_status in ("failure", "revoked"):
                    error_detail = response_data.get("detail", "Unknown conversion error")
                    logger.error(f"Task {task_id} failed: {error_detail}")
                    raise DocumentConversionError(
                        f"Conversion failed: {error_detail}",
                        "שגיאה בהמרת המסמך",
                        "Try a different format or check if file is corrupted"
                    )

                # Still processing, wait before next poll
                await asyncio.sleep(poll_interval)

            except httpx.TimeoutException:
                # Individual poll timeout is OK, continue polling
                logger.warning(f"Poll request timeout for task {task_id}, retrying...")
                await asyncio.sleep(poll_interval)
                continue

        raise DocumentTimeoutError(
            f"Polling timeout after {self.timeout}s",
            "עיבוד המסמך לקח יותר מדי זמן",
            "Try a smaller document"
        )

    async def _poll_until_complete_raw(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        poll_interval: float = 5.0
    ) -> Dict[str, Any]:
        """Poll until complete and return raw JSON response (for image extraction)."""
        start = time.time()

        while time.time() - start < self.timeout:
            try:
                response = await client.get(
                    f"{self.base_url}/v1/status/poll/{task_id}?wait=5",
                    timeout=15.0
                )
                response_data = response.json()
                task_status = response_data.get("task_status", "")

                if task_status == "success":
                    result_response = await client.get(
                        f"{self.base_url}/v1/result/{task_id}",
                        timeout=30.0
                    )
                    return result_response.json()

                if task_status in ("failure", "revoked"):
                    raise DocumentConversionError(
                        f"Conversion failed: {response_data.get('detail', 'Unknown')}",
                        "שגיאה בהמרת המסמך",
                        "Try a different format"
                    )

                await asyncio.sleep(poll_interval)

            except httpx.TimeoutException:
                await asyncio.sleep(poll_interval)
                continue

        raise DocumentTimeoutError(
            f"Polling timeout after {self.timeout}s",
            "עיבוד המסמך לקח יותר מדי זמן",
            "Try a smaller document"
        )

    def _extract_result(self, response: Dict[str, Any], to_format: str) -> str:
        """
        Extract the converted content from response.

        Matches Gradio UI response_to_output function exactly:
        - document.md_content for markdown
        - document.json_content for JSON
        - document.html_content for HTML
        - document.text_content for text

        Reference: /home/ilan/BricksLLM/docling/gradio_ui.py lines 726-740
        """
        # Gradio UI structure: response["document"]["{format}_content"]
        document = response.get("document", {})

        if to_format == "md":
            content = document.get("md_content")
            if content:
                return content

        if to_format == "json":
            json_content = document.get("json_content")
            if json_content:
                return json.dumps(json_content, ensure_ascii=False, indent=2)

        if to_format == "html":
            content = document.get("html_content")
            if content:
                return content

        if to_format == "text":
            content = document.get("text_content")
            if content:
                return content

        # Fallback: try older response structures
        if "documents" in response:
            docs = response["documents"]
            if docs:
                doc = docs[0]
                if to_format == "md" and "md" in doc:
                    return doc["md"]
                if to_format == "json":
                    return json.dumps(doc, ensure_ascii=False, indent=2)
                if "content" in doc:
                    return doc["content"]
                return json.dumps(doc, ensure_ascii=False, indent=2)

        if "result" in response:
            return response["result"]

        # Last resort: return full response as JSON
        logger.warning(f"Could not extract {to_format} from response, returning raw JSON")
        return json.dumps(response, ensure_ascii=False, indent=2)

    def _tables_to_markdown(self, tables: List[dict]) -> str:
        """Convert tables to markdown format."""
        result = []
        for i, table in enumerate(tables):
            result.append(f"### Table {i+1}\n")
            headers = table.get("headers", [])
            rows = table.get("rows", [])

            if headers:
                result.append("| " + " | ".join(str(h) for h in headers) + " |")
                result.append("| " + " | ".join(["---"] * len(headers)) + " |")

            for row in rows:
                cells = row if isinstance(row, list) else row.get("cells", [])
                result.append("| " + " | ".join(str(cell) for cell in cells) + " |")

            result.append("")
        return "\n".join(result)

    def _tables_to_csv(self, tables: List[dict]) -> str:
        """Convert tables to CSV format."""
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)

        for table in tables:
            headers = table.get("headers", [])
            rows = table.get("rows", [])

            if headers:
                writer.writerow(headers)
            for row in rows:
                cells = row if isinstance(row, list) else row.get("cells", [])
                writer.writerow(cells)
            writer.writerow([])  # Empty row between tables

        return output.getvalue()
