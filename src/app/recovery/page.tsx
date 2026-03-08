/**
 * Vault Recovery Page
 *
 * Allows users to recover their vault using BIP-39 mnemonics
 * if they forgot their password.
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Check, AlertTriangle, ArrowLeft, Key } from 'lucide-react';
import Link from 'next/link';
import { validateMnemonic } from '@/lib/recovery-kit';

interface RecoveryStepProps {
  onSubmit: (userId: string, mnemonics: string, newPassword: string) => void;
  isLoading: boolean;
}

function RecoveryForm({ onSubmit, isLoading }: RecoveryStepProps) {
  const [userId, setUserId] = useState('');
  const [mnemonics, setMnemonics] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // Validate mnemonics format
    const cleanedMnemonics = mnemonics.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!validateMnemonic(cleanedMnemonics)) {
      setError('Invalid mnemonic phrase. Please check your 24 recovery words.');
      return;
    }

    onSubmit(userId.trim(), cleanedMnemonics, newPassword);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="userId">User ID or Email</Label>
        <Input
          id="userId"
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Enter your user ID or email"
          disabled={isLoading}
          required
        />
        <p className="text-xs text-muted-foreground">
          This is the ID or email associated with your account
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mnemonics">Recovery Words (24 words)</Label>
        <Textarea
          id="mnemonics"
          value={mnemonics}
          onChange={(e) => setMnemonics(e.target.value)}
          placeholder="Enter your 24 recovery words separated by spaces"
          className="font-mono text-sm min-h-[120px]"
          disabled={isLoading}
          required
        />
        <p className="text-xs text-muted-foreground">
          Enter all 24 words in order, separated by spaces
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <Input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          disabled={isLoading}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          disabled={isLoading}
          required
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Your data will be decrypted using your recovery key and re-encrypted with your new password.
        </AlertDescription>
      </Alert>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Recovering...' : 'Recover Vault'}
      </Button>
    </form>
  );
}

function SuccessStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="text-center space-y-4 py-4">
      <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
        <Check className="h-8 w-8 text-green-600" />
      </div>
      <h3 className="text-xl font-semibold">Vault Recovered!</h3>
      <p className="text-muted-foreground">
        Your vault has been successfully recovered. You can now log in with your new password.
      </p>
      <Button onClick={onComplete} className="w-full">
        Go to Login
      </Button>
    </div>
  );
}

export default function RecoveryPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [isLoading, setIsLoading] = useState(false);

  const handleRecover = useCallback(async (userId: string, mnemonics: string, newPassword: string) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/recovery-key/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mnemonics, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to recover vault');
      }

      setStep('success');
    } catch (err) {
      console.error('Recovery failed:', err);
      // Error is handled in the form component
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleComplete = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Key className="h-6 w-6" />
            <CardTitle>Vault Recovery</CardTitle>
          </div>
          <CardDescription>
            Recover access to your encrypted data using your recovery words
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'form' ? (
            <RecoveryForm onSubmit={handleRecover} isLoading={isLoading} />
          ) : (
            <SuccessStep onComplete={handleComplete} />
          )}

          <div className="mt-6 pt-6 border-t">
            <Link href="/login">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
