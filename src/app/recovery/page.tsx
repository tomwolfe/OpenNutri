/**
 * Vault Recovery Page (Updated for Social Recovery)
 *
 * Allows users to recover their vault using:
 * 1. Traditional 24-word BIP-39 mnemonic
 * 2. 2-of-3 Social Recovery Shards (Manual + Local/Cloud)
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Shield, Check, AlertTriangle, ArrowLeft, Key, Smartphone, Cloud, FileText } from 'lucide-react';
import Link from 'next/link';
import { validateMnemonic } from '@/lib/recovery-kit';
import { isValidShard } from '@/lib/sss';

export default function RecoveryPage() {
  const router = useRouter();
  const [method, setMethod] = useState<'mnemonic' | 'shards' | null>(null);
  const [step, setStep] = useState<'method' | 'form' | 'success'>('method');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [userId, setUserId] = useState('');
  const [mnemonics, setMnemonics] = useState('');
  const [manualShard, setManualShard] = useState('');
  const [localShard, setLocalShard] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Auto-detect local shard on mount
  useEffect(() => {
    const shard = localStorage.getItem('opennutri_local_shard');
    if (shard && isValidShard(shard)) {
      setLocalShard(shard);
    }
  }, []);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const payload: {
        userId: string;
        newPassword: string;
        mnemonics?: string;
        shards?: string[];
      } = {
        userId: userId.trim(),
        newPassword,
      };

      if (method === 'mnemonic') {
        const cleaned = mnemonics.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!validateMnemonic(cleaned)) {
          throw new Error('Invalid 24-word recovery phrase');
        }
        payload.mnemonics = cleaned;
      } else {
        const shards = [manualShard.trim()];
        if (localShard) shards.push(localShard);
        
        if (shards.length < 2) {
          throw new Error('Need at least 2 shards to recover. Ensure you are on the same device where you set up recovery.');
        }
        payload.shards = shards;
      }

      const response = await fetch('/api/auth/recovery-key/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Recovery failed');

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center py-8">
          <CardContent className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold">Vault Recovered!</h3>
            <p className="text-muted-foreground">
              Your data has been re-encrypted with your new password.
            </p>
            <Button onClick={() => router.push('/login')} className="w-full mt-4">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Key className="h-6 w-6 text-blue-600" />
            <CardTitle>Vault Recovery</CardTitle>
          </div>
          <CardDescription>
            Recover your encrypted logs if you forgot your password
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === 'method' ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground mb-4">Choose your recovery method:</p>
              
              <button
                onClick={() => { setMethod('shards'); setStep('form'); }}
                className="w-full p-4 border rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded-md text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="font-semibold">Social Recovery (Shards)</div>
                </div>
                <p className="text-xs text-muted-foreground ml-10">
                  Recommended. Uses this device + your manual shard. 
                  {localShard ? (
                    <span className="text-green-600 block mt-1 font-medium flex items-center gap-1">
                      <Check className="h-3 w-3" /> Device shard detected!
                    </span>
                  ) : (
                    <span className="text-amber-600 block mt-1">Device shard not found on this browser.</span>
                  )}
                </p>
              </button>

              <button
                onClick={() => { setMethod('mnemonic'); setStep('form'); }}
                className="w-full p-4 border rounded-lg hover:border-gray-500 hover:bg-gray-50 transition-all text-left group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-gray-100 rounded-md text-gray-600 group-hover:bg-gray-600 group-hover:text-white transition-colors">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="font-semibold">24-Word Recovery Phrase</div>
                </div>
                <p className="text-xs text-muted-foreground ml-10">
                  The traditional backup method. Type in your 24 words manually.
                </p>
              </button>
            </div>
          ) : (
            <form onSubmit={handleRecover} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="userId">Email Address</Label>
                <Input
                  id="userId"
                  type="email"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="name@example.com"
                  required
                />
              </div>

              {method === 'mnemonic' ? (
                <div className="space-y-2">
                  <Label htmlFor="mnemonics">24 Recovery Words</Label>
                  <Textarea
                    id="mnemonics"
                    value={mnemonics}
                    onChange={(e) => setMnemonics(e.target.value)}
                    placeholder="Enter words separated by spaces"
                    className="font-mono text-sm min-h-[100px]"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-muted rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-3 w-3" />
                        <span>Shard 1: This Device</span>
                      </div>
                      {localShard ? <span className="text-green-600 font-bold">READY</span> : <span className="text-red-500 font-bold">MISSING</span>}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-3 w-3" />
                        <span>Shard 2: Cloud Backup</span>
                      </div>
                      <span className="text-blue-600 font-bold">AUTOMATIC</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manualShard">Shard 3: Your Manual Shard</Label>
                    <Input
                      id="manualShard"
                      value={manualShard}
                      onChange={(e) => setManualShard(e.target.value)}
                      placeholder="Paste your manual shard hex here"
                      required
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Paste the hex string from your downloaded shard file or printed copy.
                    </p>
                  </div>
                </div>
              )}

              <hr className="my-4" />

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Processing Recovery...' : 'Recover My Vault'}
              </Button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t">
            <div className="flex justify-between items-center">
              <Link href="/login" className="text-sm text-blue-600 hover:underline flex items-center">
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to Login
              </Link>
              {step !== 'method' && (
                <button onClick={() => setStep('method')} className="text-sm text-gray-500 hover:underline">
                  Change Method
                </button>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-gray-50 rounded-b-lg border-t py-3 flex items-center justify-center gap-2">
          <Shield className="h-3 w-3 text-gray-400" />
          <span className="text-[10px] text-gray-400 font-medium">Zero-Knowledge Recovery Pipeline</span>
        </CardFooter>
      </Card>
    </div>
  );
}
