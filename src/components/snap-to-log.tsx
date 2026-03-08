/**
 * Snap-to-Log Component
 *
 * Food image capture and upload UI with real-time AI processing status.
 * Uses camera or file upload, then polls for AI analysis results.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useJobStatus } from '@/hooks/useJobStatus';
import { Camera, Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

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
}

export function SnapToLog({ onComplete, onError }: SnapToLogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'analyzing' | 'complete'>('idle');
  const [jobId, setJobId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll job status when we have a job ID
  const { data: jobStatus, error: pollError } = useJobStatus(jobId, {
    onComplete: (data) => {
      if (data.foodLog && onComplete) {
        onComplete({
          id: data.foodLog.id,
          totalCalories: data.foodLog.totalCalories,
          items: data.foodLog.items.map((item) => ({
            foodName: item.foodName,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
          })),
        });
      }
      setUploadProgress('complete');
    },
    onError: (errorMessage) => {
      onError?.(errorMessage);
      setUploadProgress('idle');
    },
  });

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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      onError?.(errorMessage);
      setUploadProgress('idle');
    }
  }, [selectedFile, onError]);

  // Clear selection and reset
  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setJobId(null);
    setUploadProgress('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

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
      case 'complete':
        return (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span>Analysis complete!</span>
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

          {/* Upload button */}
          {uploadProgress === 'idle' && (
            <button
              type="button"
              onClick={handleUpload}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Analyze Food
            </button>
          )}

          {/* Status */}
          {uploadProgress !== 'idle' && (
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
              <div>
                <p className="text-sm font-medium text-red-900">Analysis failed</p>
                <p className="text-xs text-red-700">{pollError}</p>
              </div>
            </div>
          )}

          {/* Results preview */}
          {jobStatus?.status === 'completed' && jobStatus.foodLog && (
            <div className="space-y-3">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-900">
                  Total: {jobStatus.foodLog.totalCalories} calories
                </p>
                <p className="text-xs text-green-700">
                  {jobStatus.foodLog.items.length} items detected
                </p>
              </div>

              {/* Food items list */}
              <div className="space-y-2">
                {jobStatus.foodLog.items.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 rounded-lg flex justify-between items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {item.foodName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {item.calories} cal • P: {item.protein}g • C: {item.carbs}g • F: {item.fat}g
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-gray-200 rounded">
                      {item.source.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
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
