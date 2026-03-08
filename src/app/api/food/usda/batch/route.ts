/**
 * Batch USDA Food Enhancement Route
 *
 * Enhances multiple food items with USDA data in a single request.
 * Solves the N+1 API call problem by batching all requests server-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { enhanceWithUSDAData } from '@/lib/ai-usda-bridge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Items must be an array' },
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
      confidence: 0.7, // Default confidence for client-side items
      portion_guess: '',
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
