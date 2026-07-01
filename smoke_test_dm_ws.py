import asyncio
import json
import psycopg2
import websockets

from auth_utils import hash_password, create_access_token

DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "password123",
    "host": "127.0.0.1",
    "port": "5433",
}


def upsert_user(email: str, full_name: str, city: str, password: str) -> str:
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, full_name, city, is_verified)
                    VALUES (%s, %s, %s, %s, TRUE)
                    ON CONFLICT (email) DO UPDATE
                      SET password_hash = EXCLUDED.password_hash,
                          full_name = EXCLUDED.full_name,
                          city = EXCLUDED.city,
                          is_verified = TRUE
                    RETURNING id;
                    """,
                    (email, hash_password(password), full_name, city),
                )
                return str(cur.fetchone()[0])
    finally:
        conn.close()


def ensure_friendship(user_a: str, user_b: str):
    # Insert into normalized friendships
    import uuid

    a = uuid.UUID(user_a)
    b = uuid.UUID(user_b)
    low, high = sorted([a, b])
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO friendships (user_low, user_high) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (str(low), str(high)),
                )
    finally:
        conn.close()


def create_conversation(user_a: str, user_b: str) -> str:
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO dm_conversations (status) VALUES ('active') RETURNING id"
                )
                conv_id = str(cur.fetchone()[0])
                cur.execute(
                    """
                    INSERT INTO dm_participants (conversation_id, user_id)
                    VALUES (%s, %s), (%s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (conv_id, user_a, conv_id, user_b),
                )
                return conv_id
    finally:
        conn.close()


async def main():
    user1_id = upsert_user("ws1@alalsat.local", "WS User 1", "İstanbul", "pass12345")
    user2_id = upsert_user("ws2@alalsat.local", "WS User 2", "Ankara", "pass12345")

    ensure_friendship(user1_id, user2_id)
    conv_id = create_conversation(user1_id, user2_id)

    token1 = create_access_token({"sub": user1_id})
    token2 = create_access_token({"sub": user2_id})

    url1 = f"ws://127.0.0.1:8000/ws/dm/{conv_id}?token={token1}"
    url2 = f"ws://127.0.0.1:8000/ws/dm/{conv_id}?token={token2}"

    async with websockets.connect(url1) as ws1, websockets.connect(url2) as ws2:
        await ws1.send(json.dumps({"type": "message", "content": "hello from ws1"}))

        # ws2 should receive the broadcast
        msg = await asyncio.wait_for(ws2.recv(), timeout=5)
        payload = json.loads(msg)
        assert payload.get("type") == "message"
        assert payload.get("message", {}).get("content") == "hello from ws1"
        print("✅ WS broadcast ok")


if __name__ == "__main__":
    asyncio.run(main())
