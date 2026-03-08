/**
 * Delta Sync Push API Route
 * POST /api/sync/delta
 *
 * Pushes local changes to the server.
 * Handles batch creation/update of food logs and targets.
 *
 * Request Body:
 * - logs: Array of food logs to create/update
 * - targets: Array of user targets to create/update
 *
 * Response:
 * - success: boolean
 * - conflicts: Array of conflicting items (if any)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { foodLogs, logItems, userTargets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

interface SyncRequest {
  logs?: Array<{
    id: string;
    mealType?: string | null;
    totalCalories?: number | null;
    aiConfidenceScore?: number | null;
    isVerified?: boolean;
    timestamp: string;
    imageUrl?: string | null;
    notes?: string | null;
    encryptedData: string;
    encryptionIv: string;
    encryptionSalt?: string | null;
    yjsData?: string | null;
    version: number;
    deviceId?: string | null;
    updatedAt: number;
    items?: Array<{
      foodName?: string | null;
      calories?: number | null;
      protein?: number | null;
      carbs?: number | null;
      fat?: number | null;
      source?: string | null;
    }>;
  }>;
  targets?: Array<{
    userId: string;
    date: string;
    calorieTarget?: number | null;
    proteinTarget?: number | null;
    carbTarget?: number | null;
    fatTarget?: number | null;
    weightRecord?: number | null;
    yjsData?: string | null;
    version: number;
    deviceId?: string | null;
    updatedAt: number;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body: SyncRequest = await request.json();

    const conflicts: Array<{
      type: 'log' | 'target';
      id: string;
      localVersion: number;
      serverVersion: number;
    }> = [];

    // Process food logs
    if (body.logs && body.logs.length > 0) {
      for (const log of body.logs) {
        // Check if log exists on server
        const existingLogs = await db
          .select()
          .from(foodLogs)
          .where(
            and(
              eq(foodLogs.id, log.id),
              eq(foodLogs.userId, userId)
            )
          )
          .limit(1);

        const serverVersion = existingLogs.length > 0 ? existingLogs[0].version : 0;

        // Conflict detection: if server version is higher, skip and report conflict
        if (serverVersion >= log.version) {
          conflicts.push({
            type: 'log',
            id: log.id,
            localVersion: log.version,
            serverVersion,
          });
          continue;
        }

        // Upsert the log
        await db
          .insert(foodLogs)
          .values({
            id: log.id,
            userId,
            mealType: log.mealType,
            totalCalories: log.totalCalories,
            aiConfidenceScore: log.aiConfidenceScore,
            isVerified: log.isVerified,
            timestamp: new Date(log.timestamp),
            imageUrl: log.imageUrl,
            notes: log.notes,
            encryptedData: log.encryptedData,
            encryptionIv: log.encryptionIv,
            encryptionSalt: log.encryptionSalt,
            yjsData: log.yjsData,
            version: log.version,
            deviceId: log.deviceId,
            updatedAt: new Date(log.updatedAt),
          })
          .onConflictDoUpdate({
            target: [foodLogs.id],
            set: {
              mealType: log.mealType,
              totalCalories: log.totalCalories,
              aiConfidenceScore: log.aiConfidenceScore,
              isVerified: log.isVerified,
              imageUrl: log.imageUrl,
              notes: log.notes,
              encryptedData: log.encryptedData,
              encryptionIv: log.encryptionIv,
              encryptionSalt: log.encryptionSalt,
              yjsData: log.yjsData,
              version: log.version,
              deviceId: log.deviceId,
              updatedAt: new Date(log.updatedAt),
            },
          });

        // Upsert log items if provided
        if (log.items && log.items.length > 0) {
          // Delete existing items for this log first
          await db.delete(logItems).where(eq(logItems.logId, log.id));

          // Insert new items
          for (const item of log.items) {
            await db.insert(logItems).values({
              logId: log.id,
              foodName: item.foodName,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              source: item.source,
            });
          }
        }
      }
    }

    // Process user targets
    if (body.targets && body.targets.length > 0) {
      for (const target of body.targets) {
        if (target.userId !== userId) continue; // Security check

        // Check if target exists on server
        const existingTargets = await db
          .select()
          .from(userTargets)
          .where(
            and(
              eq(userTargets.userId, userId),
              eq(userTargets.date, target.date)
            )
          )
          .limit(1);

        const serverVersion = existingTargets.length > 0 ? existingTargets[0].version : 0;

        // Conflict detection
        if (serverVersion >= target.version) {
          conflicts.push({
            type: 'target',
            id: `${userId}-${target.date}`,
            localVersion: target.version,
            serverVersion,
          });
          continue;
        }

        // Upsert the target
        await db
          .insert(userTargets)
          .values({
            userId,
            date: target.date,
            calorieTarget: target.calorieTarget,
            proteinTarget: target.proteinTarget,
            carbTarget: target.carbTarget,
            fatTarget: target.fatTarget,
            weightRecord: target.weightRecord,
            yjsData: target.yjsData,
            version: target.version,
            deviceId: target.deviceId,
            updatedAt: new Date(target.updatedAt),
          })
          .onConflictDoUpdate({
            target: [userTargets.userId, userTargets.date],
            set: {
              calorieTarget: target.calorieTarget,
              proteinTarget: target.proteinTarget,
              carbTarget: target.carbTarget,
              fatTarget: target.fatTarget,
              weightRecord: target.weightRecord,
              yjsData: target.yjsData,
              version: target.version,
              deviceId: target.deviceId,
              updatedAt: new Date(target.updatedAt),
            },
          });
      }
    }

    return NextResponse.json({
      success: true,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      synced: (body.logs?.length || 0) + (body.targets?.length || 0),
    });
  } catch (error) {
    console.error('Delta sync push error:', error);
    return NextResponse.json(
      { error: 'Failed to sync changes' },
      { status: 500 }
    );
  }
}
