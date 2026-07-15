/**
 * transcribe.ts
 *
 * POST /api/transcribe — распознавание речи из аудиофайла (iOS fallback).
 * Принимает multipart field `audio`, возвращает { success, text }.
 *
 * Использует Gemini (audio inline) или OpenAI Whisper — что доступно в .env.
 */

import { Router, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { authMiddleware, type AuthenticatedRequest } from '../../middleware/auth.js';
import { config } from '../../config/env.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 15 * 1024 * 1024,
  },
});

const transcribeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

function pickMimeType(file: Express.Multer.File): string {
  if (file.mimetype && file.mimetype.startsWith('audio/')) {
    return file.mimetype;
  }
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.mp4') || name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.webm')) return 'audio/webm';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/mp4';
}

async function transcribeWithGemini(buffer: Buffer, mimeType: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: config.geminiModel || 'gemini-2.5-flash' });
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: buffer.toString('base64'),
      },
    },
    {
      text:
        'Распознай речь в этом аудио. Язык: русский. Верни только текст транскрипции без кавычек и пояснений. Если речи нет — верни пустую строку.',
    },
  ]);
  return result.response.text().trim();
}

async function transcribeWithWhisper(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const client = new OpenAI({ apiKey });
  const ext = mimeType.includes('webm')
    ? 'webm'
    : mimeType.includes('wav')
      ? 'wav'
      : mimeType.includes('ogg')
        ? 'ogg'
        : 'mp4';
  const uploadName = fileName || `audio.${ext}`;
  const bytes = new Uint8Array(buffer);
  const file = new File([bytes], uploadName, { type: mimeType });
  const result = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'ru',
  });
  return (result.text || '').trim();
}

router.post(
  '/',
  transcribeRateLimit,
  authMiddleware,
  upload.single('audio'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file?.buffer?.length) {
        res.status(400).json({ success: false, error: 'Аудиофайл не передан' });
        return;
      }

      const mimeType = pickMimeType(file);
      let text = '';

      if (config.geminiApiKey) {
        text = await transcribeWithGemini(file.buffer, mimeType);
      } else if (process.env.OPENAI_API_KEY) {
        text = await transcribeWithWhisper(file.buffer, mimeType, file.originalname);
      } else {
        res.status(503).json({
          success: false,
          error: 'Нет доступного провайдера транскрипции (GEMINI_API_KEY или OPENAI_API_KEY)',
        });
        return;
      }

      res.json({ success: true, text });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка транскрипции';
      console.error('[transcribe]', message);
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;
