import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // OCR Endpoint using Server-Side Gemini API
  app.post('/api/ocr-students', async (req, res) => {
    try {
      const { imageBase64, mimeType, rawTextHint } = req.body;

      if (!imageBase64 && !rawTextHint) {
        res.status(400).json({ error: 'Görsel verisi veya metin bulunamadı.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error: 'GEMINI_API_KEY yapılandırılmamış. Örnek OCR taraması veya metin ayrıştırıcı kullanılıyor.',
          fallbackRequired: true,
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
      if (imageBase64) {
        parts.push({
          inlineData: {
            data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
            mimeType: mimeType || 'image/jpeg',
          },
        });
      }
      parts.push({
        text:
          'Bu görseldeki öğrenci listesini (okul numarası ve ad soyad) oku. ' +
          'Eğer numara yoksa 101\'den başlayarak sırayla numara ver. ' +
          'Sonucu JSON dizisi olarak döndür.',
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                studentNumber: {
                  type: Type.STRING,
                  description: 'Öğrenci okul numarası',
                },
                fullName: {
                  type: Type.STRING,
                  description: 'Öğrencinin adı ve soyadı',
                },
              },
              required: ['studentNumber', 'fullName'],
            },
          },
        },
      });

      const textOutput = response.text || '[]';
      const students = JSON.parse(textOutput.trim());
      res.json({ students });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'OCR işlemi sırasında beklenmeyen bir hata oluştu.';
      res.status(500).json({ error: message });
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
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RubrikPad server running on http://localhost:${PORT}`);
  });
}

startServer();
