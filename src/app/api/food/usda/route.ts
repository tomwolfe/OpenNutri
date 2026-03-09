/**
 * USDA Food Search API Route
 * GET /api/food/usda?query=apple
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchFoods, extractMacros } from '@/lib/usda';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      );
    }

    const results = await searchFoods(query);

    // Transform results to include extracted macros
    const foods = results.foods.map((food) => ({
      fdcId: food.fdcId,
      description: food.description,
      dataType: food.dataType,
      servingSize: food.servingSize,
      servingSizeUnit: food.servingSizeUnit,
      ...extractMacros(food),
    }));

    return NextResponse.json({
      foods,
      totalHits: results.totalHits,
      currentPage: results.currentPage,
      totalPages: results.totalPages,
    });
  } catch (error) {
    console.error('USDA search error:', error);
    return NextResponse.json(
      { error: 'Failed to search foods' },
      { status: 500 }
    );
  }
}
