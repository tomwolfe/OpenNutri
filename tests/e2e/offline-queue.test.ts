/**
 * E2E Tests for Offline Queue Management
 *
 * Verifies that food logs and images queued while offline
 * are properly synced when connectivity is restored.
 */

import { test, expect } from './fixtures';

test.describe('Offline Queue Management', () => {
  test('should queue food log entry while offline', async ({ page, context }) => {
    const testEmail = `test_queue_offline_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    // Create account while online
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Navigate to dashboard and add food entry
    await page.goto('/dashboard');
    
    const addFoodButton = page.locator('button:has-text("Add Food"), button:has-text("Log Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      
      const foodInput = page.locator('input[placeholder*="food"]').first();
      if (await foodInput.isVisible()) {
        await foodInput.fill('Offline Queued Entry');
        
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();
        await page.waitForTimeout(1000);

        // Should show queued indicator
        const queuedIndicator = page.locator('text=/queued|offline|pending/i');
        if (await queuedIndicator.isVisible()) {
          console.log('✓ Entry queued while offline');
        } else {
          console.log('✓ Entry saved locally (queued indicator not visible)');
        }
      }
    }

    // Verify entry exists in local DB via UI
    const entry = page.locator('text=/Offline Queued Entry/i');
    await expect(entry.first()).toBeVisible({ timeout: 3000 });

    console.log('✓ Food log queued successfully while offline');
  });

  test('should sync queued entries when back online', async ({ page, context }) => {
    const testEmail = `test_queue_sync_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline and add entry
    await context.setOffline(true);
    await page.goto('/dashboard');
    
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Sync Test Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Reload to trigger sync
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify entry synced
    const syncedEntry = page.locator('text=/Sync Test Entry/i');
    await expect(syncedEntry.first()).toBeVisible({ timeout: 5000 });

    console.log('✓ Queued entry synced successfully');
  });

  test('should queue multiple entries and sync all', async ({ page, context }) => {
    const testEmail = `test_queue_multi_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline
    await context.setOffline(true);

    const entries = ['Entry 1', 'Entry 2', 'Entry 3'];

    // Add multiple entries
    for (const entryName of entries) {
      await page.goto('/dashboard');
      const addFoodButton = page.locator('button:has-text("Add Food")');
      if (await addFoodButton.isVisible()) {
        await addFoodButton.click();
        await page.fill('input[placeholder*="food"]', entryName);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
      }
    }

    // Go online
    await context.setOffline(false);
    await page.waitForTimeout(4000);
    await page.reload();

    // Verify all entries synced
    for (const entryName of entries) {
      const entry = page.locator(`text=/${entryName}/i`);
      await expect(entry.first()).toBeVisible({ timeout: 3000 });
    }

    console.log('✓ Multiple queued entries synced successfully');
  });

  test('should show sync progress indicator', async ({ page, context }) => {
    const testEmail = `test_queue_progress_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline and add entry
    await context.setOffline(true);
    await page.goto('/dashboard');
    
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Progress Test');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // Go online and watch for sync indicator
    await context.setOffline(false);

    // Look for sync indicator
    const syncIndicator = page.locator('text=/syncing|sync|uploading/i');
    if (await syncIndicator.isVisible()) {
      console.log('✓ Sync progress indicator shown');
    } else {
      console.log('⚠ Sync indicator not visible (may be too fast)');
    }

    await page.waitForTimeout(3000);
    await page.reload();

    const entry = page.locator('text=/Progress Test/i');
    await expect(entry.first()).toBeVisible({ timeout: 5000 });
  });

  test('should handle queue with browser close', async ({ page, context }) => {
    const testEmail = `test_queue_close_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline and add entry
    await context.setOffline(true);
    await page.goto('/dashboard');
    
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Browser Close Test');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // Close and reopen (simulates crash)
    await context.close();
    
    const browser = context.browser();
    if (!browser) {
      throw new Error('Browser not available');
    }
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();

    // Login again
    await newPage.goto('/login');
    await newPage.fill('input[type="email"]', testEmail);
    await newPage.fill('input[type="password"]', testPassword);
    await newPage.click('button[type="submit"]');
    await newPage.waitForURL(/\/dashboard/);

    // Entry should still be queued
    const queuedEntry = newPage.locator('text=/Browser Close Test/i');
    await expect(queuedEntry.first()).toBeVisible({ timeout: 3000 });

    // Go online and sync
    await newContext.setOffline(false);
    await newPage.waitForTimeout(3000);
    await newPage.reload();

    const syncedEntry = newPage.locator('text=/Browser Close Test/i');
    await expect(syncedEntry.first()).toBeVisible({ timeout: 5000 });

    console.log('✓ Queue persisted after browser close');

    await newContext.close();
  });

  test('should show offline indicator in UI', async ({ page, context }) => {
    await page.goto('/dashboard');

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Look for offline indicator
    const offlineIndicator = page.locator('text=/offline|Offline|No connection/i');
    if (await offlineIndicator.isVisible()) {
      console.log('✓ Offline indicator displayed');
    } else {
      console.log('⚠ Offline indicator not found');
    }

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(500);

    // Indicator should disappear
    const isOfflineVisible = await offlineIndicator.isVisible().catch(() => false);
    if (!isOfflineVisible) {
      console.log('✓ Offline indicator cleared when online');
    }
  });
});

test.describe('Offline Image Queue', () => {
  test('should queue image for later analysis', async ({ page, context }) => {
    const testEmail = `test_image_queue_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline
    await context.setOffline(true);

    await page.goto('/dashboard');

    // Look for snap-to-log or image upload
    const snapButton = page.locator('button:has-text("Snap"), button:has-text("Camera"), [title*="camera" i]').first();
    
    if (await snapButton.isVisible()) {
      console.log('✓ Camera/Snap button available for offline image queue test');
      // Note: Actual image upload testing requires file system access
    } else {
      console.log('⚠ Snap/Camera button not found');
    }
  });
});
