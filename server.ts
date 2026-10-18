import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// P0 #8: Server-side OCR API quota & rate limiting per IP/session (max 10 requests per 10 minutes)
const ocrRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const OCR_WINDOW_MS = 10 * 60 * 1000;
const OCR_MAX_REQUESTS_PER_WINDOW = 10;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '6mb' }));

  // Server-side API route for OCR student roster extraction using Gemini 3 Flash
  // Enforces P0 #8: explicit privacy consent verification, MIME validation, payload size cap, and rate quota
  app.post('/api/ocr-roster', async (req, res) => {
    try {
      const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
      const now = Date.now();
      const rateRecord = ocrRateLimitMap.get(clientIp);

      if (!rateRecord || now - rateRecord.windowStart > OCR_WINDOW_MS) {
        ocrRateLimitMap.set(clientIp, { count: 1, windowStart: now });
      } else {
        if (rateRecord.count >= OCR_MAX_REQUESTS_PER_WINDOW) {
          return res.status(429).json({
            error: 'OCR API kota sınırı aşıldı (10 dakikada en fazla 10 tarama). Lütfen yerel/çevrimdışı metin aktarımını kullanın veya biraz bekleyin.',
            remainingQuota: 0,
          });
        }
        rateRecord.count += 1;
      }

      const { base64Image, mimeType, privacyConsentConfirmed } = req.body;

      // P0 #8: Controlled external transmission — require explicit user privacy consent
      if (privacyConsentConfirmed !== true) {
        return res.status(403).json({
          error: 'Veri gizliliği onayı eksik. Görselin harici OCR servisine gönderilmesi için açık onay gereklidir.',
        });
      }

      if (!base64Image || typeof base64Image !== 'string') {
        return res.status(400).json({ error: 'Görsel verisi bulunamadı.' });
      }

      const normalizedMime = mimeType || 'image/jpeg';
      if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
        return res.status(400).json({
          error: 'Desteklenmeyen dosya türü. Yalnızca JPEG, PNG veya WEBP görselleri kabul edilir.',
        });
      }

      // Limit base64 payload to ~4.5MB raw image size
      if (base64Image.length > 6_200_000) {
        return res.status(413).json({
          error: 'Görsel boyutu güvenlik sınırını (4.5 MB) aşıyor. Lütfen daha küçük bir görsel yükleyin.',
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          error: 'Sunucuda GEMINI_API_KEY tanımlı değil. Lütfen Yerel (Çevrimdışı) OCR / Tablo Aktarım modunu kullanın.',
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: base64Image,
              },
            },
            {
              text: 'Bu sınıf listesi görselindeki öğrencilerin okul numaralarını, adlarını (firstName) ve soyadlarını (lastName) ayrı sütunlar olarak çıkar. KESİNLİKLE rastgele veya tahmini öğrenci numarası üretme; numara görselde yoksa studentNumber alanını boş ("") bırak.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                studentNumber: {
                  type: Type.STRING,
                  description: 'Görselde yer alan gerçek öğrenci okul numarası (yoksa boş string "")',
                },
                firstName: {
                  type: Type.STRING,
                  description: 'Öğrencinin adı (soyadı hariç)',
                },
                lastName: {
                  type: Type.STRING,
                  description: 'Öğrencinin soyadı',
                },
                fullName: {
                  type: Type.STRING,
                  description: 'Öğrencinin tam adı ve soyadı',
                },
              },
              required: ['studentNumber', 'firstName', 'lastName', 'fullName'],
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '[]');
      const currentQuota = ocrRateLimitMap.get(clientIp);
      const remainingQuota = Math.max(
        0,
        OCR_MAX_REQUESTS_PER_WINDOW - (currentQuota?.count || 1)
      );

      return res.json({
        students: parsed,
        remainingQuota,
      });
    } catch (error) {
      console.error('OCR Roster Error:', error);
      return res.status(500).json({
        error: 'Görselden liste okunurken bir hata oluştu. Sahte veya örnek kayıt üretilmedi; lütfen görseli kontrol edin veya yerel metin aktarımını kullanın.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RubrikPad server running on http://localhost:${PORT}`);
  });
}

startServer();
