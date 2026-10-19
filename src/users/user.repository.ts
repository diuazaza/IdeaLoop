import type { Kysely } from "kysely";
import { db as rawDb } from "../db/connection.js";
import type { Database, NewUser, PublicUser, UserUpdate } from "../db/types.js";

const db = rawDb as unknown as Kysely<Database>;

const publicColumns = [
  "id",
  "username",
  "email",
  "bio",
  "avatar_url",
  "created_at",
  "updated_at",
] as const;

export interface UserSkillInput {
  skill_id: number;
  proficiency_level: string | null;
  is_open_to_teach: boolean;
}

export const userRepository = {
  create(data: NewUser): Promise<PublicUser> {
    return db.insertInto("users").values(data).returning(publicColumns).executeTakeFirstOrThrow();
  },

  findAll(limit: number, offset: number): Promise<PublicUser[]> {
    return db
      .selectFrom("users")
      .select(publicColumns)
      .orderBy("id")
      .limit(limit)
      .offset(offset)
      .execute();
  },

  findById(id: number): Promise<PublicUser | undefined> {
    return db.selectFrom("users").select(publicColumns).where("id", "=", id).executeTakeFirst();
  },

  update(id: number, data: UserUpdate): Promise<PublicUser | undefined> {
    return db
      .updateTable("users")
      .set({ ...data, updated_at: new Date() })
      .where("id", "=", id)
      .returning(publicColumns)
      .executeTakeFirst();
  },

  async delete(id: number): Promise<boolean> {
    const result = await db.deleteFrom("users").where("id", "=", id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  },

  getSkills(userId: number) {
    return db
      .selectFrom("user_skills")
      .innerJoin("skills", "skills.id", "user_skills.skill_id")
      .select([
        "skills.id",
        "skills.name",
        "skills.category",
        "user_skills.proficiency_level",
        "user_skills.is_open_to_teach",
      ])
      .where("user_skills.user_id", "=", userId)
      .orderBy("skills.name")
      .execute();
  },

  replaceSkills(userId: number, skills: UserSkillInput[]): Promise<void> {
    return db.transaction().execute(async (trx) => {
      await trx.deleteFrom("user_skills").where("user_id", "=", userId).execute();
      if (skills.length > 0) {
        await trx
          .insertInto("user_skills")
          .values(skills.map((s) => ({ user_id: userId, ...s })))
          .execute();
      }
    });
  },
};