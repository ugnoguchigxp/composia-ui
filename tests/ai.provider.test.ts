import { describe, expect, it } from 'vitest';
import { layoutSystemContext, parseJsonText } from '../api/modules/ai/ai.provider';

describe('ai provider system context', () => {
  it('keeps generation mechanics out of visible UI labels', () => {
    expect(layoutSystemContext).toContain('Return strict JSON text only');
    expect(layoutSystemContext).toContain('Do not wrap the JSON in Markdown fences');
    expect(layoutSystemContext).toContain('user-visible product copy');
    expect(layoutSystemContext).toContain('never mention that the app will generate');
    expect(layoutSystemContext).toContain(
      'Keep generation mechanics only in action.kind and intentHint'
    );
    expect(layoutSystemContext).toContain('Do not write labels like');
    expect(layoutSystemContext).toContain('Use "sidebar" layout');
    expect(layoutSystemContext).toContain('Use CarouselSection');
    expect(layoutSystemContext).toContain('Use MasterDetailSection');
    expect(layoutSystemContext).toContain('Use EditorPreviewSection');
  });

  it('repairs minor provider JSON syntax errors before schema validation', () => {
    expect(parseJsonText("{ page: 'Operations', sections: [1, 2,], }")).toEqual({
      page: 'Operations',
      sections: [1, 2],
    });
  });

  it('repairs fenced provider JSON through the repair library', () => {
    expect(parseJsonText('```json\n{"page":"Operations"}\n```')).toEqual({
      page: 'Operations',
    });
  });
});
