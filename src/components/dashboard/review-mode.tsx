'use client';

import { Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { MacroEditor } from '@/components/dashboard/macro-editor';
import { DraftItem } from '@/types/food';
import { formatBytes } from '@/lib/image-utils';

interface ReviewModeProps {
  items: DraftItem[];
  previewUrl: string | null;
  compressionStats: { original: number; compressed: number } | null;
  uploadProgress: 'idle' | 'uploading' | 'streaming' | 'review' | 'complete';
  isStreaming: boolean;
  isSaving: boolean;
  selectedMealType: string;
  onUpdateItems: (items: DraftItem[]) => void;
  onUpdateMealType: (mealType: string) => void;
  onSave: () => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
}

export function ReviewMode({
  items,
  previewUrl,
  compressionStats,
  uploadProgress,
  isStreaming,
  isSaving,
  selectedMealType,
  onUpdateItems,
  onUpdateMealType,
  onSave,
  onAddItem,
  onRemoveItem
}: ReviewModeProps) {
  if (items.length === 0 && uploadProgress === 'idle') return null;

  return (
    <Card className="overflow-hidden border-blue-100 shadow-md">
      <CardContent className="p-4 space-y-4">
        {/* Vision Preview */}
        {previewUrl && (
          <div className="space-y-2">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 border">
              <Image src={previewUrl} alt="Meal" fill className="object-cover" />
              {(isStreaming || uploadProgress === 'uploading') && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center backdrop-blur-sm">
                  <div className="bg-white/90 px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-xs font-medium">
                      {uploadProgress === 'uploading' ? 'Optimizing...' : 'AI Analysis...'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {compressionStats && (
              <div className="text-[10px] text-gray-400 text-right px-1">
                Privacy-filtered & optimized: {formatBytes(compressionStats.original)} → {formatBytes(compressionStats.compressed)}
              </div>
            )}
          </div>
        )}

        {/* Macro Editor */}
        <MacroEditor
          items={items}
          selectedMealType={selectedMealType}
          isEditing={uploadProgress !== 'complete'}
          saveInProgress={isSaving}
          onUpdateItems={onUpdateItems}
          onUpdateMealType={onUpdateMealType}
          onToggleEditing={() => {}}
          onAddItem={onAddItem}
          onRemoveItem={onRemoveItem}
          onSave={onSave}
        />

        {uploadProgress === 'complete' && (
          <div className="flex items-center justify-center gap-2 text-green-600 py-2 font-medium animate-in fade-in zoom-in">
            <CheckCircle className="w-5 h-5" /> Meal Logged!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
