'use client';

import { Mic } from 'lucide-react';
import { useCallback, useState } from 'react';

interface VoiceCaptureProps {
  isListening: boolean;
  transcript: string;
  onStartListening: () => void;
  onStopListening: () => void;
}

export function VoiceCapture({
  isListening,
  transcript,
  onStartListening,
  onStopListening,
}: VoiceCaptureProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
      <div 
        className={`p-6 rounded-full transition-all cursor-pointer ${isListening ? 'bg-red-100 animate-pulse' : 'bg-blue-100'}`}
        onClick={isListening ? onStopListening : onStartListening}
      >
        <Mic className={`h-12 w-12 ${isListening ? 'text-red-600' : 'text-blue-600'}`} />
      </div>
      <div className="text-center">
        <h4 className="font-bold">{isListening ? 'Listening...' : 'Tap to speak'}</h4>
        <p className="text-sm text-gray-500 max-w-[200px]">
          {isListening 
            ? 'Tell me what you ate' 
            : 'Use your voice to log meals instantly'}
        </p>
      </div>
      {transcript && (
        <div className="mt-2 p-3 bg-white rounded border italic text-sm text-gray-600">
          &quot;{transcript}&quot;
        </div>
      )}
    </div>
  );
}
