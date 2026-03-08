'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Check, Loader2, AlertTriangle, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getProductByBarcode, mapOFFToLogItem, OFFProduct } from '@/lib/openfoodfacts';
import { BrowserMultiFormatReader } from '@zxing/library';

interface BarcodeScannerProps {
  onProductFound: (item: ReturnType<typeof mapOFFToLogItem>) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onProductFound, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [useZxing, setUseZxing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [foundProduct, setFoundProduct] = useState<OFFProduct | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  // Check for BarcodeDetector support and initialize ZXing as fallback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('BarcodeDetector' in window) {
        setIsSupported(true);
        setUseZxing(false);
      } else {
        setIsSupported(true); // We support it via ZXing
        setUseZxing(true);
        zxingReaderRef.current = new BrowserMultiFormatReader();
      }
    }
  }, []);

  // Initialize Camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Failed to access camera. Please check permissions.');
    }
  }, []);

  useEffect(() => {
    if (isSupported) {
      startCamera();
    }
    
    const currentVideoRef = videoRef.current;
    return () => {
      if (currentVideoRef && currentVideoRef.srcObject) {
        const stream = currentVideoRef.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      if (zxingReaderRef.current) {
        zxingReaderRef.current.reset();
      }
    };
  }, [isSupported, startCamera]);

  // Native BarcodeDetector Logic
  useEffect(() => {
    if (!isSupported || useZxing || !isScanning || foundProduct || isFetching) return;

    let animationFrameId: number;
    // @ts-expect-error - BarcodeDetector is new
    const barcodeDetector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']
    });

    const detect = async () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code !== lastScannedCode) {
              setLastScannedCode(code);
              handleBarcodeFound(code);
            }
          }
        } catch (err) {
          console.error('Native detection error:', err);
        }
      }
      animationFrameId = requestAnimationFrame(detect);
    };

    detect();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSupported, useZxing, isScanning, foundProduct, isFetching, lastScannedCode]);

  // ZXing Fallback Logic
  useEffect(() => {
    if (!isSupported || !useZxing || !isScanning || foundProduct || isFetching || !zxingReaderRef.current) return;

    let isComponentMounted = true;
    
    const decode = async () => {
      if (!videoRef.current || !isComponentMounted || !isScanning || foundProduct) return;

      try {
        // In this version of @zxing/library, decodeFromVideoElement might take only the element
        // and return a Promise for a single result. We poll manually for continuous scanning.
        const result = await zxingReaderRef.current?.decodeFromVideoElement(videoRef.current);
        
        if (result && isComponentMounted) {
          const code = result.getText();
          if (code !== lastScannedCode) {
            setLastScannedCode(code);
            handleBarcodeFound(code);
          }
        }
      } catch (_err) {
        // ZXing throws when no barcode is found in the current frame
      }

      // Schedule next decode attempt if still scanning
      if (isComponentMounted && isScanning && !foundProduct) {
        setTimeout(decode, 250); // Poll every 250ms
      }
    };

    decode();
    return () => {
      isComponentMounted = false;
      zxingReaderRef.current?.reset();
    };
  }, [isSupported, useZxing, isScanning, foundProduct, isFetching, lastScannedCode]);

  const handleBarcodeFound = async (code: string) => {
    setIsFetching(true);
    setIsScanning(false);
    
    try {
      const product = await getProductByBarcode(code);
      if (product) {
        setFoundProduct(product);
      } else {
        setError(`No product found for barcode: ${code}`);
        setTimeout(() => {
          setError(null);
          setIsScanning(true);
          setLastScannedCode(null);
        }, 3000);
      }
    } catch {
      setError('Failed to fetch product data.');
    } finally {
      setIsFetching(false);
    }
  };

  const handleConfirm = () => {
    if (foundProduct) {
      const item = mapOFFToLogItem(foundProduct);
      onProductFound(item);
    }
  };

  const handleRetry = () => {
    setFoundProduct(null);
    setError(null);
    setIsScanning(true);
    setLastScannedCode(null);
  };

  return (
    <div className="relative flex flex-col items-center bg-black rounded-lg overflow-hidden min-h-[400px]">
      <div className="relative w-full aspect-video bg-gray-900 overflow-hidden">
        {isSupported && !foundProduct && (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted
            className="w-full h-full object-cover"
          />
        )}
        
        {isScanning && !foundProduct && !error && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="w-64 h-48 border-2 border-white/50 rounded-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-blue-500/10" />
              <ScanLine className="absolute w-full text-blue-400 animate-scan" />
            </div>
            <p className="text-white text-xs mt-4 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
              {useZxing ? 'Scanning with ZXing (Fallback)...' : 'Align barcode within frame'}
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
            <p className="text-white font-medium">{error}</p>
            {!isSupported && (
              <Button variant="outline" className="mt-4 text-white border-white" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        )}

        {isFetching && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <Loader2 className="h-10 w-10 text-white animate-spin mb-2" />
            <p className="text-white">Fetching product data...</p>
          </div>
        )}

        {foundProduct && (
          <div className="absolute inset-0 bg-white p-4 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-black">Product Found</h3>
              <Button variant="ghost" size="icon" onClick={handleRetry} className="text-gray-500">
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex gap-4 mb-6">
              {foundProduct.image_url && (
                <div className="relative h-24 w-24 rounded-md border overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foundProduct.image_url} alt={foundProduct.product_name} className="object-cover w-full h-full" />
                </div>
              )}
              <div>
                <p className="font-bold text-black">{foundProduct.product_name}</p>
                <p className="text-sm text-gray-500">{foundProduct.brands}</p>
                <p className="text-xs text-gray-400 mt-1">Barcode: {foundProduct.code}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="text-xs text-orange-600 font-semibold uppercase">Calories</p>
                <p className="text-xl font-bold text-orange-700">
                  {Math.round(foundProduct.nutriments['energy-kcal_100g'] || 0)} <span className="text-sm font-normal">kcal</span>
                </p>
                <p className="text-[10px] text-orange-500">per 100g</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 font-semibold uppercase">Protein</p>
                <p className="text-xl font-bold text-blue-700">
                  {foundProduct.nutriments.proteins_100g?.toFixed(1) || 0} <span className="text-sm font-normal">g</span>
                </p>
                <p className="text-[10px] text-blue-500">per 100g</p>
              </div>
            </div>

            <div className="mt-auto flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleRetry}>
                Scan Again
              </Button>
              <Button className="flex-1" onClick={handleConfirm}>
                <Check className="mr-2 h-4 w-4" />
                Add to Log
              </Button>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes scan {
          0% { top: 0; }
          100% { top: 100%; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}</style>
    </div>
  );
}
