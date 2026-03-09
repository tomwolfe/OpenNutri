# OpenNutri Sync Documentation

## Overview

OpenNutri uses a **local-first, CRDT-based sync protocol** that enables seamless multi-device synchronization with offline support. This document explains how sync works and how to troubleshoot sync issues.

---

## How Sync Works

### Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│   Device A      │                    │   Device B      │
│                 │                    │                 │
│ ┌─────────────┐ │                    │ ┌─────────────┐ │
│ │ Local DB    │ │                    │ │ Local DB    │ │
│ │ (IndexedDB) │ │                    │ │ (IndexedDB) │ │
│ └──────┬──────┘ │                    │ └──────┬──────┘ │
│        │        │                    │        │        │
│ ┌──────▼──────┐ │   ┌──────────┐    │ ┌──────▼──────┐ │
│ │ Sync Worker │ │   │  Server  │    │ │ Sync Worker │ │
│ │ (Web Worker)│ │◀─▶│  (Neon)  │◀───┘ │ (Web Worker)│ │
│ └─────────────┘ │   └──────────┘    │ └─────────────┘ │
└─────────────────┘                    └─────────────────┘
```

### Key Concepts

| Term | Definition |
|------|------------|
| **CRDT** | Conflict-free Replicated Data Type - ensures data converges without conflicts |
| **Yjs** | Library implementing CRDTs for collaborative data |
| **Outbox** | Write-ahead log for pending sync operations |
| **Delta Sync** | Only sync changes since last sync timestamp |
| **Vector Clock** | Tracks causality between distributed updates |

---

## Sync Protocol

### Step 1: Local Change

When you create or modify a food log:

```typescript
// 1. Save to local database
await db.foodLogs.put({
  id: 'uuid',
  userId: 'user-uuid',
  mealType: 'breakfast',
  totalCalories: 500,
  yjsData: 'base64-encoded-crdt-update',
  synced: false,  // Mark as not synced
  updatedAt: Date.now()
});

// 2. Queue for sync
await db.syncOutbox.add({
  userId: 'user-uuid',
  table: 'foodLogs',
  entityId: 'uuid',
  operation: 'PUT',
  payload: {...},
  status: 'pending',
  timestamp: Date.now()
});
```

### Step 2: Background Sync

The sync worker runs periodically:

```typescript
// workers/sync.worker.ts
self.onmessage = async (event) => {
  const { type, payload } = event.data;
  
  if (type === 'SYNC_DELTA') {
    // 1. Process outbox (push)
    await processOutbox(userId);
    
    // 2. Fetch server changes (pull)
    const serverChanges = await fetchDelta(lastSyncTimestamp);
    
    // 3. Merge with CRDT
    await mergeChanges(serverChanges);
  }
};
```

### Step 3: Server Processing

Server handles the sync request:

```typescript
// /api/sync/delta/push
POST /api/sync/delta/push
{
  "logs": [...],
  "targets": [...],
  "recipes": [...]
}

Response:
{
  "success": true,
  "conflicts": [],
  "serverTime": 1234567890
}
```

### Step 4: Conflict Resolution

If conflicts are detected:

```typescript
// CRDT merge with domain-specific rules
function resolveLogConflict(localLog, serverLog) {
  // 1. Start with server state (baseline)
  const doc = new Y.Doc();
  applyYUpdate(doc, serverLog.yjsData);
  
  // 2. Apply local changes
  applyYUpdate(doc, localLog.yjsData);
  
  // 3. Domain-specific rules
  if (localLog.isVerified && !serverLog.isVerified) {
    // Prefer verified data
    map.set('isVerified', true);
  }
  
  if (localLog.aiConfidenceScore > serverLog.aiConfidenceScore) {
    // Prefer higher confidence
    map.set('totalCalories', localLog.totalCalories);
  }
  
  return encodeYDoc(doc);
}
```

---

## Sync States

### Visual Indicators

| Icon | State | Description |
|------|-------|-------------|
| 🟢 | Synced | All changes synced to cloud |
| 🟡 | Syncing | Currently syncing changes |
| 🔴 | Offline | No connection, changes queued |
| 🟠 | Conflict | Conflicting changes detected |

### Status Codes

```typescript
enum SyncStatus {
  PENDING = 'pending',     // Queued for sync
  PROCESSING = 'processing', // Currently syncing
  SYNCED = 'synced',       // Successfully synced
  FAILED = 'failed',       // Sync failed (will retry)
  CONFLICT = 'conflict'    // Needs conflict resolution
}
```

---

## Offline Support

### What Works Offline

- ✅ Create new food logs
- ✅ Edit existing logs
- ✅ Delete logs
- ✅ View cached data
- ✅ Local AI analysis (if models loaded)
- ✅ Manual data entry

### What Requires Online

- ❌ AI cloud analysis
- ❌ Image upload to cloud
- ❌ Multi-device sync
- ❌ Account changes
- ❌ Recovery operations

### Queue Management

Offline changes are queued in the sync outbox:

```typescript
interface SyncOutboxItem {
  id?: number;
  userId: string;
  table: string;          // 'foodLogs', 'userTargets', etc.
  entityId: string;       // ID of the entity
  operation: 'PUT' | 'DELETE';
  payload: any;           // Full entity data
  timestamp: number;
  status: 'pending' | 'failed' | 'processing';
  retryCount: number;     // Number of retry attempts
  error?: string;         // Last error message
}
```

**Retry Logic:**
- Failed syncs retry with exponential backoff
- Max retries: 5
- After max retries: Mark as failed, user notified

---

## Conflict Resolution

### CRDT Strategy

OpenNutri uses Yjs CRDTs for automatic conflict resolution:

**How it works:**
1. Each field is a CRDT type (Y.Map, Y.Array)
2. Concurrent updates are merged automatically
3. Last-write-wins for scalar values
4. Array elements are tracked by ID

**Example:**
```
Device A: changes calories 500 → 550
Device B: changes protein 30 → 35

Result: calories: 550, protein: 35 (both preserved)
```

### Domain-Specific Rules

For food logs, we apply additional rules:

| Field | Resolution Rule |
|-------|-----------------|
| `isVerified` | Verified data always wins |
| `aiConfidenceScore` | Higher confidence wins |
| `totalCalories` | From highest confidence source |
| `items[]` | Merge by item ID, LWW for updates |
| `mealType` | User edit wins over AI suggestion |

### Manual Conflict Resolution

If automatic resolution fails:

1. **Notification:** User sees conflict indicator
2. **Comparison:** Side-by-side view of changes
3. **Choice:** User selects which version to keep
4. **Merge:** Option to manually combine fields

---

## Multi-Device Sync

### Device Registration

Each device gets a unique ID:

```typescript
const deviceId = crypto.randomUUID();
localStorage.setItem('opennutri_device_id', deviceId);
```

### Sync Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Mobile   │     │  Server  │     │ Desktop  │
│          │     │          │     │          │
│ 1. Edit  │     │          │     │          │
│ 2. Sync ─┼────▶│ 3. Store│     │          │
│          │     │ 4. Notify│───▶│ 5. Pull  │
│          │     │          │     │ 6. Merge │
└──────────┘     └──────────┘     └──────────┘
```

### Sync Frequency

| Event | Sync Trigger |
|-------|--------------|
| New log | Immediate |
| Edit log | Debounced (2s) |
| Delete log | Immediate |
| App foreground | On resume |
| Periodic | Every 5 minutes (if active) |

---

## Troubleshooting

### Sync Not Working

**Checklist:**
1. [ ] Internet connection active
2. [ ] Logged in to account
3. [ ] Browser supports IndexedDB
4. [ ] No browser extensions blocking requests
5. [ ] Server status operational

**Debug Steps:**
```javascript
// Check sync status
const unsyncedCount = await db.foodLogs
  .where('synced')
  .equals(false)
  .count();
console.log(`Unsynced items: ${unsyncedCount}`);

// Check outbox
const outboxItems = await db.syncOutbox.toArray();
console.log(`Outbox: ${outboxItems.length} items`);

// Force sync
const worker = new Worker('/workers/sync.worker.js');
worker.postMessage({
  type: 'SYNC_DELTA',
  payload: { userId, deviceId, lastSyncTimestamp }
});
```

### Data Not Appearing on Another Device

**Possible Causes:**
- Sync not triggered on source device
- Network issue during sync
- Conflict resolution hid data
- Different account logged in

**Solutions:**
1. Pull to refresh on both devices
2. Check sync status indicators
3. Verify same account on both devices
4. Check browser console for errors

### "Sync Failed" Error

**Common Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| `Network error` | No connection | Check internet, retry |
| `Unauthorized` | Session expired | Re-login |
| `Conflict detected` | Concurrent edits | Review and merge |
| `Rate limited` | Too many requests | Wait and retry |
| `Database error` | IndexedDB issue | Clear cache, reload |

### Force Sync

To manually trigger sync:

```javascript
// In browser console
const syncEvent = new CustomEvent('opennutri:force-sync');
window.dispatchEvent(syncEvent);
```

Or navigate to Settings → Sync → "Sync Now"

---

## Performance

### Sync Benchmarks

| Metric | Target | Typical |
|--------|--------|---------|
| Initial sync (100 items) | < 5s | 2-3s |
| Delta sync (1 item) | < 500ms | 100-200ms |
| Conflict resolution | < 1s | 200-500ms |
| Offline queue (10 items) | < 10s | 3-5s |

### Optimization Tips

**For Users:**
- Keep browser tab active for background sync
- Clear old data periodically (Settings → Storage)
- Use modern browsers (Chrome, Firefox, Safari)

**For Developers:**
- Batch sync operations when possible
- Use compression for large payloads
- Implement proper error handling and retries

---

## API Reference

### Sync Endpoints

#### Pull Delta

```http
GET /api/sync/delta?since=<timestamp>
Authorization: Bearer <token>

Response:
{
  "logs": [...],
  "targets": [...],
  "recipes": [...],
  "serverTime": 1234567890
}
```

#### Push Changes

```http
POST /api/sync/delta/push
Content-Type: application/json
Authorization: Bearer <token>

{
  "logs": [...],
  "targets": [...],
  "recipes": [...]
}

Response:
{
  "success": true,
  "conflicts": [
    {
      "type": "log",
      "id": "uuid",
      "localVersion": 5,
      "serverVersion": 7
    }
  ],
  "serverTime": 1234567890
}
```

#### Process Outbox Item

```http
POST /api/sync/outbox/process
Content-Type: application/json
Authorization: Bearer <token>

{
  "id": 123,
  "userId": "uuid",
  "table": "foodLogs",
  "entityId": "uuid",
  "operation": "PUT",
  "payload": {...}
}

Response:
{
  "success": true
}
```

---

## Data Integrity

### Checksums

All sync payloads include checksums:

```typescript
interface SyncPayload {
  data: any;
  checksum: string;  // SHA-256 of serialized data
  version: number;
  deviceId: string;
  timestamp: number;
}
```

### Validation

Server validates incoming sync data:
- Checksum verification
- Schema validation
- User authorization
- Rate limiting

### Audit Trail

All sync operations are logged:
```sql
CREATE TABLE sync_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID,
  device_id UUID,
  operation TEXT,
  entity_type TEXT,
  entity_id UUID,
  status TEXT,
  error TEXT,
  created_at TIMESTAMP
);
```

---

*Last Updated: March 2026*
