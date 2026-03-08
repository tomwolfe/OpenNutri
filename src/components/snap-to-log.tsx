/**
 * Snap-to-Log Component
 *
 * Food image capture and upload UI with real-time AI processing status.
 * Uses camera or file upload, then polls for AI analysis results.
 * 
 * Flow:
 * 1. User uploads image
 * 2. AI processes and returns draft analysis
 * 3. User reviews and edits the draft (adjust portions, meal type)
 * 4. User confirms to save as verified food log
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useJobStatus } from '@/hooks/useJobStatus';
import { Camera, Upload, X, CheckCircle, AlertCircle, Loader2, Edit2, Save } from 'lucide-react';

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
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'analyzing' | 'review' | 'complete'>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>('unclassified');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll job status when we have a job ID
  const { data: jobStatus, error: pollError } = useJobStatus(jobId, {
    onComplete: (data) => {
      if (data.foodLog && data.status === 'completed') {
        // AI analysis complete - show review UI
        setDraftItems(data.foodLog.items.map(item => ({
          ...item,
          servingGrams: 100, // Default serving size
        })));
        setUploadProgress('review');
      }
    },
    onError: (errorMessage) => {
      onError?.(errorMessage);
      setUploadProgress('idle');
    },
  });

  // Suppress unused variable warning - jobStatus is used in render
  void jobStatus;

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

  // Upload image and start AI job
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploadProgress('uploading');

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('mealType', selectedMealType);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setJobId(data.jobId);
      setUploadProgress('analyzing');

      // Trigger immediate processing from the client
      fetch(`/api/cron/process-ai-jobs?jobId=${data.jobId}`, {
        method: 'POST',
      }).catch((err) => {
        console.error('Immediate processing trigger failed:', err);
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      onError?.(errorMessage);
      setUploadProgress('idle');
    }
  }, [selectedFile, selectedMealType, onError]);

  // Save draft as verified food log
  const handleSaveDraft = useCallback(async () => {
    if (!jobId || draftItems.length === 0) return;

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
          jobId,
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
        items: draftItems.map(item => ({
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
  }, [jobId, draftItems, selectedMealType, onComplete, onError, onDraftSaved]);

  // Clear selection and reset
  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setJobId(null);
    setDraftItems([]);
    setSelectedMealType('unclassified');
    setIsEditingItems(false);
    setUploadProgress('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Update item field
  const updateItemField = useCallback((index: number, field: keyof DraftItem, value: number | string) => {
    setDraftItems(prev => prev.map((item, i) => {
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
    }));
  }, []);

  // Remove item from draft
  const removeItem = useCallback((index: number) => {
    setDraftItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Convert failed AI scan to manual log entry
  const handleConvertToManual = useCallback(() => {
    // Clear the failed job but keep the image preview
    setJobId(null);
    setDraftItems([{
      foodName: '',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      source: 'MANUAL',
      servingGrams: 100,
    }]);
    setUploadProgress('review');
    setIsEditingItems(true);
  }, []);

  // Add new item to draft
  const addItem = useCallback(() => {
    setDraftItems(prev => [...prev, {
      foodName: '',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      source: 'MANUAL',
      servingGrams: 100,
    }]);
  }, []);

  // Calculate total from draft items
  const calculatedTotal = draftItems.reduce((sum, item) => sum + item.calories, 0);

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
      case 'analyzing':
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
        <h3 className="text-lg font-semibold text-gray-900">
          Snap to Log
        </h3>
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
              disabled={uploadProgress !== 'idle'}
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
          {uploadProgress !== 'idle' && uploadProgress !== 'review' && uploadProgress !== 'complete' && (
            <div className="p-3 bg-gray-50 rounded-lg">
              {renderStatus()}
              {jobId && (
                <p className="text-xs text-gray-500 mt-2">
                  Job ID: {jobId.slice(0, 8)}...
                </p>
              )}
            </div>
          )}

          {/* Error display */}
          {pollError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Analysis failed</p>
                <p className="text-xs text-red-700">{pollError}</p>
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
          {uploadProgress === 'review' && draftItems.length > 0 && (
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
                    Food Items ({draftItems.length})
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
                  {draftItems.map((item, index) => (
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
                                onChange={(e) => updateItemField(index, 'protein', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border rounded"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Carbs (g)</label>
                              <input
                                type="number"
                                step="0.1"
                                value={item.carbs.toFixed(1)}
                                onChange={(e) => updateItemField(index, 'carbs', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border rounded"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Fat (g)</label>
                              <input
                                type="number"
                                step="0.1"
                                value={item.fat.toFixed(1)}
                                onChange={(e) => updateItemField(index, 'fat', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border rounded"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">
                          {item.calories} cal • P: {item.protein.toFixed(1)}g • C: {item.carbs.toFixed(1)}g • F: {item.fat.toFixed(1)}g
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
                  <span className="text-lg font-bold text-blue-900">{calculatedTotal.toFixed(0)} cal</span>
                </div>
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
