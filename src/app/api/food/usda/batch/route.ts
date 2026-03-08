/**
 * Batch USDA Food Enhancement Route
 *
 * Enhances multiple food items with USDA data in a single request.
 * Solves the N+1 API call problem by batching all requests server-side.
 *
 * Requires authentication and rate limits requests to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { enhanceWithUSDAData } from '@/lib/ai-usda-bridge';

const MAX_ITEMS_PER_REQUEST = 50;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Items must be an array' },
        { status: 400 }
      );
    }

    // Rate limiting: prevent abuse
    if (items.length > MAX_ITEMS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Too many items. Maximum ${MAX_ITEMS_PER_REQUEST} items per request.` },
        { status: 400 }
      );
    }

    // Transform client items to the format expected by enhanceWithUSDAData
    const aiItems = items.map((item) => ({
      name: item.foodName,
      calories: item.calories || 0,
      protein_g: item.protein || 0,
      carbs_g: item.carbs || 0,
      fat_g: item.fat || 0,
      confidence: item.confidence || 0.7,
      portion_guess: item.portion_guess || '',
      numeric_quantity: item.numeric_quantity || 1,
      unit: item.unit || 'serving',
    }));

    // Enhance all items with USDA data in a single batch
    const enhancedItems = await enhanceWithUSDAData(aiItems);

    return NextResponse.json({ items: enhancedItems });
  } catch (error) {
    console.error('Batch USDA enhancement error:', error);
    return NextResponse.json(
      { error: 'Failed to enhance items with USDA data' },
      { status: 500 }
    );
  }
}
