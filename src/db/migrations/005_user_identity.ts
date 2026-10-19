import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`create unique index users_username_case_insensitive on users (lower(username))`.execute(db);
  await sql`create unique index users_email_case_insensitive on users (lower(email))`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`drop index users_email_case_insensitive`.execute(db);
  await sql`drop index users_username_case_insensitive`.execute(db);
}
