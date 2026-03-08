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
├── lib/
│   ├── auth.ts              # NextAuth configuration
│   ├── db.ts                # NeonDB connection
│   └── usda.ts              # USDA API client
├── stores/                  # Zustand stores
├── types/                   # TypeScript types
└── workers/                 # AI job workers (Phase 2)
```

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** NeonDB (Serverless Postgres)
- **ORM:** Drizzle ORM
- **Auth:** NextAuth v5 (Credentials provider)
- **UI:** Tailwind CSS + Shadcn/UI
- **State:** Zustand
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

3. **Set up the database:**
   ```bash
   npm run db:push
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```

5. **Open http://localhost:3000**

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

## Phase 2 Features (Planned)

- Vision AI integration (Zhipu GLM-4.6V-Flash)
- Async job processing with Vercel Cron
- Image upload with Vercel Blob
- Client-side job status polling
- AI scan rate limiting (5/day for free users)
- Semantic caching for food descriptions

## Architecture Notes

### Serverless Considerations

- **Vercel Timeout:** AI processing uses async job pattern (DB polling + Cron)
- **Database Size:** Images stored in Vercel Blob, not database
- **Connection Pooling:** Neon serverless driver handles pooling automatically

### Privacy

- No data selling
- Full data export capability (Phase 3)
- E2E encryption options (Phase 3)

## License

MIT
