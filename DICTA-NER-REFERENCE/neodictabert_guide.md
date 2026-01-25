# Using NeoDictaBERT-bilingual

## Important: Base Model vs Fine-Tuned Model

NeoDictaBERT-bilingual is a **base model** (released October 2025), not a fine-tuned NER model. This means:

❌ **Does NOT work for NER out-of-the-box**
✅ **Excellent for semantic search and embeddings**
✅ **Can be fine-tuned for NER if you have training data**
✅ **Superior performance for Hebrew + English bilingual tasks**

---

## Option 1: Use for NER (Requires Fine-Tuning)

If you want to use NeoDictaBERT-bilingual for NER, you need to fine-tune it first.

### Step 1: Prepare Training Data

You need labeled NER data in the format:
```python
{
    "tokens": ["דוד", "בן-גוריון", "היה", "ראש", "הממשלה"],
    "ner_tags": ["B-PER", "I-PER", "O", "B-TTL", "I-TTL"]
}
```

Common Hebrew NER datasets:
- NEMO dataset (used by DictaBERT)
- Your own labeled data

### Step 2: Fine-Tune the Model

```python
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    TrainingArguments,
    Trainer
)
from datasets import load_dataset

# Load model and tokenizer
model_name = "dicta-il/neodictabert-bilingual"
tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)

# Define label mapping
label_list = ["O", "B-PER", "I-PER", "B-ORG", "I-ORG", "B-LOC", "I-LOC", 
              "B-GPE", "I-GPE", "B-TIMEX", "I-TIMEX", "B-TTL", "I-TTL"]
label2id = {label: i for i, label in enumerate(label_list)}
id2label = {i: label for label, i in label2id.items()}

# Initialize model for token classification
model = AutoModelForTokenClassification.from_pretrained(
    model_name,
    num_labels=len(label_list),
    id2label=id2label,
    label2id=label2id,
    trust_remote_code=True
)

# Load your dataset
dataset = load_dataset("your_ner_dataset")

# Tokenize dataset
def tokenize_and_align_labels(examples):
    tokenized_inputs = tokenizer(
        examples["tokens"],
        truncation=True,
        is_split_into_words=True,
        padding="max_length",
        max_length=512
    )
    
    labels = []
    for i, label in enumerate(examples["ner_tags"]):
        word_ids = tokenized_inputs.word_ids(batch_index=i)
        previous_word_idx = None
        label_ids = []
        
        for word_idx in word_ids:
            if word_idx is None:
                label_ids.append(-100)
            elif word_idx != previous_word_idx:
                label_ids.append(label[word_idx])
            else:
                label_ids.append(-100)
            previous_word_idx = word_idx
        
        labels.append(label_ids)
    
    tokenized_inputs["labels"] = labels
    return tokenized_inputs

tokenized_dataset = dataset.map(tokenize_and_align_labels, batched=True)

# Training arguments
training_args = TrainingArguments(
    output_dir="./neodictabert-bilingual-ner",
    evaluation_strategy="epoch",
    learning_rate=2e-5,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=16,
    num_train_epochs=3,
    weight_decay=0.01,
    save_strategy="epoch",
    load_best_model_at_end=True,
)

# Initialize trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset["train"],
    eval_dataset=tokenized_dataset["validation"],
    tokenizer=tokenizer,
)

# Train!
trainer.train()

# Save the fine-tuned model
trainer.save_model("./neodictabert-bilingual-ner-finetuned")
```

### Step 3: Use Your Fine-Tuned Model

Update your `.env` file:
```bash
# Use your fine-tuned model
MODEL_NAME=./neodictabert-bilingual-ner-finetuned
USE_CUSTOM_CODE=true
```

Or upload to Hugging Face and use it:
```bash
MODEL_NAME=your-username/neodictabert-bilingual-ner
USE_CUSTOM_CODE=true
```

---

## Option 2: Use for Semantic Search (Recommended!)

NeoDictaBERT-bilingual excels at semantic understanding. Use it for:
- Document similarity
- Semantic search
- Question answering
- Text classification

### Semantic Search Implementation

```python
from transformers import AutoModel, AutoTokenizer
import torch
import numpy as np

class SemanticSearchEngine:
    def __init__(self, model_name="dicta-il/neodictabert-bilingual"):
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True
        )
        self.model = AutoModel.from_pretrained(
            model_name,
            trust_remote_code=True
        )
        self.model.eval()
    
    def get_embedding(self, text):
        """Get dense vector embedding for text"""
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True
        )
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            # Use [CLS] token embedding
            embedding = outputs.last_hidden_state[:, 0, :].numpy()
        
        return embedding
    
    def compute_similarity(self, text1, text2):
        """Compute cosine similarity between two texts"""
        emb1 = self.get_embedding(text1)
        emb2 = self.get_embedding(text2)
        
        # Cosine similarity
        similarity = np.dot(emb1, emb2.T) / (
            np.linalg.norm(emb1) * np.linalg.norm(emb2)
        )
        
        return float(similarity[0][0])
    
    def search(self, query, documents):
        """Search for most relevant documents"""
        query_emb = self.get_embedding(query)
        
        results = []
        for doc in documents:
            doc_emb = self.get_embedding(doc)
            similarity = np.dot(query_emb, doc_emb.T) / (
                np.linalg.norm(query_emb) * np.linalg.norm(doc_emb)
            )
            results.append({
                'document': doc,
                'similarity': float(similarity[0][0])
            })
        
        # Sort by similarity
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results


# Usage
search_engine = SemanticSearchEngine()

# Example documents
documents = [
    "דוד בן-גוריון היה ראש הממשלה הראשון של ישראל",
    "תל אביב היא עיר מרכזית בישראל",
    "הטכנולוגיה בישראל מתפתחת במהירות",
    "David Ben-Gurion was the first Prime Minister of Israel",
]

# Search
query = "מי היה המנהיג הראשון של ישראל?"
results = search_engine.search(query, documents)

for result in results:
    print(f"Score: {result['similarity']:.3f} | {result['document']}")
```

### Integration with Memory System

```python
class MemorySystemWithSemanticSearch:
    def __init__(self, ner_client, semantic_model):
        self.ner_client = ner_client  # For entity extraction
        self.semantic_model = semantic_model  # For semantic search
        self.memory = []
    
    def store_message(self, message, user_id):
        """Store message with both entities AND embeddings"""
        # Extract entities using NER (DictaBERT-NER)
        entities = self.ner_client.extract_entities(message)
        
        # Get semantic embedding (NeoDictaBERT-bilingual)
        embedding = self.semantic_model.get_embedding(message)
        
        # Store both!
        self.memory.append({
            'message': message,
            'user_id': user_id,
            'entities': entities['entities'],
            'embedding': embedding,
            'timestamp': datetime.now()
        })
    
    def search(self, query, user_id, method='hybrid'):
        """
        Search using:
        - Entity matching (fast, precise)
        - Semantic similarity (intelligent, context-aware)
        - Hybrid (best of both)
        """
        
        if method == 'entity':
            # Use NER for entity-based search
            query_entities = self.ner_client.extract_entities(query)
            # ... entity matching logic
            
        elif method == 'semantic':
            # Use semantic similarity
            query_emb = self.semantic_model.get_embedding(query)
            
            results = []
            for msg in self.memory:
                if msg['user_id'] == user_id:
                    similarity = np.dot(query_emb, msg['embedding'].T)
                    results.append({
                        'message': msg['message'],
                        'similarity': float(similarity[0][0])
                    })
            
            results.sort(key=lambda x: x['similarity'], reverse=True)
            return results
            
        else:  # hybrid
            # Combine entity matching + semantic similarity
            # This gives you the best of both worlds!
            pass
```

---

## Option 3: Dual Setup (Best for Your Use Case!)

**Recommended Architecture:**

```
┌────────────────────────────────────────────┐
│         Chat Application                    │
└─────────────┬──────────────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │  Processing Layer   │
    └──────┬─────────┬────┘
           │         │
           ▼         ▼
┌──────────────┐  ┌─────────────────────┐
│ DictaBERT-   │  │ NeoDictaBERT-       │
│ NER          │  │ bilingual           │
│              │  │                     │
│ Entity       │  │ Semantic            │
│ Extraction   │  │ Search              │
└──────────────┘  └─────────────────────┘
```

### Docker Compose Setup

```yaml
version: '3.8'

services:
  # NER Service - for entity extraction
  ner-service:
    build:
      context: ./hebrew-ner-service
      dockerfile: Dockerfile
    environment:
      - MODEL_NAME=dicta-il/dictabert-ner
      - SERVICE_PORT=8000
    ports:
      - "8000:8000"
    networks:
      - app-network
  
  # Semantic Search Service - for intelligent retrieval
  semantic-service:
    build:
      context: ./hebrew-semantic-service
      dockerfile: Dockerfile
    environment:
      - MODEL_NAME=dicta-il/neodictabert-bilingual
      - USE_CUSTOM_CODE=true
      - SERVICE_PORT=8001
    ports:
      - "8001:8001"
    networks:
      - app-network
  
  # Your main app
  chat-app:
    environment:
      - NER_SERVICE_URL=http://ner-service:8000
      - SEMANTIC_SERVICE_URL=http://semantic-service:8001
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

---

## Summary: What Should You Use?

### For NER (Entity Extraction)
✅ **Use: dicta-il/dictabert-ner** (default in this service)
- Works out of the box
- Pre-trained on Hebrew NER data
- Proven performance

### For Semantic Search / Embeddings
✅ **Use: dicta-il/neodictabert-bilingual** (requires separate service)
- State-of-the-art Hebrew + English understanding
- Better than multilingual models
- Perfect for memory retrieval

### Best Approach for Your Chat App
✅ **Use BOTH:**
1. DictaBERT-NER for entity extraction → structured data
2. NeoDictaBERT-bilingual for semantic search → intelligent retrieval
3. Combine both → powerful memory system!

---

## Next Steps

**If you want NER only:**
Keep current setup with `MODEL_NAME=dicta-il/dictabert-ner` ✅

**If you want to experiment with NeoDictaBERT-bilingual:**
1. Create a separate semantic search service
2. Use the semantic search code above
3. Integrate both services in your app

**If you want to fine-tune NeoDictaBERT for NER:**
1. Gather/prepare labeled NER data
2. Use the fine-tuning code above
3. Update MODEL_NAME to your fine-tuned model

---

Would you like me to create a separate semantic search service using NeoDictaBERT-bilingual?