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
│   ├── ai-usda-bridge.ts    # USDA data enrichment
│   └── ai-vision-stream.ts  # Vision & Text AI Gateway (Multi-provider)
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
- **AI Streaming:** Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/anthropic`)
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
   - `AI_PROVIDER`: Choose your AI provider (`zhipu`, `openai`, `google`, `anthropic`). Default: `zhipu`
   - `GLM_API_KEY`: Zhipu GLM Vision API key (required if using `zhipu`)
   - `OPENAI_API_KEY`: OpenAI API key (required if using `openai`)
   - `GOOGLE_GENERATION_AI_API_KEY`: Google Gemini API key (required if using `google`)
   - `ANTHROPIC_API_KEY`: Anthropic Claude API key (required if using `anthropic`)
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

- ✅ **AI Gateway** (Zhipu, OpenAI, Google, Anthropic support)
- ✅ **Real-time streaming architecture** (no polling)
- ✅ Image upload with Vercel Blob
- ✅ AI scan rate limiting (5/day for free users)
- ✅ USDA data enhancement
- ✅ Snap-to-Log UI component (camera + upload)
- ✅ AI usage tracker with daily progress

## Phase 3 Features (In Progress 🚧)

- ✅ **Semantic food matching** (pgvector)
- ✅ **E2E encryption** (Web Crypto API / AES-GCM)
- ✅ **Smart Coaching** (Weight smoothing with EWMA)
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

### AI Gateway (New)

OpenNutri uses a provider-agnostic AI Gateway (`src/lib/ai-vision-stream.ts`) that supports multiple Vision AI models. This ensures resilience if a specific provider is down or if you want to switch to a more cost-effective model.

Supported Providers:
- **Zhipu GLM-4V-Flash:** Optimized for speed and cost.
- **OpenAI GPT-4o-mini:** Industry standard for vision tasks.
- **Google Gemini 1.5 Flash:** Excellent multimodal performance.
- **Anthropic Claude 3.5 Sonnet:** High accuracy for complex meal identification.

### Smart Coaching with Weight Smoothing (New)

Weight tracking is naturally "noisy" due to water weight, sodium, and carbohydrate fluctuations. OpenNutri uses **Exponentially Weighted Moving Average (EWMA)** to filter this noise, providing a much more accurate trend for coaching recommendations than simple daily tracking.

### Privacy

- ✅ No data selling
- ✅ Full data export capability (`/api/export`)
- ✅ **E2E encryption** (AES-GCM, PBKDF2 key derivation)
- ✅ Semantic matching runs server-side (no client data leakage)
- 🔒 Encryption keys never leave the client
- 🔒 Server stores only encrypted food logs (zero-knowledge architecture)

## License

MIT
