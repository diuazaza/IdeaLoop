import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

export interface UsersTable {
  id: Generated<number>;
  username: string;
  email: string;
  password_hash: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface SkillsTable {
  id: Generated<number>;
  name: string;
  category: string | null;
}

export interface UserSkillsTable {
  user_id: number;
  skill_id: number;
  proficiency_level: string | null;
  is_open_to_teach: ColumnType<boolean, boolean | undefined, boolean>;
  created_at: ColumnType<Date, Date | string | undefined, never>;
}

export interface Database {
  users: UsersTable;
  skills: SkillsTable;
  user_skills: UserSkillsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;
export type PublicUser = Omit<User, "password_hash">;