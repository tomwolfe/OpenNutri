/**
 * Shamir's Secret Sharing (SSS) for OpenNutri
 * 
 * Allows splitting the recovery mnemonic into shards (shares).
 * A subset of shards (threshold) can reconstruct the original secret.
 * 
 * Example: 2-of-3 scheme
 * - Shard 1: Stored on user's device (Local)
 * - Shard 2: Stored on OpenNutri server (Cloud - Encrypted)
 * - Shard 3: Given to user (Email/PDF)
 * Any 2 shards can recover the vault.
 */

/**
 * Split a mnemonic phrase into shards
 * @param mnemonic - The 24-word mnemonic phrase
 * @param totalShards - Total number of shards to create (default: 3)
 * @param threshold - Number of shards required to reconstruct (default: 2)
 * @returns Array of hex-encoded shards
 */
export function splitMnemonic(
  mnemonic: string, 
  totalShards: number = 3, 
  threshold: number = 2
): string[] {
  const secrets = require('secrets.js-grempe');
  // Convert mnemonic to hex for SSS
  const hexSecret = Buffer.from(mnemonic).toString('hex');
  
  // Split the secret
  const shares = secrets.share(hexSecret, totalShards, threshold);
  
  return shares;
}

/**
 * Reconstruct a mnemonic phrase from shards
 * @param shards - Array of hex-encoded shards
 * @returns The original mnemonic phrase
 */
export function combineShards(shards: string[]): string {
  const secrets = require('secrets.js-grempe');
  const hexSecret = secrets.combine(shards);
  return Buffer.from(hexSecret, 'hex').toString();
}

/**
 * Validates a shard format
 * @param shard - Hex-encoded shard
 * @returns boolean
 */
export function isValidShard(shard: string): boolean {
  try {
    const secrets = require('secrets.js-grempe');
    const extract = secrets.extractShareComponents(shard);
    return !!(extract && extract.id && extract.data);
  } catch {
    return false;
  }
}

export interface RecoveryShardInfo {
  id: string;
  type: 'local' | 'cloud' | 'manual';
  data: string;
  createdAt: number;
}
