import type { ColumnType, Generated } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
interface Created { created_at: Timestamp | null }
interface Updated extends Created { updated_at: Timestamp | null }
interface User extends Updated {
  id: Generated<number>;
  username: string;
  email: string;
  password_hash: string;
  bio: string | null;
  avatar_url: string | null;
}
interface Skill { id: Generated<number>; name: string; category: string }
interface UserSkill extends Created {
  user_id: number;
  skill_id: number;
  proficiency_level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert' | null;
  is_open_to_teach: Generated<boolean>;
}
interface Project extends Updated {
  id: Generated<number>;
  user_id: number;
  title: string;
  description: string;
  project_url: string | null;
  is_seeking_collaborators: Generated<boolean>;
}
interface ProjectMedia extends Created {
  id: Generated<number>;
  project_id: number;
  media_url: string;
  media_type: 'image' | 'video' | 'audio' | 'document';
  display_order: Generated<number>;
}
interface Engagement extends Created { user_id: number; project_id: number }
interface Comment extends Updated {
  id: Generated<number>;
  user_id: number;
  project_id: number;
  parent_comment_id: number | null;
  content: string;
}
interface Request extends Updated {
  id: Generated<number>;
  message: string | null;
  status: Generated<'pending' | 'accepted' | 'declined'>;
}
interface LearningRequest extends Request {
  learner_id: number;
  creator_id: number;
  skill_id: number;
}
interface CollaborationRequest extends Request {
  sender_id: number;
  receiver_id: number;
  project_id: number | null;
  skill_id: number | null;
}

/** Matches the SQL migrations; update alongside future schema changes. */
export interface Database {
  users: User;
  skills: Skill;
  user_skills: UserSkill;
  projects: Project;
  project_media: ProjectMedia;
  tags: { id: Generated<number>; name: string };
  project_tags: { project_id: number; tag_id: number };
  project_skills: { project_id: number; skill_id: number };
  saved_projects: Engagement;
  project_likes: Engagement;
  project_comments: Comment;
  learning_requests: LearningRequest;
  collaboration_requests: CollaborationRequest;
}
