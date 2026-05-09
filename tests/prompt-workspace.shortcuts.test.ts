import { describe, expect, it } from 'vitest';
import { isPromptSubmitShortcut } from '../src/modules/screen-history/components/PromptWorkspace';

type PromptShortcutInput = Parameters<typeof isPromptSubmitShortcut>[0];

function shortcutEvent(overrides: Partial<PromptShortcutInput> = {}): PromptShortcutInput {
  return {
    altKey: false,
    ctrlKey: true,
    key: 'Enter',
    metaKey: false,
    nativeEvent: { isComposing: false } as PromptShortcutInput['nativeEvent'],
    shiftKey: false,
    ...overrides,
  };
}

describe('PromptWorkspace shortcuts', () => {
  it('treats Ctrl+Enter as a prompt submit shortcut', () => {
    expect(isPromptSubmitShortcut(shortcutEvent())).toBe(true);
  });

  it('keeps plain Enter and modified Enter available for textarea input', () => {
    expect(isPromptSubmitShortcut(shortcutEvent({ ctrlKey: false }))).toBe(false);
    expect(isPromptSubmitShortcut(shortcutEvent({ shiftKey: true }))).toBe(false);
    expect(isPromptSubmitShortcut(shortcutEvent({ altKey: true }))).toBe(false);
    expect(isPromptSubmitShortcut(shortcutEvent({ metaKey: true }))).toBe(false);
    expect(isPromptSubmitShortcut(shortcutEvent({ key: 'a' }))).toBe(false);
  });

  it('does not submit while IME composition is active', () => {
    expect(
      isPromptSubmitShortcut(
        shortcutEvent({
          nativeEvent: { isComposing: true } as PromptShortcutInput['nativeEvent'],
        })
      )
    ).toBe(false);
  });
});
