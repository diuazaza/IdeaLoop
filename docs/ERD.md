
# IdeaLoop — Entity Relationship Diagram

This ERD documents the planned IdeaLoop database schema, based on migrations 001–005.

```mermaid
erDiagram
    users {
        int id PK
        varchar username UK
        varchar email UK
        varchar password_hash
        text bio
        varchar avatar_url
        timestamptz created_at
        timestamptz updated_at
    }

    skills {
        int id PK
        varchar name UK
        varchar category
    }

    user_skills {
        int user_id PK, FK
        int skill_id PK, FK
        varchar proficiency_level
        boolean is_open_to_teach
        timestamptz created_at
    }

    projects {
        int id PK
        int user_id FK
        varchar title
        text description
        varchar project_url
        boolean is_seeking_collaborators
        timestamptz created_at
        timestamptz updated_at
    }

    project_media {
        int id PK
        int project_id FK
        varchar media_url
        varchar media_type
        int display_order
        timestamptz created_at
    }

    tags {
        int id PK
        varchar name UK
    }

    project_tags {
        int project_id PK, FK
        int tag_id PK, FK
    }

    project_skills {
        int project_id PK, FK
        int skill_id PK, FK
    }

    saved_projects {
        int user_id PK, FK
        int project_id PK, FK
        timestamptz created_at
    }

    project_likes {
        int user_id PK, FK
        int project_id PK, FK
        timestamptz created_at
    }

    project_comments {
        int id PK
        int user_id FK
        int project_id FK
        int parent_comment_id FK
        text content
        timestamptz created_at
        timestamptz updated_at
    }

    learning_requests {
        int id PK
        int learner_id FK
        int creator_id FK
        int skill_id FK
        text message
        varchar status
        timestamptz created_at
        timestamptz updated_at
    }

    collaboration_requests {
        int id PK
        int sender_id FK
        int receiver_id FK
        int project_id FK
        int skill_id FK
        text message
        varchar status
        timestamptz created_at
        timestamptz updated_at
    }

    users ||--o{ user_skills : has
    skills ||--o{ user_skills : assigned_to

    users ||--o{ projects : creates
    projects ||--o{ project_media : contains

    projects ||--o{ project_tags : tagged_with
    tags ||--o{ project_tags : assigned_to

    projects ||--o{ project_skills : requires
    skills ||--o{ project_skills : used_in

    users ||--o{ saved_projects : saves
    projects ||--o{ saved_projects : saved_by

    users ||--o{ project_likes : likes
    projects ||--o{ project_likes : liked_by

    users ||--o{ project_comments : writes
    projects ||--o{ project_comments : receives
    project_comments |o--o{ project_comments : replies_to

    users ||--o{ learning_requests : learner
    users ||--o{ learning_requests : creator
    skills ||--o{ learning_requests : requested_skill

    users ||--o{ collaboration_requests : sender
    users ||--o{ collaboration_requests : receiver
    projects |o--o{ collaboration_requests : related_project
    skills |o--o{ collaboration_requests : related_skill
```

## Additional database constraints

- Usernames and email addresses are unique regardless of capitalization (migration 005).
- `user_skills.proficiency_level` accepts Beginner, Intermediate, Advanced, or Expert.
- `project_media.media_type` accepts image, video, audio, or document.
- Learning and collaboration request statuses accept pending, accepted, or declined.
- Learning requests must have different learner and creator IDs.
- Collaboration requests must have different sender and receiver IDs.
- Collaboration requests require at least one of `project_id` or `skill_id`.
- Nullable foreign keys include `project_comments.parent_comment_id`, `collaboration_requests.project_id`, and `collaboration_requests.skill_id`.
