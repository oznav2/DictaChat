"""
Integration Example: Hebrew NER in Next.js Chat Application
This shows how to integrate the NER service with your chat app
"""

# ============================================================
# Backend Integration (Python/FastAPI)
# ============================================================

from ner_client import HebrewNERClient, Entity
from typing import List, Dict, Optional
import json

class ChatMessageProcessor:
    """Process chat messages with NER analysis"""
    
    def __init__(self, ner_service_url: str = "http://hebrew-ner:8000"):
        self.ner_client = HebrewNERClient(ner_service_url)
    
    def process_message(
        self,
        message: str,
        extract_entities: bool = True,
        confidence_threshold: float = 0.85
    ) -> Dict:
        """
        Process a chat message and extract entities
        
        Args:
            message: The chat message text
            extract_entities: Whether to extract entities
            confidence_threshold: Minimum confidence for entities
            
        Returns:
            Dict with message and entity information
        """
        result = {
            "message": message,
            "entities": [],
            "metadata": {}
        }
        
        if not extract_entities or not message.strip():
            return result
        
        try:
            # Extract entities
            response = self.ner_client.extract_entities(
                message,
                confidence_threshold=confidence_threshold
            )
            
            # Parse entities
            entities = self.ner_client.parse_entities(response)
            
            # Format entities for frontend
            result["entities"] = [
                {
                    "type": e.entity_group,
                    "text": e.word,
                    "start": e.start,
                    "end": e.end,
                    "confidence": round(e.score, 3)
                }
                for e in entities
            ]
            
            # Add metadata
            result["metadata"] = {
                "entity_count": response["entity_count"],
                "entity_types": response["entity_types"],
                "processing_time_ms": response["processing_time_ms"]
            }
            
        except Exception as e:
            print(f"NER processing error: {e}")
            result["metadata"]["error"] = str(e)
        
        return result
    
    def enrich_conversation_context(
        self,
        messages: List[str],
        context_window: int = 5
    ) -> Dict[str, List[str]]:
        """
        Extract entities from recent conversation for context
        
        Args:
            messages: List of recent messages
            context_window: Number of recent messages to analyze
            
        Returns:
            Dict mapping entity types to lists of unique entities
        """
        context = {}
        recent_messages = messages[-context_window:]
        
        try:
            # Batch process recent messages
            response = self.ner_client.extract_entities_batch(
                recent_messages,
                confidence_threshold=0.85
            )
            
            # Collect unique entities by type
            for result in response.get("results", []):
                for entity in result.get("entities", []):
                    entity_type = entity["entity_group"]
                    entity_text = entity["word"]
                    
                    if entity_type not in context:
                        context[entity_type] = set()
                    context[entity_type].add(entity_text)
            
            # Convert sets to lists
            context = {k: list(v) for k, v in context.items()}
            
        except Exception as e:
            print(f"Context enrichment error: {e}")
        
        return context


# ============================================================
# Next.js API Route Example (TypeScript)
# ============================================================

"""
// File: app/api/chat/route.ts

import { NextRequest, NextResponse } from 'next/server';

interface NEREntity {
  type: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface ProcessedMessage {
  message: string;
  entities: NEREntity[];
  metadata: {
    entity_count: number;
    entity_types: Record<string, number>;
    processing_time_ms: number;
  };
}

const NER_SERVICE_URL = process.env.NER_SERVICE_URL || 'http://localhost:8000';

async function extractEntities(text: string): Promise<ProcessedMessage> {
  try {
    const response = await fetch(`${NER_SERVICE_URL}/api/v1/ner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        aggregation_strategy: 'simple',
        confidence_threshold: 0.85,
      }),
    });

    if (!response.ok) {
      throw new Error('NER service error');
    }

    const data = await response.json();
    
    return {
      message: text,
      entities: data.entities.map((e: any) => ({
        type: e.entity_group,
        text: e.word,
        start: e.start,
        end: e.end,
        confidence: e.score,
      })),
      metadata: {
        entity_count: data.entity_count,
        entity_types: data.entity_types,
        processing_time_ms: data.processing_time_ms,
      },
    };
  } catch (error) {
    console.error('NER extraction failed:', error);
    return {
      message: text,
      entities: [],
      metadata: {
        entity_count: 0,
        entity_types: {},
        processing_time_ms: 0,
      },
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, extractEntities: shouldExtract = true } = await req.json();

    // Extract entities if enabled
    let processedMessage = null;
    if (shouldExtract && message) {
      processedMessage = await extractEntities(message);
    }

    // Your existing chat logic here
    // ...

    return NextResponse.json({
      success: true,
      processedMessage,
      // ... other response data
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
"""


# ============================================================
# React Component Example (TypeScript)
# ============================================================

"""
// File: components/ChatMessage.tsx

import React from 'react';

interface Entity {
  type: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface ChatMessageProps {
  message: string;
  entities?: Entity[];
  showEntities?: boolean;
}

const entityColors: Record<string, string> = {
  PER: 'bg-blue-100 border-blue-300 text-blue-800',
  GPE: 'bg-green-100 border-green-300 text-green-800',
  ORG: 'bg-purple-100 border-purple-300 text-purple-800',
  LOC: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  TIMEX: 'bg-red-100 border-red-300 text-red-800',
  TTL: 'bg-indigo-100 border-indigo-300 text-indigo-800',
};

const entityLabels: Record<string, string> = {
  PER: 'אדם',
  GPE: 'מיקום',
  ORG: 'ארגון',
  LOC: 'מקום',
  TIMEX: 'זמן',
  TTL: 'תואר',
};

export function ChatMessage({ message, entities = [], showEntities = true }: ChatMessageProps) {
  const renderHighlightedMessage = () => {
    if (!showEntities || entities.length === 0) {
      return <span>{message}</span>;
    }

    // Sort entities by start position
    const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
    
    const parts: JSX.Element[] = [];
    let lastIndex = 0;

    sortedEntities.forEach((entity, idx) => {
      // Add text before entity
      if (entity.start > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {message.slice(lastIndex, entity.start)}
          </span>
        );
      }

      // Add entity with highlight
      const colorClass = entityColors[entity.type] || 'bg-gray-100 border-gray-300 text-gray-800';
      parts.push(
        <span
          key={`entity-${idx}`}
          className={`inline-flex items-center px-1 rounded border ${colorClass} cursor-help`}
          title={`${entityLabels[entity.type] || entity.type} (${(entity.confidence * 100).toFixed(0)}%)`}
        >
          {entity.text}
        </span>
      );

      lastIndex = entity.end;
    });

    // Add remaining text
    if (lastIndex < message.length) {
      parts.push(
        <span key="text-end">
          {message.slice(lastIndex)}
        </span>
      );
    }

    return <>{parts}</>;
  };

  return (
    <div className="message-container">
      <div className="message-text" dir="rtl">
        {renderHighlightedMessage()}
      </div>
      
      {showEntities && entities.length > 0 && (
        <div className="entity-tags mt-2 flex flex-wrap gap-1">
          {entities.map((entity, idx) => (
            <span
              key={idx}
              className={`text-xs px-2 py-1 rounded-full ${
                entityColors[entity.type] || 'bg-gray-100 text-gray-800'
              }`}
            >
              {entityLabels[entity.type] || entity.type}: {entity.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
"""


# ============================================================
# Custom Hook Example (TypeScript)
# ============================================================

"""
// File: hooks/useNER.ts

import { useState, useCallback } from 'react';

interface Entity {
  type: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface UseNERResult {
  entities: Entity[];
  isLoading: boolean;
  error: string | null;
  extractEntities: (text: string) => Promise<void>;
  clearEntities: () => void;
}

export function useNER(serviceUrl: string = '/api/ner'): UseNERResult {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractEntities = useCallback(async (text: string) => {
    if (!text.trim()) {
      setEntities([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to extract entities');
      }

      const data = await response.json();
      setEntities(data.entities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setEntities([]);
    } finally {
      setIsLoading(false);
    }
  }, [serviceUrl]);

  const clearEntities = useCallback(() => {
    setEntities([]);
    setError(null);
  }, []);

  return {
    entities,
    isLoading,
    error,
    extractEntities,
    clearEntities,
  };
}
"""


# ============================================================
# Environment Configuration
# ============================================================

"""
# .env.local (Next.js)
NER_SERVICE_URL=http://localhost:8000

# For production with Docker Compose
NER_SERVICE_URL=http://hebrew-ner:8000
"""


# ============================================================
# Docker Compose Integration
# ============================================================

"""
# docker-compose.yml (Add to your existing setup)

version: '3.8'

services:
  # Your existing services...
  
  hebrew-ner:
    build: ./hebrew-ner-service
    container_name: hebrew-ner
    ports:
      - "8000:8000"
    volumes:
      - ner-cache:/root/.cache/huggingface
    networks:
      - app-network
    restart: unless-stopped
  
  nextjs-app:
    # Your Next.js app config
    environment:
      - NER_SERVICE_URL=http://hebrew-ner:8000
    depends_on:
      - hebrew-ner
    networks:
      - app-network

volumes:
  ner-cache:

networks:
  app-network:
    driver: bridge
"""