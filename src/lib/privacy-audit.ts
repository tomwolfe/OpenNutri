/**
 * Privacy Audit Utility
 * 
 * Tracks security-sensitive events in the client-side database.
 * Ensures user has a transparent log of all data access and encryption activity.
 */

import { db, type PrivacyAuditLog } from './db-local';

/**
 * Log a privacy-sensitive event
 */
export async function logPrivacyEvent(
  event: string,
  category: PrivacyAuditLog['category'],
  details: string,
  status: PrivacyAuditLog['status'] = 'success'
) {
  try {
    const entry: PrivacyAuditLog = {
      timestamp: Date.now(),
      event,
      category,
      details,
      status,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };

    await db.privacyAudit.add(entry);

    // Alert on suspicious patterns (e.g., many failed decryptions)
    if (status === 'failure' && category === 'decryption') {
      await checkForSuspiciousActivity();
    }
  } catch (err) {
    console.error('Failed to log privacy event:', err);
  }
}

/**
 * Check for suspicious patterns in the audit log
 */
async function checkForSuspiciousActivity() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentFailures = await db.privacyAudit
    .where('timestamp')
    .above(oneHourAgo)
    .and(entry => entry.status === 'failure' && entry.category === 'decryption')
    .count();

  if (recentFailures > 10) {
    // We could dispatch a global event to show a warning to the user
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('PRIVACY_ALERT', {
        detail: { message: 'High number of failed decryption attempts detected.' }
      }));
    }
  }
}

/**
 * Export all privacy audit logs as JSON
 */
export async function exportPrivacyAuditLogs() {
  const allLogs = await db.privacyAudit.orderBy('timestamp').reverse().toArray();
  return JSON.stringify(allLogs, null, 2);
}

/**
 * Clear privacy audit logs older than a certain number of days
 */
export async function cleanupPrivacyAuditLogs(days: number = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  await db.privacyAudit.where('timestamp').below(cutoff).delete();
}
