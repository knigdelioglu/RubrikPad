import test from 'node:test';
import assert from 'node:assert/strict';
import type { OcrWordToken } from './ocrTypes.ts';
import {
  applyPerspectiveHomography,
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

  // 3. Large 12MP tablet photo (4000x3000) is proportionally planned to max 1800x1350
  const plan12Mp = validateAndPlanOcrImageDimensions(4000, 3000, 3 * 1024 * 1024);
  assert.equal(plan12Mp.valid, true);
  assert.equal(plan12Mp.wasDownscaled, true);
  assert.equal(plan12Mp.targetWidth, MAX_OCR_IMAGE_DIMENSION_PX);
  assert.equal(plan12Mp.targetHeight, 1350);

  // 4. Preprocessing an oversized gray image automatically caps dimensions at MAX_OCR_IMAGE_DIMENSION_PX
  const baseRef = createReferenceSampleGrayImage();
  const oversizedImage = upscaleGrayImageBilinear(baseRef, 2.4); // > 2100px wide
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


