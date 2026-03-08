# OpenNutri E2E Tests

End-to-end tests for OpenNutri using [Playwright](https://playwright.dev).

## Test Coverage

### Encryption/Decryption Flow (`encryption.test.ts`)
- ✅ Food logs are encrypted before transmission
- ✅ Decrypted logs display correctly after page reload
- ✅ Multiple entries handled correctly
- ✅ Encryption integrity maintained across browser sessions

### Sync Logic (`sync.test.ts`)
- ✅ Offline entries sync when connection restored
- ✅ Multiple offline entries queued and synced
- ✅ Network interruption during sync handled gracefully
- ✅ Data preserved when browser closes during pending sync

### Wrong Password Scenarios (`wrong-password.test.ts`)
- ✅ Wrong password rejected at login
- ✅ Cannot access encrypted data with wrong password
- ✅ Password case sensitivity handled correctly
- ✅ No encrypted data leaked in error messages

## Running Tests

### Prerequisites
1. Ensure development server is running: `npm run dev`
2. Ensure test database is set up (uses separate test data)

### Commands

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in debug mode
npm run test:debug

# Run specific test file
npx playwright test tests/e2e/encryption.test.ts

# Run tests with specific browser
npx playwright test --project chromium
```

## Test Structure

```
tests/e2e/
├── fixtures.ts           # Global test fixtures and helpers
├── encryption.test.ts    # Encryption/decryption tests
├── sync.test.ts          # Offline sync tests
└── wrong-password.test.ts # Authentication failure tests
```

## Fixtures

The `fixtures.ts` file provides:
- `authenticatedPage`: Pre-authenticated browser page
- `encryptionKey`: Derived encryption key for test user
- `TEST_USER`: Test user credentials generator

## Writing New Tests

```typescript
import { test, expect } from './fixtures';

test.describe('New Feature', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/dashboard');
    // ... test steps
    await expect(something).toBeVisible();
  });
});
```

## CI/CD Integration

Tests are configured to run in CI mode with:
- 2 retries on failure
- Screenshots on failure
- Video recording on failure
- HTML report generation

## Troubleshooting

### Tests fail with "Timeout"
- Ensure dev server is running: `npm run dev`
- Increase timeout in `playwright.config.ts`
- Check for database connection issues

### Tests fail with "Element not found"
- Selectors may need updating after UI changes
- Use `data-testid` attributes for stable selectors
- Check for loading states

### Encryption tests fail
- Ensure Web Crypto API is available in test environment
- Check browser compatibility (Chromium recommended)

## Security Notes

- Tests create temporary test users with unique emails
- Test data is not cleaned up automatically (manual cleanup recommended)
- Never commit `.env` files with real credentials for tests
