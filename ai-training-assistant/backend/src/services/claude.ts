import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatResult, DocumentChunk, ResponseTone } from '../types';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const TONE_TAG = /^\s*\[tone:\s*(neutral|positive|thinking|concerned)\]\s*/i;
const VALID_TONES: ResponseTone[] = ['neutral', 'positive', 'thinking', 'concerned'];

function buildSystemPrompt(orgName: string, contextChunks: DocumentChunk[]): string {
  const context = contextChunks.length
    ? contextChunks
        .map((c, i) => `[Source ${i + 1}: ${c.documentTitle}]\n${c.text}`)
        .join('\n\n')
    : '(No matching training material was found for this question.)';

  return `You are a friendly, knowledgeable AI training assistant speaking out loud through a 3D avatar for ${orgName}. \
You help trainees understand the company's own training material.

Rules:
- Ground every factual answer in the CONTEXT below. If the context doesn't cover the question, say so honestly instead of guessing.
- Keep answers conversational and concise (2-5 sentences) since they will be spoken aloud by a TTS voice, not read as text.
- Do not use markdown, bullet points, or headings — plain spoken sentences only.
- Start your reply with exactly one tone tag on its own, chosen from: [tone: neutral], [tone: positive], [tone: thinking], [tone: concerned]. Use "positive" for encouraging/correct-answer moments, "thinking" when reasoning through something nuanced or when context is thin, "concerned" when flagging a safety/compliance point, otherwise "neutral". This tag drives the avatar's gesture and is stripped before the trainee hears it.

CONTEXT:
${context}`;
}

export async function generateGroundedAnswer(
  orgName: string,
  question: string,
  history: ChatMessage[],
  contextChunks: DocumentChunk[],
): Promise<ChatResult> {
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-8).map((m) => ({
      role: (m.role === 'trainee' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: question },
  ];

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 500,
    system: buildSystemPrompt(orgName, contextChunks),
    messages,
  });

  const rawText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const toneMatch = rawText.match(TONE_TAG);
  const tone = (toneMatch && VALID_TONES.includes(toneMatch[1].toLowerCase() as ResponseTone)
    ? (toneMatch[1].toLowerCase() as ResponseTone)
    : 'neutral');
  const reply = rawText.replace(TONE_TAG, '').trim();

  return {
    reply,
    tone,
    sourcesUsed: contextChunks.map((c) => ({
      documentTitle: c.documentTitle,
      snippet: c.text.slice(0, 160),
    })),
  };
}
