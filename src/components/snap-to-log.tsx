/**
 * Snap-to-Log Component
 *
 * Food image capture and upload UI with real-time AI streaming.
 * Uses the useSnapToLog hook for all business logic.
 */

'use client';

import React, { useRef } from 'react';
import Image from 'next/image';
import { X, CheckCircle, AlertCircle, Loader2, Edit2, WifiOff, Zap } from 'lucide-react';
import { BarcodeScanner } from './barcode-scanner';
import { CameraOverlay } from './dashboard/camera-overlay';
import { MacroEditor } from './dashboard/macro-editor';
import { VoiceCapture } from './dashboard/voice-capture';
import { DraftItem } from '@/types/food';
import { formatBytes } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { useSnapToLog } from '@/hooks/use-snap-to-log';
import { needsCloudAnalysis } from '@/lib/local-ai';
import { useOfflineQueue } from '@/hooks/use-offline-queue';

interface SnapToLogProps {
  onComplete?: (foodLog: {
    id: string;
    totalCalories: number;
    items: Array<{
      foodName: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }) => void;
  onError?: (error: string) => void;
  onDraftSaved?: () => void;
  onSyncComplete?: (syncedCount: number) => void;
}

export function SnapToLog({ onComplete, onError, onDraftSaved, onSyncComplete }: SnapToLogProps) {
  const {
    mode,
    setMode,
    isListening,
    setIsListening,
    transcript,
    selectedFile,
    previewUrl,
    uploadProgress,
    setUploadProgress,
    uploadError,
    selectedMealType,
    draftItems,
    setDraftItems,
    setSelectedMealType,
    isEditingItems,
    setIsEditingItems,
    saveInProgress,
    imageUrl,
    compressionStats,
    localAiResults,
    modelLoadingProgress,
    deviceInfo,
    isOnline,
    isSyncing,
    autoSaveEnabled,
    setAutoSaveEnabled,
    lastAutoSavedId,
    handleFileSelect,
    handleUpload,
    handleSaveDraft,
    handleClear,
    handleVoiceSubmit,
    startListening,
    enrichItemsWithUsda,
  } = useSnapToLog({ onComplete, onError, onDraftSaved, onSyncComplete });

  const { isAvailable: isIndexedDBAvailable } = useOfflineQueue();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProductFound = (item: DraftItem) => {
    setDraftItems([item]);
    setUploadProgress('review');
    setMode('vision');
  };

  const displayItems = draftItems;

  const renderStatus = () => {
    const statusMap = {
      uploading: { color: 'text-blue-600', text: 'Uploading image...', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
      streaming: { color: 'text-blue-600', text: 'AI is analyzing...', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
      review: { color: 'text-amber-600', text: 'Review your meal', icon: <Edit2 className="w-4 h-4" /> },
      complete: { color: 'text-green-600', text: lastAutoSavedId ? 'Auto-saved!' : 'Meal logged!', icon: <CheckCircle className="w-4 h-4" /> },
    };
    const status = statusMap[uploadProgress as keyof typeof statusMap];
    if (!status) return null;
    return (
      <div className={`flex items-center gap-2 ${status.color}`}>
        {status.icon}
        <span>{status.text}</span>
        {lastAutoSavedId && uploadProgress === 'complete' && (
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            High confidence
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-white rounded-lg shadow-sm border">
      {!isOnline && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">Offline. Images will be queued.</span>
        </div>
      )}

      {isSyncing && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-800">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Syncing queued images...</span>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Snap to Log</h3>
            <p className="text-sm text-gray-500">Fast nutrition analysis via AI, Barcode, or Voice</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Zap className="w-3 h-3" />
              <span>Auto-save</span>
            </div>
          </label>
        </div>

        {modelLoadingProgress && modelLoadingProgress.stage !== 'ready' && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                <span className="text-xs font-medium text-blue-900">Loading Local AI...</span>
              </div>
              <span className="text-[10px] text-blue-700 font-semibold">
                {Math.round(modelLoadingProgress.progress * 100)}%
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${modelLoadingProgress.progress * 100}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-blue-700">
              {modelLoadingProgress.message}
            </p>
            {deviceInfo && (
              <p className="mt-1 text-[9px] text-blue-500">
                Device: {deviceInfo.type === 'webgpu' ? '✅ WebGPU' : deviceInfo.type === 'wasm' ? '📱 WASM' : '⚠️ Limited'}
                {deviceInfo.isMobile && ' (Mobile)'}
              </p>
            )}
          </div>
        )}

        {modelLoadingProgress?.stage === 'ready' && deviceInfo && (
          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-green-600" />
            <span className="text-[10px] text-green-700 font-medium">
              {deviceInfo.type === 'webgpu' ? 'WebGPU Acceleration Active' : 'Optimized for Your Device'}
            </span>
          </div>
        )}
      </div>

      {uploadProgress === 'idle' && mode === 'barcode' ? (
        <BarcodeScanner onProductFound={handleProductFound} onClose={() => setMode('vision')} />
      ) : uploadProgress === 'idle' && mode === 'voice' ? (
        <VoiceCapture
          isListening={isListening}
          transcript={transcript}
          onStartListening={startListening}
          onStopListening={() => setIsListening(false)}
        />
      ) : (
        <div className="space-y-4">
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }} className="hidden" />

          {!previewUrl ? (
            <CameraOverlay
              mode={mode}
              onModeChange={setMode}
              onCameraCapture={() => fileInputRef.current?.click()}
              onUploadClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <Image src={previewUrl} alt="Food preview" fill className="object-contain" sizes="400px" />
                <button type="button" onClick={handleClear} disabled={uploadProgress === 'uploading' || uploadProgress === 'streaming'} className="absolute top-2 right-2 p-2 bg-white/90 rounded-full hover:bg-white disabled:opacity-50">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {compressionStats && uploadProgress !== 'idle' && (
                <div className="text-[10px] text-gray-400 text-right">
                  Optimized: {formatBytes(compressionStats.original)} → {formatBytes(compressionStats.compressed)}
                  ({Math.round((1 - compressionStats.compressed / compressionStats.original) * 100)}% saved)
                </div>
              )}

              {uploadProgress === 'idle' && (
                <div className="space-y-2">
                  {localAiResults && needsCloudAnalysis(localAiResults) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs font-medium text-amber-900 mb-2">
                        🤖 Local AI Confidence: {Math.round((localAiResults[0]?.score || 0) * 100)}%
                      </p>
                      <p className="text-[10px] text-amber-700 mb-3">
                        Local analysis detected low confidence. Would you like to use cloud AI for better accuracy?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleUpload}
                          className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium"
                        >
                          ☁️ Use Cloud AI (More Accurate)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const topResult = localAiResults[0];
                            const localItem: DraftItem = {
                              foodName: topResult.label,
                              calories: topResult.macros?.calories || 0,
                              protein: topResult.macros?.protein || 0,
                              carbs: topResult.macros?.carbs || 0,
                              fat: topResult.macros?.fat || 0,
                              source: 'LOCAL_AI',
                              servingGrams: 100,
                              isEnhancing: isOnline,
                            };
                            setDraftItems([localItem]);
                            setUploadProgress('review');
                            if (isOnline) {
                              enrichItemsWithUsda([localItem]);
                            }
                          }}
                          className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium"
                        >
                          📱 Use Local AI (Free & Private)
                        </button>
                      </div>
                    </div>
                  )}

                  {localAiResults && !needsCloudAnalysis(localAiResults) ? (
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={!isOnline && !isIndexedDBAvailable}
                      className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {isOnline ? 'Analyze with Local AI (Confident)' : 'Queue for Later'}
                    </button>
                  ) : !localAiResults ? (
                    <button
                      type="button"
                      onClick={handleUpload}
                      disabled={!isOnline && !isIndexedDBAvailable}
                      className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isOnline ? 'Analyze Food' : 'Queue for Later'}
                    </button>
                  ) : null}
                </div>
              )}

              {(uploadProgress === 'uploading' || uploadProgress === 'streaming') && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  {renderStatus()}
                  {uploadProgress === 'uploading' && localAiResults && !needsCloudAnalysis(localAiResults) && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full w-fit">
                      <CheckCircle className="w-3 h-3" />
                      Privacy-First: Analyzed on device
                    </div>
                  )}
                </div>
              )}

              {uploadError && (
                <div className="p-3 border bg-red-50 border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">Analysis failed</p>
                    <p className="text-xs text-red-700">{uploadError}</p>
                    <button type="button" onClick={handleClear} className="mt-2 text-xs underline hover:text-red-900">Clear</button>
                  </div>
                </div>
              )}

              {(uploadProgress === 'streaming' || uploadProgress === 'review' || uploadProgress === 'complete') && displayItems.length > 0 && (
                <div className={cn(
                  "transition-all duration-500 ease-in-out",
                  uploadProgress === 'streaming' ? "opacity-60 grayscale-[0.5]" : "opacity-100"
                )}>
                  {uploadProgress === 'review' && draftItems.some(i => i.source === 'LOCAL_AI' || i.source === 'USER_HISTORY') && (
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full w-fit">
                      <CheckCircle className="w-3 h-3" />
                      Privacy-First: Analyzed on device
                    </div>
                  )}
                  <MacroEditor
                    items={displayItems as DraftItem[]}
                    selectedMealType={selectedMealType}
                    isEditing={isEditingItems && uploadProgress !== 'streaming'}
                    saveInProgress={saveInProgress}
                    onUpdateItems={setDraftItems}
                    onUpdateMealType={setSelectedMealType}
                    onToggleEditing={() => setIsEditingItems(!isEditingItems)}
                    onAddItem={() => setDraftItems([...draftItems, { foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, source: 'MANUAL', servingGrams: 100 }])}
                    onRemoveItem={(index) => setDraftItems(draftItems.filter((_, i) => i !== index))}
                    onSave={handleSaveDraft}
                  />
                  {uploadProgress === 'streaming' && (
                    <div className="mt-2 text-[10px] text-blue-500 text-center animate-pulse">
                      AI is typing out discoveries...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t text-[10px] text-gray-400 text-center space-y-1">
        <p>Powered by Local AI (WebGPU) + Cloud Fallback</p>
        <p className="text-gray-300">
          <strong>Privacy-First:</strong> Local AI runs on your device. Cloud AI is optional for better accuracy.
        </p>
      </div>
    </div>
  );
}
