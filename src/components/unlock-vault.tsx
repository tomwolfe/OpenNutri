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

import { useState } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
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
import { Lock, KeyRound } from 'lucide-react';

interface UnlockVaultProps {
  onUnlocked: () => void;
  onError?: (error: string) => void;
}

export function UnlockVault({ onUnlocked, onError }: UnlockVaultProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { unlockVault } = useEncryption();

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
                  autoFocus
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <Button type="submit" className="w-full" disabled={isLoading}>
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
