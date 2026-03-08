/**
 * Global Test Fixtures for OpenNutri E2E Tests
 */

import { test as base, expect } from '@playwright/test';

// Test user credentials
export const TEST_USER = {
  email: 'test_' + Date.now() + '@opennutri.test',
  password: 'TestPassword123!',
};

// Extend Playwright test with custom fixtures
export const test = base.extend<{
  authenticatedPage: any;
}>({
  authenticatedPage: async ({ page }: { page: any }, use: any) => {
    // Navigate to signup
    await page.goto('/signup');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for navigation to dashboard
    await page.waitForURL(/\/dashboard/);
    
    await use(page);
  },
});

export { expect };
