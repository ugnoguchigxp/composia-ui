import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { generatedScreens, promptSessions } from '../../db/schema';

export type PromptSessionRecord = typeof promptSessions.$inferSelect;
export type GeneratedScreenRecord = typeof generatedScreens.$inferSelect;
export type GeneratedScreenWithSessionRecord = {
  screen: GeneratedScreenRecord;
  session: PromptSessionRecord;
};

export type ScreenHistoryRepository = {
  createScreen: (input: typeof generatedScreens.$inferInsert) => Promise<GeneratedScreenRecord>;
  createSession: (input: typeof promptSessions.$inferInsert) => Promise<PromptSessionRecord>;
  deleteScreen: (userId: string, screenId: string) => Promise<void>;
  findScreenById: (
    userId: string,
    screenId: string
  ) => Promise<GeneratedScreenWithSessionRecord | null>;
  listChildren: (
    userId: string,
    parentScreenId: string
  ) => Promise<GeneratedScreenWithSessionRecord[]>;
  listScreens: (userId: string) => Promise<GeneratedScreenWithSessionRecord[]>;
};

export const screenHistoryRepository: ScreenHistoryRepository = {
  createScreen: async (input) => {
    const [screen] = await db.insert(generatedScreens).values(input).returning();
    if (!screen) throw new Error('Generated screen was not persisted');
    return screen;
  },
  createSession: async (input) => {
    const [session] = await db.insert(promptSessions).values(input).returning();
    if (!session) throw new Error('Prompt session was not persisted');
    return session;
  },
  deleteScreen: async (userId, screenId) => {
    const found = await screenHistoryRepository.findScreenById(userId, screenId);
    if (!found) return;
    await db.delete(generatedScreens).where(eq(generatedScreens.id, screenId));
  },
  findScreenById: async (userId, screenId) => {
    const [row] = await db
      .select({ screen: generatedScreens, session: promptSessions })
      .from(generatedScreens)
      .innerJoin(promptSessions, eq(generatedScreens.sessionId, promptSessions.id))
      .where(and(eq(generatedScreens.id, screenId), eq(promptSessions.createdBy, userId)))
      .limit(1);
    return row ?? null;
  },
  listChildren: async (userId, parentScreenId) =>
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
  listScreens: async (userId) =>
    db
      .select({ screen: generatedScreens, session: promptSessions })
      .from(generatedScreens)
      .innerJoin(promptSessions, eq(generatedScreens.sessionId, promptSessions.id))
      .where(eq(promptSessions.createdBy, userId))
      .orderBy(desc(generatedScreens.createdAt)),
};
