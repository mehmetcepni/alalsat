import psycopg2

# Teknik plandaki SQL komutları
SQL_SCHEMA = """
-- Not: Bu dosya fresh kurulum içindir. Mevcut bir DB'yi güncellemek için `migrate_db.py` çalıştırın.

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Kullanıcılar Tablosu
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    phone VARCHAR(20),
    city VARCHAR(100),
    is_verified BOOLEAN DEFAULT FALSE,
    reset_token VARCHAR(255),
    account_status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Araç İlanları Tablosu (main.py ile uyumlu geniş şema)
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(120),
    title VARCHAR(255) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    series VARCHAR(120),
    model VARCHAR(100) NOT NULL,
    year INTEGER NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    mileage INTEGER,
    fuel_type VARCHAR(50),
    transmission VARCHAR(50),
    city VARCHAR(100),
    description TEXT,
    vehicle_status VARCHAR(50),
    body_type VARCHAR(80),
    engine_power INTEGER,
    engine_capacity INTEGER,
    drive_type VARCHAR(80),
    color VARCHAR(80),
    has_warranty BOOLEAN,
    heavy_damage BOOLEAN,
    plate_nationality VARCHAR(80),
    seller_type VARCHAR(80),
    exchangeable BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- İlan Görselleri
CREATE TABLE IF NOT EXISTS vehicle_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_cover BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Chat Geçmişi
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Arkadaşlık (istek -> kabul)
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pending
    ON friend_requests(from_user_id, to_user_id)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS friendships (
    user_low UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_low, user_high)
);

-- Chat (Direct Messages)
CREATE TABLE IF NOT EXISTS dm_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    requested_to UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS dm_participants (
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_requested_to_status
    ON dm_conversations(requested_to, status);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_requested_by_status
    ON dm_conversations(requested_by, status);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_status_updated
    ON dm_conversations(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS dm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dm_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Forum
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

CREATE TABLE IF NOT EXISTS forum_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forum_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_thread_tags (
    thread_id UUID NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES forum_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (thread_id, tag_id)
);

CREATE TABLE IF NOT EXISTS forum_post_likes (
    post_id UUID NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id)
);

INSERT INTO forum_categories(name)
VALUES
    ('Genel'),
    ('Elektrikli Araçlar'),
    ('Bakım / Servis'),
    ('Alım-Satım Tavsiyesi')
ON CONFLICT (name) DO NOTHING;
"""

def create_tables():
    try:
        # Önceki testte kullandığımız 5433 portuyla bağlanıyoruz
        conn = psycopg2.connect(
            user="postgres",
            password="password123",
            host="127.0.0.1",
            port="5433",
            database="postgres"
        )
        cur = conn.cursor()
        
        print("🛠️ Tablolar oluşturuluyor...")
        cur.execute(SQL_SCHEMA)
        
        conn.commit()
        print("✅ Tüm tablolar başarıyla oluşturuldu!")
        
        cur.close()
        conn.close()
    except Exception as error:
        print(f"❌ Tablo oluşturma hatası: {error}")

if __name__ == "__main__":
    create_tables()