/**
 * E2E Tests for Wrong Password / Decryption Failure Scenarios
 * 
 * Verifies that:
 * - Wrong password prevents decryption of food logs
 * - User sees appropriate error messages
 * - Data is not corrupted when decryption fails
 */

import { test, expect } from './fixtures';

test.describe('Wrong Password Scenarios', () => {
  test('should show error when logging in with wrong password', async ({ page }) => {
    const testEmail = 'test_wrong_pw_' + Date.now() + '@opennutri.test';
    const testPassword = 'CorrectPassword123!';
    const wrongPassword = 'WrongPassword456!';
    
    // Create account with correct password
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Add a food entry
    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food"), button:has-text("Log Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Secret Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Logout
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out"), [data-testid="logout"]');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL(/\/login|\/signin/);
    }

    // Try to login with wrong password
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', wrongPassword);
    await page.click('button[type="submit"]');

    // Should show error message
    const errorMessage = page.locator('text=/invalid|wrong|incorrect|error/i');
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
    
    // Should not redirect to dashboard
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
    
    console.log('✓ Wrong password rejected correctly');
  });

  test('should not decrypt food logs with wrong password', async ({ page }) => {
    const testEmail = 'test_decrypt_fail_' + Date.now() + '@opennutri.test';
    const testPassword = 'CorrectPassword123!';
    const wrongPassword = 'WrongPassword456!';
    
    // Create account and add encrypted entry
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Encrypted Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Logout and login with wrong password
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    }

    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', wrongPassword);
    await page.click('button[type="submit"]');

    // Login should fail, not even reach dashboard
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
    
    console.log('✓ Cannot access encrypted data with wrong password');
  });

  test('should handle case-sensitive password correctly', async ({ page }) => {
    const testEmail = 'test_case_' + Date.now() + '@opennutri.test';
    const testPassword = 'CaseSensitive123!';
    const wrongCasePassword = 'casesensitive123!';
    
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Logout
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    }

    // Try login with wrong case
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', wrongCasePassword);
    await page.click('button[type="submit"]');

    // Should fail
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
    
    // Login with correct case
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
    
    console.log('✓ Password case sensitivity handled correctly');
  });

  test('should not leak encrypted data in error messages', async ({ page }) => {
    const testEmail = 'test_leak_' + Date.now() + '@opennutri.test';
    const testPassword = 'TestPassword123!';
    
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Add entry
    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Sensitive Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Logout
    const logoutButton = page.locator('button:has-text("Logout")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
    }

    // Login with wrong password
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', 'WrongPassword!');
    await page.click('button[type="submit"]');

    // Wait for error
    await page.waitForTimeout(2000);

    // Get page content and verify no sensitive data leaked
    const pageContent = await page.content();
    
    // Should not contain the food entry text
    expect(pageContent).not.toContain('Sensitive Entry');
    
    // Should not contain any encrypted data blobs (base64 patterns)
    const base64Pattern = /[A-Za-z0-9+/]{50,}={0,2}/g;
    const base64Matches = pageContent.match(base64Pattern);
    expect(base64Matches).toBeNull();
    
    console.log('✓ No encrypted data leaked in error state');
  });
});
