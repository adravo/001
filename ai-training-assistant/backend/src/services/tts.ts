export interface TtsAudio {
  audio: Buffer;
  contentType: string;
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // "Rachel", ElevenLabs default demo voice
const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY;
const AZURE_TTS_REGION = process.env.AZURE_TTS_REGION;
const AZURE_TTS_VOICE = process.env.AZURE_TTS_VOICE || 'en-US-JennyNeural';

export function isServerTtsConfigured(): boolean {
  return Boolean(ELEVENLABS_API_KEY || (AZURE_TTS_KEY && AZURE_TTS_REGION));
}

/**
 * Synthesizes speech server-side so the frontend can drive real audio-analysed
 * lip-sync. Returns null when no TTS provider is configured, signalling the
 * frontend to fall back to the browser's built-in SpeechSynthesis voice.
 */
export async function synthesizeSpeech(text: string): Promise<TtsAudio | null> {
  if (ELEVENLABS_API_KEY) return synthesizeWithElevenLabs(text);
  if (AZURE_TTS_KEY && AZURE_TTS_REGION) return synthesizeWithAzure(text);
  return null;
}

async function synthesizeWithElevenLabs(text: string): Promise<TtsAudio> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${body}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { audio, contentType: 'audio/mpeg' };
}

async function synthesizeWithAzure(text: string): Promise<TtsAudio> {
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${AZURE_TTS_VOICE}">${escapeXml(
    text,
  )}</voice></speak>`;

  const response = await fetch(
    `https://${AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_TTS_KEY!,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: ssml,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure TTS failed (${response.status}): ${body}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  return { audio, contentType: 'audio/mpeg' };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
