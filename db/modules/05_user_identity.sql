-- Match migration 005_user_identity: account identity is case-insensitive.
-- Existing case-only duplicate usernames/emails must be resolved before applying.
CREATE UNIQUE INDEX users_username_case_insensitive ON users (lower(username));
CREATE UNIQUE INDEX users_email_case_insensitive ON users (lower(email));
