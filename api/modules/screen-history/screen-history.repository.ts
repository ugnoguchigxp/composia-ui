import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  generatedScreens,
  promptSessionMessages,
  promptSessions,
  screenJsons,
} from '../../db/schema';

export type PromptSessionRecord = typeof promptSessions.$inferSelect;
export type GeneratedScreenRecord = typeof generatedScreens.$inferSelect;
export type ScreenJsonRecord = typeof screenJsons.$inferSelect;
export type PromptSessionMessageRecord = typeof promptSessionMessages.$inferSelect;

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
  createScreenJson: (input: typeof screenJsons.$inferInsert) => Promise<ScreenJsonRecord>;
  createSession: (input: typeof promptSessions.$inferInsert) => Promise<PromptSessionRecord>;
  deleteLegacyScreen: (userId: string, screenId: string) => Promise<void>;
  deleteMessagesAfterVersion: (sessionId: string, version: number) => Promise<void>;
  deleteScreenJson: (userId: string, screenJsonId: string) => Promise<void>;
  deleteScreenJsonsAfterVersion: (sessionId: string, version: number) => Promise<void>;
  findLegacyScreenById: (
    userId: string,
    screenId: string
  ) => Promise<GeneratedScreenWithSessionRecord | null>;
  findScreenJsonById: (
    userId: string,
    screenJsonId: string
  ) => Promise<ScreenJsonWithSessionRecord | null>;
  findSessionById: (userId: string, sessionId: string) => Promise<PromptSessionRecord | null>;
  listLegacyChildren: (
    userId: string,
    parentScreenId: string
  ) => Promise<GeneratedScreenWithSessionRecord[]>;
  listLegacyScreens: (userId: string) => Promise<GeneratedScreenWithSessionRecord[]>;
  listScreenJsons: (userId: string) => Promise<ScreenJsonWithSessionRecord[]>;
  listSessionMessages: (userId: string, sessionId: string) => Promise<PromptSessionMessageRecord[]>;
  listSessionScreenJsons: (
    userId: string,
    sessionId: string
  ) => Promise<ScreenJsonWithSessionRecord[]>;
  updateSessionActiveScreenJson: (
    sessionId: string,
    screenJsonId: string | null
  ) => Promise<PromptSessionRecord>;
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
  listSessionMessages: async (userId, sessionId) => {
    const session = await screenHistoryRepository.findSessionById(userId, sessionId);
    if (!session) return [];
    return db
      .select()
      .from(promptSessionMessages)
      .where(eq(promptSessionMessages.sessionId, sessionId))
      .orderBy(asc(promptSessionMessages.createdAt));
  },
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
};
