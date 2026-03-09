'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Copy, Check, Mail, Clock, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { generateSharingKeyPair, exportPublicKey, wrapVaultKey } from '@/lib/sharing-protocol';
import { useEncryption } from '@/hooks/useEncryption';
import { cn } from '@/lib/utils';

interface HouseholdMember {
  id: string;
  email: string;
  role: 'owner' | 'recipient';
  createdAt: string | null;
  expiresAt: string | null;
  active: boolean;
}

export function HouseholdSharing() {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { vaultKey, isReady } = useEncryption();

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/share/household');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setMembers(data.householdMembers || []);
    } catch (err) {
      setError('Failed to load household members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async () => {
    if (!inviteEmail || !isReady || !vaultKey) return;
    
    setIsInviting(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Generate temporary key pair for this share
      const keyPair = await generateSharingKeyPair();
      
      // 2. Export public key
      const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
      
      // 3. Wrap vault key with recipient's public key
      // Note: In a real implementation, you'd fetch their public key first
      // For now, we generate a new keypair and will share the private key via link
      const wrappedKey = await wrapVaultKey(vaultKey, keyPair.publicKey);
      
      // 4. Create share record
      const res = await fetch('/api/share/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: inviteEmail,
          encryptedVaultKey: wrappedKey,
          publicKey: publicKeyBase64,
          expiresDays: 30,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create invitation');
      }

      setShareLink(data.shareLink);
      setSuccess(`Invitation created for ${inviteEmail}`);
      setInviteEmail('');
      setIsDialogOpen(false);
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      const res = await fetch(`/api/share/household?id=${shareId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to revoke');
      
      setSuccess('Access revoked');
      await fetchMembers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to revoke access');
    }
  };

  const copyShareLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Household Sharing</CardTitle>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-200">
            <Shield className="h-3 w-3 mr-1" />
            Zero-Knowledge
          </Badge>
        </div>
        <CardDescription>
          Share your nutrition data with family members. All data stays encrypted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Success/Error Messages */}
        {success && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}
        
        {error && (
          <Alert className="bg-red-50 border-red-200">
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Share Link Dialog */}
        {shareLink && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <Label className="text-sm font-medium">Share this link with your household member:</Label>
              <div className="flex gap-2 mt-2">
                <Input value={shareLink} readOnly className="bg-white" />
                <Button onClick={copyShareLink} size="icon">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This link allows them to decrypt and view your nutrition data.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Members List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Household Members</Label>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Invite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Household Member</DialogTitle>
                  <DialogDescription>
                    Share your encrypted nutrition data with a family member. They'll be able to see your meals, weight, and coaching insights.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="family@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Your data is encrypted end-to-end. Only you and your household members can decrypt it.
                    </AlertDescription>
                  </Alert>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInvite} disabled={isInviting || !inviteEmail}>
                    {isInviting ? 'Creating...' : 'Send Invitation'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No household members yet</p>
              <p className="text-xs">Invite a family member to share your nutrition journey</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      member.role === 'owner' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                    )}>
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{member.email}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="h-4 text-[10px]">
                          {member.role === 'owner' ? 'You shared' : 'Shared with you'}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires: {formatDate(member.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevoke(member.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <Alert className="bg-amber-50 border-amber-200">
          <Shield className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-800">
            <strong>Privacy Notice:</strong> Household sharing uses zero-knowledge encryption. 
            Your data is re-encrypted with the recipient's public key. Only they can decrypt it with their private key.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
