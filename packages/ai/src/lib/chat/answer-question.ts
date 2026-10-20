import { z } from 'zod';
import { ChatTurnLimitError, ChatTurnTimeoutError } from '../errors';
import type {
  ConverseBlock,
  ConverseTurn,
  LlmClient,
  ToolDefinition,
} from '../llm-client';
import { buildChatSystemPrompt } from './system-prompt';

export const FINAL_ANSWER_TOOL = 'final_answer';
export const MAX_TOOL_ITERATIONS = 6;
/** Tool output longer than this is cut, so one result cannot flood the context. */
const MAX_TOOL_RESULT_CHARS = 30_000;

export const finalAnswerDefinition: ToolDefinition = {
  name: FINAL_ANSWER_TOOL,
  description:
    'Gives the owner the final answer. Call it exactly once, when you have what you need or when the data is not available.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description:
          "The answer, in the language of the owner's message. Plain text; short lists or tables allowed.",
      },
      sourceFileIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Ids of the files whose data the answer uses (only ids returned by tools). Empty if none.',
      },
    },
    required: ['text', 'sourceFileIds'],
  },
};

const finalAnswerSchema = z.object({
  text: z.string().trim().min(1),
  sourceFileIds: z.array(z.string()).default([]),
});

/** What a tool handler returns: JSON-able data plus the files that data came from. */
export interface ToolOutput {
  data: unknown;
  fileIds?: string[];
}

export type ToolHandler = (name: string, input: unknown) => Promise<ToolOutput>;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnswerQuestionInput {
  llm: LlmClient;
  model: string;
  question: string;
  /** Earlier text turns of the conversation, oldest first (no tool traces). */
  history: HistoryMessage[];
  tools: ToolDefinition[];
  handleTool: ToolHandler;
  today: string;
  currency: string;
  timeoutMs: number;
  maxIterations?: number;
}

export interface ChatAnswer {
  text: string;
  /** Claimed file ids that the tools really returned during this turn. */
  sourceFileIds: string[];
  toolCalls: number;
}

/**
 * Runs the bounded tool-use loop. The model only sees tool results; it ends by calling
 * `final_answer`, and any file id it cites that no tool returned is dropped.
 */
export async function answerQuestion(
  input: AnswerQuestionInput,
): Promise<ChatAnswer> {
  const maxIterations = input.maxIterations ?? MAX_TOOL_ITERATIONS;
  const seenFileIds = new Set<string>();
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ChatTurnTimeoutError());
    }, input.timeoutMs);
  });
  // The race below would leave this promise unhandled if the loop wins.
  timeout.catch(() => undefined);

  try {
    return await Promise.race([
      runLoop(input, maxIterations, seenFileIds, controller.signal),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runLoop(
  input: AnswerQuestionInput,
  maxIterations: number,
  seenFileIds: Set<string>,
  signal: AbortSignal,
): Promise<ChatAnswer> {
  const messages: ConverseTurn[] = [
    ...normalizeHistory(input.history),
    { role: 'user', content: [{ type: 'text', text: input.question }] },
  ];
  const system = buildChatSystemPrompt({
    today: input.today,
    currency: input.currency,
  });
  let toolCalls = 0;
  let nudged = false;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // The last iteration can only answer, so the budget never ends in silence.
    const lastChance = iteration === maxIterations;
    const response = await input.llm.converse({
      model: input.model,
      system,
      messages,
      tools: lastChance
        ? [finalAnswerDefinition]
        : [...input.tools, finalAnswerDefinition],
      signal,
    });

    const toolUses = response.content.filter(
      (block): block is Extract<ConverseBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use',
    );
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const final = toolUses.find((use) => use.name === FINAL_ANSWER_TOOL);
    if (final) {
      const parsed = finalAnswerSchema.safeParse(final.input);
      if (parsed.success) {
        return {
          text: parsed.data.text,
          sourceFileIds: [
            ...new Set(
              parsed.data.sourceFileIds.filter((id) => seenFileIds.has(id)),
            ),
          ],
          toolCalls,
        };
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolUseId: final.id,
            content: 'Invalid final_answer input: "text" is required.',
            isError: true,
          },
        ],
      });
      continue;
    }

    if (toolUses.length === 0) {
      // Plain text answer. If data was read, ask once for the structured form so sources are kept.
      if (text && (seenFileIds.size === 0 || nudged)) {
        return { text, sourceFileIds: [], toolCalls };
      }
      if (text) {
        nudged = true;
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Call the ${FINAL_ANSWER_TOOL} tool with that answer and the source file ids.`,
            },
          ],
        });
        continue;
      }
      throw new ChatTurnLimitError('The assistant returned an empty answer');
    }

    messages.push({ role: 'assistant', content: response.content });
    const results: ConverseBlock[] = [];
    for (const use of toolUses) {
      toolCalls++;
      try {
        const output = await input.handleTool(use.name, use.input);
        for (const id of output.fileIds ?? []) seenFileIds.add(id);
        results.push({
          type: 'tool_result',
          toolUseId: use.id,
          content: wrapToolData(output.data),
        });
      } catch (error) {
        results.push({
          type: 'tool_result',
          toolUseId: use.id,
          content: wrapToolData({
            error: error instanceof Error ? error.message : String(error),
          }),
          isError: true,
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  throw new ChatTurnLimitError();
}

/** Tool output is data, never instructions: it is serialized and fenced. */
export function wrapToolData(data: unknown): string {
  let json = JSON.stringify(data) ?? 'null';
  if (json.length > MAX_TOOL_RESULT_CHARS) {
    json = `${json.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]`;
  }
  return `<tool_result_data>${json}</tool_result_data>`;
}

/** The API needs the conversation to start with a user turn. */
function normalizeHistory(history: HistoryMessage[]): ConverseTurn[] {
  const start = history.findIndex((message) => message.role === 'user');
  if (start === -1) return [];
  return history.slice(start).map((message) => ({
    role: message.role,
    content: [{ type: 'text', text: message.content }],
  }));
}
