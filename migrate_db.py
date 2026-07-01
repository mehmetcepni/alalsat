import psycopg2

DB_CONFIG = {
    "user": "postgres",
    "password": "password123",
    "host": "127.0.0.1",
    "port": "5433",
    "database": "postgres",
}

SQL_MIGRATION = r"""
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --- Hardening: users ---
ALTER TABLE IF EXISTS users
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
    ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active';

-- --- Hardening: vehicles (columns used in main.py) ---
ALTER TABLE IF EXISTS vehicles
    ADD COLUMN IF NOT EXISTS category VARCHAR(120),
    ADD COLUMN IF NOT EXISTS series VARCHAR(120),
    ADD COLUMN IF NOT EXISTS vehicle_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS body_type VARCHAR(80),
    ADD COLUMN IF NOT EXISTS engine_power INTEGER,
    ADD COLUMN IF NOT EXISTS engine_capacity INTEGER,
    ADD COLUMN IF NOT EXISTS drive_type VARCHAR(80),
    ADD COLUMN IF NOT EXISTS color VARCHAR(80),
    ADD COLUMN IF NOT EXISTS has_warranty BOOLEAN,
    ADD COLUMN IF NOT EXISTS heavy_damage BOOLEAN,
    ADD COLUMN IF NOT EXISTS plate_nationality VARCHAR(80),
    ADD COLUMN IF NOT EXISTS seller_type VARCHAR(80),
    ADD COLUMN IF NOT EXISTS exchangeable BOOLEAN;

-- --- Missing table used by backend: vehicle_images ---
CREATE TABLE IF NOT EXISTS vehicle_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_cover BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vehicle_images_vehicle_id ON vehicle_images(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_images_is_cover ON vehicle_images(vehicle_id, is_cover);

-- --- Feature 1: friendships (two-way) ---
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status ON friend_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from_status ON friend_requests(from_user_id, status);

-- Prevent duplicate pending requests in same direction
CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pending
    ON friend_requests(from_user_id, to_user_id)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS friendships (
    user_low UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_low, user_high)
);
CREATE INDEX IF NOT EXISTS idx_friendships_user_low ON friendships(user_low);
CREATE INDEX IF NOT EXISTS idx_friendships_user_high ON friendships(user_high);

-- --- Feature 2: direct messages (WS-backed) ---
CREATE TABLE IF NOT EXISTS dm_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message-request (spawn) flow metadata
ALTER TABLE IF EXISTS dm_conversations
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS requested_to UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dm_conversations_requested_to_status
    ON dm_conversations(requested_to, status);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_requested_by_status
    ON dm_conversations(requested_by, status);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_status_updated
    ON dm_conversations(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS dm_participants (
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dm_participants_user_id ON dm_participants(user_id);

CREATE TABLE IF NOT EXISTS dm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_created ON dm_messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dm_attachments_message_id ON dm_attachments(message_id);

-- --- Feature 3: forum ---
CREATE TABLE IF NOT EXISTS forum_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forum_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES forum_categories(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_forum_threads_category_created ON forum_threads(category_id, created_at DESC);

CREATE TABLE IF NOT EXISTS forum_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_forum_posts_thread_created ON forum_posts(thread_id, created_at);

CREATE TABLE IF NOT EXISTS forum_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_thread_tags (
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES forum_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (thread_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_forum_thread_tags_tag_id ON forum_thread_tags(tag_id);

CREATE TABLE IF NOT EXISTS forum_post_likes (
    post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_forum_post_likes_user_id ON forum_post_likes(user_id);

-- Seed categories (idempotent)
INSERT INTO forum_categories(name)
VALUES
    ('Genel'),
    ('Elektrikli Araçlar'),
    ('Bakım / Servis'),
    ('Alım-Satım Tavsiyesi')
ON CONFLICT (name) DO NOTHING;
"""


def run_migration():
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(SQL_MIGRATION)
        print("✅ Migration tamamlandı.")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
