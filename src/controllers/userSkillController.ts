import type { RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { HttpError } from '../middleware/httpError.js';
import * as validate from './userValidation.js';


const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;
type Level = (typeof LEVELS)[number];

export function createUserSkillController(db: Kysely<Database>) {
  async function assertUserExists(id: number) {
    const user = await db.selectFrom('users').select('id').where('id', '=', id).executeTakeFirst();
    if (!user) throw new HttpError(404, 'User not found');
  }

  function fetchSkills(userId: number) {
    return db.selectFrom('user_skills')
      .innerJoin('skills', 'skills.id', 'user_skills.skill_id')
      .select([
        'skills.id', 'skills.name', 'skills.category',
        'user_skills.proficiency_level', 'user_skills.is_open_to_teach',
      ])
      .where('user_skills.user_id', '=', userId)
      .orderBy('skills.name')
      .execute();
  }

  // GET /api/users/:id/skills
  const list: RequestHandler = async (req, res) => {
    const id = validate.userId(req.params.id);
    await assertUserExists(id);
    res.json({ skills: await fetchSkills(id) });
  };

  // PUT /api/users/:id/skills
  const replace: RequestHandler = async (req, res) => {
    const id = validate.userId(req.params.id);
    if (id !== res.locals.userId) throw new HttpError(403, 'You can only modify your own skills');

    const raw = (req.body as { skills?: unknown } | undefined)?.skills;
    if (!Array.isArray(raw)) throw new HttpError(400, 'Body must be { "skills": [...] }');
    if (raw.length > 50) throw new HttpError(400, 'A user can list at most 50 skills');

    const rows = raw.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) throw new HttpError(400, 'Each skill must be an object');
      const s = item as Record<string, unknown>;
      if (typeof s.skill_id !== 'number' || !Number.isInteger(s.skill_id) || s.skill_id <= 0) {
        throw new HttpError(400, 'Each skill needs a valid skill_id');
      }
      const level = s.proficiency_level ?? null;
      if (level !== null && !LEVELS.includes(level as Level)) {
        throw new HttpError(400, `proficiency_level must be one of: ${LEVELS.join(', ')}`);
      }
      if (s.is_open_to_teach !== undefined && typeof s.is_open_to_teach !== 'boolean') {
        throw new HttpError(400, 'is_open_to_teach must be true or false');
      }
      return {
        user_id: id,
        skill_id: s.skill_id,
        proficiency_level: level as Level | null,
        is_open_to_teach: s.is_open_to_teach === true,
      };
    });

    const ids = rows.map((r) => r.skill_id);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Each skill can only be listed once');

    try {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('user_skills').where('user_id', '=', id).execute();
        if (rows.length > 0) await trx.insertInto('user_skills').values(rows).execute();
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === '23503') {
        throw new HttpError(400, 'One or more skill_ids do not exist');
      }
      throw err;
    }

    res.json({ skills: await fetchSkills(id) });
  };

  return { list, replace };
}