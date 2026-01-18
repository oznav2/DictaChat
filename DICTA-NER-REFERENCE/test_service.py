#!/usr/bin/env python3
"""
Test script for Hebrew NER Service
Run this to verify your service is working correctly
"""

import sys
import time
from ner_client import HebrewNERClient

# ANSI color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
BOLD = '\033[1m'
RESET = '\033[0m'

def print_success(msg):
    print(f"{GREEN}✓ {msg}{RESET}")

def print_error(msg):
    print(f"{RED}✗ {msg}{RESET}")

def print_info(msg):
    print(f"{BLUE}ℹ {msg}{RESET}")

def print_warning(msg):
    print(f"{YELLOW}⚠ {msg}{RESET}")

def test_health_check(client):
    """Test service health"""
    print_info("Testing health check...")
    try:
        healthy = client.health_check()
        if healthy:
            print_success("Service is healthy")
            return True
        else:
            print_error("Service is not healthy")
            return False
    except Exception as e:
        print_error(f"Health check failed: {e}")
        return False

def test_single_ner(client):
    """Test single text NER"""
    print_info("Testing single text NER...")
    
    test_text = "דוד בן-גוריון היה ראש הממשלה הראשון של מדינת ישראל. הוא נולד ב-16 באוקטובר 1886."
    
    try:
        response = client.extract_entities(test_text, confidence_threshold=0.85)
        
        if response['entity_count'] > 0:
            print_success(f"Found {response['entity_count']} entities")
            print(f"  Entity types: {response['entity_types']}")
            print(f"  Processing time: {response['processing_time_ms']}ms")
            
            entities = client.parse_entities(response)
            print("\n  Detected entities:")
            for entity in entities:
                print(f"    {BOLD}{entity.word}{RESET} ({entity.entity_group}) - confidence: {entity.score:.3f}")
            
            return True
        else:
            print_warning("No entities found (unexpected)")
            return False
            
    except Exception as e:
        print_error(f"Single NER test failed: {e}")
        return False

def test_batch_ner(client):
    """Test batch NER"""
    print_info("\nTesting batch NER...")
    
    test_texts = [
        "ביבי נתניהו נפגש עם ג'ו ביידן בבית הלבן.",
        "ירושלים היא בירת ישראל.",
        "האוניברסיטה העברית נמצאת בהר הצופים."
    ]
    
    try:
        response = client.extract_entities_batch(test_texts, confidence_threshold=0.85)
        
        total_entities = sum(r['entity_count'] for r in response['results'])
        print_success(f"Processed {response['total_texts']} texts")
        print(f"  Total entities found: {total_entities}")
        print(f"  Processing time: {response['processing_time_ms']}ms")
        
        for i, result in enumerate(response['results'], 1):
            print(f"\n  Text {i}: {result['entity_count']} entities")
            for entity in result['entities']:
                print(f"    - {entity['word']} ({entity['entity_group']})")
        
        return True
        
    except Exception as e:
        print_error(f"Batch NER test failed: {e}")
        return False

def test_confidence_filtering(client):
    """Test confidence threshold filtering"""
    print_info("\nTesting confidence filtering...")
    
    test_text = "דוד בן-גוריון היה ראש הממשלה של ישראל"
    
    try:
        # Low threshold
        response_low = client.extract_entities(test_text, confidence_threshold=0.5)
        
        # High threshold
        response_high = client.extract_entities(test_text, confidence_threshold=0.95)
        
        count_low = response_low['entity_count']
        count_high = response_high['entity_count']
        
        print_success(f"Confidence filtering working")
        print(f"  Threshold 0.5: {count_low} entities")
        print(f"  Threshold 0.95: {count_high} entities")
        
        if count_low >= count_high:
            print_success("Filtering logic correct (lower threshold = more entities)")
            return True
        else:
            print_warning("Unexpected filtering behavior")
            return False
            
    except Exception as e:
        print_error(f"Confidence filtering test failed: {e}")
        return False

def test_entity_types(client):
    """Test getting entity types"""
    print_info("\nTesting entity types endpoint...")
    
    try:
        entity_types = client.get_entity_types()
        
        if entity_types:
            print_success(f"Retrieved {len(entity_types)} entity types")
            print("\n  Supported entity types:")
            for code, description in list(entity_types.items())[:5]:
                print(f"    {code}: {description}")
            if len(entity_types) > 5:
                print(f"    ... and {len(entity_types) - 5} more")
            return True
        else:
            print_warning("No entity types returned")
            return False
            
    except Exception as e:
        print_error(f"Entity types test failed: {e}")
        return False

def test_highlighting(client):
    """Test entity highlighting"""
    print_info("\nTesting entity highlighting...")
    
    test_text = "דוד בן-גוריון היה ראש הממשלה של ישראל"
    
    try:
        response = client.extract_entities(test_text, confidence_threshold=0.85)
        entities = client.parse_entities(response)
        
        if entities:
            highlighted = client.highlight_entities(test_text, entities, format="console")
            print_success("Entity highlighting working")
            print(f"\n  Original: {test_text}")
            print(f"  Highlighted: {highlighted}")
            return True
        else:
            print_warning("No entities to highlight")
            return False
            
    except Exception as e:
        print_error(f"Highlighting test failed: {e}")
        return False

def performance_test(client):
    """Test performance with multiple requests"""
    print_info("\nPerformance test (10 requests)...")
    
    test_text = "ביבי נתניהו נפגש עם ג'ו ביידן בבית הלבן ביום שני."
    
    try:
        times = []
        for _ in range(10):
            start = time.time()
            client.extract_entities(test_text)
            times.append((time.time() - start) * 1000)
        
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        
        print_success("Performance test completed")
        print(f"  Average: {avg_time:.2f}ms")
        print(f"  Min: {min_time:.2f}ms")
        print(f"  Max: {max_time:.2f}ms")
        
        if avg_time < 100:
            print_success("Performance is excellent")
        elif avg_time < 200:
            print_success("Performance is good")
        else:
            print_warning("Performance could be improved")
        
        return True
        
    except Exception as e:
        print_error(f"Performance test failed: {e}")
        return False

def main():
    """Run all tests"""
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}Hebrew NER Service - Test Suite{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")
    
    # Initialize client
    service_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    print_info(f"Testing service at: {service_url}\n")
    
    client = HebrewNERClient(service_url)
    
    # Run tests
    tests = [
        ("Health Check", test_health_check),
        ("Single Text NER", test_single_ner),
        ("Batch NER", test_batch_ner),
        ("Confidence Filtering", test_confidence_filtering),
        ("Entity Types", test_entity_types),
        ("Entity Highlighting", test_highlighting),
        ("Performance", performance_test)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{BOLD}Test: {test_name}{RESET}")
        print("-" * 60)
        
        try:
            success = test_func(client)
            results.append((test_name, success))
        except Exception as e:
            print_error(f"Test crashed: {e}")
            results.append((test_name, False))
        
        time.sleep(0.5)  # Brief pause between tests
    
    # Summary
    print(f"\n\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}Test Summary{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = f"{GREEN}PASSED{RESET}" if success else f"{RED}FAILED{RESET}"
        print(f"  {test_name}: {status}")
    
    print(f"\n{BOLD}Results: {passed}/{total} tests passed{RESET}")
    
    if passed == total:
        print(f"\n{GREEN}{BOLD}✓ All tests passed! Service is working correctly.{RESET}\n")
        return 0
    else:
        print(f"\n{YELLOW}{BOLD}⚠ Some tests failed. Check the output above.{RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())