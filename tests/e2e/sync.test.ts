/**
 * E2E Tests for Offline Sync Logic
 * 
 * Verifies that food logs created offline are properly synced when back online.
 * Tests the Dexie.js + Delta Sync implementation.
 */

import { test, expect } from './fixtures';
import { BrowserContext } from '@playwright/test';

test.describe('Offline Sync Logic', () => {
  test('should save food log offline and sync when online', async ({ page, context }) => {
    const testEmail = 'test_offline_' + Date.now() + '@opennutri.test';
    const testPassword = 'TestPassword123!';
    
    // Create account while online
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline using Playwright's context
    await context.setOffline(true);
    
    // Verify offline indicator shows (if implemented)
    const offlineIndicator = page.locator('text=/offline/i, [data-testid="offline-indicator"]');
    if (await offlineIndicator.isVisible().catch(() => false)) {
      console.log('✓ Offline indicator visible');
    }

    // Add food entry while offline
    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food"), button:has-text("Log Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      
      const foodInput = page.locator('input[placeholder*="food"]');
      if (await foodInput.isVisible()) {
        await foodInput.fill('Offline Salad');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);
      }
    }

    // Go back online
    await context.setOffline(false);
    
    // Wait for sync to complete
    await page.waitForTimeout(3000);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify entry synced to server
    const entry = page.locator('text=/Offline Salad/i');
    await expect(entry.first()).toBeVisible({ timeout: 5000 });
    
    console.log('✓ Offline entry synced successfully');
  });

  test('should queue multiple offline entries and sync all', async ({ page, context }) => {
    const testEmail = 'test_offline_multi_' + Date.now() + '@opennutri.test';
    const testPassword = 'TestPassword123!';
    
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline
    await context.setOffline(true);
    
    // Add multiple entries
    const offlineFoods = ['Offline Breakfast', 'Offline Lunch', 'Offline Snack'];
    
    for (const food of offlineFoods) {
      await page.goto('/dashboard');
      const addFoodButton = page.locator('button:has-text("Add Food")');
      if (await addFoodButton.isVisible()) {
        await addFoodButton.click();
        await page.fill('input[placeholder*="food"]', food);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(500);
      }
    }

    // Go online and sync
    await context.setOffline(false);
    await page.waitForTimeout(5000);
    await page.reload();

    // Verify all entries synced
    for (const food of offlineFoods) {
      const entry = page.locator('text=' + food);
      await expect(entry.first()).toBeVisible({ timeout: 3000 });
    }
    
    console.log('✓ Multiple offline entries synced successfully');
  });

  test('should handle network interruption during sync', async ({ page, context }) => {
    const testEmail = 'test_interrupt_' + Date.now() + '@opennutri.test';
    const testPassword = 'TestPassword123!';
    
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Add entry online first
    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Pre-Interrupt Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    }

    // Go offline and add entry
    await context.setOffline(true);
    await page.goto('/dashboard');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Interrupt Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Simulate flaky network: toggle offline/online
    await context.setOffline(false);
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await context.setOffline(false);
    
    // Wait for recovery and sync
    await page.waitForTimeout(5000);
    await page.reload();

    // Both entries should be present
    const preInterruptEntry = page.locator('text=/Pre-Interrupt Entry/i');
    const interruptEntry = page.locator('text=/Interrupt Entry/i');
    
    await expect(preInterruptEntry.first()).toBeVisible({ timeout: 5000 });
    await expect(interruptEntry.first()).toBeVisible({ timeout: 5000 });
    
    console.log('✓ Network interruption handled correctly');
  });

  test('should preserve data when closing browser during pending sync', async ({ page, context }) => {
    const testEmail = 'test_close_' + Date.now() + '@opennutri.test';
    const testPassword = 'TestPassword123!';
    
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Go offline
    await context.setOffline(true);
    
    // Add entry
    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Pending Sync Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // Close browser (simulates crash/user closing)
    await context.close();
    
    // Reopen and login
    const browser = context.browser();
    if (!browser) {
      throw new Error('Browser not available');
    }
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    
    await newPage.goto('/login');
    await newPage.fill('input[type="email"]', testEmail);
    await newPage.fill('input[type="password"]', testPassword);
    await newPage.click('button[type="submit"]');
    await newPage.waitForURL(/\/dashboard/);

    // Entry should still be in local DB, waiting for sync
    const entry = newPage.locator('text=/Pending Sync Entry/i');
    await expect(entry.first()).toBeVisible({ timeout: 5000 });

    // Go online and sync
    await newContext.setOffline(false);
    await newPage.waitForTimeout(3000);
    await newPage.reload();

    // Verify synced
    const syncedEntry = newPage.locator('text=/Pending Sync Entry/i');
    await expect(syncedEntry.first()).toBeVisible({ timeout: 5000 });
    
    console.log('✓ Data preserved after browser close during pending sync');
  });
});
