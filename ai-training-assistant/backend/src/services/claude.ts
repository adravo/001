import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatResult, DocumentChunk, ResponseTone } from '../types';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const RESPOND_TOOL_NAME = 'respond_to_trainee';
const VALID_TONES: ResponseTone[] = ['neutral', 'positive', 'thinking', 'concerned'];

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
- Keep the reply conversational and concise (2-5 sentences) since it will be spoken aloud by a TTS voice, not read as text.
- Do not use markdown, bullet points, or headings in the reply — plain spoken sentences only.
- You must call the ${RESPOND_TOOL_NAME} tool to deliver your answer, choosing "tone" honestly: "positive" for encouraging/correct-answer moments, "thinking" when reasoning through something nuanced or when context is thin, "concerned" when flagging a safety/compliance point, otherwise "neutral". The tone drives the avatar's gesture.

CONTEXT:
${context}`;
}

// The avatar's gesture and the spoken reply are both required in every turn,
// so they're forced through a single tool call rather than parsed out of
// free-form text: a text-embedded "[tone: ...]" tag is a fragile contract
// (the model can phrase around it, and a failed match would either read the
// literal tag aloud or silently mis-fire the gesture) with no way to detect
// drift. Structured tool output makes malformed responses a hard SDK-level
// error instead of a silent UX bug.
const RESPOND_TOOL: Anthropic.Tool = {
  name: RESPOND_TOOL_NAME,
  description:
    "Deliver the spoken answer to the trainee, along with the emotional tone that drives the avatar's gesture.",
  input_schema: {
    type: 'object',
    properties: {
      tone: {
        type: 'string',
        enum: VALID_TONES,
        description: 'The emotional tone of this reply, used to trigger the avatar\'s gesture.',
      },
      reply: {
        type: 'string',
        description: 'The spoken answer: plain conversational sentences, no markdown.',
      },
    },
    required: ['tone', 'reply'],
  },
};

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
    tools: [RESPOND_TOOL],
    tool_choice: { type: 'tool', name: RESPOND_TOOL_NAME },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === RESPOND_TOOL_NAME,
  );
  if (!toolUse) {
    throw new Error('The model did not return a structured response.');
  }

  const input = toolUse.input as Partial<{ tone: string; reply: string }>;
  const tone: ResponseTone = VALID_TONES.includes(input.tone as ResponseTone)
    ? (input.tone as ResponseTone)
    : 'neutral';
  const reply = input.reply?.trim();
  if (!reply) {
    throw new Error('The model returned an empty reply.');
  }

  return {
    reply,
    tone,
    sourcesUsed: contextChunks.map((c) => ({
      documentTitle: c.documentTitle,
      snippet: c.text.slice(0, 160),
    })),
  };
}
