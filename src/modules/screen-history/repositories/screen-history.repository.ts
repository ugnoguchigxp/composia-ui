import type {
  ScreenActionGenerateRequest,
  ScreenCheckpointRestoreResponse,
  ScreenChildrenResponse,
  ScreenConversationResponse,
  ScreenDeleteResponse,
  ScreenEditRequest,
  ScreenGenerateRequest,
  ScreenJsonResponse,
  ScreenListResponse,
  ScreenRegenerateRequest,
  ScreenResponse,
} from '../../../../shared/schemas/screen-history.schema';
import {
  screenCheckpointRestoreResponseSchema,
  screenChildrenResponseSchema,
  screenConversationResponseSchema,
  screenDeleteResponseSchema,
  screenJsonResponseSchema,
  screenListResponseSchema,
  screenResponseSchema,
} from '../../../../shared/schemas/screen-history.schema';
import { client } from '../../../lib/api';

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return payload?.error?.message ?? payload?.message ?? 'Screen history request failed';
}

export const screenHistoryRepository = {
  children: async (screenId: string): Promise<ScreenChildrenResponse> => {
    const response = await client.screens[':screenId'].children.$get({ param: { screenId } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenChildrenResponseSchema.parse(await response.json());
  },
  conversation: async (sessionId: string): Promise<ScreenConversationResponse> => {
    const response = await client.sessions[':sessionId'].conversation.$get({
      param: { sessionId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenConversationResponseSchema.parse(await response.json());
  },
  delete: async (screenId: string): Promise<ScreenDeleteResponse> => {
    const response = await client.screens[':screenId'].$delete({ param: { screenId } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenDeleteResponseSchema.parse(await response.json());
  },
  edit: async (sessionId: string, input: ScreenEditRequest): Promise<ScreenResponse> => {
    const response = await client.sessions[':sessionId'].edit.$post({
      json: input,
      param: { sessionId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenResponseSchema.parse(await response.json());
  },
  generate: async (input: ScreenGenerateRequest): Promise<ScreenResponse> => {
    const response = await client.screens.generate.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenResponseSchema.parse(await response.json());
  },
  generateFromAction: async (
    screenId: string,
    actionId: string,
    input: ScreenActionGenerateRequest
  ): Promise<ScreenResponse> => {
    const response = await client.screens[':screenId'].actions[':actionId'].generate.$post({
      json: input,
      param: { actionId, screenId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenResponseSchema.parse(await response.json());
  },
  generateFromSessionAction: async (
    sessionId: string,
    actionId: string,
    input: ScreenActionGenerateRequest
  ): Promise<ScreenResponse> => {
    const response = await client.sessions[':sessionId'].actions[':actionId'].generate.$post({
      json: input,
      param: { actionId, sessionId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenResponseSchema.parse(await response.json());
  },
  get: async (screenId: string): Promise<ScreenResponse> => {
    const response = await client.screens[':screenId'].$get({ param: { screenId } });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenResponseSchema.parse(await response.json());
  },
  getScreenJson: async (screenJsonId: string): Promise<ScreenJsonResponse> => {
    const response = await client['screen-jsons'][':screenJsonId'].$get({
      param: { screenJsonId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenJsonResponseSchema.parse(await response.json());
  },
  list: async (): Promise<ScreenListResponse> => {
    const response = await client.screens.$get({});
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenListResponseSchema.parse(await response.json());
  },
  regenerate: async (screenId: string, input: ScreenRegenerateRequest): Promise<ScreenResponse> => {
    const response = await client.screens[':screenId'].regenerate.$post({
      json: input,
      param: { screenId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenResponseSchema.parse(await response.json());
  },
  regenerateSession: async (
    sessionId: string,
    input: ScreenRegenerateRequest
  ): Promise<ScreenResponse> => {
    const response = await client.sessions[':sessionId'].regenerate.$post({
      json: input,
      param: { sessionId },
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenResponseSchema.parse(await response.json());
  },
  restoreCheckpoint: async (
    sessionId: string,
    screenJsonId: string
  ): Promise<ScreenCheckpointRestoreResponse> => {
    const response = await client.sessions[':sessionId'].checkpoints[':screenJsonId'].restore.$post(
      {
        param: { screenJsonId, sessionId },
      }
    );
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return screenCheckpointRestoreResponseSchema.parse(await response.json());
  },
};
