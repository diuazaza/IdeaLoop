# IdeaLoop Database Setup

This directory contains the database migration and schema setup scripts for IdeaLoop.

## Module Ownership
- `modules/01_users_skills.sql` - Diya (Users, Skills, User_Skills)
- `modules/02_projects_media.sql` - Member 2 (Projects, Media, Tags)
- `modules/03_engagement.sql` - Member 3 (Likes, Comments, Saved Projects)
- `modules/04_requests.sql` - Member 4 & 5 (Learn Requests, Collaboration Requests)

## How to Run Locally

For the backend, prefer `npm run db:migrate` after configuring `.env`. The following raw SQL steps are an alternative; do not run both against the same database.

1. Ensure PostgreSQL is installed and running.
2. Create local database: `createdb idealoop_db`
3. Execute master schema: `psql -d idealoop_db -f db/schema.sql`
4. (Optional) Load sample data: `psql -d idealoop_db -f db/seed.sql`

# Database ERD
```mermaid
erDiagram
    users ||--o{ projects : "creates"
    users ||--o{ learning_requests : "sends"
    users ||--o{ learning_requests : "receives"
    users ||--o{ collaboration_requests : "sends"
    users ||--o{ collaboration_requests : "receives"
    users ||--o{ saved_projects : "saves"
    users ||--o{ project_likes : "likes"
    users ||--o{ project_comments : "writes"
    users ||--o{ user_skills : "possesses"

    projects ||--o{ saved_projects : "is saved by"
    projects ||--o{ project_likes : "is liked by"
    projects ||--o{ project_comments : "has"
    projects ||--o{ project_media : "contains"
    projects ||--o{ project_tags : "tagged with"
    projects ||--o{ project_skills : "uses"
    projects |o--o{ collaboration_requests : "referenced in"

    tags ||--o{ project_tags : "categorizes"
    skills ||--o{ user_skills : "categorizes user"
    skills ||--o{ project_skills : "used in project"
    skills ||--o{ learning_requests : "subject of"

    users {
        int id PK
        string username
        string email
        string password_hash
        string bio
        string avatar_url
        datetime created_at
        datetime updated_at
    }

    skills {
        int id PK
        string name
        string category
    }

    user_skills {
        int user_id PK, FK
        int skill_id PK, FK
        string proficiency_level
        boolean is_open_to_teach
        datetime created_at
    }

    projects {
        int id PK
        int user_id FK
        string title
        string description
        string project_url
        boolean is_seeking_collaborators
        datetime created_at
        datetime updated_at
    }

    project_media {
        int id PK
        int project_id FK
        string media_type
        string media_url
        int display_order
        datetime created_at
    }

    tags {
        int id PK
        string name
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
        datetime created_at
    }

    project_likes {
        int user_id PK, FK
        int project_id PK, FK
        datetime created_at
    }

    project_comments {
        int id PK
        int project_id FK
        int user_id FK
        int parent_comment_id FK
        string content
        datetime created_at
        datetime updated_at
    }

    learning_requests {
        int id PK
        int learner_id FK
        int creator_id FK
        int skill_id FK
        string message
        string status
        datetime created_at
        datetime updated_at
    }

    collaboration_requests {
        int id PK
        int sender_id FK
        int receiver_id FK
        int project_id FK
        int skill_id FK
        string message
        string status
        datetime created_at
        datetime updated_at
    }
```
