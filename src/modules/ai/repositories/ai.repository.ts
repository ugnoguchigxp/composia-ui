import type {
  AiClassificationRequest,
  AiClassificationResponse,
  AiLayoutRequest,
  AiLayoutResponse,
  AiNavigationRequest,
  AiNavigationResponse,
  AiSummaryResponse,
  AiTextRequest,
} from '../../../../shared/schemas/ai.schema';
import {
  aiClassificationResponseSchema,
  aiLayoutResponseSchema,
  aiNavigationResponseSchema,
  aiSummaryResponseSchema,
} from '../../../../shared/schemas/ai.schema';
import { client } from '../../../lib/api';

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    message?: string;
  } | null;
  return payload?.error?.message ?? payload?.message ?? 'Failed to generate UI schema';
}

export const aiRepository = {
  classify: async (input: AiClassificationRequest): Promise<AiClassificationResponse> => {
    const response = await client.ai.classify.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return aiClassificationResponseSchema.parse(await response.json());
  },
  generateLayout: async (input: AiLayoutRequest): Promise<AiLayoutResponse> => {
    const response = await client.ai.layout.$post({
      json: input,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return aiLayoutResponseSchema.parse(await response.json());
  },
  generateNavigation: async (input: AiNavigationRequest): Promise<AiNavigationResponse> => {
    const response = await client.ai.navigation.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return aiNavigationResponseSchema.parse(await response.json());
  },
  summarize: async (input: AiTextRequest): Promise<AiSummaryResponse> => {
    const response = await client.ai.summarize.$post({ json: input });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return aiSummaryResponseSchema.parse(await response.json());
  },
};
