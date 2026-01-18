// Schema-based validation with type inference
const schema = z.object({...});
type Request = z.infer<typeof schema>;
```

#### 4. **Proper Architecture**
- ✅ Dependency injection
- ✅ Interface segregation
- ✅ Single responsibility principle
- ✅ Clean separation of concerns

#### 5. **Production Features**
- ✅ LRU caching for embeddings
- ✅ Rate limiting
- ✅ CORS & Security headers
- ✅ Structured logging with Pino
- ✅ Graceful shutdown
- ✅ Health checks
- ✅ Error handling

### **Project Structure:**
```
hebrew-semantic-search-ts/
├── src/
│   ├── config/
│   │   └── env.ts              # Type-safe environment config
│   ├── types/
│   │   ├── domain.ts           # Domain models & branded types
│   │   └── result.ts           # Result type & error handling
│   ├── services/
│   │   ├── embedding.service.ts    # HuggingFace integration
│   │   ├── search.service.ts       # Semantic search logic
│   │   └── cache.service.ts        # LRU caching
│   ├── controllers/
│   │   └── search.controller.ts    # HTTP handlers
│   ├── server.ts               # Fastify server setup
│   └── index.ts                # Entry point
├── package.json
├── tsconfig.json               # Strict TS config
├── Dockerfile                  # Multi-stage build
├── docker-compose.yml
├── .env.example
└── README.md                   # Comprehensive docs