import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { foodLogs, logItems, userTargets, userRecipes } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Process single Outbox item (Write-Ahead Log)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { table, entityId, operation, payload } = body;

    if (body.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (table === 'foodLogs') {
      if (operation === 'PUT') {
        // Upsert food log
        await db.insert(foodLogs).values({
          id: payload.id,
          userId,
          timestamp: new Date(payload.timestamp),
          mealType: payload.mealType,
          totalCalories: payload.totalCalories,
          aiConfidenceScore: payload.aiConfidenceScore,
          isVerified: payload.isVerified,
          imageUrl: payload.imageUrl,
          notes: payload.notes,
          encryptedData: payload.encryptedData,
          encryptionIv: payload.encryptionIv,
          encryptionSalt: payload.encryptionSalt,
          version: payload.version,
          deviceId: payload.deviceId,
          updatedAt: new Date(payload.updatedAt),
        }).onConflictDoUpdate({
          target: [foodLogs.id],
          set: {
            mealType: payload.mealType,
            totalCalories: payload.totalCalories,
            aiConfidenceScore: payload.aiConfidenceScore,
            isVerified: payload.isVerified,
            imageUrl: payload.imageUrl,
            notes: payload.notes,
            encryptedData: payload.encryptedData,
            encryptionIv: payload.encryptionIv,
            encryptionSalt: payload.encryptionSalt,
            version: payload.version,
            deviceId: payload.deviceId,
            updatedAt: new Date(payload.updatedAt),
          }
        });

        // Sync items if present
        if (payload.items && payload.items.length > 0) {
          // Delete old items first for a clean state
          await db.delete(logItems).where(eq(logItems.logId, payload.id));
          
          await db.insert(logItems).values(
            payload.items.map((item: any) => ({
              logId: payload.id,
              foodName: item.foodName,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              notes: item.notes,
              source: item.source || 'AI_ESTIMATE',
            }))
          );
        }
      } else if (operation === 'DELETE') {
        await db.delete(foodLogs).where(and(eq(foodLogs.id, entityId), eq(foodLogs.userId, userId)));
      }
    } else if (table === 'userTargets') {
       // Similar logic for targets...
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Outbox process error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
