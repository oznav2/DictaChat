"""
DataGov Query Builder - Templates for data.gov.il CKAN API

API Reference (from official documentation):
- Pagination: offset + limit control data flow
- Filters: {"column": "value"} or {"column": ["val1", "val2"]}
- Fields: Comma-separated list of column names
- Hebrew Search: q={chars}:* with plain=false for wildcard matching
- User-Agent: Must include 'datagov-external-client' to avoid 403 blocks

Enterprise Scoring Algorithm:
- Query Decomposition: Separates SUBJECT (what) from LOCATION (where)
- Semantic Expansion: Maps English terms to Hebrew equivalents (21 domains, 300+ terms)
- Subject-First Scoring: Requires subject match before considering results
- Minimum Threshold: Returns "no match" instead of irrelevant data
- Schema-Aware: Uses enterprise_schemas.json for field-level intelligence (optional)
"""

import os
import re
import logging
from typing import Dict, List, Optional, Any, Union, Set
import json
from urllib.parse import quote

# Configure logging
log = logging.getLogger(__name__)

BASE_URL = os.getenv("BASE_URL", "https://data.gov.il/api/3")

# ============================================================================
# Enterprise Schema Loading (Optional - enhances field matching)
# Uses split schema files for fast lookups without loading full 10MB JSON
# ============================================================================

_enterprise_schemas: Optional[Dict[str, Any]] = None
_enterprise_schema_index: Optional[Dict[str, Dict[str, Any]]] = None
_field_index: Optional[Dict[str, Dict[str, bool]]] = None
_master_index: Optional[Dict[str, Dict[str, Any]]] = None
_schemas_loaded: bool = False

def _get_schemas_dir() -> str:
    """Get the path to the schemas directory."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, "schemas")

def _load_field_index() -> Optional[Dict[str, Dict[str, bool]]]:
    """
    Load the lightweight _field_index.json for fast field availability checks.
    This is much smaller than loading the full enterprise_schemas.json.
    """
    global _field_index

    if _field_index is not None:
        return _field_index

    schemas_dir = _get_schemas_dir()
    field_index_path = os.path.join(schemas_dir, "_field_index.json")

    if not os.path.exists(field_index_path):
        return None

    try:
        with open(field_index_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _field_index = data.get("resources", {})
        log.info(f"Loaded field index: {len(_field_index)} resources")
        return _field_index
    except Exception as e:
        log.warning(f"Failed to load _field_index.json: {e}")
        return None

def _load_master_index() -> Optional[Dict[str, Dict[str, Any]]]:
    """
    Load the master index for resource_id -> file/metadata mapping.
    """
    global _master_index

    if _master_index is not None:
        return _master_index

    schemas_dir = _get_schemas_dir()
    index_path = os.path.join(schemas_dir, "_index.json")

    if not os.path.exists(index_path):
        return None

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _master_index = data.get("resources", {})
        log.info(f"Loaded master index: {len(_master_index)} resources")
        return _master_index
    except Exception as e:
        log.warning(f"Failed to load _index.json: {e}")
        return None

def _load_enterprise_schemas() -> Optional[Dict[str, Any]]:
    """
    Load enterprise_schemas.json if available.
    This is an optional enhancement - the system works without it.

    Note: For field availability checks, prefer _load_field_index() which is faster.
    """
    global _enterprise_schemas, _enterprise_schema_index, _schemas_loaded

    if _schemas_loaded:
        return _enterprise_schemas

    _schemas_loaded = True
    script_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(script_dir, "enterprise_schemas.json")

    if not os.path.exists(schema_path):
        log.debug("enterprise_schemas.json not found - using basic matching")
        return None

    try:
        with open(schema_path, "r", encoding="utf-8") as f:
            _enterprise_schemas = json.load(f)

        # Build index for fast lookup by resource_id
        _enterprise_schema_index = {}
        for ds in _enterprise_schemas.get("datasets", []):
            for res in ds.get("resources", []):
                rid = res.get("resource_id")
                if rid:
                    _enterprise_schema_index[rid] = {
                        "dataset": ds,
                        "resource": res,
                        "fields": res.get("fields", []),
                        "categories": ds.get("categories", []),
                        "keywords": ds.get("keywords", []),
                        "field_availability": ds.get("field_availability", {})
                    }

        log.info(f"Loaded enterprise schemas: {len(_enterprise_schema_index)} resources indexed")
        return _enterprise_schemas
    except Exception as e:
        log.warning(f"Failed to load enterprise_schemas.json: {e}")
        return None


# ============================================================================
# COMPREHENSIVE KEYWORD INDEX
# ============================================================================
# This indexes ALL keywords from ALL datasets to enable discovery of any
# dataset using any of its associated keywords.
# ============================================================================

_keyword_to_resources: Optional[Dict[str, List[str]]] = None
_category_to_resources: Optional[Dict[str, List[str]]] = None
_keyword_index_loaded: bool = False


def _load_keyword_index() -> None:
    """
    Build comprehensive keyword-to-resource index from enterprise_schemas.json.

    This enables finding datasets by ANY keyword they contain, not just
    the terms in SUBJECT_EXPANSIONS.
    """
    global _keyword_to_resources, _category_to_resources, _keyword_index_loaded

    if _keyword_index_loaded:
        return

    _keyword_index_loaded = True
    _keyword_to_resources = {}
    _category_to_resources = {}

    # Ensure schemas are loaded and get the result directly
    schemas = _load_enterprise_schemas()
    if not schemas:
        log.warning("Cannot build keyword index - enterprise_schemas.json not loaded")
        return

    for ds in schemas.get("datasets", []):
        keywords = ds.get("keywords", [])
        categories = ds.get("categories", [])
        title = ds.get("title", "").lower()

        # Get all resource IDs for this dataset
        resource_ids = [r.get("resource_id") for r in ds.get("resources", []) if r.get("resource_id")]

        if not resource_ids:
            continue

        # Index by keywords
        for kw in keywords:
            kw_lower = kw.lower()
            if kw_lower not in _keyword_to_resources:
                _keyword_to_resources[kw_lower] = []
            _keyword_to_resources[kw_lower].extend(resource_ids)

        # Index by categories
        for cat in categories:
            cat_lower = cat.lower()
            if cat_lower not in _category_to_resources:
                _category_to_resources[cat_lower] = []
            _category_to_resources[cat_lower].extend(resource_ids)

        # Index by title words (important for direct title matches)
        for word in title.split():
            if len(word) > 2:  # Skip very short words
                if word not in _keyword_to_resources:
                    _keyword_to_resources[word] = []
                _keyword_to_resources[word].extend(resource_ids)

    log.info(f"Keyword index built: {len(_keyword_to_resources)} unique keywords, {len(_category_to_resources)} categories")


def get_resources_by_keyword(keyword: str) -> List[str]:
    """
    Get all resource IDs that have a specific keyword.

    Args:
        keyword: Any keyword (Hebrew or English)

    Returns:
        List of resource_ids that contain this keyword
    """
    _load_keyword_index()
    if not _keyword_to_resources:
        return []
    return _keyword_to_resources.get(keyword.lower(), [])


def get_resources_by_category(category: str) -> List[str]:
    """
    Get all resource IDs in a specific category.

    Args:
        category: Category name (e.g., "health", "education", "justice")

    Returns:
        List of resource_ids in this category
    """
    _load_keyword_index()
    if not _category_to_resources:
        return []
    return _category_to_resources.get(category.lower(), [])


# ============================================================================
# HEBREW MORPHOLOGICAL NORMALIZATION
# ============================================================================
# Hebrew words have prefixes (ל, ב, מ, ה, ו, ש, כ) and plural suffixes (ים, ות)
# that need to be handled for proper matching.
# Example: "לרכבים" -> ["לרכבים", "רכבים", "רכב"]
# ============================================================================

HEBREW_PREFIXES = ['ל', 'ב', 'מ', 'ה', 'ו', 'ש', 'כ', 'וב', 'וה', 'ול', 'ומ', 'וש', 'וכ']
HEBREW_PLURAL_SUFFIXES = ['ים', 'ות']


def get_hebrew_variants(word: str) -> List[str]:
    """
    Generate morphological variants of a Hebrew word.

    Handles:
    - Prefix stripping: לרכבים -> רכבים
    - Plural suffix stripping: רכבים -> רכב
    - Combinations: לרכבים -> רכבים -> רכב

    Returns list of variants including the original word.
    """
    if not word or len(word) < 2:
        return [word] if word else []

    variants = {word, word.lower()}

    # Check if word has Hebrew characters
    has_hebrew = any('\u0590' <= c <= '\u05FF' for c in word)
    if not has_hebrew:
        return list(variants)

    # Strip prefixes
    stripped = word
    for prefix in sorted(HEBREW_PREFIXES, key=len, reverse=True):  # Longer prefixes first
        if word.startswith(prefix) and len(word) > len(prefix) + 1:
            stripped = word[len(prefix):]
            variants.add(stripped)
            break

    # Strip plural suffixes from both original and prefix-stripped
    for base in [word, stripped]:
        for suffix in HEBREW_PLURAL_SUFFIXES:
            if base.endswith(suffix) and len(base) > len(suffix) + 1:
                singular = base[:-len(suffix)]
                variants.add(singular)
                # Also add common singular forms
                if suffix == 'ים':
                    # Try adding ה for feminine singular
                    variants.add(singular + 'ה')

    return list(variants)


def find_matching_resources(query_tokens: List[str]) -> Dict[str, int]:
    """
    Find resources that match query tokens using the keyword index.

    ENHANCED: Now uses Hebrew morphological normalization to find matches
    even when query uses plural/prefix forms not in the index.

    Returns a dict of resource_id -> match_count (how many tokens matched).
    Higher count = more relevant resource.
    """
    _load_keyword_index()
    if not _keyword_to_resources:
        return {}

    resource_matches: Dict[str, int] = {}

    for token in query_tokens:
        token_lower = token.lower()

        # Get all Hebrew morphological variants
        variants = get_hebrew_variants(token)
        variants_checked = set()

        for variant in variants:
            variant_lower = variant.lower()
            if variant_lower in variants_checked:
                continue
            variants_checked.add(variant_lower)

            # Direct keyword match
            matching_resources = _keyword_to_resources.get(variant_lower, [])
            for rid in matching_resources:
                # Full score for direct match, slightly less for variant
                score = 1.0 if variant_lower == token_lower else 0.8
                resource_matches[rid] = resource_matches.get(rid, 0) + score

        # Also try bidirectional expansion on all variants
        for variant in variants:
            synonyms = get_all_synonyms(variant)
            for syn in synonyms:
                syn_lower = syn.lower()
                if syn_lower not in variants_checked:
                    variants_checked.add(syn_lower)
                    matching_resources = _keyword_to_resources.get(syn_lower, [])
                    for rid in matching_resources:
                        resource_matches[rid] = resource_matches.get(rid, 0) + 0.5

    return resource_matches


def get_resource_schema(resource_id: str) -> Optional[Dict[str, Any]]:
    """
    Get pre-computed schema for a resource from enterprise_schemas.json.
    Returns None if schemas not loaded or resource not found.
    """
    _load_enterprise_schemas()
    if _enterprise_schema_index is None:
        return None
    return _enterprise_schema_index.get(resource_id)

def check_field_availability(resource_id: str, intent: str) -> bool:
    """
    Quick check if a resource has fields matching the intent.
    Uses lightweight _field_index.json (falls back to enterprise_schemas.json).

    Args:
        resource_id: The resource UUID
        intent: One of "phone", "address", "location", "email", "date"
    """
    intent_mapping = {
        "phone": "has_phone",
        "phones": "has_phone",
        "address": "has_address",
        "addresses": "has_address",
        "location": "has_location",
        "city": "has_location",
        "email": "has_email",
        "date": "has_date",
        "contact": "has_phone",  # Contact usually means phone
    }

    key = intent_mapping.get(intent.lower())
    if not key:
        return True  # Unknown intent, assume available

    # Try lightweight field index first
    field_index = _load_field_index()
    if field_index and resource_id in field_index:
        return field_index[resource_id].get(key, True)

    # Fall back to full schema
    schema = get_resource_schema(resource_id)
    if not schema:
        return True  # Assume available if no schema data

    availability = schema.get("field_availability", {})
    return availability.get(key, True)


# ============================================================================
# Phase 1: Filter Candidates by Field Availability
# ============================================================================

def filter_by_field_availability(
    candidates: List[Dict[str, Any]],
    field_intents: List[str]
) -> List[Dict[str, Any]]:
    """
    Filter candidates to only those that have the requested field types.
    Uses pre-computed field_availability from enterprise_schemas.json.

    Args:
        candidates: List of resource candidates from suggest_for_query
        field_intents: User's requested fields (e.g., ["phone", "address"])

    Returns:
        Filtered list of candidates that have ALL requested fields.
        If no candidates match, returns original list (graceful degradation).
    """
    if not field_intents:
        return candidates

    # Map common intent words to field availability keys
    relevant_intents = []
    for intent in field_intents:
        intent_lower = intent.lower()
        if intent_lower in ("phone", "phones", "telephone", "טלפון", "contact"):
            relevant_intents.append("phone")
        elif intent_lower in ("address", "addresses", "כתובת", "location", "מיקום"):
            relevant_intents.append("address")
        elif intent_lower in ("email", "אימייל", "mail"):
            relevant_intents.append("email")
        elif intent_lower in ("date", "תאריך", "time"):
            relevant_intents.append("date")
        elif intent_lower in ("city", "עיר", "district", "מחוז"):
            relevant_intents.append("location")

    if not relevant_intents:
        return candidates

    filtered = []
    for c in candidates:
        rid = c.get("resource_id")
        if not rid:
            continue

        # Check each intent
        all_available = True
        for intent in relevant_intents:
            if not check_field_availability(rid, intent):
                all_available = False
                break

        if all_available:
            filtered.append(c)

    # Graceful degradation: if nothing matches, return original
    if not filtered:
        log.debug(f"No candidates with {relevant_intents}, returning all")
        return candidates

    log.debug(f"Filtered {len(candidates)} -> {len(filtered)} candidates with {relevant_intents}")
    return filtered


# ============================================================================
# Phase 4: Semantic Field Mapping
# ============================================================================

def get_semantic_field_name(resource_id: str, semantic_type: str) -> Optional[str]:
    """
    Get the actual field name that matches a semantic type.

    Args:
        resource_id: The resource UUID
        semantic_type: One of "phone", "address", "email", "date", "name", "city", etc.

    Returns:
        Actual field name (e.g., "טלפון_מוסד") or None if not found
    """
    schema = get_resource_schema(resource_id)
    if not schema:
        return None

    for field in schema.get("fields", []):
        if field.get("semantic") == semantic_type:
            return field.get("name")

    return None

def get_all_semantic_fields(resource_id: str) -> Dict[str, str]:
    """
    Get all semantic field mappings for a resource.

    Returns:
        Dict mapping semantic_type -> actual_field_name
        e.g., {"phone": "טלפון_מוסד", "address": "כתובת_מלאה", "date": "תאריך_עדכון"}
    """
    schema = get_resource_schema(resource_id)
    if not schema:
        return {}

    result = {}
    for field in schema.get("fields", []):
        semantic = field.get("semantic")
        if semantic:
            result[semantic] = field.get("name")

    return result

def get_resource_metadata_fast(resource_id: str) -> Optional[Dict[str, Any]]:
    """
    Get quick metadata for a resource from the master index.
    Does NOT load the full schema - just basic info.

    Returns:
        Dict with file, dataset_id, title, category, format, total_records
    """
    master_index = _load_master_index()
    if master_index and resource_id in master_index:
        return master_index[resource_id]
    return None

# ============================================================================
# Semantic Expansion Dictionaries (English → Hebrew)
# Enterprise-Grade: 21 domains, 300+ terms from enterprise_expansions.py
# ============================================================================

# Try to import enterprise expansions (21 domains, 300+ terms)
try:
    from .enterprise_expansions import ENTERPRISE_SUBJECT_EXPANSIONS
    _ENTERPRISE_LOADED = True
except ImportError:
    try:
        from enterprise_expansions import ENTERPRISE_SUBJECT_EXPANSIONS
        _ENTERPRISE_LOADED = True
    except ImportError:
        ENTERPRISE_SUBJECT_EXPANSIONS = {}
        _ENTERPRISE_LOADED = False
        log.warning("enterprise_expansions.py not found - using basic expansions")

# Base subject keywords (backward compatibility + fallback)
_BASE_SUBJECT_EXPANSIONS: Dict[str, List[str]] = {
    # Legal/Courts
    "court": ["בית משפט", "בתי משפט", "משפט", "שופט", "שפיטה", "תיקים"],
    "courts": ["בית משפט", "בתי משפט", "משפט", "שופט", "שפיטה", "תיקים"],
    "judge": ["שופט", "שופטים", "בית משפט"],
    "legal": ["משפטי", "חוקי", "משפט"],
    "law": ["חוק", "חוקים", "משפט", "חקיקה"],

    # Healthcare
    "hospital": ["בית חולים", "בתי חולים", "רפואי", "רפואה", "אשפוז"],
    "hospitals": ["בית חולים", "בתי חולים", "רפואי", "רפואה", "אשפוז"],
    "clinic": ["מרפאה", "מרפאות", "קופת חולים"],
    "health": ["בריאות", "רפואי", "רפואה"],
    "medical": ["רפואי", "רפואה", "בריאות"],
    "trauma": ["טראומה", "מרכז טראומה", "פציעות"],
    "doctor": ["רופא", "רופאים", "רפואה"],
    "pharmacy": ["בית מרקחת", "תרופות", "רוקחות"],

    # Education
    "school": ["בית ספר", "בתי ספר", "חינוך", "לימודים", "מוסד חינוך", "מוסדות חינוך"],
    "schools": ["בית ספר", "בתי ספר", "חינוך", "לימודים", "מוסד חינוך", "מוסדות חינוך"],
    "high school": ["תיכון", "תיכונים", "בית ספר תיכון", "בתי ספר תיכוניים", "חטיבה עליונה", "מוסדות חינוך"],
    "highschool": ["תיכון", "תיכונים", "בית ספר תיכון", "בתי ספר תיכוניים", "חטיבה עליונה"],
    "תיכון": ["תיכון", "תיכונים", "high school", "חטיבה עליונה", "מוסדות חינוך"],
    "תיכוניים": ["תיכון", "תיכונים", "high school", "חטיבה עליונה", "מוסדות חינוך"],
    "elementary": ["יסודי", "בית ספר יסודי", "חטיבת ביניים", "מוסדות חינוך"],
    "university": ["אוניברסיטה", "אוניברסיטאות", "השכלה גבוהה"],
    "college": ["מכללה", "מכללות", "השכלה"],
    "education": ["חינוך", "לימודים", "הוראה", "מוסדות חינוך", "בתי ספר"],
    "student": ["תלמיד", "תלמידים", "סטודנט"],
    "kindergarten": ["גן ילדים", "גני ילדים", "גנים"],

    # Government/Public Services
    "ministry": ["משרד", "משרדים", "ממשלתי"],
    "government": ["ממשלה", "ממשלתי", "ציבורי"],
    "municipality": ["עירייה", "עיריות", "רשות מקומית"],
    "office": ["משרד", "לשכה", "מוסד"],
    "police": ["משטרה", "משטרתי", "שוטר"],
    "fire": ["כבאות", "כבאי", "מכבי אש"],

    # Transportation
    "bus": ["אוטובוס", "תחבורה ציבורית", "קווים"],
    "train": ["רכבת", "תחנת רכבת", "רכבות"],
    "airport": ["שדה תעופה", "נמל תעופה", "טיסות"],
    "road": ["כביש", "כבישים", "דרך"],
    "traffic": ["תנועה", "תחבורה", "פקקים"],

    # Business/Economy
    "business": ["עסק", "עסקים", "חברה", "חברות"],
    "company": ["חברה", "חברות", "עסק"],
    "license": ["רישיון", "רישוי", "היתר"],
    "permit": ["היתר", "רישיון", "אישור"],
    "tax": ["מס", "מיסים", "מסוי"],
    "budget": ["תקציב", "תקציבי", "כספים"],

    # Environment
    "water": ["מים", "מקורות מים", "ביוב"],
    "air": ["אוויר", "זיהום אוויר", "איכות אוויר"],
    "environment": ["סביבה", "איכות הסביבה", "אקולוגי"],
    "weather": ["מזג אוויר", "גשם", "טמפרטורה"],
    "park": ["פארק", "גן ציבורי", "שטח פתוח"],

    # Social Services
    "welfare": ["רווחה", "סעד", "שירותי רווחה"],
    "elderly": ["קשישים", "זקנים", "גיל הזהב"],
    "disability": ["נכות", "נכים", "מוגבלות"],
    "housing": ["דיור", "שיכון", "מגורים"],

    # Statistics/Data
    "population": ["אוכלוסייה", "דמוגרפיה", "תושבים"],
    "census": ["מפקד", "מפקד אוכלוסין", "סטטיסטיקה"],
    "statistics": ["סטטיסטיקה", "נתונים", "מדדים"],
}

# Merge: Enterprise expansions take priority, base provides fallback
SUBJECT_EXPANSIONS: Dict[str, List[str]] = {**_BASE_SUBJECT_EXPANSIONS, **ENTERPRISE_SUBJECT_EXPANSIONS}


# ============================================================================
# BIDIRECTIONAL EXPANSION INDEX
# ============================================================================
# This solves the critical problem where:
#   "crime" expands to ["פשיעה", "עבירות"...] but
#   "פשיעה" doesn't expand back to ["crime", "עבירות"...]
#
# The bidirectional index ensures any term finds ALL related terms.
# ============================================================================

def _build_bidirectional_index() -> Dict[str, Set[str]]:
    """
    Build a bidirectional index where every term maps to all synonyms.

    Example:
        {"crime": ["פשיעה"], "פשיעה": ["crime"]}
    Becomes:
        {"crime": {"crime", "פשיעה"}, "פשיעה": {"crime", "פשיעה"}}
    """
    index: Dict[str, Set[str]] = {}

    for key, values in SUBJECT_EXPANSIONS.items():
        # Create the synonym group: key + all values
        group = set(values)
        group.add(key)

        # Map every term in the group to the entire group
        for term in group:
            if term not in index:
                index[term] = set()
            index[term].update(group)

    return index


# Build once at module load
_BIDIRECTIONAL_EXPANSIONS: Dict[str, Set[str]] = _build_bidirectional_index()


def get_all_synonyms(term: str) -> List[str]:
    """
    Get all synonyms for a term (bidirectional).

    Args:
        term: Any term (Hebrew or English)

    Returns:
        List of all related terms, or [term] if no synonyms found.
    """
    term_lower = term.lower()
    synonyms = _BIDIRECTIONAL_EXPANSIONS.get(term_lower, set())
    if not synonyms:
        # Try without lowercasing (Hebrew is case-insensitive but may be stored differently)
        synonyms = _BIDIRECTIONAL_EXPANSIONS.get(term, set())
    return list(synonyms) if synonyms else [term]


# Common column names for location filtering in data.gov.il datasets
LOCATION_COLUMN_NAMES: Set[str] = {
    # Hebrew column names
    "מחוז", "עיר", "יישוב", "רשות", "כתובת", "מיקום", "אזור", "מקום",
    "עיר/יישוב", "שם_יישוב", "שם_עיר", "שם יישוב", "שם עיר",
    "רשות_מקומית", "רשות מקומית", "מועצה",
    # English column names
    "city", "district", "location", "address", "region", "area",
    "municipality", "town", "place", "court_district"
}

# Mapping from location tokens to their Hebrew equivalents for filtering
LOCATION_FILTER_VALUES: Dict[str, List[str]] = {
    "jerusalem": ["ירושלים", "Jerusalem", "JERUSALEM", "3"],
    "ירושלים": ["ירושלים", "Jerusalem", "JERUSALEM", "3"],
    "tel aviv": ["תל אביב", "Tel Aviv", "TEL AVIV", "5", "תל-אביב"],
    "תל אביב": ["תל אביב", "Tel Aviv", "TEL AVIV", "5", "תל-אביב"],
    "haifa": ["חיפה", "Haifa", "HAIFA", "6"],
    "חיפה": ["חיפה", "Haifa", "HAIFA", "6"],
    "beer sheva": ["באר שבע", "Beer Sheva", "BEER SHEVA", "2", "באר-שבע"],
    "באר שבע": ["באר שבע", "Beer Sheva", "BEER SHEVA", "2", "באר-שבע"],
    "netanya": ["נתניה", "Netanya", "NETANYA"],
    "נתניה": ["נתניה", "Netanya", "NETANYA"],
    "ashdod": ["אשדוד", "Ashdod", "ASHDOD"],
    "אשדוד": ["אשדוד", "Ashdod", "ASHDOD"],
    "north": ["צפון", "North", "NORTH", "7"],
    "צפון": ["צפון", "North", "NORTH", "7"],
    "south": ["דרום", "South", "SOUTH", "2"],
    "דרום": ["דרום", "South", "SOUTH", "2"],
    "center": ["מרכז", "Center", "CENTRAL", "4"],
    "מרכז": ["מרכז", "Center", "CENTRAL", "4"],
}

# Israeli locations (cities, regions) - used to identify location tokens
ISRAELI_LOCATIONS: Set[str] = {
    # Major cities
    "jerusalem", "ירושלים", "tel aviv", "תל אביב", "haifa", "חיפה",
    "beer sheva", "באר שבע", "beersheba", "netanya", "נתניה",
    "ashdod", "אשדוד", "rishon", "ראשון לציון", "petah tikva", "פתח תקווה",
    "holon", "חולון", "bnei brak", "בני ברק", "ramat gan", "רמת גן",
    "ashkelon", "אשקלון", "rehovot", "רחובות", "bat yam", "בת ים",
    "herzliya", "הרצליה", "kfar saba", "כפר סבא", "ra'anana", "רעננה",
    "modi'in", "מודיעין", "lod", "לוד", "ramla", "רמלה",
    "nazareth", "נצרת", "acre", "עכו", "akko", "eilat", "אילת",
    "tiberias", "טבריה", "safed", "צפת", "kiryat", "קריית",
    "dimona", "דימונה", "arad", "ערד", "nahariya", "נהריה",

    # Regions
    "north", "צפון", "south", "דרום", "center", "מרכז",
    "galilee", "גליל", "negev", "נגב", "golan", "גולן",
    "sharon", "שרון", "shfela", "שפלה", "coastal", "חוף",

    # Districts
    "tel aviv district", "מחוז תל אביב", "jerusalem district", "מחוז ירושלים",
    "northern district", "מחוז צפון", "southern district", "מחוז דרום",
    "central district", "מחוז מרכז", "haifa district", "מחוז חיפה",
}

# ============================================================================
# Package (Dataset) Operations
# ============================================================================

def build_package_list() -> Dict[str, str]:
    """Get list of all dataset IDs (package names)."""
    return {"url": f"{BASE_URL}/action/package_list"}

def build_package_show(name_or_id: str) -> Dict[str, str]:
    """Get full metadata for a specific dataset by name or ID."""
    return {"url": f"{BASE_URL}/action/package_show?id={quote(name_or_id)}"}

def build_package_search(q: str, rows: int = 20, start: int = 0) -> Dict[str, str]:
    """
    Search datasets by query term. Returns last_modified in results.

    Args:
        q: Search query (Hebrew or English)
        rows: Number of results to return
        start: Offset for pagination
    """
    return {
        "url": f"{BASE_URL}/action/package_search?q={quote(q)}&rows={rows}&start={start}"
    }

# ============================================================================
# Organization Operations
# ============================================================================

def build_organization_list() -> Dict[str, str]:
    """Get list of all organization names."""
    return {"url": f"{BASE_URL}/action/organization_list"}

def build_organization_show(id_or_name: str) -> Dict[str, str]:
    """
    Get organization details by ID or name.

    Example names: airport_authority, ministry-of-health, etc.
    """
    return {"url": f"{BASE_URL}/action/organization_show?id={quote(id_or_name)}"}

# ============================================================================
# Datastore Operations (Core Query Templates)
# ============================================================================

def build_datastore_search(
    resource_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
    fields: Optional[List[str]] = None,
    filters: Optional[Dict[str, Union[str, List[str]]]] = None,
    q: Optional[str] = None,
    plain: Optional[bool] = None
) -> Dict[str, Any]:
    """
    Build a datastore_search query URL with all supported parameters.

    API Reference Examples:
    - Pagination: resource_id={ID}&limit=100&offset=0
    - Single filter: filters={"column":"value"}
    - Multi-value filter: filters={"column":["val1","val2"]}
    - Field selection: fields=Field1,Field2
    - Hebrew wildcard: q={chars}:*&plain=false

    Args:
        resource_id: The resource UUID to query
        limit: Max rows to return (default 100)
        offset: Starting row for pagination (default 0)
        fields: List of column names to include (None = all)
        filters: Dict of column filters, values can be str or list of str
        q: Full-text search query
        plain: Set to False for advanced search syntax (wildcards, etc.)
    """
    parts = [f"resource_id={resource_id}", f"limit={limit}", f"offset={offset}"]

    if fields and len(fields) > 0:
        parts.append(f"fields={','.join(fields)}")

    if filters and isinstance(filters, dict):
        # Handle both single values and arrays
        parts.append(f"filters={quote(json.dumps(filters, ensure_ascii=False))}")

    if q is not None:
        parts.append(f"q={quote(q)}")

    if plain is not None:
        parts.append(f"plain={'false' if not plain else 'true'}")

    url = f"{BASE_URL}/action/datastore_search?{'&'.join(parts)}"
    return {"url": url, "resource_id": resource_id}


def build_datastore_search_with_filter(
    resource_id: str,
    column: str,
    value: Union[str, List[str]],
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Convenience function for filtering by a single column.

    Examples:
        # Single value filter
        build_datastore_search_with_filter(rid, "city", "ירושלים")

        # Multi-value filter (OR condition)
        build_datastore_search_with_filter(rid, "city", ["ירושלים", "תל אביב"])
    """
    filters = {column: value}
    return build_datastore_search(resource_id, limit=limit, offset=offset, filters=filters)


def build_datastore_search_hebrew_wildcard(
    resource_id: str,
    search_term: str,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Build a Hebrew partial word search query.

    Uses the CKAN wildcard syntax: q={chars}:* with plain=false

    Example: Searching for "ירוש" will match "ירושלים", "ירושלימי", etc.
    """
    wildcard_query = f"{search_term}:*"
    return build_datastore_search(
        resource_id,
        limit=limit,
        offset=offset,
        q=wildcard_query,
        plain=False
    )


def build_datastore_search_with_fields(
    resource_id: str,
    fields: List[str],
    filters: Optional[Dict[str, Union[str, List[str]]]] = None,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Query specific fields with optional filtering.

    Example:
        build_datastore_search_with_fields(
            rid,
            fields=["name", "address", "phone"],
            filters={"city": "ירושלים"}
        )
    """
    return build_datastore_search(
        resource_id,
        limit=limit,
        offset=offset,
        fields=fields,
        filters=filters
    )

def build_datastore_search_request(
    resource_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
    fields: Optional[List[str]] = None,
    filters: Optional[Dict[str, Union[str, List[str]]]] = None,
    q: Optional[str] = None,
    plain: Optional[bool] = None,
    method: str = "GET"
) -> Dict[str, Any]:
    """
    Build a complete HTTP request dict for datastore_search.

    IMPORTANT: User-Agent must include 'datagov-external-client' to avoid 403 blocks.

    Args:
        resource_id: Resource UUID
        limit: Max rows (default 100)
        offset: Pagination offset (default 0)
        fields: Column names to return
        filters: Column filters (single value or array)
        q: Full-text search query
        plain: False for advanced search syntax
        method: "GET" or "POST"

    Returns:
        Dict with method, url, headers, and optionally json body
    """
    headers = {
        "User-Agent": "Mozilla/5.0 datagov-external-client",
        "Accept": "application/json"
    }

    if method.upper() == "POST":
        body: Dict[str, Any] = {
            "resource_id": resource_id,
            "limit": limit,
            "offset": offset,
        }
        if fields and len(fields) > 0:
            body["fields"] = fields
        if filters and isinstance(filters, dict):
            body["filters"] = filters
        if q is not None:
            body["q"] = q
        if plain is not None:
            body["plain"] = bool(plain)
        headers["Content-Type"] = "application/json"
        return {
            "method": "POST",
            "url": f"{BASE_URL}/action/datastore_search",
            "headers": headers,
            "json": body
        }

    # GET method
    url_data = build_datastore_search(
        resource_id,
        limit=limit,
        offset=offset,
        fields=fields,
        filters=filters,
        q=q,
        plain=plain
    )
    return {"method": "GET", "url": url_data["url"], "headers": headers}

# ============================================================================
# Resource Discovery & Scoring (Enterprise-Level)
# ============================================================================

# Hebrew prefix letters that attach to words
HEBREW_PREFIXES = {'ב', 'ל', 'מ', 'ה', 'ו', 'כ', 'ש', 'וב', 'ול', 'ומ', 'וה', 'וכ', 'וש', 'שב', 'של', 'שמ'}

# Stop words for tokenization
STOP_WORDS: Set[str] = {
    # Hebrew
    "של", "את", "על", "עם", "לא", "או", "גם", "כי", "מה", "זה", "הוא", "היא", "אני", "אנחנו",
    "ב", "ל", "מ", "ה", "ו", "כ", "ש",
    # English
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or", "is", "are", "was",
    "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "can", "this", "that", "these", "those",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
    "my", "your", "his", "its", "our", "their", "what", "which", "who", "whom",
    "use", "using", "show", "display", "find", "search", "get", "list", "give", "me", "want",
    "provide", "each", "every", "all", "with", "from", "by"
}

# Field intent mapping: Maps user's English/Hebrew field requests to common column patterns
FIELD_INTENT_MAPPING: Dict[str, List[str]] = {
    # Address-related
    "address": ["כתובת", "address", "רחוב", "street", "מיקום", "location", "כתובת_מלאה"],
    "addresses": ["כתובת", "address", "רחוב", "street", "מיקום", "location"],
    "כתובת": ["כתובת", "address", "רחוב", "street", "מיקום", "location"],

    # Phone-related
    "phone": ["טלפון", "phone", "tel", "telephone", "פקס", "fax", "נייד", "mobile"],
    "phones": ["טלפון", "phone", "tel", "telephone", "פקס", "fax"],
    "טלפון": ["טלפון", "phone", "tel", "telephone"],

    # Contact-related
    "contact": ["איש_קשר", "contact", "אימייל", "email", "טלפון", "phone"],
    "email": ["אימייל", "email", "דואר", "mail"],

    # Name-related
    "name": ["שם", "name", "שם_מלא", "full_name", "כותרת", "title"],
    "שם": ["שם", "name", "שם_מלא", "full_name"],

    # Location/City
    "city": ["עיר", "city", "יישוב", "town", "רשות", "municipality"],
    "עיר": ["עיר", "city", "יישוב", "town"],
    "district": ["מחוז", "district", "אזור", "region"],
    "מחוז": ["מחוז", "district", "אזור", "region"],

    # Type/Category
    "type": ["סוג", "type", "קטגוריה", "category", "תחום", "domain"],
    "סוג": ["סוג", "type", "קטגוריה", "category"],

    # Status
    "status": ["סטטוס", "status", "מצב", "state"],

    # URL/Link
    "link": ["קישור", "link", "url", "אתר", "website"],
    "url": ["קישור", "link", "url", "אתר", "website"],

    # Date/Time
    "date": ["תאריך", "date", "יום", "day", "שנה", "year"],
    "תאריך": ["תאריך", "date", "יום", "day"],

    # Hours/Schedule
    "hours": ["שעות", "hours", "שעות_פתיחה", "opening_hours", "זמנים"],
    "שעות": ["שעות", "hours", "שעות_פתיחה", "opening_hours"],
}


def _strip_hebrew_prefix(word: str, force: bool = False) -> str:
    """
    Strip common Hebrew prefix letters from a word for location matching.

    Hebrew has prefix letters (ב, ל, מ, ה, ו, כ, ש) that attach to words:
    - בירושלים (in Jerusalem) → ירושלים (Jerusalem)
    - לתל אביב (to Tel Aviv) → תל אביב (Tel Aviv)
    - מחיפה (from Haifa) → חיפה (Haifa)

    Args:
        word: The Hebrew word to strip prefix from
        force: If True, always try to strip. If False, only strip for known locations.
    """
    if not word or len(word) < 4:  # Minimum 4 chars to avoid breaking short words
        return word

    # Check for Hebrew characters (Unicode range)
    if not any('\u0590' <= c <= '\u05FF' for c in word):
        return word

    # Try stripping 2-character prefixes first, then 1-character
    for prefix_len in [2, 1]:
        if len(word) > prefix_len + 2:  # Ensure remaining word is at least 3 chars
            prefix = word[:prefix_len]
            if prefix in HEBREW_PREFIXES:
                stripped = word[prefix_len:]
                # Only strip if remaining word is substantial (3+ chars)
                if len(stripped) >= 3:
                    # For non-forced mode, only strip if stripped word is a known location
                    if not force:
                        stripped_lower = stripped.lower()
                        # Check if stripped word matches a known location
                        for loc in ISRAELI_LOCATIONS:
                            if stripped_lower == loc.lower() or stripped_lower in loc.lower():
                                return stripped
                    else:
                        return stripped

    return word


def _tokenize_hebrew(text: str, strip_prefixes: bool = False) -> List[str]:
    """
    Tokenize Hebrew/English text into searchable terms.
    Handles Hebrew word boundaries and filters stop words.

    Args:
        text: Input text to tokenize
        strip_prefixes: If True, strip Hebrew prefixes. Default False to preserve words like "בתי".
    """
    if not text:
        return []

    # Split on whitespace and punctuation
    tokens = re.split(r'[\s,.\-:;!?()[\]{}"\'/]+', text.lower())

    # Filter empty and stop words
    result = []
    for t in tokens:
        if not t or len(t) <= 1 or t in STOP_WORDS:
            continue
        if strip_prefixes:
            # Only strip if it's a known location (force=False)
            stripped = _strip_hebrew_prefix(t, force=False)
            if stripped and len(stripped) > 1:
                result.append(stripped)
            elif t and len(t) > 1:
                result.append(t)
        else:
            # Preserve original word
            if len(t) > 1:
                result.append(t)

    return result


def extract_field_intents(query: str) -> List[str]:
    """
    Extract user's field/column intents from the query.

    Examples:
        "courts with addresses" → ["address"]
        "hospitals with phone numbers" → ["phone"]
        "list of schools with addresses and contact info" → ["address", "contact"]
    """
    query_lower = query.lower()
    intents = []

    for intent, patterns in FIELD_INTENT_MAPPING.items():
        # Check if intent keyword is in query
        if intent in query_lower:
            intents.append(intent)
        # Also check Hebrew equivalents
        for pattern in patterns:
            if pattern in query_lower:
                intents.append(intent)
                break

    return list(set(intents))  # Remove duplicates


def match_fields_to_schema(intents: List[str], schema_fields: List[str]) -> Dict[str, Any]:
    """
    Match user's field intents to actual schema fields.

    Args:
        intents: User's requested field types (e.g., ["address", "phone"])
        schema_fields: Actual field names from the resource schema

    Returns:
        Dict with matched fields and any missing field info
    """
    matched = []
    missing = []
    schema_lower = {f.lower(): f for f in schema_fields}

    # Exclude common coordinate/internal fields from matching
    excluded_fields = {'x', 'y', 'lat', 'lon', 'lng', 'latitude', 'longitude', '_id', 'id',
                       'itm_x', 'itm_y', 'utm_x', 'utm_y', 'e_ord', 'n_ord'}

    for intent in intents:
        found = False
        patterns = FIELD_INTENT_MAPPING.get(intent, [intent])

        for pattern in patterns:
            pattern_lower = pattern.lower()
            # Exact match
            if pattern_lower in schema_lower:
                field = schema_lower[pattern_lower]
                if field.lower() not in excluded_fields:
                    matched.append(field)
                    found = True
                    break
            # Partial match - require minimum 3 chars to avoid false positives
            for schema_field in schema_fields:
                field_lower = schema_field.lower()
                # Skip excluded fields and very short field names
                if field_lower in excluded_fields or len(field_lower) < 3:
                    continue
                # Check for substantial overlap (pattern must be at least 3 chars)
                if len(pattern_lower) >= 3:
                    if pattern_lower in field_lower or field_lower in pattern_lower:
                        matched.append(schema_field)
                        found = True
                        break
            if found:
                break

        if not found:
            missing.append(intent)

    return {
        "matched_fields": list(set(matched)),
        "missing_intents": missing,
        "all_schema_fields": schema_fields
    }


def _decompose_query(query: str) -> Dict[str, Any]:
    """
    Decompose a query into subject tokens and location tokens.

    Handles Hebrew prefixes intelligently:
    - Subject words preserved (בתי משפט stays as-is for matching)
    - Location words stripped (בירושלים → ירושלים for location detection)

    Returns:
        Dict with:
        - subject_tokens: List of subject keywords (what the user wants)
        - location_tokens: List of location keywords (where) - with prefixes stripped
        - location_tokens_original: Original location tokens with prefixes (for display)
        - expanded_subjects: Hebrew expansions of subject tokens
        - all_tokens: Original tokens for fallback
    """
    # Tokenize without stripping prefixes to preserve subject words
    tokens = _tokenize_hebrew(query, strip_prefixes=False)
    query_lower = query.lower()

    subject_tokens = []
    location_tokens = []
    location_tokens_original = []
    expanded_subjects: List[str] = []

    for token in tokens:
        # Check if it's a known location (try both original and stripped)
        is_location = False
        token_lower = token.lower()

        # First try exact match
        for loc in ISRAELI_LOCATIONS:
            loc_lower = loc.lower()
            if token_lower == loc_lower or token_lower in loc_lower or loc_lower in token_lower:
                location_tokens.append(token)
                location_tokens_original.append(token)
                is_location = True
                break

        # If not found, try stripping Hebrew prefix
        if not is_location:
            stripped = _strip_hebrew_prefix(token, force=True)
            if stripped != token:  # Prefix was stripped
                stripped_lower = stripped.lower()
                for loc in ISRAELI_LOCATIONS:
                    loc_lower = loc.lower()
                    if stripped_lower == loc_lower or stripped_lower in loc_lower or loc_lower in stripped_lower:
                        # Found! Use stripped version for filtering, keep original for reference
                        location_tokens.append(stripped)
                        location_tokens_original.append(token)
                        is_location = True
                        break

        if not is_location:
            subject_tokens.append(token)
            # ENHANCED: Use Hebrew morphological variants + bidirectional expansion
            # This ensures "התקציבים" → "תקציב" → ["budget", "תקציבי"...] works
            # And "פשיעה" expands to ["crime", "עבירות"...] and vice versa

            # Get all Hebrew variants (strip prefixes, plural → singular, etc.)
            variants = get_hebrew_variants(token)

            # Try to find synonyms for each variant
            found_synonyms = set()
            for variant in variants:
                synonyms = get_all_synonyms(variant)
                if len(synonyms) > 1:  # Found synonyms (not just the original term)
                    found_synonyms.update(synonyms)

            # Also add the variants themselves (they might match keywords directly)
            found_synonyms.update(variants)

            if found_synonyms:
                expanded_subjects.extend(found_synonyms)

    # Also check for multi-word locations in original query
    for loc in ISRAELI_LOCATIONS:
        loc_lower = loc.lower()
        if loc_lower in query_lower:
            # Check if not already added
            if loc not in location_tokens and loc_lower not in [l.lower() for l in location_tokens]:
                location_tokens.append(loc)
                location_tokens_original.append(loc)

    return {
        "subject_tokens": subject_tokens,
        "location_tokens": location_tokens,  # Stripped versions for filtering
        "location_tokens_original": location_tokens_original,  # Original for display
        "expanded_subjects": list(set(expanded_subjects)),  # Remove duplicates
        "all_tokens": tokens
    }


# ============================================================================
# ENTERPRISE FALLBACK: Query Rephrasing Engine
# ============================================================================

# Hebrew stopwords and question words to filter out
HEBREW_STOPWORDS = {
    "את", "של", "על", "עם", "אל", "מה", "איך", "למה", "מי", "היכן", "מתי",
    "האם", "יש", "אין", "כל", "גם", "או", "אם", "לא", "כי", "זה", "זו", "זאת",
    "הוא", "היא", "הם", "הן", "אני", "אנחנו", "אתה", "את", "שלי", "שלך", "שלו",
    "בו", "בה", "בהם", "בהן", "לו", "לה", "להם", "להן", "ממנו", "ממנה",
    "מידע", "נתונים", "רשימה", "רשימת", "פרטים", "פרטי", "כמות", "סטטיסטיקה"
}

ENGLISH_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
    "what", "where", "when", "why", "how", "which", "who", "whom",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "about",
    "into", "through", "during", "before", "after", "above", "below",
    "all", "any", "both", "each", "few", "more", "most", "other", "some",
    "data", "information", "list", "details", "statistics", "numbers"
}


def rephrase_query(query: str) -> List[str]:
    """
    Generate alternative query phrasings for fallback matching.

    Returns list of rephrased queries, ordered by specificity (most → least).
    Used when initial query returns no/low-confidence matches.

    Strategies:
    1. Full morphological normalization (strip ALL prefixes/suffixes)
    2. Core subjects only (remove stopwords, question words, numbers)
    3. Category keyword extraction (find English equivalents)

    Performance: ~1ms (CPU only, no I/O)
    """
    rephrased = []

    # Tokenize
    tokens = _tokenize_hebrew(query, strip_prefixes=False)
    if not tokens:
        return []

    # Strategy 1: Full morphological normalization
    normalized = []
    for token in tokens:
        # Skip short tokens and numbers
        if len(token) < 2 or token.isdigit():
            continue

        # Get Hebrew variants (strips prefixes, plurals)
        variants = get_hebrew_variants(token)

        # Pick the BEST variant - one that has synonyms in our expansion dictionary
        # This avoids over-stemming compound words like "בתי" → "תי"
        best_variant = token
        best_score = 0

        for v in variants:
            if len(v) < 2:
                continue
            # Check if this variant has expansions
            synonyms = get_all_synonyms(v)
            if len(synonyms) > 1:
                # Has expansions - prefer this one
                if len(synonyms) > best_score:
                    best_score = len(synonyms)
                    best_variant = v

        # If no variant has expansions, keep original token
        normalized.append(best_variant)

    if normalized:
        norm_query = " ".join(normalized)
        if norm_query != query and norm_query.strip():
            rephrased.append(norm_query)

    # Strategy 2: Core subjects only (remove stopwords and question words)
    core_subjects = []
    for token in normalized:
        token_lower = token.lower()
        # Skip stopwords in both languages
        if token_lower in HEBREW_STOPWORDS or token_lower in ENGLISH_STOPWORDS:
            continue
        # Skip if it's a location (those are filtered separately)
        if token in ISRAELI_LOCATIONS or any(loc.lower() == token_lower for loc in ISRAELI_LOCATIONS):
            continue
        # Skip pure numbers (years, counts)
        if token.isdigit():
            continue
        # Keep if meaningful length
        if len(token) >= 2:
            core_subjects.append(token)

    if core_subjects and len(core_subjects) < len(normalized):
        # Limit to 3 core terms to avoid over-specificity
        core_query = " ".join(core_subjects[:3])
        if core_query and core_query not in rephrased:
            rephrased.append(core_query)

    # Strategy 3: Category keyword extraction
    # Find expansion terms and prefer English (broader matching)
    for token in core_subjects[:2]:  # Check first 2 core subjects
        synonyms = get_all_synonyms(token)
        if len(synonyms) > 1:
            # Find English terms in synonyms
            english_terms = [s for s in synonyms if s.isascii() and len(s) > 2]
            if english_terms:
                # Use first English term as a fallback
                eng_term = english_terms[0]
                if eng_term not in rephrased:
                    rephrased.append(eng_term)
                    break

    # Return max 3 alternatives (performance: 3 retries max)
    return rephrased[:3]


def get_category_suggestion(query: str) -> Optional[str]:
    """
    If query is too vague, return a suggestion to narrow down.
    Returns None if query is specific enough.
    """
    tokens = _tokenize_hebrew(query, strip_prefixes=False)
    meaningful = [t for t in tokens if len(t) > 2 and t.lower() not in HEBREW_STOPWORDS]

    if len(meaningful) < 1:
        return (
            "Query is too vague. Please specify a domain:\n"
            "• בריאות (health) - hospitals, clinics, medical data\n"
            "• חינוך (education) - schools, students, academic\n"
            "• תחבורה (transport) - vehicles, roads, traffic\n"
            "• תקציב (budget) - government spending, finance\n"
            "• מים (water) - water quality, supply\n"
            "• סביבה (environment) - pollution, nature, climate"
        )
    return None


def _calculate_subject_match(subject_tokens: List[str], expanded_subjects: List[str], text: str) -> float:
    """
    Calculate how well subject tokens match a text field.
    Uses both original tokens AND their Hebrew expansions.

    Returns a score from 0.0 to 1.0
    """
    if not text:
        return 0.0

    if not subject_tokens and not expanded_subjects:
        return 0.0

    text_lower = text.lower()
    text_tokens = set(_tokenize_hebrew(text))

    matches = 0
    total_checks = 0

    # Check original subject tokens
    for st in subject_tokens:
        total_checks += 1
        if st in text_tokens:
            matches += 1
        elif st in text_lower:
            matches += 0.7  # Partial match (substring)

    # Check Hebrew expansions (weighted slightly lower)
    for exp in expanded_subjects:
        total_checks += 0.5  # Expansions count less toward total
        exp_lower = exp.lower()
        # Check if expansion appears in text
        if exp_lower in text_lower:
            matches += 0.8
        else:
            # Check individual words from expansion
            exp_words = exp_lower.split()
            for word in exp_words:
                if len(word) > 2 and word in text_lower:
                    matches += 0.4
                    break

    if total_checks == 0:
        return 0.0

    return min(1.0, matches / total_checks)


def _calculate_location_match(location_tokens: List[str], text: str) -> float:
    """
    Calculate how well location tokens match a text field.
    Returns a score from 0.0 to 1.0
    """
    if not location_tokens or not text:
        return 0.0

    text_lower = text.lower()
    matches = 0

    for lt in location_tokens:
        if lt in text_lower:
            matches += 1

    return min(1.0, matches / len(location_tokens))


def suggest_for_query(query: str, map_data: Dict[str, Any], limit: int = 10) -> Dict[str, Any]:
    """
    Search the local resource map for datasets matching the query.

    ENTERPRISE-LEVEL SCORING ALGORITHM:
    1. Query Decomposition: Separates SUBJECT (what) from LOCATION (where)
    2. Semantic Expansion: Maps English terms to Hebrew equivalents
    3. Subject-First Scoring: Prioritizes subject match over location match
    4. Minimum Threshold: Returns "no match" if subject doesn't match

    Scoring weights:
    - Subject match (title): 40%
    - Subject match (name/tags): 30%
    - Hebrew expansion match: 20%
    - Location match: 10% (bonus only)
    - Format preference: 0-30% bonus

    Args:
        query: Search query (Hebrew or English)
        map_data: The loaded resources_map.json data
        limit: Max results to return (default 10)

    Returns:
        Dict with query, candidates, templates, and diagnostics
    """
    # Decompose query into subject and location tokens
    decomposed = _decompose_query(query)
    subject_tokens = decomposed["subject_tokens"]
    location_tokens = decomposed["location_tokens"]
    expanded_subjects = decomposed["expanded_subjects"]
    all_tokens = decomposed["all_tokens"]

    # MINIMUM SUBJECT THRESHOLD: If we have subject tokens, we MUST match them
    min_subject_threshold = 0.15 if subject_tokens else 0.0

    # COMPREHENSIVE KEYWORD MATCHING: Find resources by ALL schema keywords
    # This ensures queries with terms from ANY dataset can find that dataset
    keyword_resource_scores = find_matching_resources(subject_tokens + expanded_subjects)
    if keyword_resource_scores:
        log.debug(f"Keyword index matched {len(keyword_resource_scores)} resources")

    candidates = []

    for ds in map_data.get("datasets", []):
        ds_title = ds.get("title") or ds.get("name") or ""
        ds_name = ds.get("name") or ""
        tags = ds.get("tags") or []
        org = ds.get("organization") or ""

        # Combine all dataset text for matching
        all_ds_text = f"{ds_title} {ds_name} {' '.join(tags)} {org}"

        # Calculate SUBJECT match score (PRIMARY - 70% weight)
        subject_score = _calculate_subject_match(subject_tokens, expanded_subjects, all_ds_text)

        # CRITICAL: Skip if subject doesn't match at all
        if subject_tokens and subject_score < min_subject_threshold:
            continue

        # Calculate LOCATION match score (SECONDARY - 10% weight bonus)
        location_score = _calculate_location_match(location_tokens, all_ds_text)

        # Base score: Subject is primary, location is bonus
        base_score = (subject_score * 0.7) + (location_score * 0.1)

        # Score each resource
        for r in ds.get("resources", []) or []:
            rt = r.get("title") or r.get("name") or ""
            fmt = (r.get("format") or "").upper()

            resource_score = base_score

            # Resource-specific subject matching
            res_subject_score = _calculate_subject_match(subject_tokens, expanded_subjects, rt)
            resource_score += res_subject_score * 0.15

            # Format preference (CSV is most useful for data queries)
            fmt_bonus = {
                "CSV": 0.15,
                "XLSX": 0.12,
                "JSON": 0.10,
                "XML": 0.05,
                "PDF": 0.02,
                "API": 0.08
            }.get(fmt, 0.0)
            resource_score += fmt_bonus

            # Phase 3: Category-enhanced scoring from enterprise schemas
            rid = r.get("id")
            if rid:
                schema_info = get_resource_schema(rid)
                if schema_info:
                    ds_categories = schema_info.get("categories", [])
                    ds_keywords = schema_info.get("keywords", [])

                    # Category match bonus - if query matches dataset category
                    query_lower = query.lower()
                    for cat in ds_categories:
                        cat_lower = cat.lower()
                        # Check if category is in query or any expansion matches
                        if cat_lower in query_lower:
                            resource_score += 0.12
                            break
                        # Check if any subject token matches category expansions
                        cat_expansions = SUBJECT_EXPANSIONS.get(cat, [])
                        for exp in cat_expansions:
                            if exp.lower() in query_lower:
                                resource_score += 0.10
                                break

                    # Keyword match bonus - boost if pre-extracted keywords match query
                    keyword_matches = 0
                    for kw in ds_keywords[:25]:  # Check first 25 keywords
                        if kw.lower() in query_lower or query_lower in kw.lower():
                            keyword_matches += 1
                            if keyword_matches >= 3:
                                break
                    if keyword_matches > 0:
                        resource_score += min(0.10, keyword_matches * 0.04)

            # COMPREHENSIVE KEYWORD INDEX BOOST
            # This uses the pre-built index of ALL keywords from ALL datasets
            # to boost resources that match query terms via their schema keywords
            if rid and rid in keyword_resource_scores:
                keyword_boost = min(0.25, keyword_resource_scores[rid] * 0.08)
                resource_score += keyword_boost

            # Only include if subject match is reasonable
            if resource_score > 0.1:
                candidates.append({
                    "dataset_id": ds.get("id"),
                    "dataset_title": ds_title,
                    "dataset_name": ds_name,
                    "resource_id": r.get("id"),
                    "resource_title": rt,
                    "format": fmt,
                    "organization": org,
                    "tags": tags[:5],
                    "score": round(min(1.0, resource_score), 3),
                    "subject_score": round(subject_score, 3),
                    "location_score": round(location_score, 3)
                })

    # Sort by score descending
    candidates.sort(key=lambda x: x["score"], reverse=True)
    top = candidates[:limit]

    # Generate ready-to-use query templates for each candidate
    templates = []
    for c in top:
        rid = c["resource_id"]
        did = c["dataset_id"]
        templates.append({
            "choice": c,
            "datastore_search_get": build_datastore_search(rid, limit=100, offset=0),
            "datastore_search_post": build_datastore_search_request(rid, limit=100, offset=0, method="POST"),
            "datastore_search_hebrew": build_datastore_search_hebrew_wildcard(rid, query[:20] if query else "", limit=100),
            "package_show": build_package_show(did)
        })

    # Build informative response
    result = {
        "query": query,
        "decomposition": {
            "subject_tokens": subject_tokens,
            "location_tokens": location_tokens,
            "expanded_subjects": expanded_subjects[:10],  # Limit for readability
            "all_tokens": all_tokens
        },
        "candidates": top,
        "templates": templates,
        "total_matched": len(candidates)
    }

    # Add helpful message if no matches found
    if len(candidates) == 0:
        result["message"] = (
            f"No datasets found matching subject '{' '.join(subject_tokens)}'. "
            f"Hebrew expansions searched: {expanded_subjects[:5]}. "
            "Try using Hebrew keywords or different terms."
        )

    return result
