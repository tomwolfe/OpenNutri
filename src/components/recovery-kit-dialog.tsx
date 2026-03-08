/**
 * Recovery Kit Dialog Component
 *
 * Allows users to generate and view their BIP-39 recovery mnemonics.
 * Includes security warnings and copy/download functionality.
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
import { formatMnemonicsForDisplay, getNumberedMnemonics } from '@/lib/recovery-kit';

interface RecoveryKitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerateComplete?: () => void;
}

interface PasswordStepProps {
  onSubmit: (password: string) => void;
  isLoading: boolean;
}

interface MnemonicsDisplayProps {
  mnemonics: string;
  onConfirm: () => void;
  onCopy: () => void;
  onDownload: () => void;
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
        <Label htmlFor="password">Enter your password to generate recovery key</Label>
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
          Your password is used to encrypt the recovery key. It is never sent to the server.
        </AlertDescription>
      </Alert>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Generating...' : 'Generate Recovery Key'}
      </Button>
    </form>
  );
}

function MnemonicsDisplay({ mnemonics, onConfirm, onCopy, onDownload }: MnemonicsDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showMnemonics, setShowMnemonics] = useState(false);

  const numberedMnemonics = getNumberedMnemonics(mnemonics);
  const formattedMnemonics = formatMnemonicsForDisplay(mnemonics, 6);

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonics);
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = `OpenNutri Recovery Key\n========================\n\nGenerated: ${new Date().toISOString()}\n\nIMPORTANT: Store this in a secure location. Anyone with these words can access your data.\n\n${formattedMnemonics}\n\nDO NOT share these words with anyone.`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opennutri-recovery-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    onDownload();
  };

  return (
    <div className="space-y-4">
      <Alert className="bg-amber-50 border-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <strong>Critical Security Warning:</strong> These 24 words are the ONLY way to recover your data if you forget your password.
          Store them securely offline (write them down or save in a password manager).
        </AlertDescription>
      </Alert>

      <div className="relative">
        <div className="bg-muted p-4 rounded-lg font-mono text-sm leading-relaxed">
          {showMnemonics ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {numberedMnemonics.map(({ index, word }) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-6">{index}.</span>
                  <span className="font-semibold">{word}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              <EyeOff className="h-8 w-8 mr-2" />
              <span>Click "Show" to reveal recovery words</span>
            </div>
          )}
        </div>

        <div className="absolute top-2 right-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMnemonics(!showMnemonics)}
          >
            {showMnemonics ? <EyeOff className="h-4 w-2" /> : <Eye className="h-4 w-2" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!showMnemonics}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          I have securely backed up these 24 words. I understand they will NOT be shown again.
        </label>
      </div>

      <Button
        className="w-full"
        onClick={onConfirm}
        disabled={!confirmed}
      >
        I&apos;ve Saved My Recovery Key
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
      <h3 className="text-lg font-semibold">Recovery Key Generated!</h3>
      <p className="text-muted-foreground">
        Your recovery key has been securely generated and stored.
        Remember to keep your mnemonics in a safe place.
      </p>
      <Button onClick={onComplete} className="w-full">
        Done
      </Button>
    </div>
  );
}

export function RecoveryKitDialog({ open, onOpenChange, onGenerateComplete }: RecoveryKitDialogProps) {
  const [step, setStep] = useState<'password' | 'mnemonics' | 'success'>('password');
  const [isLoading, setIsLoading] = useState(false);
  const [mnemonics, setMnemonics] = useState('');
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

      setMnemonics(data.mnemonics);
      setStep('mnemonics');
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
    setMnemonics('');
    setError(null);
    onOpenChange(false);
    onGenerateComplete?.();
  }, [onOpenChange, onGenerateComplete]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setStep('password');
      setMnemonics('');
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
            Recovery Kit
          </DialogTitle>
          <DialogDescription>
            Generate a backup recovery key to restore access if you forget your password.
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

        {step === 'mnemonics' && mnemonics && (
          <MnemonicsDisplay
            mnemonics={mnemonics}
            onConfirm={handleConfirm}
            onCopy={() => {}}
            onDownload={() => {}}
          />
        )}

        {step === 'success' && (
          <SuccessStep onComplete={handleComplete} />
        )}

        <DialogFooter className="sm:justify-start">
          {step === 'mnemonics' && (
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
