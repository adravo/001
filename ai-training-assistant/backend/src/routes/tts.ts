import { Router } from 'express';
import { isServerTtsConfigured, synthesizeSpeech } from '../services/tts';

export const ttsRouter = Router({ mergeParams: true });

ttsRouter.get('/status', (_req, res) => {
  res.json({ configured: isServerTtsConfigured() });
});

ttsRouter.post('/', async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) {
    return res.status(400).json({ error: '"text" is required.' });
  }

  try {
    const audio = await synthesizeSpeech(text);
    if (!audio) {
      // No provider configured — frontend should fall back to browser SpeechSynthesis.
      return res.status(204).send();
    }
    res.setHeader('Content-Type', audio.contentType);
    res.send(audio.audio);
  } catch (err) {
    console.error('[tts] synthesis failed:', err);
    res.status(502).json({ error: 'TTS synthesis failed.' });
  }
});
