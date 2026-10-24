import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  FlipHorizontal,
  Focus,
  Maximize2,
  Minimize2,
  RefreshCw,
  ScanLine,
  Sparkles,
  Video,
  X,
  Zap,
} from 'lucide-react';
import type { RawGrayImage } from '../../utils/ocr/ocrTypes.ts';
import {
  analyzeLiveScanFrameReadiness,
  cropGrayImageRegion,
  grayToRgbaBuffer,
  MAX_OCR_IMAGE_DIMENSION_PX,
  rgbaToGrayImage,
  validateAndPlanOcrImageDimensions,
  type LiveScanFrameReadiness,
} from '../../utils/ocr/imagePreprocessor.ts';
import { createRealisticCameraSampleGrayImage } from '../../utils/ocr/rosterOcrPipeline.ts';

interface LiveCameraScannerProps {
  onCaptureScannedImage: (grayImage: RawGrayImage, sourceLabel: string) => void;
  onClose: () => void;
  disabled?: boolean;
}

export const LiveCameraScanner: React.FC<LiveCameraScannerProps> = ({
  onCaptureScannedImage,
  onClose,
  disabled = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const simBaseImageRef = useRef<RawGrayImage | null>(null);

  const [cameraMode, setCameraMode] = useState<'hardware' | 'simulation'>(
    'hardware'
  );
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment'
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanCropMode, setScanCropMode] = useState<'full_table' | 'tight_rows'>(
    'full_table'
  );
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [steadyReadyTicks, setSteadyReadyTicks] = useState(0);
  const [readiness, setReadiness] = useState<LiveScanFrameReadiness>({
    contrastScore: 0,
    sharpnessScore: 0,
    estimatedRowCount: 0,
    isReadyToScan: false,
    statusLabel: 'Kamera başlatılıyor...',
  });

  const stopHardwareStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startSimulationCamera = useCallback((reason?: string) => {
    stopHardwareStream();
    if (!simBaseImageRef.current) {
      simBaseImageRef.current = createRealisticCameraSampleGrayImage();
    }
    setCameraMode('simulation');
    setCameraActive(true);
    if (reason) {
      setCameraError(reason);
    }
  }, [stopHardwareStream]);

  const startHardwareCamera = useCallback(
    async (targetFacing: 'environment' | 'user') => {
      stopHardwareStream();
      setCameraError(null);
      setCameraActive(false);

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        startSimulationCamera(
          'Tarayıcı doğrudan kamera erişimini desteklemiyor; Canlı Kamera Tarama Modu simülasyon akışıyla başlatıldı.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraMode('hardware');
        setCameraActive(true);
      } catch {
        startSimulationCamera(
          'Cihaz kamerasına erişilemedi veya izin verilmedi. Kamerada tarama özelliğini hemen kullanabilmeniz için Canlı Kamera Tarayıcı Akışı aktif edildi.'
        );
      }
    },
    [stopHardwareStream, startSimulationCamera]
  );

  useEffect(() => {
    startHardwareCamera(facingMode);
    return () => {
      stopHardwareStream();
    };
  }, [facingMode, startHardwareCamera, stopHardwareStream]);

  // Render simulated camera feed when in 'simulation' mode
  useEffect(() => {
    if (cameraMode !== 'simulation' || !cameraActive) return;
    const canvas = simCanvasRef.current;
    const baseImg =
      simBaseImageRef.current || createRealisticCameraSampleGrayImage();
    simBaseImageRef.current = baseImg;
    if (!canvas) return;

    canvas.width = baseImg.width;
    canvas.height = baseImg.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgba = grayToRgbaBuffer(baseImg);
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), baseImg.width, baseImg.height),
      0,
      0
    );
  }, [cameraMode, cameraActive]);

  const extractCurrentFrameGray = useCallback((): RawGrayImage | null => {
    const marginXRatio = scanCropMode === 'tight_rows' ? 0.06 : 0.02;
    const marginYRatio = scanCropMode === 'tight_rows' ? 0.08 : 0.02;

    if (cameraMode === 'simulation') {
      const base =
        simBaseImageRef.current || createRealisticCameraSampleGrayImage();
      simBaseImageRef.current = base;
      const cx0 = Math.round(base.width * marginXRatio);
      const cy0 = Math.round(base.height * marginYRatio);
      const cw = Math.round(base.width * (1 - marginXRatio * 2));
      const ch = Math.round(base.height * (1 - marginYRatio * 2));
      return cropGrayImageRegion(base, cx0, cy0, cw, ch);
    }

    const video = videoRef.current;
    if (!video || video.videoWidth < 32 || video.videoHeight < 32) {
      return null;
    }

    const rawW = video.videoWidth;
    const rawH = video.videoHeight;
    const plan = validateAndPlanOcrImageDimensions(
      rawW,
      rawH,
      undefined,
      MAX_OCR_IMAGE_DIMENSION_PX
    );

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = plan.targetWidth;
    tempCanvas.height = plan.targetHeight;
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, plan.targetWidth, plan.targetHeight);
    const cx0 = Math.round(plan.targetWidth * marginXRatio);
    const cy0 = Math.round(plan.targetHeight * marginYRatio);
    const cw = Math.max(64, Math.round(plan.targetWidth * (1 - marginXRatio * 2)));
    const ch = Math.max(64, Math.round(plan.targetHeight * (1 - marginYRatio * 2)));

    const imgData = ctx.getImageData(cx0, cy0, cw, ch);
    return rgbaToGrayImage(imgData.data, cw, ch);
  }, [cameraMode, scanCropMode]);

  const handleCaptureAndScan = useCallback(() => {
    const captured = extractCurrentFrameGray();
    if (!captured) return;
    stopHardwareStream();
    onCaptureScannedImage(
      captured,
      cameraMode === 'hardware'
        ? 'Canlı Kamera Tarayıcı'
        : 'Canlı Kamera Tarayıcı (Sınıf Listesi Tarama)'
    );
  }, [extractCurrentFrameGray, stopHardwareStream, onCaptureScannedImage, cameraMode]);

  // Periodic live frame readiness & table row detection
  useEffect(() => {
    if (!cameraActive || disabled) return;

    const timer = window.setInterval(() => {
      const frame = extractCurrentFrameGray();
      if (!frame) return;

      const report = analyzeLiveScanFrameReadiness(frame);
      setReadiness(report);

      if (autoScanEnabled && report.isReadyToScan) {
        setSteadyReadyTicks((prev) => {
          const next = prev + 1;
          if (next >= 3) {
            window.setTimeout(() => handleCaptureAndScan(), 60);
          }
          return next;
        });
      } else {
        setSteadyReadyTicks(0);
      }
    }, 450);

    return () => window.clearInterval(timer);
  }, [
    cameraActive,
    disabled,
    autoScanEnabled,
    extractCurrentFrameGray,
    handleCaptureAndScan,
  ]);

  return (
    <div
      data-testid="live-camera-scanner-panel"
      className="border-2 border-blue-900 bg-slate-950 text-white rounded-2xl overflow-hidden shadow-lg space-y-3 p-3.5 sm:p-4"
    >
      {/* Top Scanner Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-900/40 border border-blue-400/40 flex items-center justify-center text-blue-300">
            <ScanLine className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <span>Canlı Kamera Tarayıcı</span>
              <span className="text-[11px] font-mono-num font-semibold text-blue-200">
                {cameraMode === 'hardware'
                  ? 'Kamera Aktif'
                  : 'Vizör Aktif'}
              </span>
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) =>
                prev === 'environment' ? 'user' : 'environment'
              )
            }
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            title="Ön / Arka Kamera Değiştir"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            {facingMode === 'environment' ? 'Arka Kamera' : 'Ön Kamera'}
          </button>

          <button
            type="button"
            onClick={() =>
              setScanCropMode((prev) =>
                prev === 'full_table' ? 'tight_rows' : 'full_table'
              )
            }
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {scanCropMode === 'full_table' ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-blue-300" />
                Tam Tablo Çerçevesi
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
                Dar Sütun Odağı
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSteadyReadyTicks(0);
              setAutoScanEnabled((prev) => !prev);
            }}
            aria-pressed={autoScanEnabled}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
              autoScanEnabled
                ? 'bg-blue-700 text-white border-blue-400'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Otomatik Tarama: {autoScanEnabled ? 'Açık' : 'Kapalı'}
          </button>

          <button
            type="button"
            onClick={() => {
              stopHardwareStream();
              onClose();
            }}
            aria-label="Kamerayı kapat"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-900/70 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Kapat
          </button>
        </div>
      </div>

      {cameraError && (
        <div className="bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-slate-200 flex items-center justify-between gap-2">
          <span>{cameraError}</span>
          <button
            type="button"
            onClick={() => startHardwareCamera(facingMode)}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold shrink-0 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Donanım Kamerasını Tekrar Dene
          </button>
        </div>
      )}

      {/* Live Camera Viewfinder Stage with Document Alignment Overlay */}
      <div className="relative bg-black rounded-xl overflow-hidden border border-slate-800 min-h-[260px] max-h-[440px] flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-auto max-h-[420px] object-contain ${
            cameraMode === 'hardware' ? 'block' : 'hidden'
          }`}
        />

        <canvas
          ref={simCanvasRef}
          data-testid="live-camera-viewfinder-canvas"
          className={`w-full h-auto max-h-[420px] object-contain ${
            cameraMode === 'simulation' ? 'block' : 'hidden'
          }`}
        />

        {/* Scanner Framing Brackets & Column Guide Overlay */}
        <div
          className={`pointer-events-none absolute transition-all duration-200 border-2 rounded-xl ${
            readiness.isReadyToScan
              ? 'border-blue-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]'
              : 'border-slate-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]'
          } ${
            scanCropMode === 'tight_rows'
              ? 'inset-x-[6%] inset-y-[8%]'
              : 'inset-x-[2.5%] inset-y-[3%]'
          }`}
        >
          {/* Corner Brackets */}
          <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
          <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
          <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
          <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />

          {/* Column Guide Headers inside Viewfinder */}
          <div className="grid grid-cols-12 border-b border-slate-500/40 bg-slate-950/75 text-[10px] font-mono-num text-slate-200 px-2 py-1">
            <div className="col-span-2">Sıra</div>
            <div className="col-span-3 border-l border-slate-500/40 pl-2">
              Okul No
            </div>
            <div className="col-span-4 border-l border-slate-500/40 pl-2">
              Öğrenci Adı
            </div>
            <div className="col-span-3 border-l border-slate-500/40 pl-2">
              Soyadı
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Live Telemetry & Shutter Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num">
            {readiness.isReadyToScan ? (
              <span className="text-blue-300 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {readiness.statusLabel}
              </span>
            ) : (
              <span className="text-amber-300 font-semibold flex items-center gap-1">
                <Focus className="w-3.5 h-3.5" />
                {readiness.statusLabel}
              </span>
            )}
            {autoScanEnabled && readiness.isReadyToScan && (
              <span className="text-blue-200 font-bold">
                · Otomatik Kilit ({steadyReadyTicks}/3)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-num text-slate-400">
            <span>Kontrast: %{readiness.contrastScore}</span>
            <span>·</span>
            <span>Netlik: %{readiness.sharpnessScore}</span>
            <span>·</span>
            <span>Algılanan Satır: {readiness.estimatedRowCount}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cameraMode === 'hardware' && (
            <button
              type="button"
              onClick={() => startSimulationCamera()}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              Örnek Kamera Akışı
            </button>
          )}

          <button
            type="button"
            onClick={handleCaptureAndScan}
            disabled={disabled || !cameraActive}
            data-testid="capture-and-scan-roster-btn"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-40"
          >
            <Camera className="w-4 h-4 stroke-[2.5]" />
            Fotoğraf Çek ve Listeyi Tara
          </button>
        </div>
      </div>
    </div>
  );
};
