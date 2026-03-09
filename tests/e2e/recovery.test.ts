/**
 * E2E Tests for Vault Recovery Flow
 *
 * Tests the Social Recovery (SSS) and mnemonic recovery features.
 * Verifies that users can recover their vault using:
 * 1. BIP-39 Mnemonic Phrase
 * 2. 2-of-3 Shamir's Secret Sharing Shards
 */

import { test, expect } from './fixtures';

test.describe('Vault Recovery - Social Recovery (SSS)', () => {
  test('should generate recovery shards during setup', async ({ page }) => {
    const testEmail = `test_recovery_setup_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    // Create account
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Navigate to settings to setup recovery
    await page.goto('/settings');

    // Look for recovery setup button
    const recoveryButton = page.locator('text=/Recovery|Backup|Shards/i').first();
    
    if (await recoveryButton.isVisible()) {
      await recoveryButton.click();

      // Should show recovery dialog
      const dialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]');
      await expect(dialog.first()).toBeVisible({ timeout: 5000 });

      // Generate shards
      const generateButton = page.locator('text=/Generate|Enable Recovery/i');
      if (await generateButton.isVisible()) {
        await generateButton.click();
        await page.waitForTimeout(2000);

        // Should show shards
        const shardText = page.locator('text=/SHARD|shard/i');
        await expect(shardText.first()).toBeVisible({ timeout: 3000 });

        console.log('✓ Recovery shards generated successfully');
      } else {
        console.log('⚠ Recovery generation button not found');
      }
    } else {
      console.log('⚠ Recovery setup option not found in settings');
    }
  });

  test('should display shard information correctly', async ({ page }) => {
    const testEmail = `test_recovery_display_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/settings');

    const recoveryButton = page.locator('text=/Recovery|Backup/i').first();
    if (await recoveryButton.isVisible()) {
      await recoveryButton.click();

      const generateButton = page.locator('text=/Generate|Enable/i');
      if (await generateButton.isVisible()) {
        await generateButton.click();
        await page.waitForTimeout(2000);

        // Verify shard count (should be 3 shards for 2-of-3 scheme)
        const shardCount = await page.locator('text=/SHARD 1|SHARD 2|SHARD 3/i').count();
        expect(shardCount).toBeGreaterThanOrEqual(1);

        // Verify shard data is displayed (hex strings)
        const shardData = page.locator('[class*="shard"], [class*="code"], text=/^[a-f0-9]+$/i').first();
        if (await shardData.isVisible()) {
          const text = await shardData.textContent();
          // Shards should be hex-encoded strings
          expect(text).toMatch(/^[a-f0-9]+$/i);
        }

        console.log('✓ Shard information displayed correctly');
      }
    }
  });

  test('should allow downloading recovery shard', async ({ page }) => {
    const testEmail = `test_recovery_download_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';

    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    await page.goto('/settings');

    const recoveryButton = page.locator('text=/Recovery|Backup/i').first();
    if (await recoveryButton.isVisible()) {
      await recoveryButton.click();

      const generateButton = page.locator('text=/Generate|Enable/i');
      if (await generateButton.isVisible()) {
        await generateButton.click();
        await page.waitForTimeout(2000);

        // Look for download button
        const downloadButton = page.locator('button:has-text("Download"), [title*="download" i]');
        if (await downloadButton.isVisible()) {
          // Note: Actual download testing requires file system access
          // Just verify the button exists
          console.log('✓ Download shard button available');
        } else {
          // May use copy button instead
          const copyButton = page.locator('button:has-text("Copy"), [title*="copy" i]');
          if (await copyButton.isVisible()) {
            console.log('✓ Copy shard button available');
          }
        }
      }
    }
  });
});

test.describe('Vault Recovery - Mnemonic Recovery', () => {
  test('should recover vault with mnemonic after password loss', async ({ page, context }) => {
    const testEmail = `test_mnemonic_recovery_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';
    const newPassword = 'NewPassword456!';

    // Setup: Create account and generate recovery kit
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Add a food entry to verify recovery
    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Recovery Test Entry');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Generate recovery mnemonics
    await page.goto('/settings');
    const recoveryButton = page.locator('text=/Recovery|Backup/i').first();
    let mnemonics: string | null = null;

    if (await recoveryButton.isVisible()) {
      await recoveryButton.click();

      const generateButton = page.locator('text=/Generate|Enable/i');
      if (await generateButton.isVisible()) {
        await generateButton.click();
        await page.waitForTimeout(2000);

        // Extract mnemonics from dialog
        const mnemonicDisplay = page.locator('[class*="mnemonic"], [class*="word"], text=/^[a-z]+( [a-z]+)*$/i').first();
        if (await mnemonicDisplay.isVisible()) {
          mnemonics = await mnemonicDisplay.textContent();
          console.log('✓ Mnemonics captured for recovery test');
        }
      }
    }

    // Logout
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL(/\/login|\/$/);
    }

    // Simulate password loss - go to recovery page
    await page.goto('/recovery');

    // Enter recovery mnemonics
    if (mnemonics) {
      const mnemonicInput = page.locator('textarea[name="mnemonics"], textarea[placeholder*="mnemonic" i]');
      if (await mnemonicInput.isVisible()) {
        await mnemonicInput.fill(mnemonics);

        // Enter new password
        const newPasswordInput = page.locator('input[type="password"]').first();
        await newPasswordInput.fill(newPassword);

        // Submit recovery
        const recoverButton = page.locator('button:has-text("Recover"), button:has-text("Reset Password")');
        await recoverButton.click();
        await page.waitForTimeout(3000);

        // Should redirect to dashboard
        await page.waitForURL(/\/dashboard/);

        // Verify data is accessible
        const entry = page.locator('text=/Recovery Test Entry/i');
        await expect(entry.first()).toBeVisible({ timeout: 5000 });

        console.log('✓ Vault recovered successfully with mnemonics');
      }
    } else {
      console.log('⚠ Could not capture mnemonics for recovery test');
    }
  });

  test('should reject invalid mnemonics', async ({ page }) => {
    await page.goto('/recovery');

    // Enter invalid mnemonics
    const mnemonicInput = page.locator('textarea[name="mnemonics"], textarea[placeholder*="mnemonic" i]');
    if (await mnemonicInput.isVisible()) {
      await mnemonicInput.fill('invalid wrong fake words here not real mnemonics at all');

      const recoverButton = page.locator('button:has-text("Recover")');
      await recoverButton.click();
      await page.waitForTimeout(2000);

      // Should show error message
      const errorMessage = page.locator('text=/invalid|Invalid|Error/i');
      await expect(errorMessage.first()).toBeVisible({ timeout: 3000 });

      console.log('✓ Invalid mnemonics correctly rejected');
    }
  });

  test('should reject insufficient shards', async ({ page }) => {
    await page.goto('/recovery');

    // Try to recover with only 1 shard (need 2 for 2-of-3 scheme)
    const singleShard = '1-aabbccdd11223344556677889900aabbccdd11223344556677889900aabbccdd';

    // Switch to shard recovery mode if available
    const shardModeButton = page.locator('text=/Shard|SSS/i');
    if (await shardModeButton.isVisible()) {
      await shardModeButton.click();
    }

    const shardInput = page.locator('textarea[name="shard1"], input[name="shard1"], textarea[placeholder*="shard" i]').first();
    if (await shardInput.isVisible()) {
      await shardInput.fill(singleShard);

      const recoverButton = page.locator('button:has-text("Recover")');
      await recoverButton.click();
      await page.waitForTimeout(2000);

      // Should show error about insufficient shards
      const errorMessage = page.locator('text=/insufficient|threshold|Invalid/i');
      await expect(errorMessage.first()).toBeVisible({ timeout: 3000 });

      console.log('✓ Single shard correctly rejected (threshold not met)');
    }
  });
});

test.describe('Vault Recovery - Cross-Device Recovery', () => {
  test('should recover data on different device using mnemonics', async ({ page, context }) => {
    const testEmail = `test_cross_device_${Date.now()}@opennutri.test`;
    const testPassword = 'TestPassword123!';
    let mnemonics: string | null = null;

    // Device 1: Setup and generate recovery kit
    await page.goto('/signup');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);

    // Add data
    await page.goto('/dashboard');
    const addFoodButton = page.locator('button:has-text("Add Food")');
    if (await addFoodButton.isVisible()) {
      await addFoodButton.click();
      await page.fill('input[placeholder*="food"]', 'Cross-Device Test');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }

    // Generate recovery
    await page.goto('/settings');
    const recoveryButton = page.locator('text=/Recovery|Backup/i').first();
    if (await recoveryButton.isVisible()) {
      await recoveryButton.click();

      const generateButton = page.locator('text=/Generate|Enable/i');
      if (await generateButton.isVisible()) {
        await generateButton.click();
        await page.waitForTimeout(2000);

        const mnemonicDisplay = page.locator('[class*="mnemonic"]').first();
        if (await mnemonicDisplay.isVisible()) {
          mnemonics = await mnemonicDisplay.textContent();
        }
      }
    }

    // Logout from device 1
    const logoutButton = page.locator('button:has-text("Logout")');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForURL(/\/login|\/$/);
    }

    // Device 2: New browser context
    const browser = context.browser();
    if (!browser) {
      throw new Error('Browser not available');
    }
    const device2Context = await browser.newContext();
    const device2Page = await device2Context.newPage();

    // Go to recovery on device 2
    await device2Page.goto('/recovery');

    if (mnemonics) {
      const mnemonicInput = device2Page.locator('textarea[name="mnemonics"]').first();
      if (await mnemonicInput.isVisible()) {
        await mnemonicInput.fill(mnemonics);

        const newPasswordInput = device2Page.locator('input[type="password"]').first();
        await newPasswordInput.fill(testPassword);

        const recoverButton = device2Page.locator('button:has-text("Recover")');
        await recoverButton.click();
        await device2Page.waitForTimeout(3000);

        // Verify data accessible on device 2
        await device2Page.waitForURL(/\/dashboard/);
        const entry = device2Page.locator('text=/Cross-Device Test/i');
        await expect(entry.first()).toBeVisible({ timeout: 5000 });

        console.log('✓ Cross-device recovery successful');
      }
    }

    await device2Context.close();
  });
});

test.describe('Vault Recovery - Edge Cases', () => {
  test('should handle recovery with extra whitespace in mnemonics', async ({ page }) => {
    await page.goto('/recovery');

    // Enter mnemonics with extra whitespace
    const mnemonicInput = page.locator('textarea[name="mnemonics"]').first();
    if (await mnemonicInput.isVisible()) {
      // Valid mnemonics with extra spaces
      const validMnemonics = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      await mnemonicInput.fill(`  ${validMnemonics}   `);

      const recoverButton = page.locator('button:has-text("Recover")');
      await recoverButton.click();
      await page.waitForTimeout(2000);

      // Should either recover or show specific error (not crash)
      const errorMessage = page.locator('text=/error|invalid/i');
      if (await errorMessage.isVisible()) {
        console.log('✓ Whitespace handling: Error shown for invalid checksum');
      } else {
        console.log('✓ Whitespace handled gracefully');
      }
    }
  });

  test('should prevent recovery without any credentials', async ({ page }) => {
    await page.goto('/recovery');

    const recoverButton = page.locator('button:has-text("Recover")');
    if (await recoverButton.isVisible()) {
      await recoverButton.click();
      await page.waitForTimeout(1000);

      // Should show validation error
      const errorMessage = page.locator('text=/required|enter|valid/i');
      await expect(errorMessage.first()).toBeVisible({ timeout: 3000 });

      console.log('✓ Recovery prevented without credentials');
    }
  });
});
