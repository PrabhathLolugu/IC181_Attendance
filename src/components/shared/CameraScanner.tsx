import React, { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';

interface Props {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!videoRef.current) return;
    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        scanner.stop();
        onScan(result.data);
      },
      { highlightScanRegion: true, highlightCodeOutline: true, preferredCamera: 'environment' },
    );
    scanner.start().catch(() => setError('Could not access the camera. Check your browser permissions and try again.'));
    return () => {
      scanner.stop();
      scanner.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 flex-shrink-0">
        <p className="text-white text-sm font-semibold">Scan the attendance QR code</p>
        <button onClick={onClose} aria-label="Close scanner" className="text-white p-2 -mr-2">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      </div>
      {error && <div className="p-4 bg-red-600 text-white text-sm text-center flex-shrink-0">{error}</div>}
    </div>
  );
}
