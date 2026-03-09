/**
 * AI Device Status Component
 * 
 * Displays WebGPU capability, model loading progress, and device optimization info.
 * Task 1.4: User-facing device capability feedback
 * Task 1.5: Model loading progress indicator
 */

'use client';

import { useState, useEffect } from 'react';
import { Zap, Cpu, Download, CheckCircle, AlertCircle, Loader2, Smartphone, Monitor } from 'lucide-react';
import { getDeviceInfo, getModelState, type DeviceInfo, type ProgressUpdate } from '@/lib/local-ai';
import { cn } from '@/lib/utils';

interface AIStatusIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export function AIStatusIndicator({ className, showDetails = false }: AIStatusIndicatorProps) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [modelState, setModelState] = useState<{
    classifierState: string;
    embedderState: string;
    deviceInfo: DeviceInfo;
  } | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;
    let progressUnsubscribe: (() => void) | undefined;

    async function init() {
      try {
        // Get initial device info
        const info = await getDeviceInfo();
        if (mounted && info) {
          setDeviceInfo(info);
        }

        // Get model state
        const state = await getModelState();
        if (mounted && state) {
          setModelState(state);
        }

        setIsInitialized(true);

        // Subscribe to progress updates after initialization
        const localAi = await import('@/lib/local-ai');
        
        localAi.onProgress((update) => {
          if (mounted) {
            setProgress(update);
          }
        });
      } catch (err) {
        console.warn('Failed to initialize AI status:', err);
        setIsInitialized(true); // Still mark as initialized to avoid infinite loading
      }
    }

    init();

    return () => {
      mounted = false;
      progressUnsubscribe?.();
    };
  }, []);

  if (!isInitialized) {
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Detecting AI capabilities...</span>
      </div>
    );
  }

  const getStatusIcon = () => {
    if (!deviceInfo) {
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }

    switch (deviceInfo.type) {
      case 'webgpu':
        return <Zap className="w-4 h-4 text-green-500" />;
      case 'webgpu-limited':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'wasm':
        return <Cpu className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusText = () => {
    if (!deviceInfo) return 'AI capabilities unknown';

    if (progress?.stage === 'downloading' || progress?.stage === 'loading-fallback') {
      return `${progress.message} (${Math.round(progress.progress * 100)}%)`;
    }

    switch (deviceInfo.type) {
      case 'webgpu':
        return `WebGPU enabled${deviceInfo.isMobile ? ' (Mobile)' : ''}`;
      case 'webgpu-limited':
        return 'WebGPU limited';
      case 'wasm':
        return 'CPU mode (WASM)';
      case 'none':
        return 'AI unavailable';
      default:
        return 'Unknown';
    }
  };

  const getDeviceTypeIcon = () => {
    if (!deviceInfo) return null;
    return deviceInfo.isMobile ? (
      <Smartphone className="w-3 h-3 text-muted-foreground" />
    ) : (
      <Monitor className="w-3 h-3 text-muted-foreground" />
    );
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2 text-sm">
        {getStatusIcon()}
        <span className={cn(
          'font-medium',
          deviceInfo?.type === 'webgpu' ? 'text-green-600 dark:text-green-400' :
          deviceInfo?.type === 'wasm' ? 'text-blue-600 dark:text-blue-400' :
          'text-muted-foreground'
        )}>
          {getStatusText()}
        </span>
        {getDeviceTypeIcon()}
      </div>

      {showDetails && deviceInfo && (
        <div className="text-xs text-muted-foreground space-y-1 ml-6">
          {deviceInfo.name && (
            <div>GPU: {deviceInfo.name}</div>
          )}
          {deviceInfo.limits && (
            <div>
              Max Buffer: {formatBytes(deviceInfo.limits.maxBufferSize)}
            </div>
          )}
          {progress && (
            <div className="flex items-center gap-2">
              <Download className="w-3 h-3" />
              <span>{progress.message}</span>
            </div>
          )}
          {modelState && (
            <div className="flex gap-4">
              <span>Classifier: {modelState.classifierState}</span>
              <span>Embedder: {modelState.embedderState}</span>
            </div>
          )}
        </div>
      )}

      {progress && (
        <div className="w-full bg-muted rounded-full h-1.5 ml-6">
          <div
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              progress.stage === 'error' ? 'bg-red-500' :
              progress.stage === 'ready' ? 'bg-green-500' :
              'bg-blue-500'
            )}
            style={{ width: `${progress.progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * AI Model Preloader Button
 * 
 * Allows users to manually preload AI models for faster first use.
 */
export function PreloadAIButton({ className }: { className?: string }) {
  const [isPreloading, setIsPreloading] = useState(false);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);

  const handlePreload = async () => {
    setIsPreloading(true);
    try {
      const { preloadModels } = await import('@/lib/local-ai');
      
      await preloadModels();
      setIsPreloaded(true);
    } catch (err) {
      console.error('AI preload failed:', err);
    } finally {
      setIsPreloading(false);
    }
  };

  if (isPreloaded) {
    return (
      <button
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
          className
        )}
        disabled
      >
        <CheckCircle className="w-4 h-4" />
        <span>AI Models Ready</span>
      </button>
    );
  }

  return (
    <button
      onClick={handlePreload}
      disabled={isPreloading}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm',
        'bg-blue-100 text-blue-700 hover:bg-blue-200',
        'dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {isPreloading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading AI...</span>
        </>
      ) : (
        <>
          <Zap className="w-4 h-4" />
          <span>Preload AI Models</span>
        </>
      )}
    </button>
  );
}

/**
 * AI Performance Tips Component
 * 
 * Shows optimization tips based on device capabilities.
 */
export function AIPerformanceTips({ className }: { className?: string }) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    getDeviceInfo().then(setDeviceInfo);
  }, []);

  if (!deviceInfo) return null;

  const tips = [];

  if (deviceInfo.type === 'none') {
    tips.push({
      title: 'WebGPU Not Available',
      description: 'AI features will run slower using CPU. Consider using a modern browser like Chrome 113+ or Edge.',
      severity: 'warning'
    });
  } else if (deviceInfo.type === 'webgpu-limited') {
    tips.push({
      title: 'Limited WebGPU Support',
      description: 'Some AI features may be limited. Try updating your GPU drivers.',
      severity: 'info'
    });
  }

  if (deviceInfo.isMobile) {
    tips.push({
      title: 'Mobile Optimization',
      description: 'For best performance on mobile, use in landscape mode and ensure good lighting for food photos.',
      severity: 'info'
    });
  }

  if (tips.length === 0) {
    tips.push({
      title: 'Optimal Performance',
      description: 'Your device is configured for optimal AI performance!',
      severity: 'success'
    });
  }

  return (
    <div className={cn('space-y-2', className)}>
      {tips.map((tip, i) => (
        <div
          key={i}
          className={cn(
            'p-3 rounded-lg text-sm',
            tip.severity === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
            tip.severity === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
            'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
          )}
        >
          <div className="font-medium">{tip.title}</div>
          <div className="text-muted-foreground">{tip.description}</div>
        </div>
      ))}
    </div>
  );
}
