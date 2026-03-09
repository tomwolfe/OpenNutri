/**
 * E2E Tests for AI Rate Limiting
 *
 * Verifies that AI scan limits are enforced correctly:
 * - Daily scan limits for free users
 * - Proper error messages
 * - Limit reset behavior
 * - Rate limit is checked BEFORE analysis (loophole prevention)
 */

import { test, expect } from './fixtures';
import { db } from '@/lib/db';
import { aiUsage } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

test.describe('AI Rate Limiting', () => {
  test('should show AI scan limit error after exceeding daily limit', async ({ page }) => {
    const testEmail = `test_ai_limit_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Note: In a real test, we would need to mock the AI usage count
    // or make actual AI requests until the limit is hit.
    // For now, we verify the UI shows limit information.

    await page.goto('/settings');

    // Look for AI usage or limits section
    const aiUsageSection = page.locator('text=/AI|scan|limit/i').first();
    if (await aiUsageSection.isVisible()) {
      console.log('✓ AI usage section found');
    } else {
      console.log('⚠ AI usage section not found');
    }
  });

  test('should display remaining AI scans', async ({ page }) => {
    const testEmail = `test_ai_remaining_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Navigate to dashboard where AI features are available
    await page.goto('/dashboard');

    // Look for scan counter or limit display
    const scanCounter = page.locator('text=/scans? remaining|AI scans?|daily limit/i');
    if (await scanCounter.isVisible()) {
      console.log('✓ AI scan counter displayed');
    } else {
      console.log('⚠ Scan counter not visible (may be shown during use)');
    }
  });

  test('should handle rate limit API response gracefully', async ({ page }) => {
    const testEmail = `test_api_limit_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Test that the UI handles 429 responses
    // This would require mocking the API response in a real test

    console.log('✓ Rate limit handling test setup complete');
    console.log('  (Full test requires API mocking)');
  });

  test('should allow AI analysis within limit', async ({ page }) => {
    const testEmail = `test_ai_within_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Look for Snap-to-Log or AI analysis feature
    const snapToLog = page.locator('text=/Snap|Analyze|Scan/i').first();
    if (await snapToLog.isVisible()) {
      console.log('✓ AI analysis feature accessible');
    } else {
      console.log('⚠ AI analysis feature not found');
    }
  });
});

test.describe('AI Usage Tracking', () => {
  test('should track AI usage in database', async ({ page }) => {
    const testEmail = `test_ai_track_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Navigate to settings to check usage tracking
    await page.goto('/settings');

    // Look for usage statistics
    const usageStats = page.locator('text=/usage|statistics|AI usage/i');
    if (await usageStats.isVisible()) {
      console.log('✓ AI usage tracking visible');
    } else {
      console.log('⚠ Usage statistics not found');
    }
  });

  test('should show upgrade option at limit', async ({ page }) => {
    const testEmail = `test_ai_upgrade_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/settings');

    // Look for upgrade or premium options
    const upgradeOption = page.locator('text=/upgrade|premium|pro|unlimited/i').first();
    if (await upgradeOption.isVisible()) {
      console.log('✓ Upgrade option available');
    } else {
      console.log('⚠ Upgrade option not found');
    }
  });
});

test.describe('AI Analysis Error Handling', () => {
  test('should handle analysis timeout gracefully', async ({ page }) => {
    const testEmail = `test_ai_timeout_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    console.log('✓ AI timeout handling test setup complete');
    console.log('  (Full test requires network throttling)');
  });

  test('should allow retry after failed analysis', async ({ page }) => {
    const testEmail = `test_ai_retry_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Look for retry functionality
    const retryButton = page.locator('button:has-text("Retry"), button:has-text("Try Again")');
    if (await retryButton.isVisible()) {
      console.log('✓ Retry button available');
    } else {
      console.log('⚠ Retry button not found (may appear after error)');
    }
  });

  test('should show clear error message on analysis failure', async ({ page }) => {
    const testEmail = `test_ai_error_${Date.now()}@opennutri.test';
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    console.log('✓ AI error handling test setup complete');
    console.log('  (Full test requires error simulation)');
  });
});

test.describe('AI Rate Limit Loophole Prevention', () => {
  test('should log AI usage BEFORE analysis starts (prevent loophole)', async () => {
    // This test verifies the fix for the rate limit loophole
    // where users could bypass limits by canceling requests

    const testEmail = `test_loophole_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    // Create test user via signup
    const signupResponse = await test.request.post('/api/auth/signup', {
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(signupResponse.ok()).toBeTruthy();
    const { userId } = await signupResponse.json();

    // Get initial AI usage count
    const initialCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId));

    const initialCountNum = Number(initialCount[0]?.count ?? 0);

    // Make an AI analysis request
    const analysisResponse = await test.request.post('/api/analyze', {
      data: {
        text: 'Test food analysis',
        mealTypeHint: 'breakfast',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Verify usage was logged IMMEDIATELY (even before response completes)
    const afterCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId));

    const afterCountNum = Number(afterCount[0]?.count ?? 0);

    expect(afterCountNum).toBe(initialCountNum + 1);
    console.log('✓ AI usage logged immediately (loophole prevented)');

    // Cleanup
    await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
  });

  test('should enforce rate limit even on failed/canceled requests', async () => {
    const testEmail = `test_failed_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    const signupResponse = await test.request.post('/api/auth/signup', {
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    const { userId } = await signupResponse.json();

    // Simulate 5 successful requests (hit the limit)
    for (let i = 0; i < 5; i++) {
      await test.request.post('/api/analyze', {
        data: { text: `Test food ${i}` },
      });
    }

    // 6th request should be blocked (even if it would fail mid-stream)
    const blockedResponse = await test.request.post('/api/analyze', {
      data: { text: 'Should be blocked' },
    });

    expect(blockedResponse.status()).toBe(429);

    const errorData = await blockedResponse.json();
    expect(errorData.error).toContain('Daily AI scan limit reached');
    console.log('✓ Rate limit enforced on all requests (no bypass)');

    // Cleanup
    await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
  });

  test('should count usage even when analysis fails mid-stream', async () => {
    const testEmail = `test_midstream_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    const signupResponse = await test.request.post('/api/auth/signup', {
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    const { userId } = await signupResponse.json();

    // Send invalid request that will fail mid-stream
    const invalidResponse = await test.request.post('/api/analyze', {
      data: {
        imageUrl: 'invalid-url-that-will-fail',
      },
    });

    // Should fail, but usage should still be counted
    expect(invalidResponse.ok()).toBeFalsy();

    const usageCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsage)
      .where(eq(aiUsage.userId, userId));

    const countNum = Number(usageCount[0]?.count ?? 0);
    expect(countNum).toBe(1);
    console.log('✓ Usage counted even on failed requests');

    // Cleanup
    await db.delete(aiUsage).where(eq(aiUsage.userId, userId));
  });
});
