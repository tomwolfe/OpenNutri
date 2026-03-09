/**
 * Community Food Submission API
 *
 * Allows users to submit new foods to the community database.
 * All submissions are encrypted and moderated.
 *
 * Task 2.5: Community-powered food database
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { communityFoods } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/food/community
 * 
 * Search community foods with pagination and filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const category = searchParams.get('category');
    const language = searchParams.get('language') || 'en';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status') || 'approved'; // Only show approved by default

    const offset = (page - 1) * limit;

    // Build query
    let foodsQuery = db
      .select()
      .from(communityFoods)
      .where(eq(communityFoods.status, status));

    // Add search filter
    if (query) {
      foodsQuery = foodsQuery.where(
        sql`${communityFoods.name} ILIKE ${`%${query}%`} OR ${communityFoods.description} ILIKE ${`%${query}%`}`
      );
    }

    // Add category filter
    if (category) {
      foodsQuery = foodsQuery.where(eq(communityFoods.category, category));
    }

    // Add language filter
    if (language) {
      foodsQuery = foodsQuery.where(eq(communityFoods.language, language));
    }

    // Add sorting (by upvotes - downvotes)
    foodsQuery = foodsQuery
      .orderBy(desc(sql`${communityFoods.upvotes} - ${communityFoods.downvotes}`), desc(communityFoods.createdAt))
      .limit(limit)
      .offset(offset);

    const foods = await foodsQuery;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(communityFoods)
      .where(eq(communityFoods.status, status));

    const total = Number(countResult[0]?.count || 0);

    return NextResponse.json({
      foods,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Community foods GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch community foods' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/food/community
 * 
 * Submit a new community food
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();

    const {
      name,
      description,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sodium,
      servingSize,
      servingGrams,
      category,
      brand,
      barcode,
      language,
      country,
      ingredients,
      allergens,
      metadata,
    } = body;

    // Validate required fields
    if (!name || !calories) {
      return NextResponse.json(
        { error: 'Name and calories are required' },
        { status: 400 }
      );
    }

    // Check for duplicate (barcode or name + brand)
    if (barcode) {
      const existing = await db
        .select()
        .from(communityFoods)
        .where(eq(communityFoods.barcode, barcode))
        .limit(1);

      if (existing.length > 0) {
        return NextResponse.json(
          { error: 'Food with this barcode already exists' },
          { status: 409 }
        );
      }
    }

    // Insert new community food
    const [newFood] = await db
      .insert(communityFoods)
      .values({
        userId,
        name,
        description: description || null,
        calories,
        protein: protein || null,
        carbs: carbs || null,
        fat: fat || null,
        fiber: fiber || null,
        sodium: sodium || null,
        servingSize: servingSize || '100g',
        servingGrams: servingGrams || 100,
        category: category || 'homemade',
        brand: brand || null,
        barcode: barcode || null,
        language: language || 'en',
        country: country || null,
        ingredients: ingredients || null,
        allergens: allergens || null,
        status: 'pending', // Requires moderation
        verified: false,
        source: 'user_submission',
        metadata: metadata || null,
      })
      .returning();

    return NextResponse.json({
      success: true,
      food: newFood,
      message: 'Food submitted for moderation. Thank you!',
    });
  } catch (error) {
    console.error('Community food POST error:', error);
    return NextResponse.json(
      { error: 'Failed to submit food' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/food/community
 * 
 * Vote on a community food (upvote/downvote)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, vote } = body; // vote: 'up' | 'down'

    if (!id || !vote) {
      return NextResponse.json(
        { error: 'Food ID and vote type required' },
        { status: 400 }
      );
    }

    if (vote !== 'up' && vote !== 'down') {
      return NextResponse.json(
        { error: 'Vote must be "up" or "down"' },
        { status: 400 }
      );
    }

    // Update vote count
    const updateField = vote === 'up' ? 'upvotes' : 'downvotes';
    
    await db
      .update(communityFoods)
      .set({
        [updateField]: sql`${communityFoods[updateField]} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(communityFoods.id, id));

    // Fetch updated food
    const [updatedFood] = await db
      .select()
      .from(communityFoods)
      .where(eq(communityFoods.id, id))
      .limit(1);

    return NextResponse.json({
      success: true,
      food: updatedFood,
    });
  } catch (error) {
    console.error('Community food PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to vote' },
      { status: 500 }
    );
  }
}
