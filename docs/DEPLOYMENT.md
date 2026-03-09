# OpenNutri Production Deployment Checklist

## Pre-Deployment

### Code Quality

- [ ] All TypeScript compilation errors resolved
  ```bash
  npx tsc --noEmit
  ```

- [ ] All ESLint warnings resolved
  ```bash
  npm run lint
  ```

- [ ] All tests passing
  ```bash
  npm test
  ```

- [ ] Test coverage meets threshold (>80% critical paths)
  ```bash
  npm test -- --coverage
  ```

- [ ] No console.log in production code
  ```bash
  grep -r "console.log" src/ --exclude-dir=node_modules
  ```

- [ ] No TODO/FIXME comments in critical paths
  ```bash
  grep -r "TODO\|FIXME" src/ --exclude-dir=node_modules
  ```

### Security Audit

- [ ] Dependencies audited
  ```bash
  npm audit
  npm audit fix
  ```

- [ ] No hardcoded secrets in codebase
  ```bash
  grep -r "password\|secret\|key\|token" src/ --exclude-dir=node_modules | grep -v ".env.example"
  ```

- [ ] Environment variables documented in `.env.example`
  ```bash
  cat .env.example
  ```

- [ ] CSP headers configured
  ```bash
  # Check next.config.mjs for security headers
  ```

- [ ] Rate limiting enabled on all API endpoints
  ```bash
  grep -r "rateLimit\|rate-limit" src/app/api/
  ```

- [ ] CORS configured correctly
  ```bash
  # Check API routes for CORS settings
  ```

### Database

- [ ] Database migrations generated
  ```bash
  npm run db:generate
  ```

- [ ] Migrations tested on staging
  ```bash
  npm run db:migrate
  ```

- [ ] Database indexes created
  ```sql
  -- Verify indexes exist for:
  -- food_logs(user_id, created_at)
  -- sync_outbox(user_id, status)
  -- ai_usage(user_id, scan_date)
  ```

- [ ] Database backup configured
  - [ ] Neon point-in-time recovery enabled
  - [ ] Backup retention policy set (30 days)

### Infrastructure

- [ ] Vercel project configured
  - [ ] Environment variables set
  - [ ] Build hooks configured
  - [ ] Preview deployments enabled

- [ ] Custom domain configured (if applicable)
  - [ ] DNS records updated
  - [ ] SSL certificate provisioned

- [ ] Vercel Blob storage configured
  - [ ] Bucket created
  - [ ] Lifecycle policies set (7-day cleanup)

- [ ] Cron jobs configured (vercel-cron.json)
  - [ ] Sync cleanup job
  - [ ] Blob cleanup job
  - [ ] Daily AI limit reset

---

## Deployment

### Staging Deployment

- [ ] Deploy to staging environment
  ```bash
  vercel --environment=staging
  ```

- [ ] Run smoke tests on staging
  ```bash
  npm test -- --grep "@smoke"
  ```

- [ ] Verify critical user flows:
  - [ ] User signup
  - [ ] Food logging
  - [ ] AI analysis
  - [ ] Sync between devices
  - [ ] Recovery flow

- [ ] Check monitoring dashboards
  - [ ] Error rate < 0.1%
  - [ ] API latency p95 < 500ms
  - [ ] Database connections < 80%

- [ ] Get stakeholder approval

### Production Deployment

- [ ] Create deployment branch
  ```bash
  git checkout -b release/v1.0.0
  ```

- [ ] Update version numbers
  ```json
  // package.json
  "version": "1.0.0"
  ```

- [ ] Create git tag
  ```bash
  git tag -a v1.0.0 -m "Production release v1.0.0"
  git push origin v1.0.0
  ```

- [ ] Deploy to production
  ```bash
  vercel --environment=production
  ```

- [ ] Verify deployment
  - [ ] Health check endpoint responds
  - [ ] Static assets load correctly
  - [ ] API endpoints respond

- [ ] Run production smoke tests
  ```bash
  npm test -- --grep "@smoke" --environment=production
  ```

---

## Post-Deployment

### Monitoring

- [ ] Set up error tracking (Sentry/LogRocket)
  - [ ] Source maps uploaded
  - [ ] Error alerts configured

- [ ] Configure logging
  - [ ] Log aggregation enabled (Vercel Logs)
  - [ ] Log retention set (30 days)
  - [ ] Sensitive data redaction verified

- [ ] Set up uptime monitoring
  - [ ] Ping every 5 minutes
  - [ ] Alert on 3 consecutive failures
  - [ ] SMS/email notifications configured

- [ ] Configure performance monitoring
  - [ ] Core Web Vitals tracking
  - [ ] API latency dashboards
  - [ ] Database query performance

### Alerts

| Alert | Threshold | Channel | Priority |
|-------|-----------|---------|----------|
| Error rate | > 1% (5 min) | Slack + Email | P1 |
| API latency p95 | > 1s (5 min) | Slack | P2 |
| Database connections | > 90% | Slack + Email | P1 |
| Uptime | Down (1 min) | SMS + Slack | P0 |
| Sync failure rate | > 5% (1 hour) | Slack | P2 |
| AI scan errors | > 10% (1 hour) | Slack | P3 |

### Documentation

- [ ] Update changelog
  ```markdown
  ## [1.0.0] - 2026-03-08
  
  ### Added
  - E2E encryption for food logs
  - Apple Health / Google Fit integration
  - Social recovery (SSS)
  - Shared vaults feature
  
  ### Fixed
  - Sync worker incomplete implementation
  - Session persistence vulnerability
  - Image privacy gap
  ```

- [ ] Update API documentation
  - [ ] OpenAPI/Swagger spec updated
  - [ ] Example requests/responses verified

- [ ] Update user documentation
  - [ ] Getting started guide
  - [ ] Recovery guide
  - [ ] FAQ updated

- [ ] Internal runbook updated
  - [ ] Deployment procedure
  - [ ] Rollback procedure
  - [ ] Incident response

---

## Rollback Procedure

If deployment causes issues:

### Immediate Rollback (< 5 minutes)

1. **Revert Vercel deployment**
   ```bash
   vercel rollback
   ```

2. **Or redeploy previous version**
   ```bash
   vercel --prod --git-commit-hash=<previous-commit>
   ```

3. **Verify rollback**
   - Check health endpoint
   - Run smoke tests
   - Monitor error rate

### Database Rollback

If database migration caused issues:

1. **Stop application**
   ```bash
   # Pause Vercel deployments
   ```

2. **Restore database from backup**
   ```bash
   # Use Neon point-in-time recovery
   # Restore to pre-migration state
   ```

3. **Redeploy with migration reverted**
   ```bash
   git revert <migration-commit>
   vercel --prod
   ```

---

## Maintenance

### Weekly Tasks

- [ ] Review error logs
- [ ] Check dependency updates
- [ ] Review performance metrics
- [ ] Verify backups completed

### Monthly Tasks

- [ ] Security audit (dependencies)
- [ ] Performance review
- [ ] Cost review (Vercel, Neon, Blob)
- [ ] User feedback review

### Quarterly Tasks

- [ ] Penetration testing
- [ ] Disaster recovery drill
- [ ] Documentation audit
- [ ] Technical debt review

---

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
NEXTAUTH_URL=https://opennutri.app
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

# AI
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Rate Limiting
AI_SCAN_LIMIT_FREE=5

# Feature Flags
ENABLE_HEALTH_SYNC=true
ENABLE_SHARING=true
```

### Optional Variables

```bash
# Analytics
NEXT_PUBLIC_GA_ID=G-...

# Monitoring
SENTRY_DSN=https://...

# Email (for recovery)
RESEND_API_KEY=re_...
```

---

## Performance Budget

| Metric | Budget | Measurement |
|--------|--------|-------------|
| First Contentful Paint | < 1.5s | Lighthouse |
| Largest Contentful Paint | < 2.5s | Lighthouse |
| Time to Interactive | < 3.5s | Lighthouse |
| Total Bundle Size | < 500KB | webpack-bundle-analyzer |
| API p95 Latency | < 500ms | Vercel Analytics |
| Database Query Time | < 100ms | Neon Dashboard |

---

## Success Criteria

Deployment is considered successful when:

- [ ] Zero critical errors in first 24 hours
- [ ] Error rate < 0.1%
- [ ] API latency p95 < 500ms
- [ ] All smoke tests passing
- [ ] User reports normal (no spike in support tickets)
- [ ] Monitoring dashboards green
- [ ] Backups completing successfully

---

## Contact

**On-Call Engineer:** [Name/Rotation]  
**Escalation:** [Manager Name]  
**Slack Channel:** #opennutri-alerts  

---

*Last Updated: March 2026*  
*Version: 1.0.0*
