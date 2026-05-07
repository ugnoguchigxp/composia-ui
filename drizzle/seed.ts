import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { config } from '../api/config';
import { hashPassword } from '../api/lib/password';
import { users } from '../api/db/schema';

const testUser = {
  email: 'test@example.com',
  name: 'Test User',
  password: 'DevTest!2026-Composia',
};

async function main() {
  console.log('Seeding database...');
  const client = postgres(config.DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  try {
    const [existing] = await db.select().from(users).where(eq(users.email, testUser.email)).limit(1);
    const passwordHash = await hashPassword(testUser.password);
    
    if (!existing) {
      const [user] = await db.insert(users).values({
        email: testUser.email,
        name: testUser.name,
        passwordHash,
      }).returning();

      console.log('Created test user:', user.email);
    } else {
      await db
        .update(users)
        .set({
          name: testUser.name,
          passwordHash,
          isActive: true,
        })
        .where(eq(users.id, existing.id));
      console.log('Updated test user:', existing.email);
    }
  } catch (err) {
    console.error('Error seeding DB:', err);
  } finally {
    await client.end();
  }
}

main();
