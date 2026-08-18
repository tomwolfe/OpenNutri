import { describe, test, expect } from 'vitest';
import { splitMnemonic, combineShards, isValidShard } from '../src/lib/sss';

describe('sss.ts', () => {
  test('should split mnemonic into shards', () => {
    const mnemonic = 'apple banana cherry date elderberry fig grape honey icecream juice kiwi lemon';
    const shards = splitMnemonic(mnemonic, 3, 2);
    expect(shards).toHaveLength(3);
  });

  test('should reconstruct mnemonic from 2 shards', () => {
    const mnemonic = 'apple banana cherry date elderberry fig grape honey icecream juice kiwi lemon';
    const shards = splitMnemonic(mnemonic, 3, 2);
    const combined = combineShards(shards.slice(0, 2));
    expect(combined).toBe(mnemonic);
  });

  test('should reject insufficient shards', () => {
    const mnemonic = 'apple banana cherry date elderberry fig grape honey icecream juice kiwi lemon';
    const shards = splitMnemonic(mnemonic, 3, 2);
    expect(() => combineShards(shards.slice(0, 1))).toThrow();
  });

  test('should validate shard format', () => {
    const validShard = splitMnemonic('test mnemonic', 3, 2)[0];
    expect(isValidShard(validShard)).toBe(true);
    
    expect(isValidShard('invalid-shard-format')).toBe(false);
  });
});