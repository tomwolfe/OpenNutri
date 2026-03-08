/**
 * AI Scan Usage API
 *
 * Returns the user's daily AI scan count and remaining scans.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRemainingAiScans, getUserDailyAiScanCount } from '@/lib/ai-limits';

export const runtime = 'edge';
export const maxDuration = 10;

/**
 * GET /api/ai/usage
 *
 * Returns daily AI scan usage for the authenticated user.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const used = await getUserDailyAiScanCount(userId);
    const remaining = await getRemainingAiScans(userId);
    const dailyLimit = parseInt(process.env.AI_SCAN_LIMIT_FREE || '5', 10);

    // Calculate reset time (midnight)
    const resetDate = new Date();
    resetDate.setHours(24, 0, 0, 0);

    return NextResponse.json({
      used,
      remaining,
      dailyLimit,
      resetAt: resetDate.toISOString(),
    });
  } catch (error) {
    console.error('AI usage error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 }
    );
  }
}
