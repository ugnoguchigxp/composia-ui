import type {
  PromptSessionMessage,
  ScreenCheckpoint,
  ScreenJson,
} from '../../../shared/schemas/screen-history.schema';
import { appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { checkpointLabel } from './screen-history.mapper';
import type { ScreenJsonRecord } from './screen-history.repository';

export type MessageCheckpoint = Pick<
  ScreenCheckpoint,
  'createdAt' | 'id' | 'page' | 'prompt' | 'sessionId' | 'trigger' | 'updatedAt' | 'version'
>;

export function checkpointMetadata(screenJson: ScreenJsonRecord): PromptSessionMessage['metadata'] {
  return {
    checkpointScreenJsonId: screenJson.id,
    checkpointLabel,
    generatedPage: appUiSchemaSchema.parse(screenJson.schema).page,
    version: screenJson.version,
    trigger: screenJson.trigger as ScreenJson['trigger'],
  };
}

export function fallbackMessages(checkpoints: MessageCheckpoint[]): PromptSessionMessage[] {
  return checkpoints.flatMap((checkpoint) => {
    const createdAt = checkpoint.createdAt;
    return [
      {
        id: `00000000-0000-4000-8000-${checkpoint.version.toString().padStart(12, '0')}`,
        sessionId: checkpoint.sessionId,
        screenJsonId: checkpoint.id,
        role: 'user' as const,
        content: checkpoint.prompt,
        metadata: {},
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: `00000000-0000-4000-8001-${checkpoint.version.toString().padStart(12, '0')}`,
        sessionId: checkpoint.sessionId,
        screenJsonId: checkpoint.id,
        role: 'assistant' as const,
        content: `${checkpoint.page} を保存しました。`,
        metadata: {
          checkpointScreenJsonId: checkpoint.id,
          checkpointLabel,
          generatedPage: checkpoint.page,
          version: checkpoint.version,
          trigger: checkpoint.trigger,
        },
        createdAt,
        updatedAt: createdAt,
      },
    ];
  });
}

export function messagesWithFallbacks(
  checkpoints: MessageCheckpoint[],
  storedMessages: PromptSessionMessage[]
): PromptSessionMessage[] {
  const messagesByScreenJsonId = new Map<string, PromptSessionMessage[]>();
  for (const message of storedMessages) {
    messagesByScreenJsonId.set(message.screenJsonId, [
      ...(messagesByScreenJsonId.get(message.screenJsonId) ?? []),
      message,
    ]);
  }

  return checkpoints.flatMap((checkpoint) => {
    const messages = messagesByScreenJsonId.get(checkpoint.id);
    return messages && messages.length > 0 ? messages : fallbackMessages([checkpoint]);
  });
}
