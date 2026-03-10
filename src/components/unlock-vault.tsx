/**
 * Unlock Vault Component
 *
 * Displays when a user is authenticated (valid session) but the vault is locked
 * (missing encryption key in memory). This happens when:
 * - User opens app in a new tab (sessionStorage is cleared)
 * - User refreshes the page
 *
 * The user must re-enter their password to re-derive the encryption key.
 */

'use client';

import { useState, useEffect } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Lock, KeyRound, Fingerprint } from 'lucide-react';

interface UnlockVaultProps {
  onUnlocked: () => void;
  onError?: (error: string) => void;
}

export function UnlockVault({ onUnlocked, onError }: UnlockVaultProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBioLoading, setIsBioLoading] = useState(false);
  const { unlockVault, unlockWithBiometrics, isBiometricsSupported, hasBiometricKey } = useEncryption();
  const { data: session } = useSession();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Fetch encryption metadata from server
      const res = await fetch('/api/auth/keys');
      if (!res.ok) {
        throw new Error('Failed to fetch encryption keys');
      }
      const keys = await res.json();

      // Unlock vault using password to derive the encryption key
      await unlockVault(
        session?.user?.id as string,
        password,
        keys.salt,
        keys.encryptedVaultKey,
        keys.encryptionIv
      );

      setPassword(''); // Clear password from memory
      onUnlocked();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Incorrect password';
      onError?.(message);
      console.error('Failed to unlock vault:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    if (!session?.user?.id) return;
    setIsBioLoading(true);

    try {
      const success = await unlockWithBiometrics(session.user.id);
      if (success) {
        onUnlocked();
      } else {
        onError?.('Biometric unlock failed. Please use your password.');
      }
    } catch (error) {
      console.error('Biometric unlock error:', error);
      onError?.('Biometric unlock failed.');
    } finally {
      setIsBioLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Unlock Your Vault</CardTitle>
          <CardDescription>
            Your session is active, but your encryption keys are locked.
            Enter your password to decrypt your data.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleUnlock}>
          <CardContent className="space-y-4">
            {isBiometricsSupported && hasBiometricKey && (
              <Button
                type="button"
                variant="outline"
                className="w-full py-8 text-lg flex flex-col items-center gap-2 mb-4"
                onClick={handleBiometricUnlock}
                disabled={isBioLoading || isLoading}
              >
                {isBioLoading ? (
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Fingerprint className="h-8 w-8 text-primary" />
                )}
                <span>Unlock with Biometrics</span>
              </Button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {isBiometricsSupported && hasBiometricKey ? 'Or use password' : 'Enter password'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  autoFocus={!hasBiometricKey}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <Button type="submit" className="w-full" disabled={isLoading || isBioLoading}>
              {isLoading ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Decrypting...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Decrypt Data
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Your password never leaves your device unencrypted.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
