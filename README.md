# OpenNutri

Privacy-centric nutrition tracker with Vision AI integration.

## Project Structure

```
src/
├── app/
│   ├── (auth)/              # Auth pages (login, signup)
│   │   └── login/
│   ├── (dashboard)/         # Protected dashboard pages
│   │   └── dashboard/
│   ├── api/
│   │   ├── auth/            # NextAuth endpoints
│   │   ├── food/usda        # USDA food search API
│   │   ├── analyze          # AI vision streaming endpoint
│   │   └── log/             # Food logging endpoints
│   ├── layout.tsx           # Root layout with SessionProvider
│   └── page.tsx             # Landing page
├── components/
│   ├── dashboard/           # Dashboard components
│   ├── forms/               # Form components
│   │   └── manual-food-entry.tsx
│   ├── layout/              # Layout components
│   └── ui/                  # Shadcn/UI components
├── db/
│   ├── migrations/          # Drizzle migrations
│   └── schema/
│       └── index.ts         # Database schema
├── hooks/                   # Custom React hooks
│   └── use-stream.ts        # Streaming response utilities
├── lib/
│   ├── auth.ts              # NextAuth configuration
│   ├── db.ts                # NeonDB connection
│   ├── usda.ts              # USDA API client
│   ├── ai-limits.ts         # AI rate limiting
│   ├── ai-usda-bridge.ts    # USDA data enhancement
│   └── glm-vision-stream.ts # Vision AI streaming (Zhipu GLM)
├── stores/                  # Zustand stores
└── types/                   # TypeScript types
```

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** NeonDB (Serverless Postgres)
- **ORM:** Drizzle ORM
- **Auth:** NextAuth v5 (Credentials provider)
- **UI:** Tailwind CSS + Shadcn/UI
- **State:** Zustand
- **AI Streaming:** Vercel AI SDK (`@ai-sdk/openai`)
- **Hosting:** Vercel (Hobby tier)

## Getting Started

### Prerequisites

- Node.js 18+
- NeonDB account (free tier)
- Vercel account (free tier)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your credentials:
   - `DATABASE_URL`: NeonDB connection string
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL`: Your app URL (http://localhost:3000 for dev)
   - `USDA_API_KEY`: USDA FoodData Central API key (optional)
   - `BLOB_READ_WRITE_TOKEN`: Vercel Blob token
   - `GLM_API_KEY`: Zhipu GLM Vision API key
   - `AI_SCAN_LIMIT_FREE`: Daily AI scan limit (default: 5)

3. **Enable pgvector in NeonDB:**
   ```bash
   npx tsx scripts/setup-pgvector.ts
   ```
   
   This enables semantic food matching (e.g., "fried bird" → "Fried Chicken").

4. **Set up the database:**
   ```bash
   npm run db:push
   ```

5. **Run development server:**
   ```bash
   npm run dev
   ```

6. **Open http://localhost:3000**

## Database Scripts

```bash
npm run db:generate   # Generate migrations
npm run db:migrate    # Run migrations
npm run db:push       # Push schema to database
npm run db:studio     # Open Drizzle Studio
```

## Phase 1 Features (Complete)

- ✅ User authentication (NextAuth v5)
- ✅ Manual food entry with USDA API integration
- ✅ Daily nutrition dashboard
- ✅ Meal tracking (breakfast, lunch, dinner, snack)
- ✅ Date-based food log viewing
- ✅ Macronutrient totals (calories, protein, carbs, fat)

## Phase 2 Features (Complete ✅)

- ✅ Vision AI integration (Zhipu GLM-4.6V-Flash)
- ✅ **Real-time streaming architecture** (no polling)
- ✅ Image upload with Vercel Blob
- ✅ AI scan rate limiting (5/day for free users)
- ✅ USDA data enhancement
- ✅ Snap-to-Log UI component (camera + upload)
- ✅ AI usage tracker with daily progress

## Phase 3 Features (In Progress 🚧)

- ✅ **Semantic food matching** (pgvector)
- ✅ **E2E encryption** (Web Crypto API / AES-GCM)
- ⬜ Barcode scanning for packaged foods
- ⬜ Apple Health / Google Fit integration

## Architecture Notes

### Semantic Food Matching (New)

```
AI Detection → Generate Embedding → Vector Search (pgvector) → USDA Match
```

**Why semantic search?** Traditional string matching (Levenshtein) fails on:
- "fried bird" vs "Fried Chicken" ❌
- "grilled salmon fillet" vs "Salmon, grilled" ❌

Semantic search using vector embeddings understands meaning:
- "fried bird" → embedding → cosine similarity → "Fried Chicken" ✅
- "grilled salmon" → embedding → "Salmon, grilled" ✅

**Implementation:**
- Uses GLM embedding API (same provider as vision)
- 1024-dimensional vectors stored in NeonDB with pgvector
- HNSW index for fast similarity search (<10ms)
- Automatic caching: every match populates the cache for future searches

### Streaming Architecture (Current)

```
Upload → Stream AI Response → Real-time Display → User Review → Save
```

**Why streaming?** Vercel Hobby functions timeout at 10s for non-streaming responses, but AI vision takes 30-60s. By using Vercel AI SDK's streaming capabilities, we keep the connection alive with continuous data flow, allowing the function to run for up to 120 seconds.

**Flow:**
1. User uploads food image via `/api/analyze`
2. Image uploaded to Vercel Blob
3. Server initiates streaming connection to client
4. GLM Vision API processes image (30-60s)
5. Response streams back token-by-token
6. Client parses and displays results in real-time
7. User reviews and confirms the AI analysis
8. Verified data saved to food_logs table

**Benefits:**
- ✅ No database polling (saves NeonDB compute)
- ✅ No cron jobs needed
- ✅ No stuck/failed job cleanup
- ✅ Better UX with real-time feedback
- ✅ Simpler architecture (no job queue)

### Previous Architecture (Removed)

The original implementation used an async job polling pattern:
- ❌ `ai_jobs` table for job queue
- ❌ Vercel Cron every minute
- ❌ Client polling every 2 seconds
- ❌ Complex job state management (pending/processing/completed/failed)
- ❌ Timeout and retry logic

This was replaced with streaming for simplicity and reliability.

### Serverless Considerations

- **Vercel Timeout:** Streaming allows up to 120s execution (vs 10s normal)
- **Database:** Only final results stored, no job queue needed
- **Connection Pooling:** Neon serverless driver handles pooling automatically
- **Rate Limiting:** AI scans tracked via food_logs table (aiConfidenceScore > 0)

### Database Schema

**food_logs** table tracks all meals:
- `aiConfidenceScore > 0` → AI-assisted entry (counts toward daily limit)
- `aiConfidenceScore = 0` or `null` → Manual entry (unlimited)

### Privacy

- ✅ No data selling
- ✅ Full data export capability (`/api/export`)
- ✅ **E2E encryption** (AES-GCM, PBKDF2 key derivation)
- ✅ Semantic matching runs server-side (no client data leakage)
- 🔒 Encryption keys never leave the client
- 🔒 Server stores only encrypted food logs (zero-knowledge architecture)

### Migration from Levenshtein Matching

If you're upgrading from the string-based matching:

1. **Run the pgvector setup:**
   ```bash
   npx tsx scripts/setup-pgvector.ts
   npm run db:push
   ```

2. **Existing data is preserved:** The new system is additive - it builds a cache of embeddings as foods are matched.

3. **Optional: Pre-populate cache** - If you have frequently logged foods, you can pre-generate embeddings by running a custom script.

The system automatically falls back to Levenshtein matching if pgvector is unavailable, ensuring backward compatibility.

## License

MIT
