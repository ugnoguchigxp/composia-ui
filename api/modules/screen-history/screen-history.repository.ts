import { and, asc, count, desc, eq, getTableColumns, gt, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  generatedScreens,
  promptSessionMessages,
  promptSessions,
  screenActionLinks,
  screenJsons,
} from '../../db/schema';

export type PromptSessionRecord = typeof promptSessions.$inferSelect;
export type GeneratedScreenRecord = typeof generatedScreens.$inferSelect;
export type ScreenJsonRecord = typeof screenJsons.$inferSelect;
export type ScreenActionLinkRecord = typeof screenActionLinks.$inferSelect;
export type PromptSessionMessageRecord = typeof promptSessionMessages.$inferSelect;
export type ScreenJsonCheckpointRecord = Pick<
  ScreenJsonRecord,
  | 'action'
  | 'createdAt'
  | 'dataBindings'
  | 'databaseSchemaJsonId'
  | 'id'
  | 'inferredIntent'
  | 'prompt'
  | 'sessionId'
  | 'trigger'
  | 'updatedAt'
  | 'version'
> & {
  page: string | null;
};
export type PromptSessionMessageStatsRecord = {
  count: number;
  searchText: string | null;
  sessionId: string;
};

export type GeneratedScreenWithSessionRecord = {
  screen: GeneratedScreenRecord;
  session: PromptSessionRecord;
};

export type ScreenJsonWithSessionRecord = {
  screenJson: ScreenJsonRecord;
  session: PromptSessionRecord;
};

export type ScreenHistoryRepository = {
  createMessages: (
    input: (typeof promptSessionMessages.$inferInsert)[]
  ) => Promise<PromptSessionMessageRecord[]>;
  deleteActionLink: (sourceSessionId: string, actionId: string) => Promise<void>;
  createScreenJson: (input: typeof screenJsons.$inferInsert) => Promise<ScreenJsonRecord>;
  createSession: (input: typeof promptSessions.$inferInsert) => Promise<PromptSessionRecord>;
  deleteLegacyScreen: (userId: string, screenId: string) => Promise<void>;
  deleteMessagesAfterVersion: (sessionId: string, version: number) => Promise<void>;
  deleteScreenJson: (userId: string, screenJsonId: string) => Promise<void>;
  deleteScreenJsonsAfterVersion: (sessionId: string, version: number) => Promise<void>;
  deleteSession: (userId: string, sessionId: string) => Promise<void>;
  findLegacyScreenById: (
    userId: string,
    screenId: string
  ) => Promise<GeneratedScreenWithSessionRecord | null>;
  findScreenJsonById: (
    userId: string,
    screenJsonId: string
  ) => Promise<ScreenJsonWithSessionRecord | null>;
  findActiveSessionScreenJson: (
    userId: string,
    sessionId: string
  ) => Promise<ScreenJsonWithSessionRecord | null>;
  findSessionById: (userId: string, sessionId: string) => Promise<PromptSessionRecord | null>;
  listLegacyChildren: (
    userId: string,
    parentScreenId: string
  ) => Promise<GeneratedScreenWithSessionRecord[]>;
  listLegacyScreens: (userId: string) => Promise<GeneratedScreenWithSessionRecord[]>;
  listScreenJsons: (userId: string) => Promise<ScreenJsonWithSessionRecord[]>;
  listSessionActionLinks: (
    userId: string,
    sourceSessionId: string
  ) => Promise<ScreenActionLinkRecord[]>;
  listSessionMessageStats: (
    userId: string,
    sessionIds: string[]
  ) => Promise<PromptSessionMessageStatsRecord[]>;
  listSessionMessages: (userId: string, sessionId: string) => Promise<PromptSessionMessageRecord[]>;
  listSessionScreenJsonCheckpoints: (
    userId: string,
    sessionId: string
  ) => Promise<ScreenJsonCheckpointRecord[]>;
  listSessionScreenJsons: (
    userId: string,
    sessionId: string
  ) => Promise<ScreenJsonWithSessionRecord[]>;
  updateSessionActiveScreenJson: (
    sessionId: string,
    screenJsonId: string | null
  ) => Promise<PromptSessionRecord>;
  upsertActionLink: (
    input: typeof screenActionLinks.$inferInsert
  ) => Promise<ScreenActionLinkRecord>;
};

async function screenJsonIdsAfterVersion(sessionId: string, version: number) {
  const rows = await db
    .select({ id: screenJsons.id })
    .from(screenJsons)
    .where(and(eq(screenJsons.sessionId, sessionId), gt(screenJsons.version, version)));
  return rows.map((row) => row.id);
}

export const screenHistoryRepository: ScreenHistoryRepository = {
  createMessages: async (input) => {
    if (input.length === 0) return [];
    return db.insert(promptSessionMessages).values(input).returning();
  },
  deleteActionLink: async (sourceSessionId, actionId) => {
    await db
      .delete(screenActionLinks)
      .where(
        and(
          eq(screenActionLinks.sourceSessionId, sourceSessionId),
          eq(screenActionLinks.actionId, actionId)
        )
      );
  },
  createScreenJson: async (input) => {
    const [screenJson] = await db.insert(screenJsons).values(input).returning();
    if (!screenJson) throw new Error('ScreenJSON was not persisted');
    return screenJson;
  },
  createSession: async (input) => {
    const [session] = await db.insert(promptSessions).values(input).returning();
    if (!session) throw new Error('Prompt session was not persisted');
    return session;
  },
  deleteLegacyScreen: async (userId, screenId) => {
    const found = await screenHistoryRepository.findLegacyScreenById(userId, screenId);
    if (!found) return;
    await db.delete(generatedScreens).where(eq(generatedScreens.id, screenId));
  },
  deleteMessagesAfterVersion: async (sessionId, version) => {
    const ids = await screenJsonIdsAfterVersion(sessionId, version);
    if (ids.length === 0) return;
    await db.delete(promptSessionMessages).where(inArray(promptSessionMessages.screenJsonId, ids));
  },
  deleteScreenJson: async (userId, screenJsonId) => {
    const found = await screenHistoryRepository.findScreenJsonById(userId, screenJsonId);
    if (!found) return;
    await db.delete(screenJsons).where(eq(screenJsons.id, screenJsonId));
  },
  deleteScreenJsonsAfterVersion: async (sessionId, version) => {
    const ids = await screenJsonIdsAfterVersion(sessionId, version);
    if (ids.length === 0) return;
    await db.delete(screenJsons).where(inArray(screenJsons.id, ids));
  },
  deleteSession: async (userId, sessionId) => {
    await db
      .delete(promptSessions)
      .where(and(eq(promptSessions.id, sessionId), eq(promptSessions.createdBy, userId)));
  },
  findLegacyScreenById: async (userId, screenId) => {
    const [row] = await db
      .select({ screen: generatedScreens, session: promptSessions })
      .from(generatedScreens)
      .innerJoin(promptSessions, eq(generatedScreens.sessionId, promptSessions.id))
      .where(and(eq(generatedScreens.id, screenId), eq(promptSessions.createdBy, userId)))
      .limit(1);
    return row ?? null;
  },
  findScreenJsonById: async (userId, screenJsonId) => {
    const [row] = await db
      .select({ screenJson: screenJsons, session: promptSessions })
      .from(screenJsons)
      .innerJoin(promptSessions, eq(screenJsons.sessionId, promptSessions.id))
      .where(and(eq(screenJsons.id, screenJsonId), eq(promptSessions.createdBy, userId)))
      .limit(1);
    return row ?? null;
  },
  findActiveSessionScreenJson: async (userId, sessionId) => {
    const [row] = await db
      .select({ screenJson: screenJsons, session: promptSessions })
      .from(screenJsons)
      .innerJoin(promptSessions, eq(screenJsons.sessionId, promptSessions.id))
      .where(and(eq(screenJsons.sessionId, sessionId), eq(promptSessions.createdBy, userId)))
      .orderBy(
        sql`case when ${screenJsons.id} = ${promptSessions.activeScreenJsonId} then 0 else 1 end`,
        desc(screenJsons.version)
      )
      .limit(1);
    return row ?? null;
  },
  findSessionById: async (userId, sessionId) => {
    const [session] = await db
      .select()
      .from(promptSessions)
      .where(and(eq(promptSessions.id, sessionId), eq(promptSessions.createdBy, userId)))
      .limit(1);
    return session ?? null;
  },
  listLegacyChildren: async (userId, parentScreenId) =>
    db
      .select({ screen: generatedScreens, session: promptSessions })
      .from(generatedScreens)
      .innerJoin(promptSessions, eq(generatedScreens.sessionId, promptSessions.id))
      .where(
        and(
          eq(generatedScreens.parentScreenId, parentScreenId),
          eq(promptSessions.createdBy, userId)
        )
      )
      .orderBy(desc(generatedScreens.createdAt)),
  listLegacyScreens: async (userId) =>
    db
      .select({ screen: generatedScreens, session: promptSessions })
      .from(generatedScreens)
      .innerJoin(promptSessions, eq(generatedScreens.sessionId, promptSessions.id))
      .where(eq(promptSessions.createdBy, userId))
      .orderBy(desc(generatedScreens.createdAt)),
  listScreenJsons: async (userId) =>
    db
      .select({ screenJson: screenJsons, session: promptSessions })
      .from(screenJsons)
      .innerJoin(promptSessions, eq(screenJsons.sessionId, promptSessions.id))
      .where(eq(promptSessions.createdBy, userId))
      .orderBy(desc(screenJsons.createdAt)),
  listSessionActionLinks: async (userId, sourceSessionId) =>
    db
      .select(getTableColumns(screenActionLinks))
      .from(screenActionLinks)
      .innerJoin(promptSessions, eq(screenActionLinks.sourceSessionId, promptSessions.id))
      .where(
        and(
          eq(screenActionLinks.sourceSessionId, sourceSessionId),
          eq(promptSessions.createdBy, userId)
        )
      )
      .orderBy(asc(screenActionLinks.createdAt)),
  listSessionMessageStats: async (userId, sessionIds) => {
    if (sessionIds.length === 0) return [];
    return db
      .select({
        sessionId: promptSessionMessages.sessionId,
        count: count(promptSessionMessages.id),
        searchText: sql<
          string | null
        >`string_agg(${promptSessionMessages.content}, E'\n' ORDER BY ${promptSessionMessages.createdAt})`,
      })
      .from(promptSessionMessages)
      .innerJoin(promptSessions, eq(promptSessionMessages.sessionId, promptSessions.id))
      .where(
        and(
          eq(promptSessions.createdBy, userId),
          inArray(promptSessionMessages.sessionId, sessionIds)
        )
      )
      .groupBy(promptSessionMessages.sessionId);
  },
  listSessionMessages: async (userId, sessionId) => {
    return db
      .select(getTableColumns(promptSessionMessages))
      .from(promptSessionMessages)
      .innerJoin(promptSessions, eq(promptSessionMessages.sessionId, promptSessions.id))
      .where(
        and(eq(promptSessionMessages.sessionId, sessionId), eq(promptSessions.createdBy, userId))
      )
      .orderBy(asc(promptSessionMessages.createdAt));
  },
  listSessionScreenJsonCheckpoints: async (userId, sessionId) =>
    db
      .select({
        id: screenJsons.id,
        sessionId: screenJsons.sessionId,
        version: screenJsons.version,
        prompt: screenJsons.prompt,
        trigger: screenJsons.trigger,
        inferredIntent: screenJsons.inferredIntent,
        action: screenJsons.action,
        page: sql<string | null>`${screenJsons.schema}->>'page'`,
        databaseSchemaJsonId: screenJsons.databaseSchemaJsonId,
        dataBindings: screenJsons.dataBindings,
        createdAt: screenJsons.createdAt,
        updatedAt: screenJsons.updatedAt,
      })
      .from(screenJsons)
      .innerJoin(promptSessions, eq(screenJsons.sessionId, promptSessions.id))
      .where(and(eq(screenJsons.sessionId, sessionId), eq(promptSessions.createdBy, userId)))
      .orderBy(asc(screenJsons.version)),
  listSessionScreenJsons: async (userId, sessionId) =>
    db
      .select({ screenJson: screenJsons, session: promptSessions })
      .from(screenJsons)
      .innerJoin(promptSessions, eq(screenJsons.sessionId, promptSessions.id))
      .where(and(eq(screenJsons.sessionId, sessionId), eq(promptSessions.createdBy, userId)))
      .orderBy(asc(screenJsons.version)),
  updateSessionActiveScreenJson: async (sessionId, screenJsonId) => {
    const [session] = await db
      .update(promptSessions)
      .set({ activeScreenJsonId: screenJsonId })
      .where(eq(promptSessions.id, sessionId))
      .returning();
    if (!session) throw new Error('Prompt session was not updated');
    return session;
  },
  upsertActionLink: async (input) => {
    const [link] = await db
      .insert(screenActionLinks)
      .values(input)
      .onConflictDoUpdate({
        target: [screenActionLinks.sourceSessionId, screenActionLinks.actionId],
        set: {
          targetPath: input.targetPath ?? null,
          targetSessionId: input.targetSessionId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!link) throw new Error('Screen action link was not persisted');
    return link;
  },
};
