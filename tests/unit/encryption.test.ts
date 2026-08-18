import { describe, test, expect } from 'vitest';
import { generateSalt, generateIV, deriveKey, encrypt, decrypt, generateVaultKey, getVaultKey, isCryptoAvailable, encryptFoodLog, decryptFoodLog, wrapKey, unwrapKey, arrayBufferToBase64, base64ToArrayBuffer } from '../src/lib/encryption';

describe('encryption.ts', () => {
  test('should check crypto availability', () => {
    expect(isCryptoAvailable()).toBe(true);
  });

  test('should generate salt', () => {
    const salt = generateSalt();
    expect(salt).toHaveLength(16);
    expect(salt.every(b => typeof b === 'number')).toBe(true);
  });

  test('should generate IV', () => {
    const iv = generateIV();
    expect(iv).toHaveLength(12);
  });

  test('should derive key from password and salt', async () => {
    const key = await deriveKey('password123', generateSalt());
    expect(key).toBeInstanceOf(CryptoKey);
  });

  test('should encrypt and decrypt round-trip', async () => {
    const key = await deriveKey('password123', generateSalt());
    const plaintext = { calories: 350, protein: 30, carbs: 40, fat: 15 };
    const encrypted = await encrypt(plaintext, key);
    
    const decrypted = await decrypt<typeof plaintext>(encrypted.ciphertext, encrypted.iv, key);
    expect(decrypted.calories).toBe(350);
    expect(decrypted.protein).toBe(30);
  });

  test('should throw on wrong key', async () => {
    const key1 = await deriveKey('password123', generateSalt());
    const key2 = await deriveKey('different-password', generateSalt());
    
    const plaintext = { calories: 350 };
    const encrypted = await encrypt(plaintext, key1);
    
    await expect(decrypt(encrypted.ciphertext, encrypted.iv, key2)).rejects.toThrow('Failed to decrypt data. Wrong password?');
  });

  test('should encrypt and decrypt food log', async () => {
    const key = await deriveKey('password123', generateSalt());
    const log = {
      foodName: 'Grilled Chicken Salad',
      totalCalories: 350,
      mealType: 'lunch',
      timestamp: Date.now(),
    };
    
    const { encryptedData, iv } = await encryptFoodLog(log, key);
    const decrypted = await decryptFoodLog(encryptedData, iv, key);
    
    expect(decrypted.foodName).toBe('Grilled Chicken Salad');
    expect(decrypted.totalCalories).toBe(350);
  });

  test('should wrap and unwrap key', async () => {
    const key1 = await generateVaultKey('test@test.com', 'password123');
    const key2 = await getVaultKey('password123', key1.salt, key1.encryptedKey, key1.iv);
    
    const wrapResult = await wrapKey(key2, key1);
    const unwrapped = await unwrapKey(wrapResult.ciphertext, wrapResult.iv, key2);
    
    expect(unwrapped).toBeInstanceOf(CryptoKey);
  });

  test('should convert array buffer to base64 and back', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const b64 = arrayBufferToBase64(original.buffer);
    const recovered = base64ToArrayBuffer(b64);
    expect(new Uint8Array(recovered)).toEqual(original);
  });
});