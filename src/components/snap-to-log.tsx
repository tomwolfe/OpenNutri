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

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Camera, Upload, X, CheckCircle, AlertCircle, Loader2, Edit2, Save } from 'lucide-react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { z } from 'zod';

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
}

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
  { value: 'unclassified', label: 'Other' },
] as const;

export function SnapToLog({ onComplete, onError, onDraftSaved }: SnapToLogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'streaming' | 'review' | 'complete'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>('unclassified');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isEnhancingUsda, setIsEnhancingUsda] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Vercel AI SDK useObject hook for native streaming
  const { submit, object } = useObject({
    api: '/api/analyze',
    schema: FoodAnalysisSchema,
    onFinish: async (event) => {
      if (event.object?.items) {
        // Convert AI response to draft format
        const convertedItems = event.object.items.map((item) => ({
          foodName: item.name,
          calories: item.calories || 0,
          protein: item.protein_g || 0,
          carbs: item.carbs_g || 0,
          fat: item.fat_g || 0,
          source: 'AI_ESTIMATE',
          servingGrams: 100,
        }));

        setDraftItems(convertedItems);
        setUploadProgress('review');

        // Trigger batch USDA enhancement
        await enhanceItemsWithUSDA(convertedItems);
      }
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setUploadError(errorMessage);
      setUploadProgress('idle');
      onError?.(errorMessage);
    },
  });

  // Client-side USDA enhancement (batch request)
  const enhanceItemsWithUSDA = useCallback(async (items: DraftItem[]) => {
    setIsEnhancingUsda(true);

    try {
      const response = await fetch('/api/food/usda/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const data = await response.json();
        setDraftItems(data.items);
      }
    } catch {
      // Ignore errors, keep AI estimates
    } finally {
      setIsEnhancingUsda(false);
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
  }, [selectedFile, selectedMealType, onError, submit]);

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
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save log');
      }

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
  }, [draftItems, selectedMealType, onComplete, onError, onDraftSaved]);

  // Clear selection and reset
  const handleClear = useCallback(async () => {
    // Cleanup blob image if it exists and wasn't saved
    if (imageUrl && uploadProgress !== 'complete') {
      try {
        await fetch('/api/blob/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageUrl }),
        });
      } catch (err) {
        console.error('Failed to delete blob image:', err);
      }
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setDraftItems([]);
    setSelectedMealType('unclassified');
    setIsEditingItems(false);
    setUploadProgress('idle');
    setUploadError(null);
    setImageUrl(null);
    setIsEnhancingUsda(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [imageUrl, uploadProgress]);

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
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Analyze Food
              </button>
            </div>
          )}

          {/* Status */}
          {(uploadProgress === 'uploading' || uploadProgress === 'streaming') && (
            <div className="p-3 bg-gray-50 rounded-lg">{renderStatus()}</div>
          )}

          {/* Error display */}
          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Analysis failed</p>
                <p className="text-xs text-red-700">{uploadError}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleConvertToManual}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Convert to Manual Entry
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs px-3 py-1.5 text-red-700 underline hover:text-red-900"
                  >
                    Try Again
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
                      {isEnhancingUsda && (
                        <span className="text-xs text-blue-600 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Enhancing...
                        </span>
                      )}
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
                          <p className="text-sm font-medium text-gray-900">
                            {item.foodName}
                          </p>
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
