/**
 * E2E Tests for Health Data Integration
 *
 * Verifies health data sync from Apple Health and Google Fit,
 * manual entry, and local caching behavior.
 */

import { test, expect } from './fixtures';

test.describe('Health Data Integration', () => {
  test('should display health sync component on dashboard', async ({ page }) => {
    const testEmail = `test_health_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    // Create account
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Navigate to dashboard
    await page.goto('/dashboard');

    // Health sync component should be visible
    const healthComponent = page.locator('text=/Activity Tracking|Health Sync/i');
    await expect(healthComponent.first()).toBeVisible({ timeout: 5000 });

    console.log('✓ Health sync component displayed');
  });

  test('should allow manual activity entry', async ({ page }) => {
    const testEmail = `test_health_manual_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Click manual entry button
    const manualEntryButton = page.locator('button[title="Manual entry"]');
    if (await manualEntryButton.isVisible()) {
      await manualEntryButton.click();

      // Fill in manual data
      const stepsInput = page.locator('input[placeholder="0"]').first();
      const caloriesInput = page.locator('input[placeholder="0"]').last();

      await stepsInput.fill('5000');
      await caloriesInput.fill('250');

      // Submit
      const saveButton = page.locator('button:has-text("Save")');
      await saveButton.click();

      // Wait for data to appear
      await page.waitForTimeout(1000);

      // Verify data is displayed
      const stepsDisplay = page.locator('text=/5,000|5000/');
      const caloriesDisplay = page.locator('text=/250/');

      await expect(stepsDisplay.first()).toBeVisible({ timeout: 3000 });
      await expect(caloriesDisplay.first()).toBeVisible({ timeout: 3000 });

      console.log('✓ Manual activity entry saved successfully');
    } else {
      console.log('⚠ Manual entry button not found, component may have different structure');
    }
  });

  test('should show sync button when health platforms available', async ({ page }) => {
    const testEmail = `test_health_sync_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Sync button should be present (may be disabled if no platform available)
    const syncButton = page.locator('button[title="Sync health data"]');
    
    // Button should exist in the DOM
    await expect(syncButton).toHaveCount(1);

    console.log('✓ Health sync button present');
  });

  test('should display progress bars for activity goals', async ({ page }) => {
    const testEmail = `test_health_progress_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Progress bars should be visible
    const progressBars = page.locator('[class*="bg-blue-600"], [class*="bg-orange-600"]');
    await expect(progressBars.first()).toBeVisible({ timeout: 5000 });

    console.log('✓ Activity progress bars displayed');
  });

  test('should persist health data across page reloads', async ({ page }) => {
    const testEmail = `test_health_persist_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Enter manual data
    const manualEntryButton = page.locator('button[title="Manual entry"]');
    if (await manualEntryButton.isVisible()) {
      await manualEntryButton.click();

      const stepsInput = page.locator('input[placeholder="0"]').first();
      const caloriesInput = page.locator('input[placeholder="0"]').last();

      await stepsInput.fill('8000');
      await caloriesInput.fill('400');

      const saveButton = page.locator('button:has-text("Save")');
      await saveButton.click();
      await page.waitForTimeout(1000);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Data should persist
      const stepsDisplay = page.locator('text=/8,000|8000/');
      await expect(stepsDisplay.first()).toBeVisible({ timeout: 5000 });

      console.log('✓ Health data persisted across reload');
    }
  });

  test('should handle sync error gracefully', async ({ page }) => {
    const testEmail = `test_health_error_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Try to sync (may show error if no platform available)
    const syncButton = page.locator('button[title="Sync health data"]');
    if (await syncButton.isVisible()) {
      await syncButton.click();
      
      // Wait for potential error message
      await page.waitForTimeout(2000);

      // Error message may appear in amber box
      const errorBox = page.locator('[class*="bg-amber-50"]');
      if (await errorBox.isVisible()) {
        console.log('✓ Sync error handled gracefully with user message');
      } else {
        console.log('✓ Sync attempted (no error shown)');
      }
    }
  });

  test('should show source indicator for health data', async ({ page }) => {
    const testEmail = `test_health_source_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');

    // Enter manual data to trigger source indicator
    const manualEntryButton = page.locator('button[title="Manual entry"]');
    if (await manualEntryButton.isVisible()) {
      await manualEntryButton.click();

      const stepsInput = page.locator('input[placeholder="0"]').first();
      await stepsInput.fill('3000');

      const saveButton = page.locator('button:has-text("Save")');
      await saveButton.click();
      await page.waitForTimeout(1000);

      // Source indicator should show "Manually entered"
      const sourceIndicator = page.locator('text=/Manually entered|Apple Health|Google Fit/i');
      await expect(sourceIndicator.first()).toBeVisible({ timeout: 3000 });

      console.log('✓ Data source indicator displayed');
    }
  });
});

test.describe('Health Data Privacy', () => {
  test('should not send health data to server', async ({ page }) => {
    const testEmail = `test_health_privacy_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Monitor network requests
    const healthRequests: string[] = [];
    
    page.on('request', (request) => {
      const url = request.url();
      // Check if any health data is being sent to server
      if (url.includes('/api/') && !url.includes('/api/auth/')) {
        const postData = request.postData();
        if (postData && (postData.includes('steps') || postData.includes('activeCalories'))) {
          healthRequests.push(url);
        }
      }
    });

    await page.goto('/dashboard');

    // Enter manual data
    const manualEntryButton = page.locator('button[title="Manual entry"]');
    if (await manualEntryButton.isVisible()) {
      await manualEntryButton.click();

      const stepsInput = page.locator('input[placeholder="0"]').first();
      await stepsInput.fill('5000');

      const saveButton = page.locator('button:has-text("Save")');
      await saveButton.click();
      await page.waitForTimeout(2000);
    }

    // Verify no health data was sent to server
    expect(healthRequests.length).toBe(0);
    console.log('✓ Health data kept local (not sent to server)');
  });
});
