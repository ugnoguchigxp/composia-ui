import { and, asc, desc, eq, gt, inArray, isNotNull, max } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  databaseDesignMessages,
  databaseDesignSessions,
  databaseSchemaJsons,
  promptSessions,
  sandboxManagedObjects,
  sandboxMigrationRuns,
  screenJsons,
} from '../../db/schema';

export type DatabaseDesignSessionRecord = typeof databaseDesignSessions.$inferSelect;
export type DatabaseSchemaJsonRecord = typeof databaseSchemaJsons.$inferSelect;
export type DatabaseSchemaJsonDraftRecord = Pick<
  DatabaseSchemaJsonRecord,
  'createdAt' | 'designSessionId' | 'id' | 'prompt' | 'schema' | 'trigger' | 'updatedAt' | 'version'
>;
export type DatabaseDesignMessageRecord = typeof databaseDesignMessages.$inferSelect;
export type SandboxMigrationRunRecord = typeof sandboxMigrationRuns.$inferSelect;
export type SandboxManagedObjectRecord = typeof sandboxManagedObjects.$inferSelect;
export type ScreenJsonWithPromptSessionRecord = {
  screenJson: typeof screenJsons.$inferSelect;
  session: typeof promptSessions.$inferSelect;
};

export type DatabaseSchemaJsonWithSessionRecord = {
  databaseSchemaJson: DatabaseSchemaJsonRecord;
  session: DatabaseDesignSessionRecord;
};

export type DatabaseSchemaJsonDraftWithSessionRecord = {
  databaseSchemaJson: DatabaseSchemaJsonDraftRecord;
  session: DatabaseDesignSessionRecord;
};

export type DatabaseDesignSourceScreenRecord = {
  databaseSchemaJsonId: string | null;
  screenJsonId: string | null;
};

export type DatabaseDesignBoundScreenRecord = {
  databaseSchemaJsonId: string | null;
  promptSessionId: string;
  screenJsonId: string;
};

export type DatabaseDesignRepository = {
  createDesignSession: (
    input: typeof databaseDesignSessions.$inferInsert
  ) => Promise<DatabaseDesignSessionRecord>;
  createMessages: (
    input: (typeof databaseDesignMessages.$inferInsert)[]
  ) => Promise<DatabaseDesignMessageRecord[]>;
  createMigrationRun: (
    input: typeof sandboxMigrationRuns.$inferInsert
  ) => Promise<SandboxMigrationRunRecord>;
  createSchemaJson: (
    input: typeof databaseSchemaJsons.$inferInsert
  ) => Promise<DatabaseSchemaJsonRecord>;
  createScreenJson: (
    input: typeof screenJsons.$inferInsert
  ) => Promise<typeof screenJsons.$inferSelect>;
  deleteSchemaJson: (designSessionId: string, databaseSchemaJsonId: string) => Promise<void>;
  deleteScreenJsonsAfterVersion: (sessionId: string, version: number) => Promise<void>;
  findDesignSessionById: (
    userId: string,
    designSessionId: string
  ) => Promise<DatabaseDesignSessionRecord | null>;
  findSchemaJsonById: (
    userId: string,
    databaseSchemaJsonId: string
  ) => Promise<DatabaseSchemaJsonWithSessionRecord | null>;
  findScreenJsonById: (
    userId: string,
    screenJsonId: string
  ) => Promise<ScreenJsonWithPromptSessionRecord | null>;
  latestAppliedSchemaJson: () => Promise<DatabaseSchemaJsonRecord | null>;
  latestSchemaJsonForSession: (designSessionId: string) => Promise<DatabaseSchemaJsonRecord | null>;
  nextSchemaVersion: (designSessionId: string) => Promise<number>;
  nextScreenJsonVersion: (sessionId: string) => Promise<number>;
  listDesignMessages: (designSessionId: string) => Promise<DatabaseDesignMessageRecord[]>;
  listMigrationRunsBySchemaJsonIds: (
    databaseSchemaJsonIds: string[]
  ) => Promise<SandboxMigrationRunRecord[]>;
  listManagedObjects: () => Promise<SandboxManagedObjectRecord[]>;
  listSchemaJsons: (designSessionId: string) => Promise<DatabaseSchemaJsonRecord[]>;
  listSchemaJsonsForUser: (userId: string) => Promise<DatabaseSchemaJsonDraftWithSessionRecord[]>;
  listSourceScreenJsonIdsBySchemaJsonIds: (
    databaseSchemaJsonIds: string[]
  ) => Promise<DatabaseDesignSourceScreenRecord[]>;
  listBoundScreenJsonsBySchemaJsonIds: (
    databaseSchemaJsonIds: string[]
  ) => Promise<DatabaseDesignBoundScreenRecord[]>;
  markAppliedMigrationRunsReverted: () => Promise<void>;
  markManagedObjectsDropped: (ids: string[]) => Promise<void>;
  replaceManagedObjects: (
    input: (typeof sandboxManagedObjects.$inferInsert)[]
  ) => Promise<SandboxManagedObjectRecord[]>;
  updateDesignSessionActive: (
    designSessionId: string,
    input: {
      activeDatabaseSchemaJsonId?: string | null;
      activeScreenJsonId?: string | null;
    }
  ) => Promise<DatabaseDesignSessionRecord>;
  updateMigrationRun: (
    migrationRunId: string,
    input: Partial<typeof sandboxMigrationRuns.$inferInsert>
  ) => Promise<SandboxMigrationRunRecord>;
  updatePromptSessionActiveScreenJson: (
    sessionId: string,
    screenJsonId: string
  ) => Promise<typeof promptSessions.$inferSelect>;
};

export function createDatabaseDesignRepository(dbInstance: typeof db): DatabaseDesignRepository {
  return {
    createDesignSession: async (input) => {
      const [session] = await dbInstance.insert(databaseDesignSessions).values(input).returning();
      if (!session) throw new Error('Database design session was not persisted');
      return session;
    },
    createMessages: async (input) => {
      if (input.length === 0) return [];
      return dbInstance.insert(databaseDesignMessages).values(input).returning();
    },
    createMigrationRun: async (input) => {
      const [run] = await dbInstance.insert(sandboxMigrationRuns).values(input).returning();
      if (!run) throw new Error('Sandbox migration run was not persisted');
      return run;
    },
    createSchemaJson: async (input) => {
      const [schemaJson] = await dbInstance.insert(databaseSchemaJsons).values(input).returning();
      if (!schemaJson) throw new Error('DatabaseSchemaJSON was not persisted');
      return schemaJson;
    },
    createScreenJson: async (input) => {
      const [screenJson] = await dbInstance.insert(screenJsons).values(input).returning();
      if (!screenJson) throw new Error('ScreenJSON was not persisted');
      return screenJson;
    },
    deleteSchemaJson: async (designSessionId, databaseSchemaJsonId) => {
      await dbInstance.transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(databaseDesignSessions)
          .where(eq(databaseDesignSessions.id, designSessionId))
          .limit(1);

        await tx
          .delete(databaseSchemaJsons)
          .where(
            and(
              eq(databaseSchemaJsons.id, databaseSchemaJsonId),
              eq(databaseSchemaJsons.designSessionId, designSessionId)
            )
          );

        if (session?.activeDatabaseSchemaJsonId !== databaseSchemaJsonId) return;

        const [nextActive] = await tx
          .select({ id: databaseSchemaJsons.id })
          .from(databaseSchemaJsons)
          .where(eq(databaseSchemaJsons.designSessionId, designSessionId))
          .orderBy(desc(databaseSchemaJsons.version))
          .limit(1);

        await tx
          .update(databaseDesignSessions)
          .set({ activeDatabaseSchemaJsonId: nextActive?.id ?? null })
          .where(eq(databaseDesignSessions.id, designSessionId));
      });
    },
    deleteScreenJsonsAfterVersion: async (sessionId, version) => {
      await dbInstance
        .delete(screenJsons)
        .where(and(eq(screenJsons.sessionId, sessionId), gt(screenJsons.version, version)));
    },
    findDesignSessionById: async (userId, designSessionId) => {
      const [session] = await dbInstance
        .select()
        .from(databaseDesignSessions)
        .where(
          and(
            eq(databaseDesignSessions.id, designSessionId),
            eq(databaseDesignSessions.createdBy, userId)
          )
        )
        .limit(1);
      return session ?? null;
    },
    findSchemaJsonById: async (userId, databaseSchemaJsonId) => {
      const [row] = await dbInstance
        .select({ databaseSchemaJson: databaseSchemaJsons, session: databaseDesignSessions })
        .from(databaseSchemaJsons)
        .innerJoin(
          databaseDesignSessions,
          eq(databaseSchemaJsons.designSessionId, databaseDesignSessions.id)
        )
        .where(
          and(
            eq(databaseSchemaJsons.id, databaseSchemaJsonId),
            eq(databaseDesignSessions.createdBy, userId)
          )
        )
        .limit(1);
      return row ?? null;
    },
    findScreenJsonById: async (userId, screenJsonId) => {
      const [row] = await dbInstance
        .select({ screenJson: screenJsons, session: promptSessions })
        .from(screenJsons)
        .innerJoin(promptSessions, eq(screenJsons.sessionId, promptSessions.id))
        .where(and(eq(screenJsons.id, screenJsonId), eq(promptSessions.createdBy, userId)))
        .limit(1);
      return row ?? null;
    },
    latestAppliedSchemaJson: async () => {
      const [row] = await dbInstance
        .select({ databaseSchemaJson: databaseSchemaJsons })
        .from(sandboxMigrationRuns)
        .innerJoin(
          databaseSchemaJsons,
          eq(sandboxMigrationRuns.databaseSchemaJsonId, databaseSchemaJsons.id)
        )
        .where(eq(sandboxMigrationRuns.status, 'applied'))
        .orderBy(desc(sandboxMigrationRuns.appliedAt), desc(sandboxMigrationRuns.createdAt))
        .limit(1);
      return row?.databaseSchemaJson ?? null;
    },
    latestSchemaJsonForSession: async (designSessionId) => {
      const [row] = await dbInstance
        .select()
        .from(databaseSchemaJsons)
        .where(eq(databaseSchemaJsons.designSessionId, designSessionId))
        .orderBy(desc(databaseSchemaJsons.version))
        .limit(1);
      return row ?? null;
    },
    nextSchemaVersion: async (designSessionId) => {
      const [row] = await dbInstance
        .select({ version: max(databaseSchemaJsons.version) })
        .from(databaseSchemaJsons)
        .where(eq(databaseSchemaJsons.designSessionId, designSessionId));
      return Number(row?.version ?? 0) + 1;
    },
    nextScreenJsonVersion: async (sessionId) => {
      const [row] = await dbInstance
        .select({ version: max(screenJsons.version) })
        .from(screenJsons)
        .where(eq(screenJsons.sessionId, sessionId));
      return Number(row?.version ?? 0) + 1;
    },
    listDesignMessages: async (designSessionId) =>
      dbInstance
        .select()
        .from(databaseDesignMessages)
        .where(eq(databaseDesignMessages.designSessionId, designSessionId))
        .orderBy(asc(databaseDesignMessages.createdAt)),
    listMigrationRunsBySchemaJsonIds: async (databaseSchemaJsonIds) => {
      if (databaseSchemaJsonIds.length === 0) return [];
      return dbInstance
        .select()
        .from(sandboxMigrationRuns)
        .where(inArray(sandboxMigrationRuns.databaseSchemaJsonId, databaseSchemaJsonIds))
        .orderBy(desc(sandboxMigrationRuns.appliedAt), desc(sandboxMigrationRuns.createdAt));
    },
    listManagedObjects: async () =>
      dbInstance
        .select()
        .from(sandboxManagedObjects)
        .orderBy(asc(sandboxManagedObjects.objectName)),
    listSchemaJsons: async (designSessionId) =>
      dbInstance
        .select()
        .from(databaseSchemaJsons)
        .where(eq(databaseSchemaJsons.designSessionId, designSessionId))
        .orderBy(asc(databaseSchemaJsons.version)),
    listSchemaJsonsForUser: async (userId) =>
      dbInstance
        .select({
          databaseSchemaJson: {
            createdAt: databaseSchemaJsons.createdAt,
            designSessionId: databaseSchemaJsons.designSessionId,
            id: databaseSchemaJsons.id,
            prompt: databaseSchemaJsons.prompt,
            schema: databaseSchemaJsons.schema,
            trigger: databaseSchemaJsons.trigger,
            updatedAt: databaseSchemaJsons.updatedAt,
            version: databaseSchemaJsons.version,
          },
          session: databaseDesignSessions,
        })
        .from(databaseDesignSessions)
        .innerJoin(
          databaseSchemaJsons,
          eq(databaseDesignSessions.activeDatabaseSchemaJsonId, databaseSchemaJsons.id)
        )
        .where(eq(databaseDesignSessions.createdBy, userId))
        .orderBy(desc(databaseDesignSessions.updatedAt), desc(databaseSchemaJsons.createdAt)),
    listSourceScreenJsonIdsBySchemaJsonIds: async (databaseSchemaJsonIds) => {
      if (databaseSchemaJsonIds.length === 0) return [];
      return dbInstance
        .select({
          databaseSchemaJsonId: databaseDesignMessages.databaseSchemaJsonId,
          screenJsonId: databaseDesignMessages.screenJsonId,
        })
        .from(databaseDesignMessages)
        .where(
          and(
            inArray(databaseDesignMessages.databaseSchemaJsonId, databaseSchemaJsonIds),
            isNotNull(databaseDesignMessages.screenJsonId)
          )
        )
        .orderBy(asc(databaseDesignMessages.createdAt));
    },
    listBoundScreenJsonsBySchemaJsonIds: async (databaseSchemaJsonIds) => {
      if (databaseSchemaJsonIds.length === 0) return [];
      return dbInstance
        .select({
          databaseSchemaJsonId: screenJsons.databaseSchemaJsonId,
          promptSessionId: screenJsons.sessionId,
          screenJsonId: screenJsons.id,
        })
        .from(screenJsons)
        .where(inArray(screenJsons.databaseSchemaJsonId, databaseSchemaJsonIds))
        .orderBy(desc(screenJsons.version), desc(screenJsons.createdAt));
    },
    markAppliedMigrationRunsReverted: async () => {
      await dbInstance
        .update(sandboxMigrationRuns)
        .set({ status: 'reverted' })
        .where(eq(sandboxMigrationRuns.status, 'applied'));
    },
    markManagedObjectsDropped: async (ids) => {
      if (ids.length === 0) return;
      await dbInstance
        .update(sandboxManagedObjects)
        .set({ status: 'dropped' })
        .where(inArray(sandboxManagedObjects.id, ids));
    },
    replaceManagedObjects: async (input) =>
      dbInstance.transaction(async (tx) => {
        await tx.delete(sandboxManagedObjects);
        if (input.length === 0) return [];
        return tx.insert(sandboxManagedObjects).values(input).returning();
      }),
    updateDesignSessionActive: async (designSessionId, input) => {
      const [session] = await dbInstance
        .update(databaseDesignSessions)
        .set(input)
        .where(eq(databaseDesignSessions.id, designSessionId))
        .returning();
      if (!session) throw new Error('Database design session was not updated');
      return session;
    },
    updateMigrationRun: async (migrationRunId, input) => {
      const [run] = await dbInstance
        .update(sandboxMigrationRuns)
        .set(input)
        .where(eq(sandboxMigrationRuns.id, migrationRunId))
        .returning();
      if (!run) throw new Error('Sandbox migration run was not updated');
      return run;
    },
    updatePromptSessionActiveScreenJson: async (sessionId, screenJsonId) => {
      const [session] = await dbInstance
        .update(promptSessions)
        .set({ activeScreenJsonId: screenJsonId })
        .where(eq(promptSessions.id, sessionId))
        .returning();
      if (!session) throw new Error('Prompt session was not updated');
      return session;
    },
  };
}

export const databaseDesignRepository = createDatabaseDesignRepository(db);
