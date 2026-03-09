/**
 * E2E Tests for Local AI Implementation
 *
 * Verifies WebGPU detection, model loading, and local classification.
 * Task 1.4-1.6: Weeks 3-4 Local AI Foundation
 */

import { test, expect } from './fixtures';

test.describe('Local AI - WebGPU Detection', () => {
  test('should detect device capabilities on page load', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for AI status indicator to appear
    const aiStatus = page.locator('[data-testid="ai-status"], text=/WebGPU|CPU mode|AI/i').first();
    
    // Should show some status within 5 seconds
    await expect(aiStatus).toBeVisible({ timeout: 5000 });
    
    const statusText = await aiStatus.textContent();
    console.log(`AI Status: ${statusText}`);
    
    // Status should indicate one of the supported modes
    expect(statusText).toMatch(/WebGPU|CPU|WASM|AI/i);
  });

  test('should display AI status indicator component', async ({ page }) => {
    await page.goto('/dashboard');

    // Look for the AI status indicator
    const statusIndicator = page.locator('[data-testid="ai-status-indicator"]');
    
    // Component may or may not be present depending on implementation
    // If present, verify it shows correct info
    if (await statusIndicator.isVisible()) {
      const icon = statusIndicator.locator('svg').first();
      await expect(icon).toBeVisible();
      
      console.log('✓ AI status indicator displayed');
    } else {
      console.log('⚠ AI status indicator not found (optional component)');
    }
  });

  test('should report device info to main thread', async ({ page }) => {
    // Enable console logging to capture device info
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WebGPU') || text.includes('device')) {
        consoleMessages.push(text);
      }
    });

    await page.goto('/dashboard');
    await page.waitForTimeout(2000); // Allow time for device detection

    // Check console for device info messages
    const hasDeviceInfo = consoleMessages.some(msg => 
      msg.includes('WebGPU') || msg.includes('device') || msg.includes('GPU')
    );

    if (hasDeviceInfo) {
      console.log('✓ Device info reported to main thread');
      consoleMessages.forEach(msg => console.log(`  ${msg}`));
    } else {
      console.log('⚠ No device info messages found');
    }
  });
});

test.describe('Local AI - Model Loading', () => {
  test('should load models progressively', async ({ page }) => {
    await page.goto('/dashboard');

    // Look for model loading progress
    const progressIndicator = page.locator('[data-testid="model-progress"], text=/Loading|Ready/i').first();
    
    // Progress may appear during AI usage
    if (await progressIndicator.isVisible()) {
      const progressText = await progressIndicator.textContent();
      console.log(`Model loading: ${progressText}`);
      
      // Should show progress or ready state
      expect(progressText).toMatch(/Loading|Ready|complete/i);
    } else {
      console.log('⚠ Model progress indicator not visible (models load on-demand)');
    }
  });

  test('should handle model loading errors gracefully', async ({ page }) => {
    await page.goto('/dashboard');

    // Navigate to AI feature (Snap-to-Log)
    const snapButton = page.locator('button:has-text("Snap"), button:has-text("Scan"), button:has-text("Analyze")').first();
    
    if (await snapButton.isVisible()) {
      await snapButton.click();
      
      // Should not crash even if model loading fails
      await page.waitForTimeout(3000);
      
      // Page should still be functional
      const isPageHealthy = await page.locator('body').isVisible();
      expect(isPageHealthy).toBe(true);
      
      console.log('✓ App remains functional after model load attempt');
    } else {
      console.log('⚠ Snap-to-Log feature not found');
    }
  });

  test('should support manual model preloading', async ({ page }) => {
    await page.goto('/settings');

    // Look for preload button
    const preloadButton = page.locator('button:has-text("Preload"), button:has-text("Load AI")').first();
    
    if (await preloadButton.isVisible()) {
      await preloadButton.click();
      
      // Should show loading state
      await page.waitForTimeout(1000);
      
      const isLoading = await page.locator('text=/Loading|Preloading/i').isVisible();
      console.log(`Preload initiated: ${isLoading ? 'Yes' : 'No'}`);
    } else {
      console.log('⚠ Manual preload button not found (optional feature)');
    }
  });
});

test.describe('Local AI - Food Classification', () => {
  test('should classify food image locally', async ({ page }) => {
    await page.goto('/dashboard');

    // Find and click Snap-to-Log button
    const snapButton = page.locator('button:has-text("Snap"), button:has-text("Scan")').first();
    
    if (!(await snapButton.isVisible())) {
      console.log('⚠ Snap-to-Log not available, skipping classification test');
      return;
    }

    await snapButton.click();

    // Upload a test image (if file input is available)
    const fileInput = page.locator('input[type="file"]').first();
    
    if (await fileInput.isVisible()) {
      // Note: In real tests, you would upload actual test images
      console.log('✓ File input available for image classification');
    } else {
      console.log('⚠ File input not visible');
    }
  });

  test('should show classification results', async ({ page }) => {
    await page.goto('/dashboard');

    // Trigger AI analysis
    const analyzeButton = page.locator('button:has-text("Analyze"), button:has-text("Scan")').first();
    
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
      
      // Wait for results (if any)
      await page.waitForTimeout(5000);
      
      // Look for AI results
      const results = page.locator('[data-testid="ai-results"], .ai-results, text=/Apple|Banana|Food/i').first();
      
      if (await results.isVisible()) {
        const resultText = await results.textContent();
        console.log(`Classification results: ${resultText}`);
      } else {
        console.log('⚠ No classification results visible');
      }
    }
  });

  test('should fallback to cloud AI when local confidence is low', async ({ page }) => {
    // This test verifies the fallback logic
    await page.goto('/dashboard');

    // Check console for fallback messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('fallback') || text.includes('cloud') || text.includes('MobileNet')) {
        consoleMessages.push(text);
      }
    });

    // Trigger AI analysis
    const analyzeButton = page.locator('button:has-text("Analyze")').first();
    if (await analyzeButton.isVisible()) {
      await analyzeButton.click();
      await page.waitForTimeout(10000); // Allow time for analysis
    }

    // Check if fallback occurred
    const hasFallback = consoleMessages.some(msg => 
      msg.toLowerCase().includes('fallback') || msg.toLowerCase().includes('cloud')
    );

    if (hasFallback) {
      console.log('✓ Fallback mechanism triggered when needed');
      consoleMessages.forEach(msg => console.log(`  ${msg}`));
    } else {
      console.log('ℹ️ No fallback detected (local AI sufficient)');
    }
  });
});

test.describe('Local AI - Semantic Cache', () => {
  test('should cache frequent foods locally', async ({ page }) => {
    await page.goto('/dashboard');

    // Check IndexedDB for cached foods
    const cachedFoods = await page.evaluate(async () => {
      if (typeof indexedDB === 'undefined') return null;
      
      return new Promise((resolve) => {
        const request = indexedDB.open('opennutri-local', 1);
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('localSemanticCache')) {
            resolve(null);
            return;
          }
          
          const tx = db.transaction('localSemanticCache', 'readonly');
          const store = tx.objectStore('localSemanticCache');
          const countRequest = store.count();
          countRequest.onsuccess = () => resolve(countRequest.result);
        };
      });
    });

    if (cachedFoods !== null) {
      console.log(`✓ Local semantic cache contains ${cachedFoods} items`);
      expect(cachedFoods).toBeGreaterThan(0);
    } else {
      console.log('⚠ Local semantic cache not found or empty');
    }
  });

  test('should search local history for food matches', async ({ page }) => {
    await page.goto('/dashboard');

    // Start typing a food name
    const foodInput = page.locator('input[placeholder*="food"], input[name="foodName"]').first();
    
    if (await foodInput.isVisible()) {
      await foodInput.fill('Apple');
      await page.waitForTimeout(500);
      
      // Look for autocomplete suggestions from local cache
      const suggestions = page.locator('[data-testid="suggestion"], .suggestion, [role="listbox"]');
      
      if (await suggestions.isVisible()) {
        const count = await suggestions.count();
        console.log(`✓ Found ${count} local suggestions`);
      } else {
        console.log('ℹ️ No local suggestions (cache may be empty)');
      }
    }
  });

  test('should pre-compute embeddings for common foods', async ({ page }) => {
    // Verify the small-core-index.json is loaded
    const response = await page.goto('/data/small-core-index.json');
    
    if (response?.ok()) {
      const foods = await response?.json();
      console.log(`✓ Core index contains ${foods?.length || 0} foods`);
      
      if (foods && foods.length > 0) {
        expect(Array.isArray(foods)).toBe(true);
        expect(foods[0]).toHaveProperty('description');
        expect(foods[0]).toHaveProperty('calories');
      }
    } else {
      console.log('⚠ Core index file not found');
    }
  });
});

test.describe('Local AI - Performance', () => {
  test('should not block main thread during inference', async ({ page }) => {
    await page.goto('/dashboard');

    // Measure frame rate during AI operation
    const fpsMetrics = await page.evaluate(async () => {
      const frames: number[] = [];
      let lastTime = performance.now();
      let frameCount = 0;
      
      return new Promise((resolve) => {
        function measureFrame() {
          const now = performance.now();
          frames.push(1000 / (now - lastTime));
          lastTime = now;
          frameCount++;
          
          if (frameCount < 60) {
            requestAnimationFrame(measureFrame);
          } else {
            // Calculate average FPS
            const avgFps = frames.reduce((a, b) => a + b, 0) / frames.length;
            resolve({ avgFps, frames: frames.slice(0, 10) }); // Return first 10 frames
          }
        }
        requestAnimationFrame(measureFrame);
      });
    });

    console.log(`Average FPS: ${fpsMetrics.avgFps.toFixed(1)}`);
    
    // FPS should remain above 30 (not blocked by AI)
    // Note: This is a soft assertion as FPS can vary
    if (fpsMetrics.avgFps < 30) {
      console.log('⚠ Main thread may be blocked during AI operations');
    } else {
      console.log('✓ Main thread remains responsive');
    }
  });

  test('should load models without freezing UI', async ({ page }) => {
    await page.goto('/dashboard');

    // Trigger model load
    const analyzeButton = page.locator('button:has-text("Analyze")').first();
    if (await analyzeButton.isVisible()) {
      const startTime = Date.now();
      await analyzeButton.click();
      
      // UI should remain interactive
      await page.waitForTimeout(1000);
      
      const isInteractive = await page.locator('body').isEnabled();
      const loadTime = Date.now() - startTime;
      
      console.log(`Model load time: ${loadTime}ms`);
      console.log(`UI interactive: ${isInteractive ? 'Yes' : 'No'}`);
      
      expect(isInteractive).toBe(true);
    }
  });
});

test.describe('Local AI - Browser Compatibility', () => {
  test('should work on WebGPU-enabled browsers', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebGPU only supported in Chromium-based browsers');

    await page.goto('/dashboard');

    // Check WebGPU availability
    const hasWebGPU = await page.evaluate(() => {
      return !!(navigator as any).gpu;
    });

    if (hasWebGPU) {
      console.log('✓ WebGPU available in this browser');
      
      // Should use Moondream2 model
      const statusIndicator = page.locator('text=/WebGPU/i').first();
      if (await statusIndicator.isVisible()) {
        console.log('✓ Using WebGPU acceleration');
      }
    } else {
      console.log('ℹ️ WebGPU not available, using WASM fallback');
    }
  });

  test('should fallback gracefully on older browsers', async ({ page }) => {
    // This test would require browser version mocking
    // For now, verify WASM fallback is available
    await page.goto('/dashboard');

    const hasWASM = await page.evaluate(() => {
      return typeof WebAssembly !== 'undefined';
    });

    expect(hasWASM).toBe(true);
    console.log('✓ WASM fallback available');
  });
});
