#!/bin/bash
# Reset Memory Data for NER Integration Testing
# PRESERVES: Chat history (conversations, messages, sessions)
# CLEARS: Memory collections in MongoDB + Qdrant vector collection

set -e

echo "=========================================="
echo "Memory Data Reset Script"
echo "=========================================="
echo ""
echo "This will CLEAR:"
echo "  - Qdrant: memories_v1 collection"
echo "  - MongoDB: memory_items, memory_versions, memory_outcomes,"
echo "             action_outcomes, known_solutions, kg_nodes, kg_edges,"
echo "             personality_memory_mappings, memoryBank (legacy)"
echo ""
echo "This will PRESERVE:"
echo "  - Chat history (conversations, messages, sessions)"
echo "  - User settings and preferences"
echo ""

read -p "Are you sure you want to reset memory data? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Step 1: Clearing Qdrant collection..."
echo "--------------------------------------"

# Drop and recreate Qdrant collection
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
COLLECTION="${QDRANT_COLLECTION:-memories_v1}"
VECTOR_NAME="${QDRANT_VECTOR_NAME:-dense}"
VECTOR_SIZE="${QDRANT_VECTOR_SIZE:-1024}"

# Helper: count points in Qdrant collection
qdrant_count_points() {
    curl -s -X POST "${QDRANT_URL}/collections/${COLLECTION}/points/count" \
        -H "Content-Type: application/json" \
        -d '{"exact": true}' 2>/dev/null | sed -n 's/.*"count":\([0-9]\+\).*/\1/p'
}

# Count points before deletion (if collection exists)
qdrant_before=0
if curl -s "${QDRANT_URL}/collections/${COLLECTION}" | grep -q "\"status\":\"ok\""; then
    qdrant_before=$(qdrant_count_points)
    qdrant_before=${qdrant_before:-0}
    echo "Qdrant points before reset: ${qdrant_before}"
fi

# Check if collection exists
if curl -s "${QDRANT_URL}/collections/${COLLECTION}" | grep -q "\"status\":\"ok\""; then
    echo "Deleting Qdrant collection: ${COLLECTION}"
    curl -s -X DELETE "${QDRANT_URL}/collections/${COLLECTION}" > /dev/null
    echo "✓ Qdrant collection deleted"
else
    echo "! Qdrant collection does not exist (already clean)"
fi

# Recreate collection with correct dimensions (1024 for BGE-M3) and correct vector name
echo "Creating fresh Qdrant collection with ${VECTOR_SIZE} dimensions (vector: ${VECTOR_NAME})..."
curl -s -X PUT "${QDRANT_URL}/collections/${COLLECTION}" \
    -H "Content-Type: application/json" \
    -d "{
        \"vectors\": {
            \"${VECTOR_NAME}\": {
                \"size\": ${VECTOR_SIZE},
                \"distance\": \"Cosine\"
            }
        }
    }" > /dev/null
echo "✓ Qdrant collection created"

# Create payload indexes for entity filtering
echo "Creating payload indexes..."
curl -s -X PUT "${QDRANT_URL}/collections/${COLLECTION}/index" \
    -H "Content-Type: application/json" \
    -d '{"field_name": "user_id", "field_schema": "keyword"}' > /dev/null
curl -s -X PUT "${QDRANT_URL}/collections/${COLLECTION}/index" \
    -H "Content-Type: application/json" \
    -d '{"field_name": "tier", "field_schema": "keyword"}' > /dev/null
curl -s -X PUT "${QDRANT_URL}/collections/${COLLECTION}/index" \
    -H "Content-Type: application/json" \
    -d '{"field_name": "status", "field_schema": "keyword"}' > /dev/null
curl -s -X PUT "${QDRANT_URL}/collections/${COLLECTION}/index" \
    -H "Content-Type: application/json" \
    -d '{"field_name": "entities", "field_schema": "keyword"}' > /dev/null
echo "✓ Payload indexes created (user_id, tier, status, entities)"

# Count points after recreation
qdrant_after=$(qdrant_count_points)
qdrant_after=${qdrant_after:-0}
echo "Qdrant points after reset: ${qdrant_after} (cleared: ${qdrant_before})"

echo ""
echo "Step 2: Clearing MongoDB memory collections..."
echo "-----------------------------------------------"

# MongoDB connection
MONGO_URL="${MONGO_URL:-mongodb://localhost:27017}"
DB_NAME="${MONGODB_DB_NAME:-chat-ui}"

# List of memory collections to clear (NOT chat history)
MEMORY_COLLECTIONS=(
    "memory_items"
    "memory_versions"
    "memory_outcomes"
    "action_outcomes"
    "known_solutions"
    "kg_nodes"
    "kg_edges"
    "personality_memory_mappings"
    "reindex_checkpoints"
    "consistency_logs"
    "memoryBank"
)

total_deleted=0

for collection in "${MEMORY_COLLECTIONS[@]}"; do
    echo "Clearing: ${collection}"
    before_count=$(mongosh "${MONGO_URL}/${DB_NAME}" --quiet --eval "db.${collection}.countDocuments({})" 2>/dev/null || echo "0")
    deleted_count=$(mongosh "${MONGO_URL}/${DB_NAME}" --quiet --eval "db.${collection}.deleteMany({}).deletedCount" 2>/dev/null || echo "0")
    after_count=$(mongosh "${MONGO_URL}/${DB_NAME}" --quiet --eval "db.${collection}.countDocuments({})" 2>/dev/null || echo "0")

    if [[ "$deleted_count" =~ ^[0-9]+$ ]]; then
        total_deleted=$((total_deleted + deleted_count))
    else
        deleted_count=0
    fi

    echo "  before=${before_count} deleted=${deleted_count} after=${after_count}"
done

echo "✓ MongoDB memory collections cleared (total deleted: ${total_deleted})"

echo ""
echo "Step 3: Verifying preserved collections..."
echo "------------------------------------------"

# Verify chat history is preserved
conversations=$(mongosh "${MONGO_URL}/${DB_NAME}" --quiet --eval "db.conversations.countDocuments({})" 2>/dev/null || echo "0")
messages=$(mongosh "${MONGO_URL}/${DB_NAME}" --quiet --eval "db.messages.countDocuments({})" 2>/dev/null || echo "0")
sessions=$(mongosh "${MONGO_URL}/${DB_NAME}" --quiet --eval "db.sessions.countDocuments({})" 2>/dev/null || echo "0")

echo "✓ Preserved: ${conversations} conversations, ${messages} messages, ${sessions} sessions"

echo ""
echo "=========================================="
echo "Memory Reset Complete!"
echo "=========================================="
echo ""
echo "Your chat history is preserved."
echo "Memory system is now clean for NER testing."
echo ""
echo "Next steps:"
echo "  1. Restart the frontend: docker restart frontend-UI"
echo "  2. Run validation: ./scripts/validate-ner-integration.sh"
echo "  3. Start testing memory features in the UI"
