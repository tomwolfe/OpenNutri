'use client';

import { Camera, Upload, Mic, Barcode } from 'lucide-react';

interface CameraOverlayProps {
  mode: 'vision' | 'barcode' | 'voice';
  onModeChange: (mode: 'vision' | 'barcode' | 'voice') => void;
  onCameraCapture: () => void;
  onUploadClick: () => void;
}

export function CameraOverlay({
  mode,
  onModeChange,
  onCameraCapture,
  onUploadClick,
}: CameraOverlayProps) {
  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
        <button
          onClick={() => onModeChange('vision')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
            mode === 'vision' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Camera className="h-4 w-4" />
          Vision
        </button>
        <button
          onClick={() => onModeChange('barcode')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
            mode === 'barcode' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Barcode className="h-4 w-4" />
          Barcode
        </button>
        <button
          onClick={() => onModeChange('voice')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
            mode === 'voice' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mic className="h-4 w-4" />
          Voice
        </button>
      </div>

      {mode === 'vision' && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCameraCapture}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Camera className="w-5 h-5" />
            Take Photo
          </button>
          <button
            type="button"
            onClick={onUploadClick}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Upload className="w-5 h-5" />
            Upload
          </button>
        </div>
      )}
    </div>
  );
}
