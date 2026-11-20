import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { STAND_CRY_LIBRARY, type StandCryId } from './src/game/StandCries';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const ttsWavCache = new Map<string, string>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'killthebug-server' });
  });

  app.get('/api/audio/jojo-cry', async (req: Request, res: Response) => {
    const requestedId = typeof req.query?.id === 'string' ? (req.query.id as StandCryId) : 'ora_rush';
    const clip = STAND_CRY_LIBRARY.find((c) => c.id === requestedId);
    if (!clip) {
      res.status(400).json({ error: 'Unknown Stand cry clip ID.' });
      return;
    }

    const cached = ttsWavCache.get(clip.id);
    if (cached) {
      res.json({ id: clip.id, audioBase64: cached, mimeType: 'audio/wav', cached: true });
      return;
    }

    try {
      const ai = getGeminiClient();
      if (!ai) {
        res.json({ id: clip.id, fallback: true, reason: 'GEMINI_API_KEY not configured' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: clip.spokenText,
                speechMetadata: {
                  style: clip.voiceStyle,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: clip.voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.json({ id: clip.id, fallback: true, reason: 'No audio data returned from Gemini TTS.' });
        return;
      }

      ttsWavCache.set(clip.id, base64Audio);
      res.json({ id: clip.id, audioBase64: base64Audio, mimeType: 'audio/wav', cached: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate Stand cry audio.';
      res.json({ id: clip.id, fallback: true, reason: message });
    }
  });

  app.post('/api/search/dengue-tips', async (req: Request, res: Response) => {
    try {
      const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      const topic = rawQuery.slice(0, 180) || 'Aedes mosquito dengue fever prevention and rainy weather surge';

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server.',
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents:
          `Provide a concise, practical 3-bullet field briefing on: "${topic}". ` +
          `Focus on mosquito/fly defense, Aedes dengue risk during rain & wind, and household bite prevention. Keep it under 140 words.`,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: { title: string; uri: string }[] = [];
      const seen = new Set<string>();
      for (const chunk of chunks) {
        const uri = chunk?.web?.uri;
        if (uri && !seen.has(uri)) {
          seen.add(uri);
          sources.push({
            title: chunk.web?.title || uri,
            uri,
          });
        }
      }

      res.json({
        text: response.text ?? 'No briefing returned.',
        sources: sources.slice(0, 6),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query Gemini Search Grounding.';
      res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`killthebug server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start killthebug server:', err);
  process.exit(1);
});
