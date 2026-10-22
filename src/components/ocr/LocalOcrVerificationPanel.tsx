import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Columns,
  Eye,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  RotateCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import type { Student } from '../../types.ts';
import { LiveCameraScanner } from './LiveCameraScanner.tsx';
import type {
  ColumnRole,
  GeometricTableAnalysisResult,
  OcrEngineOutput,
  RawGrayImage,
  VerifiedOcrRosterRow,
} from '../../utils/ocr/ocrTypes.ts';
import {
  grayToRgbaBuffer,
  MAX_OCR_FILE_SIZE_BYTES,
  MAX_OCR_IMAGE_DIMENSION_PX,
  rgbaToGrayImage,
  validateAndPlanOcrImageDimensions,
  validateUploadedImageMagicBytes,
} from '../../utils/ocr/imagePreprocessor.ts';
import { defaultLocalOcrRegistry } from '../../utils/ocr/localOcrEngine.ts';
import {
  createChallengingSkewedSampleGrayImage,
  createRealisticCameraSampleGrayImage,
  createReferenceSampleGrayImage,
  evaluateRosterOcrAccuracyMetrics,
  parseGroundTruthRosterText,
  reparseOcrWithColumnRoles,
  runLocalRosterOcrPipelineAsync,
  runRealisticCameraOcrBenchmarkSuite,
  terminateActiveOcrWorker,
  type RealisticCameraBenchmarkSuiteSummary,
  type RosterOcrAccuracyMetrics,
  type RosterOcrPerformanceMetrics,
} from '../../utils/ocr/rosterOcrPipeline.ts';
import {
  applyOcrFieldSuggestion,
  bulkApproveReliableOcrRows,
  commitVerifiedOcrRosterAtomically,
  evaluateRosterReliability,
  runTargetedCellReReads,
  toggleOcrRowApproval,
  updateOcrRowIdentityField,
} from '../../utils/ocr/rosterReliability.ts';

interface LocalOcrVerificationPanelProps {
  activeClassId: string;
  activeClassName: string;
  existingClassroomStudents: Student[];
  onCommitStudents: (createdStudents: Student[]) => void;
}

const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  sequence: 'Sıra No',
  studentNumber: 'Okul Numarası',
  firstName: 'Öğrenci Adı',
  lastName: 'Öğrenci Soyadı',
  fullName: 'Adı Soyadı (Birleşik)',
  gender: 'Cinsiyet (K/E)',
  auxiliary: 'Yardımcı / Ek Sütun',
  ignore: 'Yoksay',
};

export const LocalOcrVerificationPanel: React.FC<
  LocalOcrVerificationPanelProps
> = ({
  activeClassId,
  activeClassName,
  existingClassroomStudents,
  onCommitStudents,
}) => {
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [sourceGrayImage, setSourceGrayImage] = useState<RawGrayImage | null>(
    null
  );
  const [manualRotation, setManualRotation] = useState<0 | 90 | 180 | 270>(0);

  const [ocrOutput, setOcrOutput] = useState<OcrEngineOutput | null>(null);
  const [tableAnalysis, setTableAnalysis] =
    useState<GeometricTableAnalysisResult | null>(null);
  const [rows, setRows] = useState<VerifiedOcrRosterRow[]>([]);
  const [performanceMetrics, setPerformanceMetrics] =
    useState<RosterOcrPerformanceMetrics | null>(null);
  const [benchmarkSummary, setBenchmarkSummary] =
    useState<RealisticCameraBenchmarkSuiteSummary | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [manualColumnRoles, setManualColumnRoles] = useState<
    Record<number, ColumnRole>
  >({});

  // Selected row for physical photo zoom comparison
  const [inspectedRowId, setInspectedRowId] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1.35);
  const [showFullPhotoOverlay, setShowFullPhotoOverlay] = useState(false);
  const [showLiveCameraScanner, setShowLiveCameraScanner] = useState(false);

  // Active OCR engine selector & Real Photo Ground-Truth Verification Harness
  const [activeEngineId, setActiveEngineId] = useState<string>(
    () => defaultLocalOcrRegistry.getActiveEngine().engineId
  );
  const [showGroundTruthHarness, setShowGroundTruthHarness] = useState(false);
  const [groundTruthInput, setGroundTruthInput] = useState<string>(
    '245 | AYŞE NUR | ÇELİK | K\n246 | MEHMET | DEMİR | E\n247 | ÖMER FARUK | ŞAHİN | E\n248 | ZEYNEP | GÜNEŞ | K'
  );
  const [customPhotoAccuracy, setCustomPhotoAccuracy] =
    useState<RosterOcrAccuracyMetrics | null>(null);

  const rowCropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullPhotoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const inspectedRow =
    rows.find((r) => r.rowId === inspectedRowId) || rows[0] || null;

  // Terminate any active background OCR Web Worker on component unmount
  useEffect(() => {
    return () => {
      terminateActiveOcrWorker();
    };
  }, []);

  // Re-evaluate rows if classroom's existing students change
  useEffect(() => {
    if (rows.length > 0 && ocrOutput) {
      setRows((prev) =>
        evaluateRosterReliability(
          prev,
          ocrOutput.words,
          existingClassroomStudents
        )
      );
    }
  }, [existingClassroomStudents]);

  // Render zoomed physical row crop on canvas whenever inspectedRow or zoomScale changes
  useEffect(() => {
    const canvas = rowCropCanvasRef.current;
    if (!canvas || !ocrOutput || !inspectedRow) return;

    const procImg = ocrOutput.preprocessing.grayImage;
    const padX = 24;
    const padY = 14;
    const rx0 = Math.max(0, Math.floor(inspectedRow.rowBbox.x0 - padX));
    const ry0 = Math.max(0, Math.floor(inspectedRow.rowBbox.y0 - padY));
    const rx1 = Math.min(
      procImg.width - 1,
      Math.ceil(inspectedRow.rowBbox.x1 + padX)
    );
    const ry1 = Math.min(
      procImg.height - 1,
      Math.ceil(inspectedRow.rowBbox.y1 + padY)
    );

    const cropW = Math.max(40, rx1 - rx0 + 1);
    const cropH = Math.max(24, ry1 - ry0 + 1);

    const displayW = Math.round(cropW * zoomScale);
    const displayH = Math.round(cropH * zoomScale);
    canvas.width = displayW;
    canvas.height = displayH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create temporary ImageData for the cropped region
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      const cropRgba = new Uint8ClampedArray(cropW * cropH * 4);
      for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
          const val = procImg.data[(ry0 + y) * procImg.width + (rx0 + x)];
          const p = (y * cropW + x) * 4;
          cropRgba[p] = val;
          cropRgba[p + 1] = val;
          cropRgba[p + 2] = val;
          cropRgba[p + 3] = 255;
        }
      }
      tempCtx.putImageData(new ImageData(cropRgba, cropW, cropH), 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tempCanvas, 0, 0, displayW, displayH);

      // Draw color-coded cell bounding boxes on the zoomed row crop
      const drawCellBox = (
        box: { x0: number; y0: number; x1: number; y1: number } | undefined,
        strokeColor: string,
        label: string
      ) => {
        if (!box) return;
        const bx = (box.x0 - rx0 - 3) * zoomScale;
        const by = (box.y0 - ry0 - 3) * zoomScale;
        const bw = (box.x1 - box.x0 + 6) * zoomScale;
        const bh = (box.y1 - box.y0 + 6) * zoomScale;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = strokeColor;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(label, Math.max(2, bx), Math.max(10, by - 3));
      };

      drawCellBox(inspectedRow.cellBboxes.studentNumber, '#0f766e', 'Okul No');
      drawCellBox(inspectedRow.cellBboxes.firstName, '#0369a1', 'Adı');
      drawCellBox(inspectedRow.cellBboxes.lastName, '#4338ca', 'Soyadı');
      drawCellBox(inspectedRow.cellBboxes.gender, '#64748b', 'Cinsiyet');
    }
  }, [ocrOutput, inspectedRow, zoomScale]);

  // Render full preprocessed table image with column & row overlays when toggled
  useEffect(() => {
    const canvas = fullPhotoCanvasRef.current;
    if (!canvas || !ocrOutput || !tableAnalysis || !showFullPhotoOverlay)
      return;

    const procImg = ocrOutput.preprocessing.grayImage;
    canvas.width = procImg.width;
    canvas.height = procImg.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgba = grayToRgbaBuffer(procImg);
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), procImg.width, procImg.height),
      0,
      0
    );

    // Draw detected column bands
    for (const col of tableAnalysis.columns) {
      ctx.strokeStyle = 'rgba(13, 148, 136, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(col.x0, 8, col.x1 - col.x0, procImg.height - 16);
      ctx.setLineDash([]);
    }

    // Highlight rows
    for (const r of rows) {
      const isSelected = r.rowId === inspectedRow?.rowId;
      ctx.strokeStyle =
        r.rowKind === 'missing_gap_candidate'
          ? '#d97706'
          : isSelected
          ? '#0f766e'
          : 'rgba(71, 85, 105, 0.45)';
      ctx.lineWidth = isSelected ? 2.5 : 1.2;
      ctx.strokeRect(
        r.rowBbox.x0 - 4,
        r.rowBbox.y0 - 4,
        r.rowBbox.x1 - r.rowBbox.x0 + 8,
        r.rowBbox.y1 - r.rowBbox.y0 + 8
      );
    }
  }, [ocrOutput, tableAnalysis, rows, inspectedRow, showFullPhotoOverlay]);

  const executePipelineOnGrayImage = async (
    grayImg: RawGrayImage,
    rotationDeg: 0 | 90 | 180 | 270 = 0
  ) => {
    setOcrLoading(true);
    setOcrError(null);
    try {
      const res = await runLocalRosterOcrPipelineAsync(
        grayImg,
        existingClassroomStudents,
        {
          preprocessing:
            rotationDeg !== 0
              ? { manualRotationDeg: rotationDeg, autoOrient: false }
              : { autoOrient: true },
        }
      );

      setSourceGrayImage(grayImg);
      setOcrOutput(res.ocrOutput);
      setTableAnalysis(res.tableAnalysis);
      setRows(res.verifiedRows);
      setPerformanceMetrics(res.performanceMetrics);
      setInspectedRowId(res.verifiedRows[0]?.rowId ?? null);

      const initialRoleMap: Record<number, ColumnRole> = {};
      res.tableAnalysis.columns.forEach((c) => {
        initialRoleMap[c.columnIndex] = c.role;
      });
      setManualColumnRoles(initialRoleMap);
      setShowColumnMapper(res.tableAnalysis.headerlessRecoveryRequired);

      if (res.verifiedRows.length === 0) {
        setOcrError(
          'Görselde anlamlı tablo satırı tespit edilemedi. Fotoğraf yönünü değiştirmeyi veya Sütun Eşleştirme aracını açmayı deneyin.'
        );
      }
    } catch (err) {
      setOcrError(
        err instanceof Error
          ? err.message
          : 'Yerel OCR çözümlemesi sırasında bir hata oluştu.'
      );
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);

    if (file.size > MAX_OCR_FILE_SIZE_BYTES) {
      const preCheck = validateAndPlanOcrImageDimensions(100, 100, file.size);
      setOcrError(
        preCheck.error ||
          'Fotoğraf dosya boyutu çok büyük. Lütfen daha küçük bir görsel seçin.'
      );
      e.target.value = '';
      return;
    }

    setOcrLoading(true);
    let objectUrl: string | null = null;

    try {
      const headerBuffer = await file.slice(0, 12).arrayBuffer();
      const magicCheck = validateUploadedImageMagicBytes(
        new Uint8Array(headerBuffer),
        file.type
      );
      if (!magicCheck.valid) {
        setOcrError(
          magicCheck.error ||
            'Geçersiz görsel dosyası. Lütfen PNG, JPEG veya WEBP fotoğraf seçin.'
        );
        setOcrLoading(false);
        return;
      }

      objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objectUrl!;
      });

      const rawWidth = img.naturalWidth || img.width;
      const rawHeight = img.naturalHeight || img.height;
      const dimensionPlan = validateAndPlanOcrImageDimensions(
        rawWidth,
        rawHeight,
        file.size,
        MAX_OCR_IMAGE_DIMENSION_PX
      );

      if (!dimensionPlan.valid) {
        setOcrError(
          dimensionPlan.error ||
            'Görsel boyutları tablet güvenlik sınırlarını aşıyor.'
        );
        setOcrLoading(false);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = dimensionPlan.targetWidth;
      canvas.height = dimensionPlan.targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Tarayıcı Canvas görüntü bağlamı oluşturulamadı.');
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        img,
        0,
        0,
        dimensionPlan.targetWidth,
        dimensionPlan.targetHeight
      );
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = rgbaToGrayImage(
        imgData.data,
        imgData.width,
        imgData.height
      );

      setManualRotation(0);
      await executePipelineOnGrayImage(gray, 0);
    } catch {
      setOcrError(
        'Görsel dosyası yerel olarak okunamadı. Lütfen geçerli bir PNG, JPEG veya WEBP dosyası seçin.'
      );
      setOcrLoading(false);
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      e.target.value = '';
    }
  };

  const handleLoadReferenceSample = async () => {
    const sample = createReferenceSampleGrayImage();
    setManualRotation(0);
    await executePipelineOnGrayImage(sample, 0);
  };

  const handleLoadChallengingSample = async () => {
    const sample = createChallengingSkewedSampleGrayImage();
    setManualRotation(0);
    await executePipelineOnGrayImage(sample, 0);
  };

  const handleLoadRealisticCameraSample = async () => {
    const sample = createRealisticCameraSampleGrayImage();
    setManualRotation(0);
    await executePipelineOnGrayImage(sample, 0);
  };

  const handleRunRealisticBenchmarkSuite = async () => {
    setBenchmarkRunning(true);
    setOcrError(null);
    try {
      const summary = await runRealisticCameraOcrBenchmarkSuite();
      setBenchmarkSummary(summary);
      // Also load the realistic camera sample into the workspace so the user can inspect its rows
      const sample = createRealisticCameraSampleGrayImage();
      setManualRotation(0);
      await executePipelineOnGrayImage(sample, 0);
    } catch (err) {
      setOcrError(
        err instanceof Error
          ? err.message
          : 'Gerçek fotoğraf doğruluk ve performans testi sırasında hata oluştu.'
      );
    } finally {
      setBenchmarkRunning(false);
    }
  };

  const handleRotate90 = async () => {
    if (!sourceGrayImage) return;
    const nextRot = (((manualRotation + 90) % 360) as 0 | 90 | 180 | 270);
    setManualRotation(nextRot);
    await executePipelineOnGrayImage(sourceGrayImage, nextRot);
  };

  const handleColumnRoleChange = (colIndex: number, newRole: ColumnRole) => {
    if (!ocrOutput) return;
    const nextRoles = {
      ...manualColumnRoles,
      [colIndex]: newRole,
    };
    setManualColumnRoles(nextRoles);

    const reparsed = reparseOcrWithColumnRoles(
      ocrOutput,
      nextRoles,
      !tableAnalysis?.headerDetected,
      existingClassroomStudents
    );
    setTableAnalysis(reparsed.tableAnalysis);
    setRows(reparsed.verifiedRows);
  };

  const handleReReadSingleRow = async (rowId: string) => {
    if (!ocrOutput) return;
    const target = rows.find((r) => r.rowId === rowId);
    if (!target) return;

    const engine = defaultLocalOcrRegistry.getActiveEngine();
    const [reReadRow] = await runTargetedCellReReads(
      [{ ...target, reliabilityLevel: 'review_required', reReadAttempted: false }],
      ocrOutput.preprocessing.grayImage,
      engine
    );
    setRows((prev) =>
      evaluateRosterReliability(
        prev.map((r) => (r.rowId === rowId ? reReadRow : r)),
        ocrOutput.words,
        existingClassroomStudents
      )
    );
  };

  const handleDeleteCandidateRow = (rowId: string) => {
    if (!ocrOutput) return;
    const filtered = rows
      .filter((r) => r.rowId !== rowId)
      .map((r, i) => ({ ...r, rowIndex: i + 1 }));
    setRows(
      evaluateRosterReliability(
        filtered,
        ocrOutput.words,
        existingClassroomStudents
      )
    );
  };

  const handleAtomicCommit = () => {
    setOcrError(null);
    const result = commitVerifiedOcrRosterAtomically(
      rows,
      activeClassId,
      existingClassroomStudents
    );
    if (!result.ok) {
      setOcrError(result.error || 'Atomik kayıt doğrulaması başarısız oldu.');
      return;
    }
    onCommitStudents(result.createdStudents);
    setRows([]);
    setOcrOutput(null);
    setTableAnalysis(null);
    setSourceGrayImage(null);
  };

  const highReliabilityCount = rows.filter(
    (r) => r.reliabilityLevel === 'high'
  ).length;
  const reviewRequiredCount = rows.filter(
    (r) => r.reliabilityLevel === 'review_required'
  ).length;
  const invalidRowCount = rows.filter(
    (r) => r.reliabilityLevel === 'invalid'
  ).length;
  const approvedCount = rows.filter((r) => r.approvedByTeacher).length;
  const allApprovedAndValid =
    rows.length > 0 &&
    invalidRowCount === 0 &&
    approvedCount === rows.length;

  const handleEngineChange = async (newEngineId: string) => {
    defaultLocalOcrRegistry.setActiveEngine(newEngineId);
    setActiveEngineId(newEngineId);
    if (sourceGrayImage) {
      await executePipelineOnGrayImage(sourceGrayImage, manualRotation);
    }
  };

  const handleEvaluateUploadedPhotoGroundTruth = () => {
    const parsedGt = parseGroundTruthRosterText(groundTruthInput);
    if (parsedGt.length === 0) {
      setOcrError(
        'Doğrulama için en az 1 beklenen öğrenci satırı girin (Örn: 245 | AYŞE NUR | ÇELİK).'
      );
      return;
    }
    setOcrError(null);
    const metrics = evaluateRosterOcrAccuracyMetrics(rows, parsedGt);
    setCustomPhotoAccuracy(metrics);
  };

  return (
    <div className="space-y-4">
      {/* 100% Local & Offline Privacy Guarantee + Engine Selector (Android ML Kit v2 / Browser Local) */}
      <div className="bg-teal-50/80 border border-teal-200 rounded-xl p-3.5 text-xs text-teal-950 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold flex items-center gap-1.5 text-teal-900">
            <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
            %100 Yerel Cihaz İçi OCR (Google ML Kit Android & Tarayıcı Motoru)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="ocr-engine-selector"
              className="text-[11px] font-bold text-teal-900"
            >
              Aktif Motor:
            </label>
            <select
              id="ocr-engine-selector"
              aria-label="Aktif Yerel OCR Motoru"
              value={activeEngineId}
              onChange={(e) => handleEngineChange(e.target.value)}
              disabled={ocrLoading}
              className="px-2 py-1 rounded-lg border border-teal-300 bg-white text-[11px] font-semibold text-teal-950 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {defaultLocalOcrRegistry.listAdapters().map((adapter) => (
                <option key={adapter.engineId} value={adapter.engineId}>
                  {adapter.engineName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowGroundTruthHarness((prev) => !prev)}
              data-testid="toggle-ground-truth-harness-btn"
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                showGroundTruthHarness
                  ? 'bg-teal-800 text-white border-teal-800'
                  : 'bg-white text-teal-900 border-teal-300 hover:bg-teal-100/70'
              }`}
            >
              Gerçek Fotoğraf Doğrulama Laboratuvarı
            </button>
          </div>
        </div>
        <p className="text-[11px] text-teal-900 leading-relaxed">
          KVKK Güvencesi: Fotoğraflar ve öğrenci bilgileri hiçbir sunucuya gönderilmez.
          Android cihazlarda Capacitor üzerinden yerel{' '}
          <strong>Google ML Kit Text Recognition v2</strong> motoru, tarayıcıda ise
          yerel Türkçe OCR motoru yüksek çözünürlükte (3200px) çalışır; komşu satır ve
          sütunların birbirine karışması geometrik koordinat sınırlarıyla engellenir.
        </p>
      </div>

      {/* Real Photo Ground-Truth Verification Harness (Gerçek Fotoğraf Doğrulama Altyapısı) */}
      {showGroundTruthHarness && (
        <div
          data-testid="ground-truth-harness-panel"
          className="border border-teal-300 bg-white rounded-xl p-3.5 space-y-2.5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Gerçek Sınıf Listesi Fotoğrafı — Beklenen Liste (Ground-Truth) Doğrulama Altyapısı
              </h4>
              <p className="text-[11px] text-slate-600">
                Kamerayla çektiğiniz veya yüklediğiniz gerçek sınıf listesi fotoğrafının beklenen
                öğrenci satırlarını aşağıya girerek karakter doğruluğu (CER), ad-soyad eşleşmesi ve
                komşu öğrenci karışmazlığını (0 Cross-Row Contamination) canlı olarak ölçün.
              </p>
            </div>
            <button
              type="button"
              onClick={handleEvaluateUploadedPhotoGroundTruth}
              disabled={rows.length === 0}
              data-testid="run-ground-truth-eval-btn"
              className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-bold cursor-pointer shrink-0"
            >
              Mevcut OCR Sonucunu Doğrula ({rows.length} Satır)
            </button>
          </div>

          <textarea
            aria-label="Beklenen Gerçek Sınıf Listesi Satırları"
            rows={4}
            value={groundTruthInput}
            onChange={(e) => setGroundTruthInput(e.target.value)}
            placeholder="Her satıra: OkulNo | Adı | Soyadı | Cinsiyet (Örn: 245 | AYŞE NUR | ÇELİK | K)"
            className="w-full p-2.5 text-xs font-mono-num border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
          />

          {customPhotoAccuracy && (
            <div className="bg-teal-50/80 border border-teal-200 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-num">
              <span className="font-bold text-teal-950">
                Karakter Doğruluğu: %{customPhotoAccuracy.characterAccuracyPercent} (CER: {customPhotoAccuracy.characterErrorRate})
              </span>
              <span className="font-semibold text-slate-800">
                Okul No Eşleşmesi: %{customPhotoAccuracy.studentNumberExactMatchRate}
              </span>
              <span className="font-semibold text-slate-800">
                Ad/Soyad Tam Eşleşme: %{customPhotoAccuracy.rowIdentityMatchRate}
              </span>
              <span
                className={`font-bold ${
                  customPhotoAccuracy.zeroCrossRowContamination
                    ? 'text-emerald-800'
                    : 'text-red-700'
                }`}
              >
                Komşu Öğrenci Karışması:{' '}
                {customPhotoAccuracy.zeroCrossRowContamination
                  ? '0 (Karışma Yok)'
                  : 'Tespit Edildi!'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Camera Scanner, Photo Upload & Built-in Verification Sample Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
        <button
          type="button"
          onClick={() => setShowLiveCameraScanner((prev) => !prev)}
          disabled={ocrLoading}
          data-testid="open-live-camera-scanner-btn"
          className={`sm:col-span-4 rounded-xl p-3.5 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 border-2 ${
            showLiveCameraScanner
              ? 'bg-teal-900 text-white border-teal-700 shadow-xs'
              : 'bg-teal-700 hover:bg-teal-800 text-white border-teal-700 shadow-xs'
          }`}
        >
          <ScanLine className="w-5 h-5 text-teal-200" />
          <span className="text-xs font-bold">
            {showLiveCameraScanner
              ? 'Canlı Kamera Tarayıcıyı Kapat'
              : 'Kamerayı Aç ve Listeyi Tara'}
          </span>
          <span className="text-[11px] text-teal-100">
            Uygulama içi canlı kamera ve otomatik tablo hizalama
          </span>
        </button>

        <label className="sm:col-span-4 border-2 border-dashed border-slate-300 hover:border-teal-600 rounded-xl p-3.5 text-center transition-colors cursor-pointer bg-slate-50/70 flex flex-col items-center justify-center gap-1">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={handleFileUpload}
            className="hidden"
            disabled={ocrLoading}
          />
          {ocrLoading ? (
            <Loader2 className="w-5 h-5 text-teal-700 animate-spin" />
          ) : (
            <Camera className="w-5 h-5 text-teal-700" />
          )}
          <span className="text-xs font-bold text-slate-900">
            {ocrLoading
              ? 'Tablo Geometrisi Çözümleniyor...'
              : 'Fotoğraf Çek / Dosya Seç (PNG / JPEG)'}
          </span>
          <span className="text-[11px] text-slate-500">
            Sütun ve satır koordinatları yerel olarak analiz edilir
          </span>
        </label>

        <div className="sm:col-span-4 flex flex-col justify-between gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleLoadReferenceSample}
              disabled={ocrLoading || benchmarkRunning}
              className="w-full py-2 px-2.5 rounded-xl border border-teal-300 bg-teal-50/60 hover:bg-teal-100/70 text-teal-950 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              Referans Tablo
            </button>

            <button
              type="button"
              onClick={handleLoadRealisticCameraSample}
              disabled={ocrLoading || benchmarkRunning}
              className="w-full py-2 px-2.5 rounded-xl border border-teal-400 bg-teal-100/60 hover:bg-teal-200/70 text-teal-950 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-teal-800 shrink-0" />
              Gerçek Fotoğraf
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleLoadChallengingSample}
              disabled={ocrLoading || benchmarkRunning}
              className="w-full py-2 px-2.5 rounded-xl border border-amber-300 bg-amber-50/60 hover:bg-amber-100/70 text-amber-950 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              Eğik / Eksik Liste
            </button>

            <button
              type="button"
              onClick={handleRunRealisticBenchmarkSuite}
              disabled={ocrLoading || benchmarkRunning}
              className="w-full py-2 px-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              {benchmarkRunning ? (
                <Loader2 className="w-3.5 h-3.5 text-teal-700 animate-spin shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              )}
              Doğruluk Testi
            </button>
          </div>
        </div>
      </div>

      {/* In-App Live Camera & Document Scanner */}
      {showLiveCameraScanner && (
        <LiveCameraScanner
          disabled={ocrLoading}
          onClose={() => setShowLiveCameraScanner(false)}
          onCaptureScannedImage={async (capturedGray) => {
            setShowLiveCameraScanner(false);
            setManualRotation(0);
            await executePipelineOnGrayImage(capturedGray, 0);
          }}
        />
      )}

      {/* Real Photo OCR Accuracy & Performance Benchmark Suite Report */}
      {benchmarkSummary && (
        <div className="border border-teal-300 bg-teal-50/50 rounded-xl p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
              <span className="text-xs font-bold text-slate-900">
                Gerçek Kamera Fotoğrafları OCR Doğruluk ve Performans Raporu (4 Senaryo)
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono-num">
              <span className="font-bold text-teal-900">
                Karakter Doğruluğu: %{benchmarkSummary.averageCharacterAccuracyPercent}
              </span>
              <span className="font-bold text-teal-900">
                Satır Kimlik Eşleşmesi: %{benchmarkSummary.averageRowIdentityMatchRate}
              </span>
              <span className="text-slate-700">
                Toplam Süre: {benchmarkSummary.totalDurationMs} ms
              </span>
              <button
                type="button"
                onClick={() => setBenchmarkSummary(null)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Gizle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {benchmarkSummary.scenarios.map((sc) => (
              <div
                key={sc.scenarioId}
                className="bg-white border border-slate-200 rounded-lg p-2.5 text-[11px] space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{sc.title}</span>
                  <span className="font-mono-num font-bold text-teal-800">
                    %{sc.accuracy.characterAccuracyPercent} · {sc.performance.totalDurationMs}ms
                  </span>
                </div>
                <p className="text-slate-600 leading-snug">{sc.description}</p>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono-num text-slate-600 pt-0.5">
                  <span>Okul No: %{sc.accuracy.studentNumberExactMatchRate}</span>
                  <span>·</span>
                  <span>Ad/Soyad: %{sc.accuracy.rowIdentityMatchRate}</span>
                  <span>·</span>
                  <span>CER: {sc.accuracy.characterErrorRate}</span>
                  <span>·</span>
                  <span>
                    Komşu Satır Karışması:{' '}
                    {sc.accuracy.zeroCrossRowContamination ? '0 (Yok)' : 'Tespit Edildi'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ocrError && (
        <div
          role="alert"
          className="flex items-start gap-2 text-xs text-red-900 bg-red-50 border border-red-200 rounded-xl p-3 font-medium"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
          <span>{ocrError}</span>
        </div>
      )}

      {/* Explicit ML Kit Native Bridge Failure / Fallback Transparency Alert */}
      {ocrOutput?.fallbackOccurred && (
        <div
          role="status"
          data-testid="mlkit-fallback-alert"
          className="flex items-start gap-2.5 text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded-xl p-3.5 space-y-1"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          <div className="space-y-1">
            <div className="font-bold text-amber-950">
              Yerel ML Kit Köprüsü Kullanılamadı — Yedek OCR Motoruna Geçildi
            </div>
            <div className="text-[11px] text-amber-900 leading-relaxed">
              <strong>Hata / Geçiş Nedeni:</strong> {ocrOutput.fallbackReason}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-num pt-0.5 text-amber-950">
              <span>
                <strong>İstenen Motor:</strong>{' '}
                {ocrOutput.requestedEngineName || ocrOutput.requestedEngineId}
              </span>
              <span>
                <strong>Gerçekte Çalışan Motor:</strong> {ocrOutput.engineName}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Preprocessing & Geometric Diagnostics Toolbar */}
      {ocrOutput && tableAnalysis && (
        <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 text-[11px]">
            <div
              data-testid="actual-running-ocr-engine"
              className="flex flex-wrap items-center gap-1.5 text-slate-800"
            >
              <span className="font-bold text-slate-900">
                Gerçekte Çalışan Motor:
              </span>
              <span className="font-semibold text-teal-900 bg-teal-100/80 border border-teal-300 rounded px-2 py-0.5">
                {ocrOutput.engineName}
              </span>
              {ocrOutput.fallbackOccurred && (
                <span className="font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-0.5">
                  Yedek Motor Devrede
                </span>
              )}
            </div>

            {tableAnalysis.surnameOrderAlignmentApplied && (
              <div
                data-testid="surname-order-alignment-badge"
                className="font-mono-num text-[11px] font-semibold text-teal-900 bg-white border border-teal-200 rounded px-2 py-0.5"
              >
                Sıra Koruyan 1-1 Soyadı Eşleştirme:{' '}
                {tableAnalysis.surnameOrderAlignmentPairs?.length ?? 0} eşleşme
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 font-mono-num">
              <span className="font-bold text-slate-900">
                Geometrik Analiz Özeti:
              </span>
              <span>
                {ocrOutput.preprocessing.diagnostics.processedWidth}×
                {ocrOutput.preprocessing.diagnostics.processedHeight}px
              </span>
              <span>·</span>
              <span>
                Eğim:{' '}
                {ocrOutput.preprocessing.diagnostics.detectedSkewDeg > 0
                  ? `+${ocrOutput.preprocessing.diagnostics.detectedSkewDeg}°`
                  : `${ocrOutput.preprocessing.diagnostics.detectedSkewDeg}°`}
              </span>
              <span>·</span>
              <span>
                Kontrast: %{ocrOutput.preprocessing.diagnostics.contrastScore}
              </span>
              <span>·</span>
              <span>{tableAnalysis.columns.length} Sütun</span>
              <span>·</span>
              <span>{rows.length} Satır</span>
              {performanceMetrics && (
                <>
                  <span>·</span>
                  <span className="text-teal-800 font-semibold">
                    Süre: {performanceMetrics.totalDurationMs} ms ({performanceMetrics.throughputRowsPerSec} satır/sn)
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleRotate90}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                90° Döndür ({manualRotation}°)
              </button>

              <button
                type="button"
                onClick={() => setShowColumnMapper(!showColumnMapper)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                  showColumnMapper || tableAnalysis.headerlessRecoveryRequired
                    ? 'bg-amber-100 border-amber-400 text-amber-950'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                Sütun Eşleştirme ({tableAnalysis.headerDetected ? 'Başlıklı' : 'Başlıksız Kurtarma'})
              </button>

              <button
                type="button"
                onClick={() => setShowFullPhotoOverlay(!showFullPhotoOverlay)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                  showFullPhotoOverlay
                    ? 'bg-teal-700 border-teal-700 text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {showFullPhotoOverlay ? 'Tam Tabloyu Gizle' : 'Tam Tablo Haritası'}
              </button>
            </div>
          </div>

          {ocrOutput.preprocessing.diagnostics.qualityWarnings.filter(
            (w) =>
              !w.startsWith('[Motor Bilgilendirmesi]') &&
              !w.startsWith('[ML Kit Hatası')
          ).length > 0 && (
            <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
              {ocrOutput.preprocessing.diagnostics.qualityWarnings
                .filter(
                  (w) =>
                    !w.startsWith('[Motor Bilgilendirmesi]') &&
                    !w.startsWith('[ML Kit Hatası')
                )
                .map((w, idx) => (
                  <div key={idx}>• {w}</div>
                ))}
            </div>
          )}

          {/* Headerless Recovery / Column Role Assignment Panel */}
          {(showColumnMapper || tableAnalysis.headerlessRecoveryRequired) && (
            <div className="bg-white border border-amber-300 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-900">
                  {tableAnalysis.headerDetected
                    ? 'Geometrik Sütun Başlıkları ve Rol Eşleştirmesi'
                    : 'Başlıksız Tablo Kurtarma — Sütun Rollerini Doğrulayın'}
                </div>
                <span className="text-[11px] text-slate-500">
                  Sütun rolünü değiştirdiğinizde satırlar koordinatlarına göre anında yeniden eşleştirilir
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {tableAnalysis.columns.map((col) => (
                  <div
                    key={col.columnIndex}
                    className="p-2 rounded-lg border border-slate-200 bg-slate-50 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-500">
                      <span>Sütun #{col.columnIndex + 1}</span>
                      <span>
                        x:{col.x0}..{col.x1}
                      </span>
                    </div>
                    <div
                      className="text-xs font-bold text-slate-800 truncate"
                      title={col.headerText}
                    >
                      Başlık: {col.headerText || 'Yok'}
                    </div>
                    <select
                      aria-label={`${col.columnIndex + 1}. Sütun Rolü`}
                      value={
                        manualColumnRoles[col.columnIndex] ?? col.role
                      }
                      onChange={(e) =>
                        handleColumnRoleChange(
                          col.columnIndex,
                          e.target.value as ColumnRole
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    >
                      {Object.entries(COLUMN_ROLE_LABELS).map(
                        ([roleKey, label]) => (
                          <option key={roleKey} value={roleKey}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Full Table Coordinate Overlay */}
          {showFullPhotoOverlay && (
            <div className="bg-white border border-slate-200 rounded-xl p-2 overflow-x-auto">
              <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                Önişlenmiş Tablo Görseli ve Tespit Edilen Fiziksel Satır / Sütun Kutuları:
              </div>
              <canvas
                ref={fullPhotoCanvasRef}
                className="max-w-full h-auto border border-slate-200 rounded"
              />
            </div>
          )}

          {/* Physical Photo Row Zoom Inspector */}
          {inspectedRow && (
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ZoomIn className="w-4 h-4 text-teal-700 shrink-0" />
                  <span className="text-xs font-bold text-slate-900">
                    Fiziksel Satır Yakınlaştırma (Satır #{inspectedRow.rowIndex}{' '}
                    · Kaynak: {inspectedRow.physicalRowId})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="ocr-row-zoom-slider"
                    className="text-[11px] font-semibold text-slate-600"
                  >
                    Büyütme: {zoomScale.toFixed(2)}x
                  </label>
                  <input
                    id="ocr-row-zoom-slider"
                    type="range"
                    min="1"
                    max="2.2"
                    step="0.15"
                    value={zoomScale}
                    onChange={(e) => setZoomScale(Number(e.target.value))}
                    className="w-24 accent-teal-700 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => handleReReadSingleRow(inspectedRow.rowId)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Hücreyi Yerel Yeniden Oku
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto bg-slate-100/80 border border-slate-200 rounded-lg p-2 flex items-center justify-center">
                <canvas
                  ref={rowCropCanvasRef}
                  data-testid="ocr-row-crop-canvas"
                  className="max-w-full h-auto rounded bg-white shadow-2xs"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teacher Verification Table & Bulk Approval / Atomic Commit Controls */}
      {rows.length > 0 && (
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Öğretmen Doğrulama ve Satır Eşleştirme Tablosu ({rows.length}{' '}
                Satır)
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5 font-mono-num">
                <span className="text-emerald-800 font-semibold">
                  {highReliabilityCount} Güvenilir
                </span>
                <span>·</span>
                <span className="text-amber-800 font-semibold">
                  {reviewRequiredCount} İnceleme Gerekli
                </span>
                <span>·</span>
                <span className="text-red-800 font-semibold">
                  {invalidRowCount} Eksik/Hatalı
                </span>
                <span>·</span>
                <span className="text-teal-900 font-bold">
                  Onaylanan: {approvedCount}/{rows.length}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const res = bulkApproveReliableOcrRows(
                    rows,
                    ocrOutput?.words ?? [],
                    existingClassroomStudents
                  );
                  setRows(res.rows);
                }}
                disabled={highReliabilityCount === 0}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-teal-50 text-teal-900 border border-teal-300 hover:bg-teal-100 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                Güvenilir Satırları Toplu Onayla ({highReliabilityCount})
              </button>

              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setOcrOutput(null);
                  setTableAnalysis(null);
                  setSourceGrayImage(null);
                  setOcrError(null);
                }}
                className="px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Temizle
              </button>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
            {rows.map((row) => {
              const isInspected = inspectedRow?.rowId === row.rowId;
              const isGapCandidate = row.rowKind === 'missing_gap_candidate';

              return (
                <div
                  key={row.rowId}
                  onClick={() => setInspectedRowId(row.rowId)}
                  className={`p-3 rounded-xl border transition-all space-y-2 ${
                    isGapCandidate
                      ? 'bg-amber-50/90 border-amber-300'
                      : row.validationErrors.length > 0
                      ? 'bg-red-50/70 border-red-300'
                      : row.approvedByTeacher
                      ? 'bg-emerald-50/40 border-emerald-300'
                      : isInspected
                      ? 'bg-teal-50/40 border-teal-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Row Top Metadata & Approval Action */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono-num">
                      <span className="font-bold text-slate-900">
                        Satır #{row.rowIndex}
                      </span>
                      {row.sequenceNumber !== null && (
                        <span className="text-slate-600">
                          (Basılı Sıra: {row.sequenceNumber})
                        </span>
                      )}
                      <span className="text-slate-400">·</span>
                      <span className="text-[11px] text-slate-500">
                        y:{row.rowBbox.y0}..{row.rowBbox.y1}px
                      </span>
                      <span className="text-slate-400">·</span>
                      {row.reliabilityLevel === 'high' ? (
                        <span className="text-emerald-800 font-semibold">
                          Yüksek Güven (%{row.confidence})
                        </span>
                      ) : row.reliabilityLevel === 'review_required' ? (
                        <span className="text-amber-800 font-semibold">
                          İnceleme Gerekli (%{row.confidence})
                        </span>
                      ) : (
                        <span className="text-red-800 font-bold">
                          {isGapCandidate
                            ? 'Belirsiz / Okunamayan Satır Boşluğu'
                            : 'Eksik veya Hatalı Alan'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedRowId(row.rowId);
                        }}
                        className="px-2 py-1 rounded text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <ZoomIn className="w-3 h-3" />
                        Satırı Göster
                      </button>

                      <button
                        type="button"
                        disabled={row.validationErrors.length > 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRows((prev) =>
                            toggleOcrRowApproval(
                              prev,
                              row.rowId,
                              ocrOutput?.words ?? [],
                              existingClassroomStudents
                            )
                          );
                        }}
                        aria-label={`${row.rowIndex}. satırı ${
                          row.approvedByTeacher ? 'onayını kaldır' : 'onayla'
                        }`}
                        className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          row.approvedByTeacher
                            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                            : row.validationErrors.length > 0
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {row.approvedByTeacher ? 'Onaylandı' : 'Onayla'}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCandidateRow(row.rowId);
                        }}
                        aria-label={`${row.rowIndex}. satırı sil`}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                        title="Satırı listeden çıkar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Editable Identity Inputs (Okul No, Ad, Soyad, Cinsiyet) */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Okul No
                      </label>
                      <input
                        type="text"
                        aria-label={`${row.rowIndex}. Satır Okul Numarası`}
                        value={row.studentNumber}
                        placeholder="Okul No"
                        onChange={(e) =>
                          setRows((prev) =>
                            updateOcrRowIdentityField(
                              prev,
                              row.rowId,
                              'studentNumber',
                              e.target.value,
                              ocrOutput?.words ?? [],
                              existingClassroomStudents
                            )
                          )
                        }
                        className={`w-full px-2.5 py-1.5 text-xs font-mono-num font-bold rounded-lg border ${
                          !row.studentNumber ||
                          row.uncertaintyFlags.includes(
                            'DUPLICATE_STUDENT_NUMBER'
                          )
                            ? 'border-red-400 bg-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Adı (Çok Sözcüklü Destekli)
                      </label>
                      <input
                        type="text"
                        aria-label={`${row.rowIndex}. Satır Öğrenci Adı`}
                        value={row.firstName}
                        placeholder="Adı (Örn: AYŞE NUR)"
                        onChange={(e) =>
                          setRows((prev) =>
                            updateOcrRowIdentityField(
                              prev,
                              row.rowId,
                              'firstName',
                              e.target.value,
                              ocrOutput?.words ?? [],
                              existingClassroomStudents
                            )
                          )
                        }
                        className={`w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border ${
                          row.firstName.trim().length < 2
                            ? 'border-red-400 bg-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Soyadı
                      </label>
                      <input
                        type="text"
                        aria-label={`${row.rowIndex}. Satır Öğrenci Soyadı`}
                        value={row.lastName}
                        placeholder="Soyadı (Örn: ÇELİK)"
                        onChange={(e) =>
                          setRows((prev) =>
                            updateOcrRowIdentityField(
                              prev,
                              row.rowId,
                              'lastName',
                              e.target.value,
                              ocrOutput?.words ?? [],
                              existingClassroomStudents
                            )
                          )
                        }
                        className={`w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border ${
                          row.lastName.trim().length < 2
                            ? 'border-red-400 bg-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                        Cinsiyet
                      </label>
                      <input
                        type="text"
                        aria-label={`${row.rowIndex}. Satır Cinsiyet`}
                        value={row.gender}
                        placeholder="K / E"
                        onChange={(e) =>
                          setRows((prev) =>
                            updateOcrRowIdentityField(
                              prev,
                              row.rowId,
                              'gender',
                              e.target.value,
                              ocrOutput?.words ?? [],
                              existingClassroomStudents
                            )
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono-num rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  {/* Non-Destructive Alternative OCR Suggestions */}
                  {row.suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-bold text-amber-900">
                        Alternatif Okuma Önerileri:
                      </span>
                      {row.suggestions.map((sug) => (
                        <button
                          key={sug.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRows((prev) =>
                              applyOcrFieldSuggestion(
                                prev,
                                row.rowId,
                                sug.id,
                                ocrOutput?.words ?? [],
                                existingClassroomStudents
                              )
                            );
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-[11px] font-semibold cursor-pointer"
                          title={sug.reason}
                        >
                          {sug.field === 'studentNumber'
                            ? 'Okul No'
                            : sug.field === 'firstName'
                            ? 'Adı'
                            : 'Soyadı'}
                          : &ldquo;{sug.suggestedText}&rdquo; Uygula
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Uncertainty Reasons & Validation Errors */}
                  {(row.validationErrors.length > 0 ||
                    row.uncertaintyReasons.length > 0) && (
                    <div className="space-y-1 pt-0.5">
                      {row.validationErrors.map((err, i) => (
                        <div
                          key={i}
                          className="text-[11px] font-semibold text-red-700 flex items-center gap-1"
                        >
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{err}</span>
                        </div>
                      ))}
                      {row.uncertaintyReasons.map((reason, i) => (
                        <div
                          key={i}
                          className="text-[11px] text-amber-900 flex items-center gap-1"
                        >
                          <span>• {reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Atomic Commit Footer */}
          <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="text-[11px] text-slate-600">
              {allApprovedAndValid ? (
                <span className="text-emerald-800 font-semibold">
                  Tüm satırlar doğrulandı ve onaylandı. Atomik kayıt için hazır.
                </span>
              ) : (
                <span>
                  Atomik kayıt için listedeki tüm satırların hatasız olması ve
                  öğretmen tarafından onaylanması gerekir ({approvedCount}/
                  {rows.length} onaylı).
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleAtomicCommit}
              disabled={!allApprovedAndValid}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
            >
              <Check className="w-4 h-4" />
              Onaylanan {rows.length} Öğrenciyi {activeClassName} Listesine
              Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
