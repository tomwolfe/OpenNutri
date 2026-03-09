/**
 * Shared Vault Recipient View
 * /share/[id]
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { generateSharingKeyPair, unwrapVaultKey } from '@/lib/sharing-protocol';
import { CoachingDashboard } from '@/components/coaching-dashboard';

export default function SharedVaultPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{
    ownerEmail: string;
    ownerId: string;
    encryptedVaultKey: string;
  } | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // 1. Initialize temporary sharing keys
  useEffect(() => {
    async function initKeys() {
      try {
        const { privateKey } = await generateSharingKeyPair();
        
        // Store private key in memory only
        setPrivateKey(privateKey);
        
        // Register this recipient session with the server
        // This is a simplified flow: normally the recipient would provide 
        // their public key to the owner FIRST. 
        // Here we're assuming the link [id] already exists and we just need to 
        // fetch the data that was already re-encrypted for us (or provide our key).
        
        const response = await fetch(`/api/share/${id}`);
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to load share');
        }
        
        const data = await response.json();
        setShareData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Initialization failed');
      } finally {
        setIsInitializing(false);
        setLoading(false);
      }
    }

    initKeys();
  }, [id]);

  // 2. Unwrap the vault key when it arrives
  const handleDecrypt = async () => {
    if (!shareData || !privateKey) return;
    
    setLoading(true);
    try {
      // Decrypt the owner's vault key with our private key
      const key = await unwrapVaultKey(shareData.encryptedVaultKey, privateKey);
      setVaultKey(key);
    } catch (_err) {
      setError('Decryption failed. The sharing session may be invalid.');
    } finally {
      setLoading(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Initializing secure session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-red-100 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a href="/" className="text-blue-600 hover:underline">Return to Home</a>
        </div>
      </div>
    );
  }

  if (!vaultKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Secure Shared View</h1>
          <p className="text-gray-600 mb-8">
            This nutrition data is protected with End-to-End Encryption. 
            Click the button below to decrypt and view the data for {shareData?.ownerEmail}.
          </p>
          <button
            onClick={handleDecrypt}
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
            Decrypt and View Data
          </button>
          <p className="mt-4 text-[10px] text-gray-400 uppercase tracking-widest">
            Zero-Knowledge Sharing • OpenNutri
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Shared Nutrition Dashboard</h1>
            <p className="text-sm text-gray-500">Viewing data shared by {shareData?.ownerEmail}</p>
          </div>
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-xs font-medium border border-green-100">
            <ShieldCheck className="w-3.5 h-3.5" />
            End-to-End Encrypted Session
          </div>
        </div>

        {/* Use the existing Coaching Dashboard component, but pass the shared vault key */}
        {shareData && (
          <CoachingDashboard 
            userId={shareData.ownerId} 
            sharedVaultKey={vaultKey} 
            isSharedView={true}
          />
        )}
      </div>
    </div>
  );
}
