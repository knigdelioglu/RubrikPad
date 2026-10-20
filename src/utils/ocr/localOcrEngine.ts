import type {
  BoundingBox,
  ColumnRole,
  OcrCellReReadOutput,
  OcrEngineAdapter,
  OcrEngineOptions,
  OcrEngineOutput,
  OcrWordAlternative,
  OcrWordToken,
  RawBinaryImage,
  RawGrayImage,
} from './ocrTypes.ts';
import {
  adaptiveLocalBinarize,
  preprocessRosterImage,
  upscaleGrayImageBilinear,
} from './imagePreprocessor.ts';

const NORM_W = 16;
const NORM_H = 24;

interface GlyphTemplate {
  char: string;
  isDigit: boolean;
  isUpper: boolean;
  isLower: boolean;
  hasTopDiacritic: boolean;
  hasBottomDiacritic: boolean;
  aspectRatio: number;
  grid: Float32Array; // length NORM_W * NORM_H (0..1)
  smoothGrid: Float32Array; // 3x3 Gaussian-smoothed density grid for blur/font invariance
}

/**
 * Built-in 7x11 crisp bitmap patterns for deterministic glyph rendering in headless/Node
 * environments AND as baseline structural templates alongside browser Canvas fonts.
 */
const BUILTIN_BITMAP_FONT: Record<string, string[]> = {
  '0': [
    '  ###  ',
    ' #   # ',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    ' #   # ',
    '  ###  ',
  ],
  '1': [
    '   #   ',
    '  ##   ',
    ' # #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    ' ##### ',
  ],
  '2': [
    ' ##### ',
    '#     #',
    '      #',
    '     # ',
    '   ##  ',
    '  #    ',
    ' #     ',
    '#      ',
    '#######',
  ],
  '3': [
    ' ##### ',
    '#     #',
    '      #',
    '  #### ',
    '      #',
    '      #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  '4': [
    '    #  ',
    '   ##  ',
    '  # #  ',
    ' #  #  ',
    '#   #  ',
    '#######',
    '    #  ',
    '    #  ',
    '    #  ',
  ],
  '5': [
    '#######',
    '#      ',
    '#      ',
    '###### ',
    '      #',
    '      #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  '6': [
    '  #### ',
    ' #     ',
    '#      ',
    '###### ',
    '#     #',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  '7': [
    '#######',
    '     # ',
    '    #  ',
    '   #   ',
    '   #   ',
    '  #    ',
    '  #    ',
    '  #    ',
    '  #    ',
  ],
  '8': [
    ' ##### ',
    '#     #',
    '#     #',
    ' ##### ',
    '#     #',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  '9': [
    ' ##### ',
    '#     #',
    '#     #',
    ' ######',
    '      #',
    '      #',
    '     # ',
    ' ####  ',
    '       ',
  ],
  A: [
    '  ###  ',
    ' #   # ',
    '#     #',
    '#     #',
    '#######',
    '#     #',
    '#     #',
    '#     #',
    '       ',
  ],
  B: [
    '###### ',
    '#     #',
    '#     #',
    '###### ',
    '#     #',
    '#     #',
    '#     #',
    '###### ',
    '       ',
  ],
  C: [
    ' ##### ',
    '#     #',
    '#      ',
    '#      ',
    '#      ',
    '#      ',
    '#     #',
    ' ##### ',
    '       ',
  ],
  Ç: [
    ' ##### ',
    '#     #',
    '#      ',
    '#      ',
    '#      ',
    '#     #',
    ' ##### ',
    '   #   ',
    '  ##   ',
  ],
  D: [
    '#####  ',
    '#    # ',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#    # ',
    '#####  ',
    '       ',
  ],
  E: [
    '#######',
    '#      ',
    '#      ',
    '#####  ',
    '#      ',
    '#      ',
    '#      ',
    '#######',
    '       ',
  ],
  F: [
    '#######',
    '#      ',
    '#      ',
    '#####  ',
    '#      ',
    '#      ',
    '#      ',
    '#      ',
    '       ',
  ],
  G: [
    ' ##### ',
    '#     #',
    '#      ',
    '#  ####',
    '#     #',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  Ğ: [
    '  ###  ',
    ' ##### ',
    '#      ',
    '#  ####',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
    '       ',
  ],
  H: [
    '#     #',
    '#     #',
    '#     #',
    '#######',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '       ',
  ],
  I: [
    ' ##### ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    ' ##### ',
    '       ',
  ],
  İ: [
    '   #   ',
    '       ',
    ' ##### ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    ' ##### ',
    '       ',
  ],
  J: [
    '  #####',
    '     # ',
    '     # ',
    '     # ',
    '     # ',
    '#    # ',
    '#    # ',
    ' ####  ',
    '       ',
  ],
  K: [
    '#    # ',
    '#   #  ',
    '#  #   ',
    '###    ',
    '#  #   ',
    '#   #  ',
    '#    # ',
    '#     #',
    '       ',
  ],
  L: [
    '#      ',
    '#      ',
    '#      ',
    '#      ',
    '#      ',
    '#      ',
    '#      ',
    '#######',
    '       ',
  ],
  M: [
    '#     #',
    '##   ##',
    '# # # #',
    '#  #  #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '       ',
  ],
  N: [
    '#     #',
    '##    #',
    '# #   #',
    '#  #  #',
    '#   # #',
    '#    ##',
    '#     #',
    '#     #',
    '       ',
  ],
  O: [
    ' ##### ',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  Ö: [
    ' #   # ',
    ' ##### ',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
    '       ',
  ],
  P: [
    '###### ',
    '#     #',
    '#     #',
    '###### ',
    '#      ',
    '#      ',
    '#      ',
    '#      ',
    '       ',
  ],
  R: [
    '###### ',
    '#     #',
    '#     #',
    '###### ',
    '#   #  ',
    '#    # ',
    '#     #',
    '#     #',
    '       ',
  ],
  S: [
    ' ##### ',
    '#     #',
    '#      ',
    ' ##### ',
    '      #',
    '      #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  Ş: [
    ' ##### ',
    '#     #',
    '#      ',
    ' ##### ',
    '      #',
    '#     #',
    ' ##### ',
    '   #   ',
    '  ##   ',
  ],
  T: [
    '#######',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '       ',
  ],
  U: [
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
  ],
  Ü: [
    ' #   # ',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    ' ##### ',
    '       ',
    '       ',
  ],
  V: [
    '#     #',
    '#     #',
    '#     #',
    '#     #',
    ' #   # ',
    ' #   # ',
    '  # #  ',
    '   #   ',
    '       ',
  ],
  Y: [
    '#     #',
    '#     #',
    ' #   # ',
    '  # #  ',
    '   #   ',
    '   #   ',
    '   #   ',
    '   #   ',
    '       ',
  ],
  Z: [
    '#######',
    '     # ',
    '    #  ',
    '   #   ',
    '  #    ',
    ' #     ',
    '#      ',
    '#######',
    '       ',
  ],
};

/**
 * Common Turkish roster vocabulary (headers + frequent Turkish names & surnames)
 * used strictly to boost confidence or provide ranked alternatives when OCR characters are noisy.
 */
const TURKISH_ROSTER_LEXICON = [
  'SIRA',
  'OKUL',
  'NO',
  'NUMARA',
  'NUMARASI',
  'ADI',
  'SOYADI',
  'AD',
  'SOYAD',
  'CİNSİYET',
  'CINSIYET',
  'ÖĞRENCİ',
  'SINIF',
  'ŞUBE',
  'LİSTESİ',
  'AYŞE',
  'NUR',
  'ÇELİK',
  'MEHMET',
  'DEMİR',
  'ELİF',
  'YILMAZ',
  'KEREM',
  'ZEYNEP',
  'KAYA',
  'MERT',
  'DEFNE',
  'ŞAHİN',
  'CANER',
  'AYDIN',
  'NİLÜFER',
  'YILDIZ',
  'EMİRHAN',
  'ÖZTÜRK',
  'BEREN',
  'SU',
  'KARAHAN',
  'KUZEY',
  'ALP',
  'TEKİN',
  'DURU',
  'ERDEM',
  'ALİ',
  'AHMET',
  'MUSTAFA',
  'FATMA',
  'HATİCE',
  'EMİNE',
  'HÜSEYİN',
  'HASAN',
  'İBRAHİM',
  'ÖMER',
  'YUSUF',
  'EYMEN',
  'MİRAÇ',
  'BERAT',
  'YİĞİT',
  'KAAN',
  'DENİZ',
  'ECEM',
  'YAĞMUR',
  'IRMAK',
  'EYLÜL',
  'ARSLAN',
  'DOĞAN',
  'KILIÇ',
  'ASLAN',
  'ÇETİN',
  'KARA',
  'KOÇ',
  'KURT',
  'ÖZKAN',
  'ŞİMŞEK',
  'POLAT',
  'ÖZDEMİR',
  'KORKMAZ',
  'ÇAKIR',
  'ERDOĞAN',
  'YAVUZ',
  'GÜLER',
  'AKSOY',
  'AKTAŞ',
  'GÜNEŞ',
  'BOZKURT',
  'ÜNAL',
  'AVCI',
  'FARUK',
  'SUDE',
  'CAN',
  'MERVE',
  'BURAK',
  'EMRE',
  'SELİN',
  'ECE',
  'BERK',
  'KAĞAN',
  'ADA',
  'KERİM',
  'SENA',
  'DİLARA',
  'BÜŞRA',
  'ENES',
  'FURKAN',
  'TALHA',
  'UMUT',
  'BARIŞ',
  'TOLGA',
  'ONUR',
  'SERKAN',
  'GÖKHAN',
  'SİNAN',
  'İREM',
  'BEYZA',
  'ESRA',
  'GAMZE',
  'GİZEM',
  'MELİS',
  'MELİSA',
  'CEREN',
  'ASLI',
  'DAMLA',
  'SILA',
  'NİSA',
  'AZRA',
  'NEHİR',
  'ASYA',
  'MİNA',
  'ECRİN',
  'RABİA',
  'HİRA',
  'MELEK',
  'DERYA',
  'ÖYKÜ',
  'PELİN',
  'TUĞBA',
  'BETÜL',
  'ŞEYMA',
  'KÜBRA',
  'YASEMİN',
  'PINAR',
  'SEDA',
  'ÖZGE',
  'CANSU',
  'EZGİ',
  'BAHAR',
  'YAREN',
  'ALEYNA',
  'İLAYDA',
  'TUANA',
  'CEMRE',
  'KADİR',
  'MURAT',
  'ORHAN',
  'OSMAN',
  'RAMAZAN',
  'SALİH',
  'SAMET',
  'SELİM',
  'SEMİH',
  'SERDAR',
  'SÜLEYMAN',
  'TARIK',
  'TUNA',
  'UFUK',
  'UĞUR',
  'VOLKAN',
  'YASİN',
  'YUNUS',
  'ZAFER',
  'ADEM',
  'ALPER',
  'ALPEREN',
  'ARDA',
  'ATAKAN',
  'BATUHAN',
  'BERKAY',
  'BİLAL',
  'BORA',
  'BUĞRA',
  'CEM',
  'CİHAN',
  'ÇAĞRI',
  'ÇINAR',
  'DOĞUKAN',
  'DORUK',
  'EFE',
  'EGEMEN',
  'EKİN',
  'EMİR',
  'EREN',
  'ERKAN',
  'FATİH',
  'FERHAT',
  'GÖKTUĞ',
  'GÖRKEM',
  'HALİL',
  'HAMZA',
  'HARUN',
  'HAKAN',
  'İSMAİL',
  'KIVANÇ',
  'KORAY',
  'LEVENT',
  'MAHMUT',
  'MELİH',
  'METE',
  'METEHAN',
  'MUHAMMED',
  'MUHAMMET',
  'MUSA',
  'OĞUZ',
  'OĞUZHAN',
  'OKAN',
  'ÖZGÜR',
  'POYRAZ',
  'RECEP',
  'RÜZGAR',
  'SARP',
  'SEFA',
  'SERHAT',
  'TAHA',
  'TOPRAK',
  'UTKU',
  'YAĞIZ',
  'AKIN',
  'ALKAN',
  'ALTUN',
  'ARI',
  'ATALAY',
  'AYAZ',
  'AYDOĞAN',
  'BAKIR',
  'BALCI',
  'BARAN',
  'BAŞARAN',
  'BAYRAM',
  'BAYRAKTAR',
  'BEKTAŞ',
  'BİLGİN',
  'BULUT',
  'CENGİZ',
  'CEYLAN',
  'COŞKUN',
  'ÇALIŞKAN',
  'ÇAM',
  'ÇİFTÇİ',
  'ÇOBAN',
  'DAĞ',
  'DEMİRCİ',
  'DEMİREL',
  'DİNÇ',
  'DUMAN',
  'DURAN',
  'DURMUŞ',
  'DURSUN',
  'EKİNCİ',
  'ERCAN',
  'ERGÜN',
  'EROĞLU',
  'ERSOY',
  'ERTÜRK',
  'ESEN',
  'FİDAN',
  'GENÇ',
  'GÖK',
  'GÖKÇE',
  'GÜL',
  'GÜMÜŞ',
  'GÜNDÜZ',
  'GÜNGÖR',
  'GÜRBÜZ',
  'GÜRSOY',
  'IŞIK',
  'İNAN',
  'İNCE',
  'İPEK',
  'KAHRAMAN',
  'KALKAN',
  'KAPLAN',
  'KARACA',
  'KARADAĞ',
  'KARADENİZ',
  'KARAGÖZ',
  'KARAKAŞ',
  'KARAKAYA',
  'KARAMAN',
  'KARATAŞ',
  'KARTAL',
  'KOÇAK',
  'KÖSE',
  'KUTLU',
  'KÜÇÜK',
  'MUTLU',
  'ÖZEN',
  'ÖZER',
  'ÖZCAN',
  'ÖZÇELİK',
  'PEKER',
  'SAĞLAM',
  'SARI',
  'SARIKAYA',
  'SEZER',
  'SÖNMEZ',
  'ŞEN',
  'ŞENER',
  'ŞENGÜL',
  'ŞENTÜRK',
  'TAŞ',
  'TAŞKIN',
  'TEMEL',
  'TOPAL',
  'TOPÇU',
  'TOSUN',
  'TUNCER',
  'TUNÇ',
  'TURAN',
  'TURGUT',
  'TÜRK',
  'UÇAR',
  'ULUSOY',
  'USLU',
  'UYSAL',
  'UZUN',
  'ÜNLÜ',
  'VAROL',
  'VURAL',
  'YALÇIN',
  'YAMAN',
  'YILDIRIM',
  'YÜCEL',
  'YÜKSEL',
  'ZENGİN',
];

function normalizeBinaryPatchToGrid(
  mask: Uint8Array,
  imgW: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Float32Array {
  const out = new Float32Array(NORM_W * NORM_H);
  const bw = Math.max(1, x1 - x0 + 1);
  const bh = Math.max(1, y1 - y0 + 1);

  for (let gy = 0; gy < NORM_H; gy++) {
    const sy0 = y0 + (gy * bh) / NORM_H;
    const sy1 = y0 + ((gy + 1) * bh) / NORM_H;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(y1, Math.floor(sy1));

    for (let gx = 0; gx < NORM_W; gx++) {
      const sx0 = x0 + (gx * bw) / NORM_W;
      const sx1 = x0 + ((gx + 1) * bw) / NORM_W;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(x1, Math.floor(sx1));

      let sum = 0;
      let count = 0;
      for (let py = iy0; py <= iy1; py++) {
        for (let px = ix0; px <= ix1; px++) {
          sum += mask[py * imgW + px] ? 1 : 0;
          count++;
        }
      }
      out[gy * NORM_W + gx] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

function smoothGrid16x24(grid: Float32Array): Float32Array {
  const out = new Float32Array(NORM_W * NORM_H);
  for (let y = 0; y < NORM_H; y++) {
    for (let x = 0; x < NORM_W; x++) {
      let sum = 0;
      let weightSum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= NORM_H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= NORM_W) continue;
          const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          sum += grid[ny * NORM_W + nx] * w;
          weightSum += w;
        }
      }
      out[y * NORM_W + x] = weightSum > 0 ? sum / weightSum : 0;
    }
  }
  return out;
}

function buildBuiltinTemplates(): GlyphTemplate[] {
  const templates: GlyphTemplate[] = [];

  for (const [char, rows] of Object.entries(BUILTIN_BITMAP_FONT)) {
    const h = rows.length;
    const w = rows[0].length;
    const scale = 3;
    const bw = w * scale + 2;
    const bh = h * scale + 2;

    // Generate 'regular' and 'bold' (blurred/shadowed camera ink) variants
    const variants: Array<'regular' | 'bold'> = ['regular', 'bold'];

    for (const variant of variants) {
      const mask = new Uint8Array(bw * bh);
      let minX = bw;
      let minY = bh;
      let maxX = 0;
      let maxY = 0;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (rows[y][x] === '#') {
            const startDelta = variant === 'bold' ? -1 : 0;
            const endDelta = variant === 'bold' ? scale + 1 : scale;
            for (let dy = startDelta; dy < endDelta; dy++) {
              for (let dx = startDelta; dx < endDelta; dx++) {
                const px = 1 + x * scale + dx;
                const py = 1 + y * scale + dy;
                if (px >= 0 && px < bw && py >= 0 && py < bh) {
                  mask[py * bw + px] = 1;
                  if (px < minX) minX = px;
                  if (py < minY) minY = py;
                  if (px > maxX) maxX = px;
                  if (py > maxY) maxY = py;
                }
              }
            }
          }
        }
      }

      if (maxX >= minX && maxY >= minY) {
        const grid = normalizeBinaryPatchToGrid(mask, bw, minX, minY, maxX, maxY);
        templates.push({
          char,
          isDigit: /^[0-9]$/.test(char),
          isUpper: !/^[0-9]$/.test(char),
          isLower: false,
          hasTopDiacritic: ['Ğ', 'İ', 'Ö', 'Ü'].includes(char),
          hasBottomDiacritic: ['Ç', 'Ş'].includes(char),
          aspectRatio: (maxX - minX + 1) / Math.max(1, maxY - minY + 1),
          grid,
          smoothGrid: smoothGrid16x24(grid),
        });
      }
    }
  }

  // In browser or Web Worker environments, also build templates from native Canvas / OffscreenCanvas font rendering
  try {
    let ctx:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } else if (typeof OffscreenCanvas !== 'undefined') {
      const offscreen = new OffscreenCanvas(64, 64);
      ctx = offscreen.getContext('2d', {
        willReadFrequently: true,
      }) as OffscreenCanvasRenderingContext2D | null;
    }

    if (ctx) {
      const chars =
        '0123456789ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZabcçdefgğhıijklmnoöprsştuüvyz';
      const fonts = [
        'bold 34px sans-serif',
        '500 34px sans-serif',
        '34px Arial, Helvetica, sans-serif',
        '34px "Times New Roman", Georgia, serif',
      ];
      for (const fontSpec of fonts) {
        for (const ch of chars) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 64, 64);
          ctx.fillStyle = '#000000';
          ctx.font = fontSpec;
          ctx.textBaseline = 'top';
          ctx.fillText(ch, 10, 8);
          const imgData = ctx.getImageData(0, 0, 64, 64).data;
          const mask = new Uint8Array(64 * 64);
          let minX = 64;
          let minY = 64;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) {
              const lum = imgData[(y * 64 + x) * 4];
              if (lum < 160) {
                mask[y * 64 + x] = 1;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxX >= minX && maxY >= minY) {
            const grid = normalizeBinaryPatchToGrid(
              mask,
              64,
              minX,
              minY,
              maxX,
              maxY
            );
            const upper = ch
              .replace(/i/g, 'İ')
              .replace(/ı/g, 'I')
              .toLocaleUpperCase('tr-TR');
            templates.push({
              char: upper,
              isDigit: /^[0-9]$/.test(ch),
              isUpper: ch === upper && !/^[0-9]$/.test(ch),
              isLower: ch !== upper,
              hasTopDiacritic: [
                'Ğ',
                'İ',
                'Ö',
                'Ü',
                'ğ',
                'i',
                'ö',
                'ü',
              ].includes(ch),
              hasBottomDiacritic: ['Ç', 'Ş', 'ç', 'ş'].includes(ch),
              aspectRatio: (maxX - minX + 1) / Math.max(1, maxY - minY + 1),
              grid,
              smoothGrid: smoothGrid16x24(grid),
            });
          }
        }
      }
    }
  } catch {
    // Ignore canvas creation errors in restricted environments
  }

  return templates;
}

let cachedTemplates: GlyphTemplate[] | null = null;
function getGlyphTemplates(): GlyphTemplate[] {
  if (!cachedTemplates) {
    cachedTemplates = buildBuiltinTemplates();
  }
  return cachedTemplates;
}

/**
 * Renders a synthetic table roster image (with borders, headers, rows, optional skew/noise)
 * into a RawGrayImage buffer. Works identically in Node.js unit tests and Browser!
 */
export function renderSyntheticRosterTableToGrayImage(config: {
  headers?: string[];
  rows: string[][];
  columnWidths?: number[];
  rowHeight?: number;
  skewDeg?: number;
  drawGridLines?: boolean;
}): RawGrayImage {
  const colCount = Math.max(
    config.headers?.length ?? 0,
    ...config.rows.map((r) => r.length),
    1
  );
  const colWidths =
    config.columnWidths && config.columnWidths.length === colCount
      ? config.columnWidths
      : Array.from({ length: colCount }, (_, i) => (i === 0 ? 90 : i === 1 ? 140 : 210));
  const rowHeight = config.rowHeight ?? 54;
  const padX = 28;
  const padY = 28;

  const totalTableW = colWidths.reduce((a, b) => a + b, 0);
  const totalRows = (config.headers ? 1 : 0) + config.rows.length;
  const totalTableH = totalRows * rowHeight;

  const width = totalTableW + padX * 2;
  const height = totalTableH + padY * 2;
  const data = new Uint8Array(width * height);
  data.fill(250); // light paper background

  const drawTextCell = (text: string, cellX0: number, cellY0: number, cellW: number) => {
    const upper = text
      .trim()
      .replace(/i/g, 'İ')
      .replace(/ı/g, 'I')
      .toUpperCase();
    if (!upper) return;

    let charScale = 3;
    let charW = 7 * charScale;
    let charH = 9 * charScale;
    let charSpacing = 5;

    let totalTextW =
      upper.length * charW + Math.max(0, upper.length - 1) * charSpacing;
    if (totalTextW > cellW - 16) {
      charScale = 2;
      charW = 7 * charScale;
      charH = 9 * charScale;
      charSpacing = 4;
      totalTextW =
        upper.length * charW + Math.max(0, upper.length - 1) * charSpacing;
    }

    let curX = Math.max(
      cellX0 + 8,
      Math.round(cellX0 + (cellW - totalTextW) / 2)
    );
    const curY = Math.round(cellY0 + (rowHeight - charH) / 2);

    for (const ch of upper) {
      if (ch === ' ') {
        curX += charW + 4;
        continue;
      }
      const pattern = BUILTIN_BITMAP_FONT[ch];
      if (pattern) {
        for (let py = 0; py < pattern.length; py++) {
          for (let px = 0; px < pattern[py].length; px++) {
            if (pattern[py][px] === '#') {
              for (let dy = 0; dy < charScale; dy++) {
                for (let dx = 0; dx < charScale; dx++) {
                  const ix = curX + px * charScale + dx;
                  const iy = curY + py * charScale + dy;
                  if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
                    data[iy * width + ix] = 25;
                  }
                }
              }
            }
          }
        }
      }
      curX += charW + charSpacing;
    }
  };

  // Draw optional table grid lines
  if (config.drawGridLines !== false) {
    for (let r = 0; r <= totalRows; r++) {
      const y = padY + r * rowHeight;
      for (let x = padX; x <= padX + totalTableW; x++) {
        if (y >= 0 && y < height && x >= 0 && x < width) {
          data[y * width + x] = 90;
        }
      }
    }
    let accX = padX;
    for (let c = 0; c <= colCount; c++) {
      for (let y = padY; y <= padY + totalTableH; y++) {
        if (y >= 0 && y < height && accX >= 0 && accX < width) {
          data[y * width + accX] = 90;
        }
      }
      if (c < colCount) accX += colWidths[c];
    }
  }

  let curRowIdx = 0;
  if (config.headers) {
    let cellX = padX;
    for (let c = 0; c < config.headers.length; c++) {
      drawTextCell(config.headers[c], cellX, padY + curRowIdx * rowHeight, colWidths[c]);
      cellX += colWidths[c];
    }
    curRowIdx++;
  }

  for (const row of config.rows) {
    let cellX = padX;
    for (let c = 0; c < row.length; c++) {
      drawTextCell(row[c] || '', cellX, padY + curRowIdx * rowHeight, colWidths[c]);
      cellX += colWidths[c];
    }
    curRowIdx++;
  }

  let result: RawGrayImage = { width, height, data };
  if (config.skewDeg && Math.abs(config.skewDeg) > 0.1) {
    // Apply forward rotation to simulate a tilted camera capture
    result = deskewGrayImageByForwardAngle(result, config.skewDeg);
  }
  return result;
}

function deskewGrayImageByForwardAngle(
  image: RawGrayImage,
  angleDeg: number
): RawGrayImage {
  const { width, height, data } = image;
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const sx = Math.max(
        0,
        Math.min(width - 1, Math.round(dx * cosA + dy * sinA + cx))
      );
      const sy = Math.max(
        0,
        Math.min(height - 1, Math.round(-dx * sinA + dy * cosA + cy))
      );
      out[y * width + x] = data[sy * width + sx];
    }
  }
  return { width, height, data: out };
}

export interface RealisticCameraRosterConfig {
  headers?: string[];
  rows: string[][];
  columnWidths?: number[];
  rowHeight?: number;
  rowHeights?: number[];
  skewDeg?: number;
  drawGridLines?: boolean;
  strokeWeight?: 'thin' | 'regular' | 'bold';
  shadowIntensity?: number; // 0..0.45 directional hand/phone shadow across sheet
  vignetteIntensity?: number; // 0..0.30 corner lens darkening
  blurStrength?: number; // 0..0.45 optical 3x3 PSF lens softness
  noiseAmplitude?: number; // 0..18 paper grain & camera sensor noise
  perspectivePinch?: number; // 0..0.04 trapezoidal camera perspective distortion
  seed?: number;
}

/**
 * Renders a realistic smartphone camera capture of a printed classroom roster sheet,
 * including uneven directional shadow gradients, radial lens vignette, paper texture & sensor grain,
 * optical 3x3 lens blur, variable row heights, variable font stroke weights, perspective pinch, and camera tilt.
 */
export function renderRealisticCameraRosterPhotoToGrayImage(
  config: RealisticCameraRosterConfig
): RawGrayImage {
  const colCount = Math.max(
    config.headers?.length ?? 0,
    ...config.rows.map((r) => r.length),
    1
  );
  const colWidths =
    config.columnWidths && config.columnWidths.length === colCount
      ? config.columnWidths
      : Array.from({ length: colCount }, (_, i) =>
          i === 0 ? 105 : i === 1 ? 165 : i === 4 ? 145 : 240
        );
  const defaultRowH = config.rowHeight ?? 58;
  const totalRows = (config.headers ? 1 : 0) + config.rows.length;

  const rowHeights: number[] = [];
  for (let r = 0; r < totalRows; r++) {
    if (config.headers && r === 0) {
      rowHeights.push(defaultRowH);
    } else {
      const dataIdx = config.headers ? r - 1 : r;
      rowHeights.push(config.rowHeights?.[dataIdx] ?? defaultRowH);
    }
  }

  const rowYOffsets: number[] = [0];
  for (let r = 0; r < totalRows; r++) {
    rowYOffsets.push(rowYOffsets[r] + rowHeights[r]);
  }

  const padX = 34;
  const padY = 34;
  const totalTableW = colWidths.reduce((a, b) => a + b, 0);
  const totalTableH = rowYOffsets[totalRows];

  const width = totalTableW + padX * 2;
  const height = totalTableH + padY * 2;
  const data = new Uint8Array(width * height);
  data.fill(244); // realistic warm paper base luminance

  const strokeWeight = config.strokeWeight ?? 'regular';

  const drawTextCell = (
    text: string,
    cellX0: number,
    cellY0: number,
    cellW: number,
    cellH: number
  ) => {
    const upper = text
      .trim()
      .replace(/i/g, 'İ')
      .replace(/ı/g, 'I')
      .toUpperCase();
    if (!upper) return;

    let charScale = 3;
    let charW = 7 * charScale;
    let charH = 9 * charScale;
    let charSpacing = 5;

    let totalTextW =
      upper.length * charW + Math.max(0, upper.length - 1) * charSpacing;
    if (totalTextW > cellW - 16) {
      charScale = 2;
      charW = 7 * charScale;
      charH = 9 * charScale;
      charSpacing = 4;
      totalTextW =
        upper.length * charW + Math.max(0, upper.length - 1) * charSpacing;
    }

    let curX = Math.max(
      cellX0 + 8,
      Math.round(cellX0 + (cellW - totalTextW) / 2)
    );
    const curY = Math.round(cellY0 + (cellH - charH) / 2);

    for (const ch of upper) {
      if (ch === ' ') {
        curX += charW + 4;
        continue;
      }
      const pattern = BUILTIN_BITMAP_FONT[ch];
      if (pattern) {
        const inkLum = strokeWeight === 'thin' ? 78 : 28;
        const endDeltaX = strokeWeight === 'bold' ? charScale + 1 : charScale;
        const endDeltaY = charScale;
        for (let py = 0; py < pattern.length; py++) {
          for (let px = 0; px < pattern[py].length; px++) {
            if (pattern[py][px] === '#') {
              for (let dy = 0; dy < endDeltaY; dy++) {
                for (let dx = 0; dx < endDeltaX; dx++) {
                  const ix = curX + px * charScale + dx;
                  const iy = curY + py * charScale + dy;
                  if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
                    data[iy * width + ix] = inkLum;
                  }
                }
              }
            }
          }
        }
      }
      curX += charW + charSpacing;
    }
  };

  if (config.drawGridLines !== false) {
    for (let r = 0; r <= totalRows; r++) {
      const y = padY + rowYOffsets[r];
      for (let x = padX; x <= padX + totalTableW; x++) {
        if (y >= 0 && y < height && x >= 0 && x < width) {
          data[y * width + x] = 95;
        }
      }
    }
    let accX = padX;
    for (let c = 0; c <= colCount; c++) {
      for (let y = padY; y <= padY + totalTableH; y++) {
        if (y >= 0 && y < height && accX >= 0 && accX < width) {
          data[y * width + accX] = 95;
        }
      }
      if (c < colCount) accX += colWidths[c];
    }
  }

  let curRowIdx = 0;
  if (config.headers) {
    let cellX = padX;
    const rh = rowHeights[curRowIdx];
    const ry = padY + rowYOffsets[curRowIdx];
    for (let c = 0; c < config.headers.length; c++) {
      drawTextCell(config.headers[c], cellX, ry, colWidths[c], rh);
      cellX += colWidths[c];
    }
    curRowIdx++;
  }

  for (const row of config.rows) {
    let cellX = padX;
    const rh = rowHeights[curRowIdx];
    const ry = padY + rowYOffsets[curRowIdx];
    for (let c = 0; c < row.length; c++) {
      drawTextCell(row[c] || '', cellX, ry, colWidths[c], rh);
      cellX += colWidths[c];
    }
    curRowIdx++;
  }

  // 1. Apply optical lens blur (3x3 Gaussian blend) if configured
  const blurStrength = Math.max(0, Math.min(0.45, config.blurStrength ?? 0.14));
  if (blurStrength > 0.01) {
    const blurred = new Uint8Array(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const neighborAvg =
          (data[(y - 1) * width + x] +
            data[(y + 1) * width + x] +
            data[y * width + (x - 1)] +
            data[y * width + (x + 1)]) *
          0.25;
        blurred[idx] = Math.round(
          data[idx] * (1 - blurStrength) + neighborAvg * blurStrength
        );
      }
    }
    data.set(blurred);
  }

  // 2. Apply uneven directional lighting shadow + lens vignette + deterministic sensor/paper grain
  const shadowIntensity = Math.max(
    0,
    Math.min(0.45, config.shadowIntensity ?? 0.22)
  );
  const vignetteIntensity = Math.max(
    0,
    Math.min(0.3, config.vignetteIntensity ?? 0.12)
  );
  const noiseAmplitude = Math.max(0, Math.min(18, config.noiseAmplitude ?? 6));
  let prng = (config.seed ?? 133742) >>> 0;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const maxDistSq = cx * cx + cy * cy;

  for (let y = 0; y < height; y++) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) {
      const nx = x / Math.max(1, width - 1);
      // Directional phone/hand shadow across diagonal (darker toward bottom-right)
      const shadowFactor = 1 - shadowIntensity * (0.55 * nx + 0.45 * ny);
      // Radial lens vignette
      const dx = x - cx;
      const dy = y - cy;
      const rSq = (dx * dx + dy * dy) / Math.max(1, maxDistSq);
      const vignetteFactor = 1 - vignetteIntensity * rSq;

      // Deterministic LCG sensor noise
      prng = (Math.imul(prng, 1664525) + 1013904223) >>> 0;
      const noise =
        noiseAmplitude > 0
          ? (((prng >>> 16) & 0xff) / 127.5 - 1.0) * noiseAmplitude
          : 0;

      const idx = y * width + x;
      const val = Math.round(
        data[idx] * shadowFactor * vignetteFactor + noise
      );
      data[idx] = Math.max(0, Math.min(255, val));
    }
  }

  let result: RawGrayImage = { width, height, data };

  // 3. Apply subtle perspective keystone pinch if configured
  const pinch = Math.max(0, Math.min(0.04, config.perspectivePinch ?? 0));
  if (pinch > 0.001) {
    const warped = new Uint8Array(width * height);
    warped.fill(220);
    for (let y = 0; y < height; y++) {
      const ny = y / Math.max(1, height - 1);
      const scaleX = 1 - pinch * (1 - ny); // slightly narrower at top
      for (let x = 0; x < width; x++) {
        const sx = Math.round((x - cx) / scaleX + cx);
        if (sx >= 0 && sx < width) {
          warped[y * width + x] = result.data[y * width + sx];
        }
      }
    }
    result = { width, height, data: warped };
  }

  // 4. Apply camera tilt / skew if configured
  if (config.skewDeg && Math.abs(config.skewDeg) > 0.1) {
    result = deskewGrayImageByForwardAngle(result, config.skewDeg);
  }

  return result;
}

/**
 * Segments a cleaned binary mask into word bounding boxes using horizontal row bands
 * and vertical gap / column divider analysis.
 */
export function segmentWordsFromBinaryMask(
  binary: RawBinaryImage,
  horizontalGridLinesY: number[] = [],
  verticalGridLinesX: number[] = []
): BoundingBox[] {
  const { width, height } = binary;
  if (width === 0 || height === 0) return [];

  // Work on a local copy where residual horizontal/vertical border runs (even slightly wavy after deskew) are cleared
  const mask = new Uint8Array(binary.mask);
  const maxCharSpanX = Math.max(28, Math.floor(width * 0.16));
  const maxCharSpanY = Math.max(36, Math.floor(height * 0.22));

  // Clear outer 1.5% camera border edge noise
  const edgeMarginX = Math.min(8, Math.floor(width * 0.015));
  const edgeMarginY = Math.min(8, Math.floor(height * 0.015));
  for (let y = 0; y < height; y++) {
    const rOff = y * width;
    if (y < edgeMarginY || y >= height - edgeMarginY) {
      for (let x = 0; x < width; x++) mask[rOff + x] = 0;
    } else {
      for (let x = 0; x < edgeMarginX; x++) mask[rOff + x] = 0;
      for (let x = width - edgeMarginX; x < width; x++) mask[rOff + x] = 0;
    }
  }

  // Clear horizontal runs wider than maxCharSpanX
  for (let y = 0; y < height; y++) {
    const rOff = y * width;
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width ? mask[rOff + x] : 0;
      if (on && start === -1) start = x;
      else if (!on && start !== -1) {
        if (x - start >= maxCharSpanX) {
          for (let rx = start; rx < x; rx++) {
            mask[rOff + rx] = 0;
            if (y > 0) mask[(y - 1) * width + rx] = 0;
            if (y + 1 < height) mask[(y + 1) * width + rx] = 0;
          }
        }
        start = -1;
      }
    }
  }

  // Clear vertical runs taller than maxCharSpanY
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      const on = y < height ? mask[y * width + x] : 0;
      if (on && start === -1) start = y;
      else if (!on && start !== -1) {
        if (y - start >= maxCharSpanY) {
          for (let ry = start; ry < y; ry++) {
            mask[ry * width + x] = 0;
            if (x > 0) mask[ry * width + (x - 1)] = 0;
            if (x + 1 < width) mask[ry * width + (x + 1)] = 0;
          }
        }
        start = -1;
      }
    }
  }

  // 1. Horizontal projection profile to locate text lines
  const rowCounts = new Int32Array(height);
  const vertLineSet = new Set<number>();
  for (const vx of verticalGridLinesX) {
    for (let d = -2; d <= 2; d++) vertLineSet.add(vx + d);
  }
  const horizLineSet = new Set<number>();
  for (const hy of horizontalGridLinesY) {
    for (let d = -2; d <= 2; d++) horizLineSet.add(hy + d);
  }

  for (let y = 0; y < height; y++) {
    if (horizLineSet.has(y)) continue;
    const rowOff = y * width;
    let cnt = 0;
    for (let x = 0; x < width; x++) {
      if (!vertLineSet.has(x) && mask[rowOff + x]) {
        cnt++;
      }
    }
    // Suppress residual full-width horizontal table rules
    if (cnt > width * 0.42) {
      rowCounts[y] = 0;
    } else {
      rowCounts[y] = cnt;
    }
  }

  // Bridge small vertical gaps (<= 4px) so top dots/umlauts on İ, Ö, Ü, Ğ and bottom cedillas on Ç, Ş stay attached to the line
  const activeY = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    if (rowCounts[y] >= 2 && !horizLineSet.has(y)) activeY[y] = 1;
  }
  for (let y = 1; y < height - 5; y++) {
    if (activeY[y - 1] && !activeY[y]) {
      let nextOn = -1;
      for (let k = 1; k <= 5; k++) {
        if (horizLineSet.has(y + k - 1)) break;
        if (activeY[y + k]) {
          nextOn = y + k;
          break;
        }
      }
      if (nextOn !== -1) {
        for (let fill = y; fill < nextOn; fill++) activeY[fill] = 1;
      }
    }
  }

  const rawLineBands: { y0: number; y1: number }[] = [];
  let lineStart = -1;
  for (let y = 0; y <= height; y++) {
    const on = y < height ? activeY[y] : 0;
    if (on && lineStart === -1) {
      lineStart = y;
    } else if (!on && lineStart !== -1) {
      const h = y - lineStart;
      if (h >= 7) {
        rawLineBands.push({ y0: lineStart, y1: y - 1 });
      }
      lineStart = -1;
    }
  }

  // Split any overly tall lineBand (where residual vertical borders connected multiple rows) at local minima
  const lineBands: { y0: number; y1: number }[] = [];
  const maxSingleLineBandH = Math.max(72, Math.floor(height * 0.24));
  for (const band of rawLineBands) {
    const bh = band.y1 - band.y0 + 1;
    if (bh <= maxSingleLineBandH) {
      lineBands.push(band);
    } else {
      const numSubLines = Math.max(2, Math.round(bh / 34));
      let curY0 = band.y0;
      for (let s = 1; s < numSubLines; s++) {
        const idealY = band.y0 + Math.round((s * bh) / numSubLines);
        let bestY = idealY;
        let minVal = Infinity;
        for (
          let y = Math.max(curY0 + 12, idealY - 10);
          y <= Math.min(band.y1 - 12, idealY + 10);
          y++
        ) {
          if (rowCounts[y] < minVal) {
            minVal = rowCounts[y];
            bestY = y;
          }
        }
        if (bestY - curY0 >= 7) {
          lineBands.push({ y0: curY0, y1: bestY - 1 });
        }
        curY0 = bestY + 1;
      }
      if (band.y1 - curY0 + 1 >= 7) {
        lineBands.push({ y0: curY0, y1: band.y1 });
      }
    }
  }

  const wordBoxes: BoundingBox[] = [];

  for (const band of lineBands) {
    const bandH = band.y1 - band.y0 + 1;
    const colCounts = new Int32Array(width);
    for (let x = 0; x < width; x++) {
      if (vertLineSet.has(x)) continue;
      let c = 0;
      for (let y = band.y0; y <= band.y1; y++) {
        if (mask[y * width + x]) c++;
      }
      colCounts[x] = c;
    }

    // Intra-word letter spacing vs inter-word gap threshold
    const maxIntraWordGap = Math.max(7, Math.round(bandH * 0.42));

    let wordStart = -1;
    let gapRun = 0;

    for (let x = 0; x <= width; x++) {
      const hitVertBorder = vertLineSet.has(x);
      const hasInk = x < width && !hitVertBorder && colCounts[x] > 0;

      if (hasInk) {
        if (wordStart === -1) {
          wordStart = x;
        }
        gapRun = 0;
      } else {
        if (wordStart !== -1) {
          gapRun++;
          if (hitVertBorder || x === width || gapRun > maxIntraWordGap) {
            const wordEnd = x - gapRun;
            if (wordEnd >= wordStart) {
              // Tighten vertical bounds [wy0, wy1] for this word
              let wy0 = band.y1;
              let wy1 = band.y0;
              let inkPixels = 0;
              for (let py = band.y0; py <= band.y1; py++) {
                const rOff = py * width;
                for (let px = wordStart; px <= wordEnd; px++) {
                  if (mask[rOff + px]) {
                    inkPixels++;
                    if (py < wy0) wy0 = py;
                    if (py > wy1) wy1 = py;
                  }
                }
              }
              const ww = wordEnd - wordStart + 1;
              const wh = wy1 - wy0 + 1;
              if (inkPixels >= 6 && ww >= 3 && wh >= 7) {
                wordBoxes.push({
                  x0: wordStart,
                  y0: wy0,
                  x1: wordEnd,
                  y1: wy1,
                });
              }
            }
            wordStart = -1;
            gapRun = 0;
          }
        }
      }
    }
  }

  return wordBoxes;
}

/**
 * Segments a single word bounding box into individual character bounding boxes,
 * keeping top/bottom Turkish diacritics merged with their base glyph.
 */
function segmentCharactersInWord(
  binary: RawBinaryImage,
  wordBox: BoundingBox
): BoundingBox[] {
  const { width, mask } = binary;
  const { x0, y0, x1, y1 } = wordBox;
  const colInk = new Int32Array(x1 - x0 + 1);

  for (let x = x0; x <= x1; x++) {
    let c = 0;
    for (let y = y0; y <= y1; y++) {
      if (mask[y * width + x]) c++;
    }
    colInk[x - x0] = c;
  }

  const rawCharSpans: { cx0: number; cx1: number }[] = [];
  let start = -1;
  for (let i = 0; i <= colInk.length; i++) {
    const on = i < colInk.length && colInk[i] > 0;
    if (on && start === -1) {
      start = x0 + i;
    } else if (!on && start !== -1) {
      rawCharSpans.push({ cx0: start, cx1: x0 + i - 1 });
      start = -1;
    }
  }

  // Split overly wide touching character spans using minimum vertical ink valleys
  const wordH = y1 - y0 + 1;
  const maxSingleCharW = Math.max(16, Math.round(wordH * 1.12));
  const splitSpans: { cx0: number; cx1: number }[] = [];

  for (const span of rawCharSpans) {
    const sw = span.cx1 - span.cx0 + 1;
    if (sw <= maxSingleCharW) {
      splitSpans.push(span);
    } else {
      const parts = Math.max(2, Math.round(sw / (wordH * 0.72)));
      let curStart = span.cx0;
      for (let p = 1; p < parts; p++) {
        const idealCut = span.cx0 + Math.round((p * sw) / parts);
        let bestCut = idealCut;
        let minInk = Infinity;
        for (
          let cx = Math.max(curStart + 3, idealCut - 4);
          cx <= Math.min(span.cx1 - 3, idealCut + 4);
          cx++
        ) {
          const v = colInk[cx - x0];
          if (v < minInk) {
            minInk = v;
            bestCut = cx;
          }
        }
        splitSpans.push({ cx0: curStart, cx1: bestCut });
        curStart = bestCut + 1;
      }
      if (curStart <= span.cx1) {
        splitSpans.push({ cx0: curStart, cx1: span.cx1 });
      }
    }
  }

  const charBoxes: BoundingBox[] = [];
  for (const sp of splitSpans) {
    let cy0 = y1;
    let cy1 = y0;
    let pixels = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = sp.cx0; x <= sp.cx1; x++) {
        if (mask[y * width + x]) {
          pixels++;
          if (y < cy0) cy0 = y;
          if (y > cy1) cy1 = y;
        }
      }
    }
    if (pixels >= 3 && cy1 >= cy0) {
      charBoxes.push({ x0: sp.cx0, y0: cy0, x1: sp.cx1, y1: cy1 });
    }
  }
  return charBoxes;
}

function classifyCharacterBox(
  binary: RawBinaryImage,
  cbox: BoundingBox,
  wordBox: BoundingBox,
  roleHint?: ColumnRole
): { char: string; score: number; runnerUpChar: string; runnerUpScore: number } {
  const templates = getGlyphTemplates();
  const patchGrid = normalizeBinaryPatchToGrid(
    binary.mask,
    binary.width,
    cbox.x0,
    cbox.y0,
    cbox.x1,
    cbox.y1
  );
  const smoothPatchGrid = smoothGrid16x24(patchGrid);
  const cw = cbox.x1 - cbox.x0 + 1;
  const ch = cbox.y1 - cbox.y0 + 1;
  const aspect = cw / Math.max(1, ch);

  // Detect disconnected top diacritic (dot/umlaut/breve) inside character column
  let hasDisconnectedTop = false;
  for (let y = cbox.y0 + 1; y < cbox.y0 + Math.floor(ch * 0.42); y++) {
    let rowInk = 0;
    for (let x = cbox.x0; x <= cbox.x1; x++) {
      if (binary.mask[y * binary.width + x]) rowInk++;
    }
    if (rowInk === 0) {
      hasDisconnectedTop = true;
      break;
    }
  }

  // Detect bottom cedilla extension below word baseline
  const wordH = Math.max(1, wordBox.y1 - wordBox.y0 + 1);
  const extendsBottom = cbox.y1 >= wordBox.y1 && ch > wordH * 0.88;

  const bestByChar = new Map<string, number>();

  for (const tpl of templates) {
    if (roleHint === 'studentNumber' || roleHint === 'sequence') {
      if (!tpl.isDigit) continue;
    } else if (roleHint === 'firstName' || roleHint === 'lastName' || roleHint === 'gender') {
      if (tpl.isDigit) continue;
    }

    // Combined crisp + 3x3 Gaussian-smoothed cosine similarity on 16x24 grid
    let dot = 0;
    let normA = 0;
    let normB = 0;
    let sDot = 0;
    let sNormA = 0;
    let sNormB = 0;
    for (let i = 0; i < patchGrid.length; i++) {
      const a = patchGrid[i];
      const b = tpl.grid[i];
      dot += a * b;
      normA += a * a;
      normB += b * b;

      const sa = smoothPatchGrid[i];
      const sb = tpl.smoothGrid[i];
      sDot += sa * sb;
      sNormA += sa * sa;
      sNormB += sb * sb;
    }
    const directSim =
      normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
    const smoothSim =
      sNormA > 0 && sNormB > 0 ? sDot / Math.sqrt(sNormA * sNormB) : 0;
    let sim = directSim * 0.62 + smoothSim * 0.38;

    // Aspect ratio penalty for narrow glyphs ('1', 'I', 'İ') vs wide glyphs
    const aspectDiff = Math.abs(aspect - tpl.aspectRatio);
    sim -= aspectDiff * 0.14;

    if (hasDisconnectedTop && tpl.hasTopDiacritic) {
      sim += 0.08;
    } else if (!hasDisconnectedTop && tpl.hasTopDiacritic) {
      sim -= 0.05;
    }

    if (extendsBottom && tpl.hasBottomDiacritic) {
      sim += 0.05;
    }

    const prev = bestByChar.get(tpl.char) ?? -1;
    if (sim > prev) {
      bestByChar.set(tpl.char, sim);
    }
  }

  let bestChar = '?';
  let bestScore = -1;
  let runnerUpChar = '?';
  let runnerUpScore = -1;

  for (const [char, sc] of bestByChar.entries()) {
    if (sc > bestScore) {
      runnerUpChar = bestChar;
      runnerUpScore = bestScore;
      bestChar = char;
      bestScore = sc;
    } else if (sc > runnerUpScore) {
      runnerUpChar = char;
      runnerUpScore = sc;
    }
  }

  return {
    char: bestChar,
    score: Math.max(0, Math.min(1, bestScore)),
    runnerUpChar,
    runnerUpScore: Math.max(0, Math.min(1, runnerUpScore)),
  };
}

/**
 * Computes visual edit similarity between a raw OCR token and a known Turkish roster lexicon word.
 */
function visualConfusionCost(a: string, b: string): number {
  if (a === b) return 0;
  const confusablePairs: [string, string, number][] = [
    ['0', 'O', 0.18],
    ['0', 'Ö', 0.25],
    ['1', 'I', 0.16],
    ['1', 'İ', 0.22],
    ['5', 'S', 0.2],
    ['5', 'Ş', 0.26],
    ['8', 'B', 0.22],
    ['2', 'Z', 0.24],
    ['C', 'Ç', 0.15],
    ['G', 'Ğ', 0.15],
    ['I', 'İ', 0.14],
    ['O', 'Ö', 0.15],
    ['S', 'Ş', 0.15],
    ['U', 'Ü', 0.15],
    ['E', 'F', 0.28],
    ['D', 'O', 0.28],
    ['R', 'P', 0.28],
    ['M', 'N', 0.3],
    ['K', 'R', 0.32],
  ];
  for (const [x, y, cost] of confusablePairs) {
    if ((a === x && b === y) || (a === y && b === x)) return cost;
  }
  return 1.0;
}

function weightedEditDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = visualConfusionCost(s1[i - 1], s2[j - 1]);
      dp[i][j] = Math.min(
        dp[i - 1][j] + 0.9,
        dp[i][j - 1] + 0.9,
        dp[i - 1][j - 1] + subCost
      );
    }
  }
  return dp[m][n];
}

function recognizeWordFromCharacterBoxes(
  binary: RawBinaryImage,
  wordBox: BoundingBox,
  roleHint?: ColumnRole
): {
  text: string;
  confidence: number;
  alternatives: OcrWordAlternative[];
} {
  const charBoxes = segmentCharactersInWord(binary, wordBox);
  if (charBoxes.length === 0) {
    return { text: '', confidence: 0, alternatives: [] };
  }

  const classified = charBoxes.map((cb) =>
    classifyCharacterBox(binary, cb, wordBox, roleHint)
  );

  let rawText = classified.map((c) => c.char).join('');
  const avgScore =
    classified.reduce((acc, c) => acc + c.score, 0) / classified.length;

  const alternatives: OcrWordAlternative[] = [];

  // Build runner-up alternative if any character had a close second candidate
  const hasCloseRunnerUp = classified.some(
    (c) => c.runnerUpChar !== '?' && c.score - c.runnerUpScore < 0.08
  );
  if (hasCloseRunnerUp) {
    const altStr = classified
      .map((c) =>
        c.runnerUpChar !== '?' && c.score - c.runnerUpScore < 0.08
          ? c.runnerUpChar
          : c.char
      )
      .join('');
    if (altStr !== rawText) {
      alternatives.push({
        text: altStr,
        confidence: Math.round(Math.max(40, (avgScore - 0.05) * 100)),
        reason: 'Benzer karakter geometrisi alternatifi',
      });
    }
  }

  // Check if token is primarily numeric vs alphabetic
  const digitCount = classified.filter((c) => /^[0-9]$/.test(c.char)).length;
  const lookalikeDigitCount = classified.filter((c) =>
    /^[0-9OIİSBZ]$/.test(c.char)
  ).length;

  if (
    roleHint === 'studentNumber' ||
    roleHint === 'sequence' ||
    (digitCount >= Math.ceil(classified.length * 0.5) &&
      lookalikeDigitCount === classified.length &&
      classified.length <= 6)
  ) {
    const normalizedDigits = rawText
      .replace(/[OÖD]/g, '0')
      .replace(/[Iİ]/g, '1')
      .replace(/[SŞ]/g, '5')
      .replace(/B/g, '8')
      .replace(/Z/g, '2');

    if (normalizedDigits !== rawText && /^\d+$/.test(normalizedDigits)) {
      if (roleHint === 'studentNumber' || digitCount >= classified.length - 1) {
        alternatives.unshift({
          text: rawText,
          confidence: Math.round(avgScore * 88),
          reason: 'Ham OCR okuması',
        });
        rawText = normalizedDigits;
      } else {
        alternatives.push({
          text: normalizedDigits,
          confidence: Math.round(avgScore * 92),
          reason: 'Sayısal okul numarası dönüşüm önerisi',
        });
      }
    }
  } else if (rawText.length >= 2) {
    // Check Turkish roster lexicon for exact or near-exact visual matches
    let bestLexWord = '';
    let bestDist = Infinity;
    for (const lex of TURKISH_ROSTER_LEXICON) {
      const w = lex.trim();
      if (Math.abs(w.length - rawText.length) > 1) continue;
      const d = weightedEditDistance(rawText, w);
      if (d < bestDist) {
        bestDist = d;
        bestLexWord = w;
      }
    }

    if (bestLexWord && bestDist === 0) {
      return {
        text: bestLexWord,
        confidence: Math.min(99, Math.round(Math.max(avgScore * 100, 94))),
        alternatives,
      };
    }

    if (bestLexWord && bestDist <= 0.48) {
      // Very small visual confusion (e.g. 'CELIK' -> 'ÇELİK' or 'AYSE' -> 'AYŞE' or 'OKUL' vs '0KUL')
      alternatives.push({
        text: rawText,
        confidence: Math.round(avgScore * 85),
        reason: 'Ham karakter okuması',
      });
      rawText = bestLexWord;
    } else if (bestLexWord && bestDist <= 1.15 && bestLexWord !== rawText) {
      // Keep rawText or surface lexicon candidate as a non-destructive suggestion
      alternatives.push({
        text: bestLexWord,
        confidence: Math.round(Math.max(65, avgScore * 90)),
        reason: 'Türkçe ad/başlık sözlük eşleşme önerisi',
      });
    }
  }

  return {
    text: rawText,
    confidence: Math.min(99, Math.max(35, Math.round(avgScore * 100))),
    alternatives,
  };
}

/**
 * 100% Local, Offline-Capable Turkish OCR Engine Adapter.
 * Never transmits images or student data outside the browser.
 */
export class SelfContainedTurkishOcrEngine implements OcrEngineAdapter {
  public readonly engineId = 'rubrikpad-local-tur-v1';
  public readonly engineName =
    'RubrikPad Yerel Türkçe Tablo OCR Motoru (Cihaz İçi / Çevrimdışı)';
  public readonly isLocalOnly = true as const;

  public async recognizeImage(
    image: RawGrayImage,
    options: OcrEngineOptions = {}
  ): Promise<OcrEngineOutput> {
    const preprocessing = preprocessRosterImage(image, options.preprocessing);
    const {
      gridLinesRemovedMask,
      diagnostics: { horizontalGridLinesY, verticalGridLinesX, detectedSkewDeg },
    } = preprocessing;

    const wordBoxes = segmentWordsFromBinaryMask(
      gridLinesRemovedMask,
      horizontalGridLinesY,
      verticalGridLinesX
    );

    const words: OcrWordToken[] = [];
    wordBoxes.forEach((bbox, idx) => {
      const recognized = recognizeWordFromCharacterBoxes(
        gridLinesRemovedMask,
        bbox
      );
      if (recognized.text.trim().length > 0) {
        words.push({
          id: `tok-${idx + 1}`,
          text: recognized.text.trim(),
          confidence: recognized.confidence,
          bbox,
          baselineY: bbox.y1,
          skewDeg: detectedSkewDeg,
          alternatives: recognized.alternatives,
        });
      }
    });

    return {
      engineId: this.engineId,
      engineName: this.engineName,
      isLocalOnly: true,
      words,
      preprocessing,
    };
  }

  /**
   * Targeted local cell re-OCR on a cropped bounding box using multi-sensitivity thresholding
   * and role-specific character constraints (e.g. digits for Okul No, Turkish letters for Ad/Soyad).
   */
  public async recognizeCellRegion(
    image: RawGrayImage,
    bbox: BoundingBox,
    roleHint: ColumnRole
  ): Promise<OcrCellReReadOutput> {
    const pad = 4;
    const x0 = Math.max(0, Math.floor(bbox.x0 - pad));
    const y0 = Math.max(0, Math.floor(bbox.y0 - pad));
    const x1 = Math.min(image.width - 1, Math.ceil(bbox.x1 + pad));
    const y1 = Math.min(image.height - 1, Math.ceil(bbox.y1 + pad));
    const cw = Math.max(1, x1 - x0 + 1);
    const ch = Math.max(1, y1 - y0 + 1);

    const cropData = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        cropData[y * cw + x] = image.data[(y0 + y) * image.width + (x0 + x)];
      }
    }

    const upscaled = upscaleGrayImageBilinear(
      { width: cw, height: ch, data: cropData },
      1.5
    );

    const sensitivities = [0.09, 0.13, 0.17];
    let bestText = '';
    let bestConfidence = 0;
    const allAlternatives: OcrWordAlternative[] = [];

    for (const sens of sensitivities) {
      const bin = adaptiveLocalBinarize(upscaled, 14, sens);
      const subBoxes = segmentWordsFromBinaryMask(bin);
      if (subBoxes.length === 0) continue;

      const parts = subBoxes.map((sb) =>
        recognizeWordFromCharacterBoxes(bin, sb, roleHint)
      );
      const combinedText = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join(' ')
        .trim();
      if (!combinedText) continue;

      const avgConf = Math.round(
        parts.reduce((acc, p) => acc + p.confidence, 0) / parts.length
      );

      if (avgConf > bestConfidence) {
        if (bestText && bestText !== combinedText) {
          allAlternatives.push({
            text: bestText,
            confidence: bestConfidence,
            reason: 'Farklı yerel eşikleme okuması',
          });
        }
        bestText = combinedText;
        bestConfidence = avgConf;
      } else if (combinedText !== bestText) {
        allAlternatives.push({
          text: combinedText,
          confidence: avgConf,
          reason: 'Alternatif yerel hücre okuması',
        });
      }
    }

    return {
      text: bestText,
      confidence: bestConfidence,
      alternatives: allAlternatives,
    };
  }
}

/**
 * Pluggable Local OCR Engine Registry so the application is never locked to a single OCR library.
 * Rejects any adapter that does not declare `isLocalOnly: true`.
 */
export class LocalOcrEngineRegistry {
  private adapters = new Map<string, OcrEngineAdapter>();
  private activeEngineId: string;

  constructor(defaultAdapter: OcrEngineAdapter = new SelfContainedTurkishOcrEngine()) {
    this.registerAdapter(defaultAdapter);
    this.activeEngineId = defaultAdapter.engineId;
  }

  public registerAdapter(adapter: OcrEngineAdapter): void {
    if (adapter.isLocalOnly !== true) {
      throw new Error(
        'Güvenlik İhlali: Yalnızca tamamen yerel (isLocalOnly: true) OCR motorları kaydedilebilir.'
      );
    }
    this.adapters.set(adapter.engineId, adapter);
  }

  public setActiveEngine(engineId: string): void {
    if (!this.adapters.has(engineId)) {
      throw new Error(`OCR motoru bulunamadı: ${engineId}`);
    }
    this.activeEngineId = engineId;
  }

  public getActiveEngine(): OcrEngineAdapter {
    const adapter = this.adapters.get(this.activeEngineId);
    if (!adapter) {
      throw new Error('Aktif yerel OCR motoru tanımlı değil.');
    }
    return adapter;
  }

  public listAdapters(): OcrEngineAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const defaultLocalOcrRegistry = new LocalOcrEngineRegistry();
