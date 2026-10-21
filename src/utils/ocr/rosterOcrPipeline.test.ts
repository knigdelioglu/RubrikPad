import test from 'node:test';
import assert from 'node:assert/strict';
import type { OcrWordToken } from './ocrTypes.ts';
import {
  analyzeLiveScanFrameReadiness,
  applyPerspectiveHomography,
  cropGrayImageRegion,
  downscaleGrayImageBilinear,
  MAX_OCR_FILE_SIZE_BYTES,
  MAX_OCR_IMAGE_DIMENSION_PX,
  preprocessRosterImage,
  rotateGrayImage90n,
  upscaleGrayImageBilinear,
  validateAndPlanOcrImageDimensions,
} from './imagePreprocessor.ts';
import {
  LocalOcrEngineRegistry,
  renderSyntheticRosterTableToGrayImage,
} from './localOcrEngine.ts';
import { analyzeRosterTableGeometry } from './geometricTableParser.ts';
import {
  applyOcrFieldSuggestion,
  bulkApproveReliableOcrRows,
  commitVerifiedOcrRosterAtomically,
  evaluateRosterReliability,
  toggleOcrRowApproval,
  updateOcrRowIdentityField,
} from './rosterReliability.ts';
import {
  createChallengingSkewedSampleGrayImage,
  createRealisticCameraSampleGrayImage,
  createReferenceSampleGrayImage,
  evaluateRosterOcrAccuracyMetrics,
  reparseOcrWithColumnRoles,
  runLocalRosterOcrPipeline,
  runLocalRosterOcrPipelineAsync,
  runRealisticCameraOcrBenchmarkSuite,
} from './rosterOcrPipeline.ts';

test('OCR #1: End-to-end local OCR on reference table extracts exact multi-word Turkish names, school numbers, gender, and cell coordinates', async () => {
  const refImage = createReferenceSampleGrayImage();
  const result = await runLocalRosterOcrPipeline(refImage, []);

  assert.equal(result.ocrOutput.isLocalOnly, true);
  assert.equal(result.tableAnalysis.headerDetected, true);
  assert.equal(result.verifiedRows.length, 2);

  const row1 = result.verifiedRows[0];
  assert.equal(row1.sequenceNumber, 1);
  assert.equal(row1.studentNumber, '245');
  assert.equal(row1.firstName, 'AYŞE NUR');
  assert.equal(row1.lastName, 'ÇELİK');
  assert.equal(row1.gender, 'K');
  assert.equal(row1.fullName, 'AYŞE NUR ÇELİK');
  assert.ok(row1.cellBboxes.studentNumber);
  assert.ok(row1.cellBboxes.firstName);
  assert.ok(row1.cellBboxes.lastName);
  assert.ok(
    row1.cellBboxes.studentNumber.x1 < row1.cellBboxes.firstName.x0,
    'Student number cell is geometrically to the left of firstName cell'
  );

  const row2 = result.verifiedRows[1];
  assert.equal(row2.sequenceNumber, 2);
  assert.equal(row2.studentNumber, '246');
  assert.equal(row2.firstName, 'MEHMET');
  assert.equal(row2.lastName, 'DEMİR');
  assert.equal(row2.gender, 'E');
  assert.equal(row2.fullName, 'MEHMET DEMİR');
});

test('OCR #2: Geometric table parser uses physical 2D coordinates (not array reading order) and NEVER borrows surnames or numbers from adjacent rows', () => {
  // Deliberately scramble token array order AND leave Row 1 surname blank
  // Row 2 has surname "DEMİR" and Row 3 has missing school number
  const scrambledTokens: OcrWordToken[] = [
    // Row 2 tokens placed first in array
    { id: 't-r2-last', text: 'DEMİR', confidence: 96, bbox: { x0: 540, y0: 150, x1: 630, y1: 175 } },
    { id: 't-r2-first', text: 'MEHMET', confidence: 96, bbox: { x0: 310, y0: 151, x1: 420, y1: 175 } },
    { id: 't-r2-num', text: '246', confidence: 98, bbox: { x0: 145, y0: 150, x1: 195, y1: 174 } },
    { id: 't-r2-seq', text: '2', confidence: 98, bbox: { x0: 45, y0: 150, x1: 62, y1: 174 } },
    { id: 't-r2-gen', text: 'E', confidence: 97, bbox: { x0: 740, y0: 150, x1: 758, y1: 174 } },

    // Header tokens placed in middle of array
    { id: 'h-last', text: 'Soyadı', confidence: 99, bbox: { x0: 535, y0: 30, x1: 625, y1: 55 } },
    { id: 'h-seq', text: 'Sıra', confidence: 99, bbox: { x0: 35, y0: 30, x1: 85, y1: 55 } },
    { id: 'h-num', text: 'Okul No', confidence: 99, bbox: { x0: 130, y0: 30, x1: 225, y1: 55 } },
    { id: 'h-first', text: 'Adı', confidence: 99, bbox: { x0: 320, y0: 30, x1: 375, y1: 55 } },
    { id: 'h-gen', text: 'Cinsiyet', confidence: 99, bbox: { x0: 710, y0: 30, x1: 805, y1: 55 } },

    // Row 1 tokens: multi-word first name "AYŞE" + "NUR", NO surname token at all!
    { id: 't-r1-first2', text: 'NUR', confidence: 95, bbox: { x0: 385, y0: 90, x1: 440, y1: 114 } },
    { id: 't-r1-first1', text: 'AYŞE', confidence: 95, bbox: { x0: 300, y0: 90, x1: 372, y1: 114 } },
    { id: 't-r1-num', text: '245', confidence: 98, bbox: { x0: 145, y0: 90, x1: 195, y1: 114 } },
    { id: 't-r1-seq', text: '1', confidence: 98, bbox: { x0: 45, y0: 90, x1: 62, y1: 114 } },
    { id: 't-r1-gen', text: 'K', confidence: 97, bbox: { x0: 740, y0: 90, x1: 758, y1: 114 } },

    // Row 3 tokens: missing school number, has firstName "ZEYNEP" and lastName "KAYA"
    { id: 't-r3-seq', text: '3', confidence: 97, bbox: { x0: 45, y0: 210, x1: 62, y1: 234 } },
    { id: 't-r3-first', text: 'ZEYNEP', confidence: 95, bbox: { x0: 310, y0: 210, x1: 410, y1: 234 } },
    { id: 't-r3-last', text: 'KAYA', confidence: 96, bbox: { x0: 540, y0: 210, x1: 615, y1: 234 } },
  ];

  const analysis = analyzeRosterTableGeometry(scrambledTokens);
  const evaluated = evaluateRosterReliability(analysis.rows, scrambledTokens, []);

  assert.equal(evaluated.length, 3);

  // Row 1 must have firstName "AYŞE NUR" and empty lastName "" (must NOT steal "DEMİR" from Row 2!)
  assert.equal(evaluated[0].studentNumber, '245');
  assert.equal(evaluated[0].firstName, 'AYŞE NUR');
  assert.equal(evaluated[0].lastName, '');
  assert.ok(evaluated[0].uncertaintyFlags.includes('MISSING_LAST_NAME'));

  // Row 2 keeps "MEHMET" and "DEMİR" intact
  assert.equal(evaluated[1].studentNumber, '246');
  assert.equal(evaluated[1].firstName, 'MEHMET');
  assert.equal(evaluated[1].lastName, 'DEMİR');
  assert.equal(evaluated[1].reliabilityLevel, 'high');

  // Row 3 is preserved even though school number is missing (must NOT steal 246 or invent a number!)
  assert.equal(evaluated[2].studentNumber, '');
  assert.equal(evaluated[2].firstName, 'ZEYNEP');
  assert.equal(evaluated[2].lastName, 'KAYA');
  assert.ok(evaluated[2].uncertaintyFlags.includes('MISSING_STUDENT_NUMBER'));
});

test('OCR #3: Missing student detection identifies sequence number gaps and vertical spacing gaps without inventing numbers or names', async () => {
  const skewedWithGap = createChallengingSkewedSampleGrayImage();
  const result = await runLocalRosterOcrPipeline(skewedWithGap, []);

  // Table had rows at Sıra 1, Sıra 2 (missing surname), blank Sıra 3, and Sıra 4
  assert.equal(result.verifiedRows.length, 4);

  // Row 1: Complete
  assert.equal(result.verifiedRows[0].studentNumber, '310');
  assert.equal(result.verifiedRows[0].firstName, 'AYŞE NUR');
  assert.equal(result.verifiedRows[0].lastName, 'ÇELİK');

  // Row 2: Missing surname (did not borrow KAYA from Row 4!)
  assert.equal(result.verifiedRows[1].studentNumber, '311');
  assert.equal(result.verifiedRows[1].firstName, 'MEHMET');
  assert.equal(result.verifiedRows[1].lastName, '');

  // Row 3: Missing gap candidate inserted between Sıra 2 and Sıra 4
  const gapRow = result.verifiedRows[2];
  assert.equal(gapRow.rowKind, 'missing_gap_candidate');
  assert.equal(gapRow.sequenceNumber, 3);
  assert.equal(gapRow.studentNumber, '');
  assert.equal(gapRow.firstName, '');
  assert.equal(gapRow.lastName, '');
  assert.ok(gapRow.uncertaintyFlags.includes('MISSING_ROW_GAP'));
  assert.ok(gapRow.uncertaintyFlags.includes('SEQUENCE_GAP'));

  // Row 4: Preserved after the gap
  assert.equal(result.verifiedRows[3].studentNumber, '313');
  assert.equal(result.verifiedRows[3].firstName, 'ZEYNEP');
  assert.equal(result.verifiedRows[3].lastName, 'KAYA');
});

test('OCR #4: Image preprocessing handles 90-degree sideways rotation, skew deskewing, and perspective homography rectification', async () => {
  const upright = createReferenceSampleGrayImage();
  // Rotate 270 deg so that 90 deg clockwise restores upright orientation
  const sideways = rotateGrayImage90n(upright, 270);

  const prep = preprocessRosterImage(sideways, { autoOrient: true });
  assert.equal(prep.diagnostics.appliedRotationDeg, 90);
  assert.equal(prep.grayImage.width, upright.width);
  assert.equal(prep.grayImage.height, upright.height);

  // Test perspective homography rectification on a trapezoidal quad
  const warped = applyPerspectiveHomography(
    upright,
    [
      { x: 5, y: 5 },
      { x: upright.width - 5, y: 8 },
      { x: upright.width - 5, y: upright.height - 5 },
      { x: 5, y: upright.height - 8 },
    ],
    upright.width,
    upright.height
  );
  assert.equal(warped.width, upright.width);
  assert.equal(warped.height, upright.height);
});

test('OCR #5: Headerless table recovery infers candidate columns and allows teacher column role remapping without losing coordinates', async () => {
  const headerlessImg = renderSyntheticRosterTableToGrayImage({
    // No headers row!
    rows: [
      ['1', '245', 'AYŞE NUR', 'ÇELİK', 'K'],
      ['2', '246', 'MEHMET', 'DEMİR', 'E'],
    ],
    columnWidths: [105, 165, 250, 210, 145],
    rowHeight: 58,
    drawGridLines: true,
  });

  const pipelineRes = await runLocalRosterOcrPipeline(headerlessImg, []);
  assert.equal(pipelineRes.tableAnalysis.headerDetected, false);
  assert.equal(pipelineRes.tableAnalysis.headerlessRecoveryRequired, true);
  assert.equal(pipelineRes.verifiedRows.length, 2);

  // Inferred columns should still extract 245 / AYŞE NUR / ÇELİK and 246 / MEHMET / DEMİR
  assert.equal(pipelineRes.verifiedRows[0].studentNumber, '245');
  assert.equal(pipelineRes.verifiedRows[0].firstName, 'AYŞE NUR');
  assert.equal(pipelineRes.verifiedRows[0].lastName, 'ÇELİK');

  // Teacher can explicitly confirm/override column roles via reparseOcrWithColumnRoles
  const remapped = reparseOcrWithColumnRoles(
    pipelineRes.ocrOutput,
    {
      0: 'sequence',
      1: 'studentNumber',
      2: 'firstName',
      3: 'lastName',
      4: 'gender',
    },
    true,
    []
  );
  assert.equal(remapped.tableAnalysis.headerlessRecoveryRequired, false);
  assert.equal(remapped.verifiedRows[0].studentNumber, '245');
  assert.equal(remapped.verifiedRows[1].studentNumber, '246');
});

test('OCR #6: Smart uncertainty engine generates non-destructive suggestions, never auto-merges similar names, invalidates approval on edit, and enforces atomic commit', () => {
  const tokens: OcrWordToken[] = [
    { id: 'h1', text: 'Okul No', confidence: 99, bbox: { x0: 50, y0: 20, x1: 130, y1: 45 } },
    { id: 'h2', text: 'Adı', confidence: 99, bbox: { x0: 200, y0: 20, x1: 260, y1: 45 } },
    { id: 'h3', text: 'Soyadı', confidence: 99, bbox: { x0: 380, y0: 20, x1: 460, y1: 45 } },

    // Row 1: Valid high-confidence student "246 MEHMET DEMİR"
    { id: 'r1-n', text: '246', confidence: 98, bbox: { x0: 60, y0: 80, x1: 110, y1: 105 } },
    { id: 'r1-f', text: 'MEHMET', confidence: 97, bbox: { x0: 200, y0: 80, x1: 295, y1: 105 } },
    { id: 'r1-l', text: 'DEMİR', confidence: 97, bbox: { x0: 380, y0: 80, x1: 455, y1: 105 } },

    // Row 2: Another student with the EXACT SAME NAME "MEHMET DEMİR" but different school number "289"
    { id: 'r2-n', text: '289', confidence: 98, bbox: { x0: 60, y0: 140, x1: 110, y1: 165 } },
    { id: 'r2-f', text: 'MEHMET', confidence: 97, bbox: { x0: 200, y0: 140, x1: 295, y1: 165 } },
    { id: 'r2-l', text: 'DEMİR', confidence: 97, bbox: { x0: 380, y0: 140, x1: 455, y1: 165 } },

    // Row 3: Ambiguous number "24S" and ASCII surname "CELIK" (should generate suggestions, NOT auto-apply!)
    { id: 'r3-n', text: '24S', confidence: 76, bbox: { x0: 60, y0: 200, x1: 110, y1: 225 } },
    { id: 'r3-f', text: 'AYŞE', confidence: 95, bbox: { x0: 200, y0: 200, x1: 270, y1: 225 } },
    { id: 'r3-l', text: 'CELIK', confidence: 82, bbox: { x0: 380, y0: 200, x1: 455, y1: 225 } },
  ];

  const geo = analyzeRosterTableGeometry(tokens);
  let rows = evaluateRosterReliability(geo.rows, tokens, []);

  // Both MEHMET DEMİR students are preserved separately (never auto-merged!) and flagged with SIMILAR_STUDENT_NAME
  assert.equal(rows.length, 3);
  assert.equal(rows[0].studentNumber, '246');
  assert.equal(rows[1].studentNumber, '289');
  assert.ok(rows[0].uncertaintyFlags.includes('SIMILAR_STUDENT_NAME'));
  assert.ok(rows[1].uncertaintyFlags.includes('SIMILAR_STUDENT_NAME'));

  // Row 3 has raw values "24S" and "CELIK" preserved, with suggestions "245" and "ÇELİK"
  assert.equal(rows[2].studentNumber, '24S');
  assert.equal(rows[2].lastName, 'CELIK');
  const numSug = rows[2].suggestions.find((s) => s.field === 'studentNumber');
  const lastSug = rows[2].suggestions.find((s) => s.field === 'lastName');
  assert.ok(numSug && numSug.suggestedText === '245');
  assert.ok(lastSug && lastSug.suggestedText === 'ÇELİK');

  // Apply suggestions via teacher action
  rows = applyOcrFieldSuggestion(rows, rows[2].rowId, numSug.id, tokens, []);
  rows = applyOcrFieldSuggestion(rows, rows[2].rowId, lastSug.id, tokens, []);
  assert.equal(rows[2].studentNumber, '245');
  assert.equal(rows[2].lastName, 'ÇELİK');
  assert.equal(rows[2].reliabilityLevel, 'high');

  // Bulk approve reliable rows: Row 3 is 'high' so it gets approved; Rows 1 & 2 have SIMILAR_STUDENT_NAME ('review_required') so they require individual review!
  const bulkRes = bulkApproveReliableOcrRows(rows, tokens, []);
  rows = bulkRes.rows;
  assert.equal(bulkRes.newlyApprovedCount, 1);
  assert.equal(bulkRes.skippedUncertainCount, 2);
  assert.equal(rows[2].approvedByTeacher, true);
  assert.equal(rows[0].approvedByTeacher, false);

  // Attempting atomic commit while Rows 1 & 2 are unapproved MUST fail atomically with 0 students created
  const failedCommit = commitVerifiedOcrRosterAtomically(rows, 'cls-1', []);
  assert.equal(failedCommit.ok, false);
  assert.equal(failedCommit.createdStudents.length, 0);

  // Teacher manually approves Row 1 and Row 2 after checking their distinct school numbers
  rows = toggleOcrRowApproval(rows, rows[0].rowId, tokens, []);
  rows = toggleOcrRowApproval(rows, rows[1].rowId, tokens, []);
  assert.equal(rows[0].approvedByTeacher, true);
  assert.equal(rows[1].approvedByTeacher, true);

  // Now teacher edits Row 3's firstName ("AYŞE" -> "AYŞE NUR") -> Previous approval MUST be invalidated!
  rows = updateOcrRowIdentityField(
    rows,
    rows[2].rowId,
    'firstName',
    'AYŞE NUR',
    tokens,
    []
  );
  assert.equal(
    rows[2].approvedByTeacher,
    false,
    'Editing student identity must invalidate previous approval'
  );

  // Re-approve Row 3 and commit atomically
  rows = toggleOcrRowApproval(rows, rows[2].rowId, tokens, []);
  const successCommit = commitVerifiedOcrRosterAtomically(rows, 'cls-1', []);
  assert.equal(successCommit.ok, true);
  assert.equal(successCommit.createdStudents.length, 3);
});

test('OCR #7: LocalOcrEngineRegistry enforces local-only engine contract', () => {
  const registry = new LocalOcrEngineRegistry();
  assert.equal(registry.getActiveEngine().isLocalOnly, true);

  // Attempting to register an engine without isLocalOnly: true throws
  assert.throws(() => {
    registry.registerAdapter({
      engineId: 'cloud-bad',
      engineName: 'Cloud OCR',
      isLocalOnly: false as unknown as true,
      recognizeImage: async () => {
        throw new Error('not local');
      },
    });
  }, /Güvenlik İhlali/);
});

test('OCR #8: Real camera classroom roster photos benchmark suite verifies >=98% character accuracy, 100% row identity match, 0 cross-row contamination, and fast stage-by-stage performance', async () => {
  const cameraSample = createRealisticCameraSampleGrayImage();
  const samplePipeline = await runLocalRosterOcrPipeline(cameraSample, []);

  assert.ok(samplePipeline.performanceMetrics.totalDurationMs > 0);
  assert.ok(samplePipeline.performanceMetrics.preprocessingAndOcrMs > 0);
  assert.ok(samplePipeline.performanceMetrics.throughputRowsPerSec > 0);
  assert.equal(samplePipeline.verifiedRows.length, 4);

  const sampleAccuracy = evaluateRosterOcrAccuracyMetrics(
    samplePipeline.verifiedRows,
    [
      { sequenceNumber: 1, studentNumber: '245', firstName: 'AYŞE NUR', lastName: 'ÇELİK', gender: 'K' },
      { sequenceNumber: 2, studentNumber: '246', firstName: 'MEHMET', lastName: 'DEMİR', gender: 'E' },
      { sequenceNumber: 3, studentNumber: '247', firstName: 'ÖMER FARUK', lastName: 'ŞAHİN', gender: 'E' },
      { sequenceNumber: 4, studentNumber: '248', firstName: 'ZEYNEP', lastName: 'GÜNEŞ', gender: 'K' },
    ]
  );

  assert.equal(sampleAccuracy.studentNumberExactMatchRate, 100);
  assert.equal(sampleAccuracy.rowIdentityMatchRate, 100);
  assert.equal(sampleAccuracy.zeroCrossRowContamination, true);
  assert.ok(sampleAccuracy.characterAccuracyPercent >= 98);

  // Run full 4-scenario real camera benchmark suite (shadows, lens blur, perspective pinch, bold/thin strokes, +3.5°/-2.8°/+4.0° skew, missing row gap)
  const suiteSummary = await runRealisticCameraOcrBenchmarkSuite();
  assert.equal(suiteSummary.scenarios.length, 4);
  for (const sc of suiteSummary.scenarios) {
    assert.equal(
      sc.passed,
      true,
      `Scenario ${sc.scenarioId} failed: accuracy=${JSON.stringify(sc.accuracy)}`
    );
    assert.equal(sc.accuracy.studentNumberExactMatchRate, 100);
    assert.equal(sc.accuracy.rowIdentityMatchRate, 100);
    assert.equal(sc.accuracy.zeroCrossRowContamination, true);
    assert.ok(sc.accuracy.characterAccuracyPercent >= 98);
    assert.ok(sc.performance.totalDurationMs < 5000);
  }
  assert.equal(suiteSummary.allPassed, true);
  assert.equal(suiteSummary.allZeroCrossRowContamination, true);
  assert.ok(suiteSummary.averageCharacterAccuracyPercent >= 98);
  assert.equal(suiteSummary.averageRowIdentityMatchRate, 100);
});

test('OCR #9: Oversized camera photos are bounded by validateAndPlanOcrImageDimensions and automatically downscaled in preprocessRosterImage to prevent tablet UI freezes', async () => {
  // 1. File size limit guard (>15 MB rejected)
  const overFileLimit = validateAndPlanOcrImageDimensions(
    2000,
    1500,
    MAX_OCR_FILE_SIZE_BYTES + 1024
  );
  assert.equal(overFileLimit.valid, false);
  assert.ok(overFileLimit.error?.includes('MB'));

  // 2. Extreme megapixel guard (>25 MP rejected)
  const overMpLimit = validateAndPlanOcrImageDimensions(6000, 5000, 4 * 1024 * 1024);
  assert.equal(overMpLimit.valid, false);
  assert.ok(overMpLimit.error?.includes('MP'));

  // 3. Large 12MP tablet photo (4000x3000) is proportionally planned to max MAX_OCR_IMAGE_DIMENSION_PX (3200x2400) so high-res roster detail is preserved
  const plan12Mp = validateAndPlanOcrImageDimensions(4000, 3000, 3 * 1024 * 1024);
  assert.equal(plan12Mp.valid, true);
  assert.equal(plan12Mp.wasDownscaled, true);
  assert.equal(plan12Mp.targetWidth, MAX_OCR_IMAGE_DIMENSION_PX);
  assert.equal(plan12Mp.targetHeight, 2400);

  // 4. Preprocessing an oversized gray image (>3200px) automatically caps dimensions at MAX_OCR_IMAGE_DIMENSION_PX
  const baseRef = createReferenceSampleGrayImage();
  const oversizedImage = upscaleGrayImageBilinear(baseRef, 3.6); // > 3300px wide
  assert.ok(oversizedImage.width > MAX_OCR_IMAGE_DIMENSION_PX);

  const prepped = preprocessRosterImage(oversizedImage);
  assert.ok(
    Math.max(prepped.grayImage.width, prepped.grayImage.height) <=
      MAX_OCR_IMAGE_DIMENSION_PX
  );
  assert.ok((prepped.diagnostics.downscaleFactor ?? 1) < 1);

  const downscaledDirect = downscaleGrayImageBilinear(oversizedImage, 1500);
  assert.equal(downscaledDirect.image.width, 1500);
  assert.ok(downscaledDirect.downscaleFactor < 1);

  // 5. Async pipeline wrapper executes cleanly and preserves full accuracy
  const asyncResult = await runLocalRosterOcrPipelineAsync(oversizedImage, []);
  assert.equal(asyncResult.verifiedRows.length, 2);
  assert.equal(asyncResult.verifiedRows[0].studentNumber, '245');
  assert.equal(asyncResult.verifiedRows[1].studentNumber, '246');
  assert.ok((asyncResult.performanceMetrics.downscaleFactor ?? 1) < 1);
});

test('OCR #10: Live camera scanner readiness analyzer and real-photo border frame / combined column resilience', async () => {
  const cameraSample = createRealisticCameraSampleGrayImage();
  const readiness = analyzeLiveScanFrameReadiness(cameraSample);

  assert.equal(readiness.isReadyToScan, true);
  assert.ok(readiness.contrastScore >= 28);
  assert.ok(readiness.sharpnessScore >= 20);
  assert.ok(readiness.estimatedRowCount >= 3);

  const cropped = cropGrayImageRegion(
    cameraSample,
    10,
    10,
    cameraSample.width - 20,
    cameraSample.height - 20
  );
  assert.equal(cropped.width, cameraSample.width - 20);
  assert.equal(cropped.height, cameraSample.height - 20);

  // Simulate a photo with dark desk/border margins along the left and right edges
  const withDarkMargins = {
    width: cameraSample.width,
    height: cameraSample.height,
    data: new Uint8Array(cameraSample.data),
  };
  for (let y = 0; y < withDarkMargins.height; y++) {
    for (let x = 0; x < 6; x++) {
      withDarkMargins.data[y * withDarkMargins.width + x] = 15;
      withDarkMargins.data[
        y * withDarkMargins.width + (withDarkMargins.width - 1 - x)
      ] = 15;
    }
  }

  const pipelineRes = await runLocalRosterOcrPipelineAsync(withDarkMargins, []);
  assert.equal(
    pipelineRes.verifiedRows.length,
    4,
    `Expected all 4 extracted rows from bordered camera photo, got ${pipelineRes.verifiedRows.length}`
  );
  assert.equal(pipelineRes.verifiedRows[0].studentNumber, '245');
  assert.equal(pipelineRes.verifiedRows[0].firstName, 'AYŞE NUR');
  assert.equal(pipelineRes.verifiedRows[0].lastName, 'ÇELİK');
  assert.equal(pipelineRes.verifiedRows[3].studentNumber, '248');
});

test('OCR #11: Android Google ML Kit Text Recognition v2 Capacitor adapter processes hierarchical Blocks/Lines/Elements/Symbols, normalizes Turkish characters, splits border-glued tokens, and prevents neighbor student row contamination', async () => {
  const {
    CapacitorMlKitOcrEngine,
    convertMlKitResponseToWordTokens,
    encodeGrayImageToPngBase64,
    normalizeMlKitTurkishToken,
  } = await import('./mlKitOcrEngine.ts');
  const { SelfContainedTurkishOcrEngine } = await import('./localOcrEngine.ts');
  const { parseGroundTruthRosterText } = await import('./rosterOcrPipeline.ts');

  // 1. Verify PNG Base64 encoder preserves valid PNG signature and exact dimensions
  const sampleImg = createReferenceSampleGrayImage();
  const b64 = encodeGrayImageToPngBase64(sampleImg);
  assert.ok(b64.startsWith('iVBORw0KGgo'), 'Encoded Base64 must start with PNG magic header');

  // 2. Verify Turkish token normalizer repairs Latin diacritic drops and border artifacts
  const normCelik = normalizeMlKitTurkishToken('|CELIK|', 0.94);
  assert.equal(normCelik.text, 'ÇELİK');
  assert.ok(normCelik.alternatives.some((a) => a.text === 'CELIK'));

  const normAyse = normalizeMlKitTurkishToken('AYSE', 0.91);
  assert.equal(normAyse.text, 'AYŞE');

  const normNum = normalizeMlKitTurkishToken('24S', 0.89, 'studentNumber');
  assert.equal(normNum.text, '245');

  // 3. Simulate a realistic Android Google ML Kit v2 native payload with:
  //    - Pipe-glued tokens ("1|245")
  //    - Dropped Turkish diacritics ("AYSE", "CELIK", "OMER", "SAHIN", "GUNES")
  //    - Tightly spaced neighbor rows (Row 1 at y=92..116, Row 2 at y=126..150, Row 3 at y=160..184)
  //    - Row 2 missing surname (must NOT borrow SAHIN from Row 3!)
  const mockMlKitBridge = {
    getCapabilities: async () => ({
      available: true,
      engineId: 'google-mlkit-text-recognition-v2-latin',
      engineName: 'Google ML Kit Text Recognition v2 (Android Yerel / Cihaz İçi)',
      isLocalOnly: true,
      script: 'latin-turkish',
    }),
    recognizeText: async () => ({
      text: 'SIRA OKUL NO ADI SOYADI CINSIYET\n1|245 AYSE NUR CELIK K\n2 246 MEHMET E\n3 247 OMER FARUK SAHIN E',
      imageWidth: sampleImg.width,
      imageHeight: sampleImg.height,
      elapsedMs: 18.4,
      isLocalOnly: true as const,
      blocks: [
        {
          blockIndex: 0,
          text: 'SIRA OKUL NO ADI SOYADI CINSIYET',
          bbox: { x0: 40, y0: 30, x1: 820, y1: 60 },
          lines: [
            {
              lineIndex: 0,
              text: 'SIRA OKUL NO ADI SOYADI CINSIYET',
              confidence: 98,
              angle: 0.4,
              bbox: { x0: 40, y0: 30, x1: 820, y1: 60 },
              elements: [
                { elementIndex: 0, text: 'SIRA', confidence: 99, angle: 0.4, bbox: { x0: 45, y0: 32, x1: 100, y1: 58 } },
                { elementIndex: 1, text: 'OKUL', confidence: 98, angle: 0.4, bbox: { x0: 150, y0: 32, x1: 205, y1: 58 } },
                { elementIndex: 2, text: 'NO', confidence: 98, angle: 0.4, bbox: { x0: 215, y0: 32, x1: 250, y1: 58 } },
                { elementIndex: 3, text: 'ADI', confidence: 99, angle: 0.4, bbox: { x0: 340, y0: 32, x1: 395, y1: 58 } },
                { elementIndex: 4, text: 'SOYADI', confidence: 99, angle: 0.4, bbox: { x0: 570, y0: 32, x1: 665, y1: 58 } },
                { elementIndex: 5, text: 'CINSIYET', confidence: 98, angle: 0.4, bbox: { x0: 750, y0: 32, x1: 835, y1: 58 } },
              ],
            },
          ],
        },
        {
          blockIndex: 1,
          text: 'Body rows',
          bbox: { x0: 40, y0: 90, x1: 820, y1: 200 },
          lines: [
            {
              lineIndex: 0,
              text: '1|245 AYSE NUR CELIK K',
              confidence: 95,
              angle: 0.4,
              bbox: { x0: 45, y0: 92, x1: 800, y1: 116 },
              elements: [
                // Element 0 has '1|245' glued by table border pipe; symbols split it!
                {
                  elementIndex: 0,
                  text: '1|245',
                  confidence: 94,
                  angle: 0.4,
                  bbox: { x0: 55, y0: 92, x1: 225, y1: 116 },
                  symbols: [
                    { symbolIndex: 0, text: '1', confidence: 97, angle: 0.4, bbox: { x0: 55, y0: 92, x1: 72, y1: 116 } },
                    { symbolIndex: 1, text: '|', confidence: 70, angle: 0.4, bbox: { x0: 132, y0: 90, x1: 135, y1: 118 } },
                    { symbolIndex: 2, text: '2', confidence: 96, angle: 0.4, bbox: { x0: 165, y0: 92, x1: 182, y1: 116 } },
                    { symbolIndex: 3, text: '4', confidence: 96, angle: 0.4, bbox: { x0: 185, y0: 92, x1: 202, y1: 116 } },
                    { symbolIndex: 4, text: '5', confidence: 95, angle: 0.4, bbox: { x0: 205, y0: 92, x1: 225, y1: 116 } },
                  ],
                },
                { elementIndex: 1, text: 'AYSE', confidence: 94, angle: 0.4, bbox: { x0: 325, y0: 92, x1: 390, y1: 116 } },
                { elementIndex: 2, text: 'NUR', confidence: 96, angle: 0.4, bbox: { x0: 405, y0: 92, x1: 460, y1: 116 } },
                { elementIndex: 3, text: 'CELIK', confidence: 93, angle: 0.4, bbox: { x0: 575, y0: 92, x1: 655, y1: 116 } },
                { elementIndex: 4, text: 'K', confidence: 97, angle: 0.4, bbox: { x0: 775, y0: 92, x1: 795, y1: 116 } },
              ],
            },
            {
              lineIndex: 1,
              text: '2 246 MEHMET E',
              confidence: 95,
              angle: 0.4,
              bbox: { x0: 55, y0: 126, x1: 795, y1: 150 },
              elements: [
                { elementIndex: 0, text: '2', confidence: 98, angle: 0.4, bbox: { x0: 55, y0: 126, x1: 72, y1: 150 } },
                { elementIndex: 1, text: '246', confidence: 98, angle: 0.4, bbox: { x0: 165, y0: 126, x1: 225, y1: 150 } },
                { elementIndex: 2, text: 'MEHMET', confidence: 96, angle: 0.4, bbox: { x0: 330, y0: 126, x1: 440, y1: 150 } },
                // Notice: NO surname on Row 2!
                { elementIndex: 3, text: 'E', confidence: 97, angle: 0.4, bbox: { x0: 775, y0: 126, x1: 795, y1: 150 } },
              ],
            },
            {
              lineIndex: 2,
              text: '3 247 OMER FARUK SAHIN E',
              confidence: 95,
              angle: 0.4,
              bbox: { x0: 55, y0: 160, x1: 795, y1: 184 },
              elements: [
                { elementIndex: 0, text: '3', confidence: 98, angle: 0.4, bbox: { x0: 55, y0: 160, x1: 72, y1: 184 } },
                { elementIndex: 1, text: '247', confidence: 98, angle: 0.4, bbox: { x0: 165, y0: 160, x1: 225, y1: 184 } },
                { elementIndex: 2, text: 'OMER', confidence: 94, angle: 0.4, bbox: { x0: 325, y0: 160, x1: 390, y1: 184 } },
                { elementIndex: 3, text: 'FARUK', confidence: 96, angle: 0.4, bbox: { x0: 405, y0: 160, x1: 485, y1: 184 } },
                { elementIndex: 4, text: 'SAHIN', confidence: 93, angle: 0.4, bbox: { x0: 575, y0: 160, x1: 655, y1: 184 } },
                { elementIndex: 5, text: 'E', confidence: 97, angle: 0.4, bbox: { x0: 775, y0: 160, x1: 795, y1: 184 } },
              ],
            },
          ],
        },
      ],
    }),
  };

  const mlkitAdapter = new CapacitorMlKitOcrEngine(
    new SelfContainedTurkishOcrEngine(),
    mockMlKitBridge
  );
  assert.equal(mlkitAdapter.isLocalOnly, true);
  assert.equal(mlkitAdapter.isNativeAndroidAvailable(), true);

  const pipelineRes = await runLocalRosterOcrPipeline(sampleImg, [], {
    engine: mlkitAdapter,
  });

  assert.equal(pipelineRes.ocrOutput.engineId, 'google-mlkit-android-v2');
  assert.equal(pipelineRes.verifiedRows.length, 3);

  // Row 1: "1|245" was cleanly split into sequence=1 and studentNumber="245", "AYSE NUR" -> "AYŞE NUR", "CELIK" -> "ÇELİK"
  assert.equal(pipelineRes.verifiedRows[0].sequenceNumber, 1);
  assert.equal(pipelineRes.verifiedRows[0].studentNumber, '245');
  assert.equal(pipelineRes.verifiedRows[0].firstName, 'AYŞE NUR');
  assert.equal(pipelineRes.verifiedRows[0].lastName, 'ÇELİK');

  // Row 2: Missing surname stays empty "" and NEVER steals ÇELİK (Row 1) or ŞAHİN (Row 3)
  assert.equal(pipelineRes.verifiedRows[1].sequenceNumber, 2);
  assert.equal(pipelineRes.verifiedRows[1].studentNumber, '246');
  assert.equal(pipelineRes.verifiedRows[1].firstName, 'MEHMET');
  assert.equal(pipelineRes.verifiedRows[1].lastName, '');
  assert.ok(pipelineRes.verifiedRows[1].uncertaintyFlags.includes('MISSING_LAST_NAME'));

  // Row 3: "OMER FARUK" -> "ÖMER FARUK", "SAHIN" -> "ŞAHİN"
  assert.equal(pipelineRes.verifiedRows[2].sequenceNumber, 3);
  assert.equal(pipelineRes.verifiedRows[2].studentNumber, '247');
  assert.equal(pipelineRes.verifiedRows[2].firstName, 'ÖMER FARUK');
  assert.equal(pipelineRes.verifiedRows[2].lastName, 'ŞAHİN');

  // Verify Ground-Truth text parser & accuracy evaluator against this ML Kit run
  const gtList = parseGroundTruthRosterText(
    '245 | AYŞE NUR | ÇELİK | K\n246 | MEHMET |  | E\n247 | ÖMER FARUK | ŞAHİN | E'
  );
  assert.equal(gtList.length, 3);
  const acc = evaluateRosterOcrAccuracyMetrics(pipelineRes.verifiedRows, gtList);
  assert.equal(acc.studentNumberExactMatchRate, 100);
  assert.equal(acc.rowIdentityMatchRate, 100);
  assert.equal(acc.zeroCrossRowContamination, true);
  assert.equal(acc.characterAccuracyPercent, 100);
});

test('OCR #12: Confidence scores are never artificially inflated when OCR confidence is 0 or when words match the Turkish lexicon, preventing erroneous names from appearing reliable', async () => {
  const { normalizeMlKitTurkishToken } = await import('./mlKitOcrEngine.ts');

  // 1. OCR confidence 0 must remain 0 (never inflated to 92!)
  const zeroConfWord = normalizeMlKitTurkishToken('AYŞE', 0);
  assert.equal(zeroConfWord.text, 'AYŞE');
  assert.equal(zeroConfWord.confidence, 0);

  const zeroConfDiacritic = normalizeMlKitTurkishToken('CELIK', 0);
  assert.equal(zeroConfDiacritic.text, 'ÇELİK');
  assert.equal(zeroConfDiacritic.confidence, 0);

  const zeroConfNum = normalizeMlKitTurkishToken('245', 0, 'studentNumber');
  assert.equal(zeroConfNum.text, '245');
  assert.equal(zeroConfNum.confidence, 0);

  // 2. Lexicon words with low confidence (e.g. 58%) must keep 58% (never boosted to 95%!)
  const lowConfLexiconExact = normalizeMlKitTurkishToken('MEHMET', 0.58);
  assert.equal(lowConfLexiconExact.text, 'MEHMET');
  assert.equal(lowConfLexiconExact.confidence, 58);

  const lowConfLexiconDiacritic = normalizeMlKitTurkishToken('SAHIN', 0.62);
  assert.equal(lowConfLexiconDiacritic.text, 'ŞAHİN');
  assert.ok(
    lowConfLexiconDiacritic.confidence <= 62,
    `Expected confidence <= 62, got ${lowConfLexiconDiacritic.confidence}`
  );

  // 3. A row containing a 0% or 58% confidence dictionary name must be flagged as LOW_CONFIDENCE_OCR ('review_required') and skipped by bulkApproveReliableOcrRows
  const tokensWithLowConfName: OcrWordToken[] = [
    { id: 'h1', text: 'SIRA', confidence: 99, bbox: { x0: 40, y0: 20, x1: 90, y1: 45 } },
    { id: 'h2', text: 'OKUL NO', confidence: 99, bbox: { x0: 140, y0: 20, x1: 230, y1: 45 } },
    { id: 'h3', text: 'ADI', confidence: 99, bbox: { x0: 310, y0: 20, x1: 370, y1: 45 } },
    { id: 'h4', text: 'SOYADI', confidence: 99, bbox: { x0: 520, y0: 20, x1: 610, y1: 45 } },

    // Row 1: "MEHMET" has 0% confidence even though it's in the dictionary
    { id: 'r1-s', text: '1', confidence: 99, bbox: { x0: 45, y0: 85, x1: 65, y1: 110 } },
    { id: 'r1-n', text: '245', confidence: 99, bbox: { x0: 150, y0: 85, x1: 200, y1: 110 } },
    { id: 'r1-f', text: 'MEHMET', confidence: 0, bbox: { x0: 310, y0: 85, x1: 410, y1: 110 } },
    { id: 'r1-l', text: 'DEMİR', confidence: 96, bbox: { x0: 520, y0: 85, x1: 605, y1: 110 } },

    // Row 2: "AYŞE" has 58% confidence even though it's in the dictionary
    { id: 'r2-s', text: '2', confidence: 99, bbox: { x0: 45, y0: 145, x1: 65, y1: 170 } },
    { id: 'r2-n', text: '246', confidence: 99, bbox: { x0: 150, y0: 145, x1: 200, y1: 170 } },
    { id: 'r2-f', text: 'AYŞE', confidence: 58, bbox: { x0: 310, y0: 145, x1: 390, y1: 170 } },
    { id: 'r2-l', text: 'ÇELİK', confidence: 96, bbox: { x0: 520, y0: 145, x1: 605, y1: 170 } },
  ];

  const geo = analyzeRosterTableGeometry(tokensWithLowConfName);
  const evaluated = evaluateRosterReliability(geo.rows, tokensWithLowConfName, []);

  assert.equal(evaluated.length, 2);
  assert.equal(evaluated[0].confidence, 0);
  assert.ok(evaluated[0].uncertaintyFlags.includes('LOW_CONFIDENCE_OCR'));
  assert.equal(evaluated[0].reliabilityLevel, 'review_required');

  assert.ok(evaluated[1].confidence <= 66);
  assert.ok(evaluated[1].uncertaintyFlags.includes('LOW_CONFIDENCE_OCR'));
  assert.equal(evaluated[1].reliabilityLevel, 'review_required');

  // Bulk approval must NOT auto-approve either row!
  const bulk = bulkApproveReliableOcrRows(evaluated, tokensWithLowConfName, []);
  assert.equal(bulk.newlyApprovedCount, 0);
  assert.equal(bulk.skippedUncertainCount, 2);
});

test('OCR #13: ML Kit native bridge errors are never silently hidden; failure cause and actual executed fallback engine are transparently reported', async () => {
  const { CapacitorMlKitOcrEngine } = await import('./mlKitOcrEngine.ts');
  const { SelfContainedTurkishOcrEngine } = await import('./localOcrEngine.ts');

  const sampleImg = createReferenceSampleGrayImage();
  const browserFallback = new SelfContainedTurkishOcrEngine();

  // Case 1: Native Android bridge throws an exception during recognition
  const failingBridge = {
    getCapabilities: async () => ({
      available: true,
      engineId: 'google-mlkit-text-recognition-v2-latin',
      engineName: 'Google ML Kit Text Recognition v2',
      isLocalOnly: true,
      script: 'latin-turkish',
    }),
    recognizeText: async () => {
      throw new Error('ML Kit yerel modeli başlatılamadı (DynamiteModule hatası)');
    },
  };

  const engineWithFailingBridge = new CapacitorMlKitOcrEngine(
    browserFallback,
    failingBridge
  );
  const res1 = await runLocalRosterOcrPipeline(sampleImg, [], {
    engine: engineWithFailingBridge,
  });

  // Must explicitly report that fallback occurred, why it occurred, which engine was requested, and which engine actually ran!
  assert.equal(res1.ocrOutput.fallbackOccurred, true);
  assert.equal(res1.ocrOutput.requestedEngineId, 'google-mlkit-android-v2');
  assert.equal(res1.ocrOutput.engineId, 'rubrikpad-local-tur-v1');
  assert.ok(
    res1.ocrOutput.fallbackReason?.includes('DynamiteModule hatası'),
    `Expected fallbackReason to include exact error cause, got: ${res1.ocrOutput.fallbackReason}`
  );
  assert.ok(
    res1.ocrOutput.preprocessing.diagnostics.qualityWarnings.some((w) =>
      w.includes('DynamiteModule hatası')
    )
  );
  assert.equal(res1.verifiedRows.length, 2);

  // Case 2: Running in Web/Browser where native Android Capacitor bridge is inactive
  const engineWithoutNativeBridge = new CapacitorMlKitOcrEngine(browserFallback);
  const res2 = await runLocalRosterOcrPipeline(sampleImg, [], {
    engine: engineWithoutNativeBridge,
  });
  assert.equal(res2.ocrOutput.fallbackOccurred, true);
  assert.equal(res2.ocrOutput.requestedEngineId, 'google-mlkit-android-v2');
  assert.equal(res2.ocrOutput.engineId, 'rubrikpad-local-tur-v1');
  assert.ok(res2.ocrOutput.fallbackReason?.includes('aktif değil'));
});

test('OCR #14: Puanla order-preserving 1-to-1 surname matching algorithm resolves severe vertical surname column shift (+24px) without neighbor surname stealing', async () => {
  const { matchSurnamesOrderPreservingOneToOne } = await import(
    './geometricTableParser.ts'
  );

  // 4 student anchor rows at y = 102, 142, 182, 222 (40px row step)
  // Right-hand Soyadı column is shifted down by +24px due to page curl / perspective:
  // - Row 1 surname "ÇELİK" is at y=126 (which is 24px below Row 1=102, and only 16px above Row 2=142!)
  // - Row 2 ("246 MEHMET") has NO surname on the page!
  // - Row 3 surname "ŞAHİN" is at y=206 (closer in raw Y to Row 4=222 than Row 3=182!)
  // - Row 4 surname "GÜNEŞ" is at y=246
  const curledTableTokens: OcrWordToken[] = [
    { id: 'h-seq', text: 'SIRA', confidence: 99, bbox: { x0: 40, y0: 30, x1: 90, y1: 54 } },
    { id: 'h-num', text: 'OKUL NO', confidence: 99, bbox: { x0: 140, y0: 30, x1: 230, y1: 54 } },
    { id: 'h-first', text: 'ADI', confidence: 99, bbox: { x0: 310, y0: 30, x1: 375, y1: 54 } },
    { id: 'h-last', text: 'SOYADI', confidence: 99, bbox: { x0: 560, y0: 30, x1: 650, y1: 54 } },
    { id: 'h-gen', text: 'CİNSİYET', confidence: 99, bbox: { x0: 740, y0: 30, x1: 830, y1: 54 } },

    // Row 1 anchor at y=90..114 (center 102), Surname "ÇELİK" shifted down to y=114..138 (center 126)
    { id: 'r1-seq', text: '1', confidence: 98, bbox: { x0: 50, y0: 90, x1: 68, y1: 114 } },
    { id: 'r1-num', text: '245', confidence: 98, bbox: { x0: 155, y0: 90, x1: 205, y1: 114 } },
    { id: 'r1-f1', text: 'AYŞE', confidence: 96, bbox: { x0: 310, y0: 90, x1: 375, y1: 114 } },
    { id: 'r1-f2', text: 'NUR', confidence: 96, bbox: { x0: 385, y0: 90, x1: 440, y1: 114 } },
    { id: 'r1-last', text: 'ÇELİK', confidence: 95, bbox: { x0: 565, y0: 114, x1: 645, y1: 138 } },
    { id: 'r1-gen', text: 'K', confidence: 97, bbox: { x0: 765, y0: 114, x1: 785, y1: 138 } },

    // Row 2 anchor at y=130..154 (center 142), Surname is BLANK!
    { id: 'r2-seq', text: '2', confidence: 98, bbox: { x0: 50, y0: 130, x1: 68, y1: 154 } },
    { id: 'r2-num', text: '246', confidence: 98, bbox: { x0: 155, y0: 130, x1: 205, y1: 154 } },
    { id: 'r2-f1', text: 'MEHMET', confidence: 96, bbox: { x0: 310, y0: 130, x1: 415, y1: 154 } },
    { id: 'r2-gen', text: 'E', confidence: 97, bbox: { x0: 765, y0: 154, x1: 785, y1: 178 } },

    // Row 3 anchor at y=170..194 (center 182), Surname "ŞAHİN" shifted down to y=194..218 (center 206)
    { id: 'r3-seq', text: '3', confidence: 98, bbox: { x0: 50, y0: 170, x1: 68, y1: 194 } },
    { id: 'r3-num', text: '247', confidence: 98, bbox: { x0: 155, y0: 170, x1: 205, y1: 194 } },
    { id: 'r3-f1', text: 'ÖMER', confidence: 96, bbox: { x0: 310, y0: 170, x1: 375, y1: 194 } },
    { id: 'r3-f2', text: 'FARUK', confidence: 96, bbox: { x0: 385, y0: 170, x1: 465, y1: 194 } },
    { id: 'r3-last', text: 'ŞAHİN', confidence: 95, bbox: { x0: 565, y0: 194, x1: 645, y1: 218 } },
    { id: 'r3-gen', text: 'E', confidence: 97, bbox: { x0: 765, y0: 194, x1: 785, y1: 218 } },

    // Row 4 anchor at y=210..234 (center 222), Surname "GÜNEŞ" shifted down to y=234..258 (center 246)
    { id: 'r4-seq', text: '4', confidence: 98, bbox: { x0: 50, y0: 210, x1: 68, y1: 234 } },
    { id: 'r4-num', text: '248', confidence: 98, bbox: { x0: 155, y0: 210, x1: 205, y1: 234 } },
    { id: 'r4-f1', text: 'ZEYNEP', confidence: 96, bbox: { x0: 310, y0: 210, x1: 410, y1: 234 } },
    { id: 'r4-last', text: 'GÜNEŞ', confidence: 95, bbox: { x0: 565, y0: 234, x1: 645, y1: 258 } },
    { id: 'r4-gen', text: 'K', confidence: 97, bbox: { x0: 765, y0: 234, x1: 785, y1: 258 } },
  ];

  const analysis = analyzeRosterTableGeometry(curledTableTokens);
  assert.equal(analysis.surnameOrderAlignmentApplied, true);
  assert.equal(analysis.rows.length, 4);

  // Row 1 gets "ÇELİK"
  assert.equal(analysis.rows[0].studentNumber, '245');
  assert.equal(analysis.rows[0].firstName, 'AYŞE NUR');
  assert.equal(analysis.rows[0].lastName, 'ÇELİK');
  assert.equal(analysis.rows[0].gender, 'K');

  // Row 2 MUST stay empty "" and NOT steal "ÇELİK" even though "ÇELİK" (y=126) is only 16px from Row 2 (y=142)!
  assert.equal(analysis.rows[1].studentNumber, '246');
  assert.equal(analysis.rows[1].firstName, 'MEHMET');
  assert.equal(analysis.rows[1].lastName, '');
  assert.equal(analysis.rows[1].gender, 'E');

  // Row 3 gets "ŞAHİN"
  assert.equal(analysis.rows[2].studentNumber, '247');
  assert.equal(analysis.rows[2].firstName, 'ÖMER FARUK');
  assert.equal(analysis.rows[2].lastName, 'ŞAHİN');
  assert.equal(analysis.rows[2].gender, 'E');

  // Row 4 gets "GÜNEŞ"
  assert.equal(analysis.rows[3].studentNumber, '248');
  assert.equal(analysis.rows[3].firstName, 'ZEYNEP');
  assert.equal(analysis.rows[3].lastName, 'GÜNEŞ');
  assert.equal(analysis.rows[3].gender, 'K');

  // Verify direct call to matchSurnamesOrderPreservingOneToOne preserves strict monotonic order
  const directMatch = matchSurnamesOrderPreservingOneToOne(
    [
      { rowIndex: 0, anchorCorrectedY: 102, anchorRawY: 102 },
      { rowIndex: 1, anchorCorrectedY: 142, anchorRawY: 142 },
      { rowIndex: 2, anchorCorrectedY: 182, anchorRawY: 182 },
      { rowIndex: 3, anchorCorrectedY: 222, anchorRawY: 222 },
    ],
    [
      {
        candidateIndex: 0,
        tokens: [curledTableTokens[9]],
        text: 'ÇELİK',
        bbox: curledTableTokens[9].bbox,
        correctedY: 126,
        rawCenterY: 126,
      },
      {
        candidateIndex: 1,
        tokens: [curledTableTokens[19]],
        text: 'ŞAHİN',
        bbox: curledTableTokens[19].bbox,
        correctedY: 206,
        rawCenterY: 206,
      },
      {
        candidateIndex: 2,
        tokens: [curledTableTokens[24]],
        text: 'GÜNEŞ',
        bbox: curledTableTokens[24].bbox,
        correctedY: 246,
        rawCenterY: 246,
      },
    ],
    24,
    40
  );

  assert.equal(directMatch.estimatedColumnVerticalOffsetPx, 24);
  assert.equal(directMatch.alignmentPairs.length, 3);
  assert.deepEqual(
    directMatch.alignmentPairs.map((p) => p.rowIndex),
    [1, 3, 4]
  );
  assert.deepEqual(
    directMatch.alignmentPairs.map((p) => p.surnameText),
    ['ÇELİK', 'ŞAHİN', 'GÜNEŞ']
  );
});





