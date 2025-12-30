#!/usr/bin/env python3
"""
Document Enterprise Expansions

Bidirectional semantic mappings for Hebrew<->English document processing.
Following the pattern from datagov/enterprise_expansions.py with 22 domains.
"""

from typing import Dict, Set, List

# ============================================================================
# Document-Related Semantic Domains (5 domains, ~200+ terms)
# ============================================================================

DOCUMENT_EXPANSIONS: Dict[str, List[str]] = {
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

def _build_bidirectional_index(
    expansions: Dict[str, List[str]]
) -> Dict[str, Set[str]]:
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
    bidirectional: Dict[str, Set[str]] = {}

    for domain, values in expansions.items():
        all_terms = {v.lower() for v in values}

        for term in all_terms:
            if term in bidirectional:
                bidirectional[term].update(all_terms)
            else:
                bidirectional[term] = all_terms.copy()

    return bidirectional


# Pre-built at startup
BIDIRECTIONAL_INDEX: Dict[str, Set[str]] = _build_bidirectional_index(
    DOCUMENT_EXPANSIONS
)


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
    expanded: Set[str] = set()
    query_lower = query.lower()

    for domain, terms in DOCUMENT_EXPANSIONS.items():
        terms_lower = [t.lower() for t in terms]
        if any(term in query_lower for term in terms_lower):
            expanded.update(terms)

    return expanded


# Statistics (computed at import time)
TOTAL_TERMS: int = get_all_terms()
TOTAL_DOMAINS: int = len(DOCUMENT_EXPANSIONS)
