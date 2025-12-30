#!/bin/bash
set -e

echo "🚀 Starting BAAI Retrieval Services..."

# Function to handle shutdown gracefully
shutdown() {
    echo "🛑 Shutting down services..."
    kill $EMBED_PID $RERANK_PID 2>/dev/null || true
    wait $EMBED_PID $RERANK_PID 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

# Trap termination signals
trap shutdown SIGTERM SIGINT EXIT

# Start embedding service in background
echo "📊 Starting Embedding Service on port ${EMBEDDING_PORT:-5005}..."
SERVICE_TYPE=embedding \
FASTAPI_PORT=${EMBEDDING_PORT:-5005} \
FASTAPI_HOST=${FASTAPI_HOST:-0.0.0.0} \
EMBEDDING_MODEL_NAME="${EMBEDDING_MODEL_NAME}" \
LOG_LEVEL="${LOG_LEVEL}" \
DEVICE="${DEVICE}" \
USE_FP16="${USE_FP16}" \
MODEL_IDLE_TIMEOUT="${MODEL_IDLE_TIMEOUT}" \
python -m src.main &

EMBED_PID=$!
echo "✅ Embedding service started (PID: $EMBED_PID)"

# Wait for embedding service to initialize
sleep 15

# Start reranking service in background
echo "🔄 Starting Reranking Service on port ${RERANKING_PORT:-5006}..."
SERVICE_TYPE=reranker \
FASTAPI_PORT=${RERANKING_PORT:-5006} \
FASTAPI_HOST=${FASTAPI_HOST:-0.0.0.0} \
RERANKER_MODEL_NAME="${RERANKER_MODEL_NAME}" \
LOG_LEVEL="${LOG_LEVEL}" \
DEVICE="${DEVICE}" \
USE_FP16="${USE_FP16}" \
MODEL_IDLE_TIMEOUT="${MODEL_IDLE_TIMEOUT}" \
python -m src.main &

RERANK_PID=$!
echo "✅ Reranking service started (PID: $RERANK_PID)"

echo "✅ All services running!"
echo "   📊 Dicta BAAI Embeddings:  http://${FASTAPI_HOST:-localhost}:${EMBEDDING_PORT:-5005}"
echo "   🔄 Dicta BAAI Reranking:   http://${FASTAPI_HOST:-localhost}:${RERANKING_PORT:-5006}"

# Wait for both processes (keeps container alive)
wait $EMBED_PID $RERANK_PID