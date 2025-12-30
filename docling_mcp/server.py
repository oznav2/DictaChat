#!/usr/bin/env python3
"""
Docling MCP Server - Enterprise Document Processing

Provides intelligent document conversion, table extraction, OCR,
and image classification via the Docling REST API.

Tools:
    - docling_convert: Convert documents to markdown/JSON/text
    - docling_convert_url: Convert documents from URL
    - docling_extract_tables: Extract tables from documents
    - docling_extract_images: Extract and classify images
    - docling_ocr: OCR for scanned documents (Hebrew/English)
    - docling_status: Check async job status
    - docling_list_formats: List supported formats
"""

import logging
from fastmcp import FastMCP

from .query_helper import (
    DocumentHelper,
    DocumentHelperError,
    detect_document_intent,
    detect_file_type,
    get_document_schema,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("docling-mcp")

# Initialize FastMCP server
mcp = FastMCP("docling")

# Initialize document helper
helper = DocumentHelper()


def format_error_response(error: Exception) -> str:
    """Format error with Hebrew/English messages."""
    if isinstance(error, DocumentHelperError):
        return error.to_user_message()
    return f"שגיאה: {str(error)}\nError: {str(error)}"


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
    try:
        logger.info(f"Converting document: {file_path} to {format}")
        result = await helper.convert_document(file_path, format, ocr_enabled)
        logger.info(f"Conversion successful: {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"Conversion failed: {e}")
        return format_error_response(e)


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

    Examples:
        - docling_convert_url("https://example.com/report.pdf", "markdown")
    """
    try:
        logger.info(f"Converting URL document: {url} to {format}")
        result = await helper.convert_url(url, format, ocr_enabled)
        logger.info(f"URL conversion successful: {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"URL conversion failed: {e}")
        return format_error_response(e)


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

    Examples:
        - docling_extract_tables("/uploads/report.pdf", "json")
        - docling_extract_tables("/uploads/data.xlsx", "csv")
    """
    try:
        logger.info(f"Extracting tables from: {file_path}")
        result = await helper.extract_tables(file_path, output_format)
        logger.info(f"Table extraction successful")
        return result
    except Exception as e:
        logger.error(f"Table extraction failed: {e}")
        return format_error_response(e)


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

    Examples:
        - docling_extract_images("/uploads/presentation.pptx")
        - docling_extract_images("/uploads/report.pdf", classify=True)
    """
    try:
        logger.info(f"Extracting images from: {file_path}")
        result = await helper.extract_images(file_path, classify)
        logger.info(f"Image extraction successful")
        return result
    except Exception as e:
        logger.error(f"Image extraction failed: {e}")
        return format_error_response(e)


@mcp.tool()
async def docling_ocr(
    file_path: str,
    language: str = "heb+eng"
) -> str:
    """
    Perform OCR on a scanned document or image.

    Supports Hebrew, English, Arabic and combinations.

    Args:
        file_path: Path to the scanned document or image
        language: OCR language(s) - "heb", "eng", "heb+eng", "ara+heb+eng"

    Returns:
        Recognized text content

    Examples:
        - docling_ocr("/uploads/scanned_form.pdf", "heb+eng")
        - docling_ocr("/uploads/hebrew_doc.jpg", "heb")
    """
    try:
        logger.info(f"OCR processing: {file_path} with language: {language}")
        result = await helper.ocr_document(file_path, language)
        logger.info(f"OCR successful: {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return format_error_response(e)


@mcp.tool()
async def docling_status(task_id: str) -> str:
    """
    Check the status of an async conversion job.

    Args:
        task_id: The task ID returned from an async conversion

    Returns:
        Job status including progress and result if complete

    Examples:
        - docling_status("abc123-task-id")
    """
    try:
        logger.info(f"Checking status for task: {task_id}")
        result = await helper.check_status(task_id)
        return result
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        return format_error_response(e)


@mcp.tool()
async def docling_list_formats() -> str:
    """
    List all supported document formats.

    Returns:
        JSON with supported input and output formats,
        OCR languages, and available features.

    Examples:
        - docling_list_formats()
    """
    try:
        return await helper.list_formats()
    except Exception as e:
        logger.error(f"List formats failed: {e}")
        return format_error_response(e)


# Additional utility functions exposed as tools

@mcp.tool()
async def docling_analyze(file_path: str) -> str:
    """
    Analyze a document and return its metadata and processing options.

    Args:
        file_path: Path to the document file

    Returns:
        JSON with file info, supported operations, and recommendations

    Examples:
        - docling_analyze("/uploads/unknown_file.pdf")
    """
    try:
        schema = get_document_schema(file_path)
        file_type = detect_file_type(file_path)

        result = {
            "file_analysis": schema,
            "recommendations": {
                "use_ocr": file_type.get("ocr_default", False),
                "best_format": "markdown",
                "supports_tables": file_type.get("handler") in [
                    "pdf", "docx", "xlsx", "html"
                ],
                "supports_images": file_type.get("handler") in [
                    "pdf", "docx", "pptx"
                ],
            }
        }

        import json
        return json.dumps(result, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return format_error_response(e)


if __name__ == "__main__":
    mcp.run()
