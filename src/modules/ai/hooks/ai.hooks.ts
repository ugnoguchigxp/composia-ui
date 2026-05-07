import { useMutation } from '@tanstack/react-query';
import type {
  AiClassificationRequest,
  AiLayoutRequest,
  AiNavigationRequest,
  AiTextRequest,
} from '../../../../shared/schemas/ai.schema';
import { aiRepository } from '../repositories/ai.repository';

export function useClassifyAiText() {
  return useMutation({
    mutationFn: (input: AiClassificationRequest) => aiRepository.classify(input),
  });
}

export function useGenerateAiLayout() {
  return useMutation({
    mutationFn: (input: AiLayoutRequest) => aiRepository.generateLayout(input),
  });
}

export function useGenerateAiNavigation() {
  return useMutation({
    mutationFn: (input: AiNavigationRequest) => aiRepository.generateNavigation(input),
  });
}

export function useSummarizeAiText() {
  return useMutation({
    mutationFn: (input: AiTextRequest) => aiRepository.summarize(input),
  });
}
