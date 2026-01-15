#!/usr/bin/env python3
"""
DataGov Expansions JSON Export Script

Phase 25.12: Create Expansions JSON Export Script

This script exports all semantic term expansions from query_builder.py
to a JSON file that can be loaded by the TypeScript DataGov ingestion service.

Usage:
    python export_expansions.py [--output OUTPUT_FILE]

Output format:
{
    "domains": {
        "TRANSPORTATION": {
            "terms_he": ["תחבורה", "נסיעה", ...],
            "terms_en": ["transportation", "travel", ...],
            "bidirectional": {"תחבורה": ["transport", "travel"]}
        },
        ...
    },
    "total_terms": 9500,
    "total_domains": 22,
    "generated_at": "2026-01-15T00:00:00Z"
}
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    from query_builder import SUBJECT_EXPANSIONS
    print(f"Loaded SUBJECT_EXPANSIONS with {len(SUBJECT_EXPANSIONS)} entries")
except ImportError as e:
    print(f"Error importing SUBJECT_EXPANSIONS from query_builder: {e}", file=sys.stderr)
    # Fallback: define minimal expansions
    SUBJECT_EXPANSIONS = {
        "transportation": ["תחבורה", "נסיעה", "אוטובוס", "רכבת"],
        "health": ["בריאות", "רפואה", "בית חולים"],
        "education": ["חינוך", "בית ספר", "אוניברסיטה"],
    }
    print(f"Using fallback expansions with {len(SUBJECT_EXPANSIONS)} entries")


# Domain categorization mapping (English key -> domain)
DOMAIN_MAPPING: Dict[str, str] = {
    # Transportation
    "bus": "TRANSPORTATION",
    "train": "TRANSPORTATION", 
    "airport": "TRANSPORTATION",
    "road": "TRANSPORTATION",
    "traffic": "TRANSPORTATION",
    "vehicle": "TRANSPORTATION",
    "car": "TRANSPORTATION",
    
    # Healthcare
    "hospital": "HEALTH",
    "hospitals": "HEALTH",
    "clinic": "HEALTH",
    "health": "HEALTH",
    "medical": "HEALTH",
    "trauma": "HEALTH",
    "doctor": "HEALTH",
    "pharmacy": "HEALTH",
    
    # Education
    "school": "EDUCATION",
    "schools": "EDUCATION",
    "high school": "EDUCATION",
    "highschool": "EDUCATION",
    "elementary": "EDUCATION",
    "university": "EDUCATION",
    "college": "EDUCATION",
    "education": "EDUCATION",
    "student": "EDUCATION",
    "kindergarten": "EDUCATION",
    
    # Legal/Justice
    "court": "JUSTICE",
    "courts": "JUSTICE",
    "judge": "JUSTICE",
    "legal": "JUSTICE",
    "law": "JUSTICE",
    "crime": "JUSTICE",
    "police": "JUSTICE",
    
    # Government
    "ministry": "GOVERNMENT",
    "government": "GOVERNMENT",
    "municipality": "GOVERNMENT",
    "office": "GOVERNMENT",
    
    # Finance
    "tax": "FINANCE",
    "budget": "FINANCE",
    "bank": "FINANCE",
    "finance": "FINANCE",
    
    # Environment
    "water": "ENVIRONMENT",
    "air": "ENVIRONMENT",
    "environment": "ENVIRONMENT",
    "weather": "ENVIRONMENT",
    "park": "ENVIRONMENT",
    
    # Social Services
    "welfare": "WELFARE",
    "elderly": "WELFARE",
    "disability": "WELFARE",
    "housing": "HOUSING",
    
    # Statistics
    "population": "DEMOGRAPHICS",
    "census": "STATISTICS",
    "statistics": "STATISTICS",
    
    # Business
    "business": "ECONOMY",
    "company": "ECONOMY",
    "license": "ECONOMY",
    "permit": "ECONOMY",
}


def is_hebrew(text: str) -> bool:
    """Check if text contains Hebrew characters."""
    return any('\u0590' <= char <= '\u05FF' for char in text)


def categorize_term(term: str) -> str:
    """Categorize a term into a domain."""
    term_lower = term.lower().strip()
    
    # Direct mapping
    if term_lower in DOMAIN_MAPPING:
        return DOMAIN_MAPPING[term_lower]
    
    # Partial matching
    for key, domain in DOMAIN_MAPPING.items():
        if key in term_lower or term_lower in key:
            return domain
    
    return "GENERAL"


def extract_domains() -> Dict[str, Dict[str, Any]]:
    """Extract and organize expansions by domain."""
    domains: Dict[str, Dict[str, List[str]]] = {}
    
    for term, expansions in SUBJECT_EXPANSIONS.items():
        domain = categorize_term(term)
        
        if domain not in domains:
            domains[domain] = {
                "terms_he": set(),
                "terms_en": set(),
            }
        
        # Categorize original term
        if is_hebrew(term):
            domains[domain]["terms_he"].add(term)
        else:
            domains[domain]["terms_en"].add(term)
        
        # Categorize expansions
        for exp in expansions:
            if is_hebrew(exp):
                domains[domain]["terms_he"].add(exp)
            else:
                domains[domain]["terms_en"].add(exp)
    
    # Convert sets to sorted lists
    result = {}
    for domain, data in domains.items():
        result[domain] = {
            "terms_he": sorted(list(data["terms_he"])),
            "terms_en": sorted(list(data["terms_en"])),
            "term_count": len(data["terms_he"]) + len(data["terms_en"]),
        }
    
    return result


def export_expansions(output_path: str = None) -> Dict[str, Any]:
    """Export all expansions to a structured format."""
    domains = extract_domains()
    
    # Calculate totals
    total_terms = sum(d["term_count"] for d in domains.values())
    
    result = {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "query_builder.py",
        "total_domains": len(domains),
        "total_terms": total_terms,
        "domains": domains,
        # Include raw expansions for debugging/verification
        "raw_expansions_count": len(SUBJECT_EXPANSIONS),
    }
    
    if output_path:
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Exported {total_terms} terms across {len(domains)} domains to {output_path}")
    
    return result


def main():
    """CLI entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Export DataGov semantic expansions to JSON"
    )
    parser.add_argument(
        "--output", "-o",
        default="enterprise_expansions.json",
        help="Output file path (default: enterprise_expansions.json)"
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print to stdout instead of file"
    )
    
    args = parser.parse_args()
    
    if args.stdout:
        result = export_expansions()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        export_expansions(args.output)


if __name__ == "__main__":
    main()
