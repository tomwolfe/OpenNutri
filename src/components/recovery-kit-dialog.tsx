/**
 * Recovery Kit Dialog Component (Updated for Social Recovery)
 *
 * Allows users to generate sharded recovery shards using Shamir's Secret Sharing.
 * Implements a 2-of-3 recovery scheme:
 * 1. Local Device Shard (Automatic)
 * 2. Cloud Server Shard (Automatic)
 * 3. Manual User Shard (Action Required)
 */

'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, Download, Copy, Check, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface RecoveryKitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateComplete?: () => void;
}

interface PasswordStepProps {
  onSubmit: (password: string) => void;
  isLoading: boolean;
}

interface ShardDisplayProps {
  shards: {
    local: string;
    cloud: string;
    manual: string;
  };
  onConfirm: () => void;
}

interface SuccessProps {
  onComplete: () => void;
}

function PasswordStep({ onSubmit, isLoading }: PasswordStepProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Enter your password to secure your recovery key</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={isLoading}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Your password is used to encrypt your vault key before sharding.
        </AlertDescription>
      </Alert>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Generating Shards...' : 'Enable Social Recovery'}
      </Button>
    </form>
  );
}

function ShardDisplay({ shards, onConfirm }: ShardDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showShard, setShowShard] = useState(false);

  const manualShard = shards.manual;

  const handleCopy = () => {
    navigator.clipboard.writeText(manualShard);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = `OpenNutri Social Recovery Shard\n==============================\n\nGenerated: ${new Date().toISOString()}\n\nThis is 1 of 3 shards. You need 2 shards to recover your vault.\n\nSHARD 1 (Local): Stored on this device.\nSHARD 2 (Cloud): Stored encrypted on OpenNutri servers.\nSHARD 3 (Manual): THIS SHARD. Store it securely!\n\nManual Shard Data:\n${manualShard}\n\nAnyone with this shard AND access to your device OR the cloud can recover your data.`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opennutri-shard-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Alert className="bg-blue-50 border-blue-200">
        <Shield className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          <strong>Social Recovery Active:</strong> We&apos;ve split your recovery key into 3 shards. 
          You only need to save <strong>ONE</strong> shard manually. The others are managed for you.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-3 gap-2 py-2">
        <div className="flex flex-col items-center p-2 rounded-lg bg-green-50 border border-green-100 text-center">
          <Check className="h-5 w-5 text-green-600 mb-1" />
          <span className="text-[10px] font-bold text-green-800">1. DEVICE</span>
          <span className="text-[8px] text-green-600 italic">Saved Automatically</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-lg bg-green-50 border border-green-100 text-center">
          <Check className="h-5 w-5 text-green-600 mb-1" />
          <span className="text-[10px] font-bold text-green-800">2. CLOUD</span>
          <span className="text-[8px] text-green-600 italic">Saved Automatically</span>
        </div>
        <div className="flex flex-col items-center p-2 rounded-lg bg-amber-50 border border-amber-200 text-center animate-pulse">
          <AlertTriangle className="h-5 w-5 text-amber-600 mb-1" />
          <span className="text-[10px] font-bold text-amber-800">3. MANUAL</span>
          <span className="text-[8px] text-amber-600 italic">ACTION REQUIRED</span>
        </div>
      </div>

      <div className="relative">
        <div className="bg-muted p-4 rounded-lg font-mono text-[10px] break-all leading-tight min-h-[80px] flex items-center justify-center">
          {showShard ? (
            <div className="p-2 border bg-white rounded w-full">
              {manualShard}
            </div>
          ) : (
            <div className="flex flex-col items-center text-muted-foreground">
              <EyeOff className="h-6 w-6 mb-2" />
              <span>Click to reveal your shard</span>
            </div>
          )}
        </div>

        <div className="absolute top-2 right-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShard(!showShard)}
          >
            {showShard ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!showShard}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleCopy}>
          <Copy className="h-4 w-4 mr-2" />
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      <div className="flex items-start space-x-2 pt-2">
        <Checkbox
          id="confirm-backup"
          checked={confirmed}
          onCheckedChange={(checked: boolean) => setConfirmed(checked)}
        />
        <label
          htmlFor="confirm-backup"
          className="text-xs font-medium leading-tight text-muted-foreground"
        >
          I have saved Shard 3 manually. I understand that I need 2 out of 3 shards to recover my account if I lose my password.
        </label>
      </div>

      <Button
        className="w-full"
        onClick={onConfirm}
        disabled={!confirmed}
      >
        Finish Setup
      </Button>
    </div>
  );
}

function SuccessStep({ onComplete }: SuccessProps) {
  return (
    <div className="text-center space-y-4">
      <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
        <Check className="h-6 w-6 text-green-600" />
      </div>
      <h3 className="text-lg font-semibold">Social Recovery Ready!</h3>
      <p className="text-sm text-muted-foreground px-4">
        Your recovery key is now split. If you forget your password, simply use this device + your manual shard to get back in.
      </p>
      <Button onClick={onComplete} className="w-full">
        Done
      </Button>
    </div>
  );
}

export function RecoveryKitDialog({ open, onOpenChange, onGenerateComplete }: RecoveryKitDialogProps) {
  const [step, setStep] = useState<'password' | 'shards' | 'success'>('password');
  const [isLoading, setIsLoading] = useState(false);
  const [shards, setShards] = useState<{ local: string; cloud: string; manual: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async (password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/recovery-key/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate recovery key');
      }

      // Store local shard automatically in localStorage for this browser/device
      localStorage.setItem('opennutri_local_shard', data.shards.local);

      setShards(data.shards);
      setStep('shards');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recovery key');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setStep('success');
  }, []);

  const handleComplete = useCallback(() => {
    setStep('password');
    setShards(null);
    setError(null);
    onOpenChange(false);
    onGenerateComplete?.();
  }, [onOpenChange, onGenerateComplete]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setStep('password');
      setShards(null);
      setError(null);
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Social Recovery Setup
          </DialogTitle>
          <DialogDescription>
            Securely split your recovery key so you never lose access.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'password' && (
          <PasswordStep onSubmit={handleGenerate} isLoading={isLoading} />
        )}

        {step === 'shards' && shards && (
          <ShardDisplay
            shards={shards}
            onConfirm={handleConfirm}
          />
        )}

        {step === 'success' && (
          <SuccessStep onComplete={handleComplete} />
        )}

        <DialogFooter className="sm:justify-start">
          {step === 'shards' && (
            <Button
              variant="ghost"
              onClick={() => setStep('password')}
              disabled={isLoading}
            >
              Back
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
