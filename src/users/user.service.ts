import bcrypt from "bcryptjs";
import { userRepository, type UserSkillInput } from "./user.repository.js";
import type { PublicUser, UserUpdate } from "../db/types.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  bio?: string;
  avatar_url?: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  password?: string;
  bio?: string | null;
  avatar_url?: string | null;
}

function validateUsername(v: unknown) {
  if (typeof v !== "string" || !USERNAME_REGEX.test(v)) {
    throw new HttpError(400, "Username must be 3-30 characters: letters, numbers, or underscores.");
  }
}

function validateEmail(v: unknown) {
  if (typeof v !== "string" || !EMAIL_REGEX.test(v)) {
    throw new HttpError(400, "A valid email is required.");
  }
}

function validatePassword(v: unknown) {
  if (typeof v !== "string" || v.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }
}

function pgCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
}

// 23505 = unique constraint violation (duplicate username/email)
function handleUniqueViolation(err: unknown): never {
  if (pgCode(err) === "23505") throw new HttpError(409, "Username or email is already taken.");
  throw err;
}

export const userService = {
  async createUser(input: CreateUserInput): Promise<PublicUser> {
    validateUsername(input?.username);
    validateEmail(input?.email);
    validatePassword(input?.password);

    const password_hash = await bcrypt.hash(input.password, 10);

    try {
      return await userRepository.create({
        username: input.username,
        email: input.email.toLowerCase(),
        password_hash,
        bio: input.bio ?? null,
        avatar_url: input.avatar_url ?? null,
      });
    } catch (err) {
      handleUniqueViolation(err);
    }
  },

  listUsers(limit = 20, offset = 0): Promise<PublicUser[]> {
    return userRepository.findAll(Math.min(Math.max(limit, 1), 100), Math.max(offset, 0));
  },

  async getUser(id: number): Promise<PublicUser> {
    const user = await userRepository.findById(id);
    if (!user) throw new HttpError(404, "User not found.");
    return user;
  },

  async updateUser(id: number, input: UpdateUserInput): Promise<PublicUser> {
    const updates: UserUpdate = {};

    if (input?.username !== undefined) {
      validateUsername(input.username);
      updates.username = input.username;
    }
    if (input?.email !== undefined) {
      validateEmail(input.email);
      updates.email = input.email.toLowerCase();
    }
    if (input?.password !== undefined) {
      validatePassword(input.password);
      updates.password_hash = await bcrypt.hash(input.password, 10);
    }
    if (input?.bio !== undefined) updates.bio = input.bio;
    if (input?.avatar_url !== undefined) updates.avatar_url = input.avatar_url;

    if (Object.keys(updates).length === 0) {
      throw new HttpError(400, "No valid fields to update.");
    }

    try {
      const user = await userRepository.update(id, updates);
      if (!user) throw new HttpError(404, "User not found.");
      return user;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      handleUniqueViolation(err);
    }
  },

  async deleteUser(id: number): Promise<void> {
    const deleted = await userRepository.delete(id);
    if (!deleted) throw new HttpError(404, "User not found.");
  },

  async getUserSkills(id: number) {
    await this.getUser(id);
    return userRepository.getSkills(id);
  },

  async setUserSkills(id: number, body: unknown) {
    await this.getUser(id);

    if (!Array.isArray(body)) {
      throw new HttpError(400, "Request body must be an array of skills.");
    }

    const skills: UserSkillInput[] = body.map((s) => {
      if (!s || !Number.isInteger(s.skill_id) || s.skill_id <= 0) {
        throw new HttpError(400, "Each skill needs a valid skill_id.");
      }
      return {
        skill_id: s.skill_id,
        proficiency_level: typeof s.proficiency_level === "string" ? s.proficiency_level : null,
        is_open_to_teach: s.is_open_to_teach === true,
      };
    });

    const ids = skills.map((s) => s.skill_id);
    if (new Set(ids).size !== ids.length) {
      throw new HttpError(400, "Each skill can only be listed once.");
    }

    try {
      await userRepository.replaceSkills(id, skills);
    } catch (err) {
      if (pgCode(err) === "23503") throw new HttpError(400, "One or more skill_ids do not exist.");
      throw err;
    }

    return userRepository.getSkills(id);
  },
};