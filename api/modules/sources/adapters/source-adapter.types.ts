export type SourceAdapterItem = {
  externalId: string;
  title?: string;
  body?: string;
  summary?: string;
  url?: string;
  author?: string;
  tags?: string[];
  publishedAt?: Date;
  sourceUpdatedAt?: Date;
  raw: unknown;
};

export type SourceAdapterSettings = {
  entity?: string;
  itemPath?: string;
  titleField?: string;
  bodyField?: string;
  summaryField?: string;
  urlField?: string;
  authorField?: string;
  tagsField?: string;
  publishedAtField?: string;
  updatedAtField?: string;
};
