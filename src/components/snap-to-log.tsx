/**
 * Snap-to-Log Component
 *
 * Food image capture and upload UI with real-time AI streaming.
 * Uses Vercel AI SDK's useObject hook for native streaming support.
 *
 * Flow:
 * 1. User uploads image to blob storage
 * 2. AI streams analysis back in real-time via useObject
 * 3. User reviews and edits the draft (adjust portions, meal type)
 * 4. User confirms to save as verified food log
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Camera, Upload, X, CheckCircle, AlertCircle, Loader2, Edit2, Save, WifiOff, Cloud } from 'lucide-react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { z } from 'zod';
import { useOfflineQueue } from '@/hooks/use-offline-queue';

// Schema matching the GLM vision response
const FoodAnalysisSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Food item name'),
      calories: z.number().describe('Calories in kcal'),
      protein_g: z.number().describe('Protein in grams'),
      carbs_g: z.number().describe('Carbohydrates in grams'),
      fat_g: z.number().describe('Fat in grams'),
      confidence: z.number().describe('Confidence score 0-1'),
      portion_guess: z.string().describe('Estimated portion size'),
      notes: z
        .string()
        .optional()
        .describe('Brief explanation of estimation (e.g., "Visible oil sheen suggests higher fat")'),
    })
  ),
});

interface DraftItem {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: string;
  servingGrams: number;
  isEnhancing?: boolean; // Track per-item enhancement status
  notes?: string; // AI-generated notes or user notes
}

interface SnapToLogProps {
  /** Callback when AI analysis completes successfully */
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
  /** Callback when upload/analysis fails */
  onError?: (error: string) => void;
  /** Callback when draft is saved to log */
  onDraftSaved?: () => void;
  /** Callback when offline queue sync completes */
  onSyncComplete?: (syncedCount: number) => void;
}

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'unclassified', label: 'Other' },
] as const;

export function SnapToLog({ onComplete, onError, onDraftSaved, onSyncComplete }: SnapToLogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'streaming' | 'review' | 'complete'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>('unclassified');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  
  // Offline state
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const { queueImage, syncQueue, isAvailable: isIndexedDBAvailable } = useOfflineQueue();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync queued images when online
  const handleSyncAndUpload = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    
    setIsSyncing(true);
    try {
      const result = await syncQueue();
      if (result.success > 0) {
        console.log(`Synced ${result.success} image(s) from offline queue`);
        onSyncComplete?.(result.success);
      }
      if (result.failed > 0) {
        console.warn(`Failed to sync ${result.failed} image(s)`);
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, syncQueue, onSyncComplete]);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      if (selectedFile) {
        handleSyncAndUpload();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [selectedFile, handleSyncAndUpload]);

  // Vercel AI SDK useObject hook for native streaming
  const { submit, object } = useObject({
    api: '/api/analyze',
    schema: FoodAnalysisSchema,
    onFinish: async (event) => {
      if (event.object?.items) {
        // Convert AI response to draft format with enhancement tracking
        const convertedItems = event.object.items.map((item) => ({
          foodName: item.name,
          calories: item.calories || 0,
          protein: item.protein_g || 0,
          carbs: item.carbs_g || 0,
          fat: item.fat_g || 0,
          source: 'AI_ESTIMATE',
          servingGrams: 100,
          isEnhancing: true, // Mark as being enhanced
          notes: item.notes, // Capture AI notes
        }));

        setDraftItems(convertedItems);
        setUploadProgress('review');

        // Enhance items individually for smoother UX
        await enhanceItemsIndividually(convertedItems);
      }
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setUploadError(errorMessage);
      setUploadProgress('idle');
      onError?.(errorMessage);
    },
  });

  // Enhance all items in a single batch request for better performance
  const enhanceItemsIndividually = useCallback(async (items: DraftItem[]) => {
    try {
      // Send all items in one batch request instead of sequential calls
      const response = await fetch('/api/food/usda/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.items) {
          // Mark all items as no longer enhancing
          const enhancedItems = data.items.map((item: DraftItem) => ({
            ...item,
            isEnhancing: false,
          }));
          setDraftItems(enhancedItems);
        }
      } else {
        // Mark all items as complete even on error
        setDraftItems(items.map((item) => ({ ...item, isEnhancing: false })));
      }
    } catch {
      // Ignore errors, keep AI estimates
      setDraftItems(items.map((item) => ({ ...item, isEnhancing: false })));
    }
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      onError?.('Please select an image file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      onError?.('File too large. Max size is 10MB');
      return;
    }

    setSelectedFile(file);

    // Create preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, [onError]);

  // Handle file input change
  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Handle camera capture (mobile)
  const handleCameraCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Upload image and start AI analysis
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    // If offline, queue the image for later upload
    if (!isOnline) {
      setUploadProgress('uploading');
      setUploadError(null);
      
      try {
        const queueId = await queueImage(selectedFile, selectedMealType);
        
        if (queueId) {
          setUploadError('You are offline. Image queued for upload when connection is restored.');
          setUploadProgress('idle');
          // Don't clear the preview - let user know it's queued
          return;
        } else {
          throw new Error('Failed to queue image (IndexedDB unavailable)');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to queue image';
        setUploadError(errorMessage);
        setUploadProgress('idle');
        onError?.(errorMessage);
        return;
      }
    }

    // Online flow - proceed with normal upload
    setUploadProgress('uploading');
    setUploadError(null);

    try {
      // Step 1: Upload image to blob storage
      const formData = new FormData();
      formData.append('image', selectedFile);

      const uploadResponse = await fetch('/api/blob/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const { imageUrl: uploadedImageUrl } = await uploadResponse.json();
      setImageUrl(uploadedImageUrl);

      // Step 2: Start AI streaming analysis
      setUploadProgress('streaming');
      submit({
        imageUrl: uploadedImageUrl,
        mealTypeHint: selectedMealType,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(errorMessage);
      setUploadProgress('idle');
      onError?.(errorMessage);
    }
  }, [selectedFile, selectedMealType, isOnline, queueImage, onError, submit]);

  // Save draft as verified food log
  const handleSaveDraft = useCallback(async () => {
    if (draftItems.length === 0) return;

    setSaveInProgress(true);

    try {
      const totalCalories = draftItems.reduce((sum, item) => sum + item.calories, 0);

      const response = await fetch('/api/log/food', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mealType: selectedMealType,
          items: draftItems,
          totalCalories,
          aiConfidenceScore: 0.8,
          imageUrl, // Save the image URL for future reference
          notes: draftItems.map((item) => item.notes).filter(Boolean).join(' ') || null, // Combine AI notes
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save log');
      }

      // Image is now saved with the log - no cleanup needed
      // The weekly cron job will handle orphaned blobs after 24h

      setUploadProgress('complete');
      onDraftSaved?.();
      onComplete?.({
        id: data.logId,
        totalCalories,
        items: draftItems.map((item) => ({
          foodName: item.foodName,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        })),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save';
      onError?.(errorMessage);
    } finally {
      setSaveInProgress(false);
    }
  }, [draftItems, selectedMealType, onComplete, onError, onDraftSaved, imageUrl]);

  // Clear selection and reset
  const handleClear = useCallback(async () => {
    // Note: We no longer delete blobs immediately on cancel
    // The weekly cron job handles orphaned blobs after 24h

    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setDraftItems([]);
    setSelectedMealType('unclassified');
    setIsEditingItems(false);
    setUploadProgress('idle');
    setUploadError(null);
    setImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [previewUrl]);

  // Update item field
  const updateItemField = useCallback((index: number, field: keyof DraftItem, value: number | string) => {
    setDraftItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        if (field === 'calories') {
          // Recalculate macros proportionally when calories change
          const ratio = Number(value) / item.calories;
          return {
            ...item,
            calories: Number(value),
            protein: item.protein * ratio,
            carbs: item.carbs * ratio,
            fat: item.fat * ratio,
          };
        }

        return { ...item, [field]: value };
      })
    );
  }, []);

  // Remove item from draft
  const removeItem = useCallback((index: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Convert failed AI scan to manual log entry
  const handleConvertToManual = useCallback(() => {
    // Clear the failed stream but keep the image preview
    setDraftItems([
      {
        foodName: '',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        source: 'MANUAL',
        servingGrams: 100,
      },
    ]);
    setUploadProgress('review');
    setIsEditingItems(true);
    setUploadError(null);
  }, []);

  // Retry AI analysis without re-uploading the image
  const handleRetryAnalysis = useCallback(() => {
    if (!imageUrl) return;

    setUploadError(null);
    setUploadProgress('streaming');
    setDraftItems([]);

    // Re-run the AI analysis with the existing image URL
    submit({
      imageUrl,
      mealTypeHint: selectedMealType,
    });
  }, [imageUrl, selectedMealType, submit]);

  // Add new item to draft
  const addItem = useCallback(() => {
    setDraftItems((prev) => [
      ...prev,
      {
        foodName: '',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        source: 'MANUAL',
        servingGrams: 100,
      },
    ]);
  }, []);

  // Calculate total from draft items
  const calculatedTotal = draftItems.reduce((sum, item) => sum + item.calories, 0);

  // Get current items for display (from streaming or final)
  const displayItems = object?.items
    ? object.items.map((item) => ({
        foodName: item?.name ?? '',
        calories: item?.calories ?? 0,
        protein: item?.protein_g ?? 0,
        carbs: item?.carbs_g ?? 0,
        fat: item?.fat_g ?? 0,
        source: 'AI_ESTIMATE',
        servingGrams: 100,
        isEnhancing: false,
      }))
    : draftItems;

  // Render status message
  const renderStatus = () => {
    switch (uploadProgress) {
      case 'uploading':
        return (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Uploading image...</span>
          </div>
        );
      case 'streaming':
        return (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI is analyzing your food...</span>
          </div>
        );
      case 'review':
        return (
          <div className="flex items-center gap-2 text-amber-600">
            <Edit2 className="w-4 h-4" />
            <span>Review your meal</span>
          </div>
        );
      case 'complete':
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span>Meal logged successfully!</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-white rounded-lg shadow-sm border">
      {/* Offline indicator banner */}
      {!isOnline && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">You are offline. Images will be uploaded when connection is restored.</span>
        </div>
      )}
      
      {/* Syncing indicator */}
      {isSyncing && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-800">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Syncing queued images...</span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Snap to Log</h3>
        <p className="text-sm text-gray-500">
          Take a photo of your meal for instant nutrition analysis
        </p>
      </div>

      {/* File input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileInputChange}
        className="hidden"
      />

      {/* Preview or upload buttons */}
      {!previewUrl ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCameraCapture}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Camera className="w-5 h-5" />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Upload className="w-5 h-5" />
            Upload
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Image preview */}
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <Image
              src={previewUrl}
              alt="Food preview"
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 400px"
            />
            <button
              type="button"
              onClick={handleClear}
              disabled={uploadProgress !== 'idle' && uploadProgress !== 'review'}
              className="absolute top-2 right-2 p-2 bg-white/90 rounded-full hover:bg-white transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Upload button and meal type selector */}
          {uploadProgress === 'idle' && (
            <div className="space-y-3">
              {/* Meal type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meal Type (optional)
                </label>
                <select
                  value={selectedMealType}
                  onChange={(e) => setSelectedMealType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {MEAL_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleUpload}
                disabled={!isOnline && !isIndexedDBAvailable}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {!isOnline ? (
                  <>
                    <Cloud className="w-5 h-5" />
                    Queue for Later
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    Analyze Food
                  </>
                )}
              </button>
              
              {/* Manual sync button - shown when online and IndexedDB available */}
              {isOnline && isIndexedDBAvailable && (
                <button
                  type="button"
                  onClick={handleSyncAndUpload}
                  disabled={isSyncing}
                  className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      Sync Queued Images
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Status */}
          {(uploadProgress === 'uploading' || uploadProgress === 'streaming') && (
            <div className="p-3 bg-gray-50 rounded-lg">{renderStatus()}</div>
          )}

          {/* Error display */}
          {uploadError && (
            <div className={`p-3 border rounded-lg flex items-start gap-2 ${
              uploadError.includes('offline') || uploadError.includes('queued')
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
            }`}>
              {uploadError.includes('offline') || uploadError.includes('queued') ? (
                <Cloud className="w-4 h-4 text-amber-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  uploadError.includes('offline') || uploadError.includes('queued')
                    ? 'text-amber-900'
                    : 'text-red-900'
                }`}>
                  {uploadError.includes('offline') || uploadError.includes('queued')
                    ? 'Image queued for later upload'
                    : 'Analysis failed'}
                </p>
                <p className={`text-xs ${
                  uploadError.includes('offline') || uploadError.includes('queued')
                    ? 'text-amber-700'
                    : 'text-red-700'
                }`}>{uploadError}</p>
                <div className="flex gap-2 mt-3">
                  {!uploadError.includes('offline') && !uploadError.includes('queued') && (
                    <>
                      <button
                        type="button"
                        onClick={handleConvertToManual}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Convert to Manual Entry
                      </button>
                      {imageUrl && (
                        <button
                          type="button"
                          onClick={handleRetryAnalysis}
                          className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors flex items-center gap-1"
                        >
                          <Loader2 className="w-3 h-3" />
                          Retry Analysis
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs px-3 py-1.5 underline hover:text-red-900"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Review UI - shown when AI analysis is complete */}
          {(uploadProgress === 'review' || uploadProgress === 'complete') &&
            displayItems.length > 0 && (
              <div className="space-y-4">
                {/* Meal type selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meal Type
                  </label>
                  <select
                    value={selectedMealType}
                    onChange={(e) => setSelectedMealType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {MEAL_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Detected items with editing */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900">
                      Food Items ({displayItems.length})
                    </h4>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingItems(!isEditingItems)}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        {isEditingItems ? 'Done' : 'Edit'}
                      </button>
                      {isEditingItems && (
                        <button
                          type="button"
                          onClick={addItem}
                          className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
                        >
                          + Add Item
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {displayItems.map((item, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {item.foodName}
                            </p>
                            {item.isEnhancing && (
                              <span className="text-xs text-blue-600 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Matching USDA...
                              </span>
                            )}
                          </div>
                          {isEditingItems && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {isEditingItems ? (
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-gray-600">Calories</label>
                              <input
                                type="number"
                                value={item.calories}
                                onChange={(e) => updateItemField(index, 'calories', e.target.value)}
                                className="w-full px-2 py-1 text-sm border rounded"
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs text-gray-600">Protein (g)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={item.protein.toFixed(1)}
                                  onChange={(e) =>
                                    updateItemField(index, 'protein', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-600">Carbs (g)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={item.carbs.toFixed(1)}
                                  onChange={(e) =>
                                    updateItemField(index, 'carbs', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-600">Fat (g)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={item.fat.toFixed(1)}
                                  onChange={(e) =>
                                    updateItemField(index, 'fat', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-2 py-1 text-sm border rounded"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">
                            {item.calories} cal • P: {item.protein.toFixed(1)}g • C:{' '}
                            {item.carbs.toFixed(1)}g • F: {item.fat.toFixed(1)}g
                          </p>
                        )}

                        <span className="inline-block mt-2 text-xs px-2 py-1 bg-gray-200 rounded">
                          {item.source.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total and save button */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-blue-900">Total Calories:</span>
                    <span className="text-lg font-bold text-blue-900">
                      {calculatedTotal.toFixed(0)} cal
                    </span>
                  </div>

                  {uploadProgress === 'review' && (
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={saveInProgress}
                      className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {saveInProgress ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          Save to Log
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

          {/* Success state */}
          {uploadProgress === 'complete' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-900">Meal logged successfully!</p>
              <button
                type="button"
                onClick={handleClear}
                className="mt-3 text-sm text-green-700 underline hover:text-green-900"
              >
                Log another meal
              </button>
            </div>
          )}
        </div>
      )}

      {/* Daily limit info */}
      <div className="mt-4 pt-4 border-t text-xs text-gray-500">
        <p>Free tier: 5 AI scans per day</p>
      </div>
    </div>
  );
}
