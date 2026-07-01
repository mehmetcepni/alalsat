import psycopg2
from fastapi.testclient import TestClient
from uuid import uuid4

import main
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


def main_smoke():
    suffix = str(uuid4())[:8]
    user1_id = upsert_user(f"dm1_{suffix}@alalsat.local", "DM User 1", "İstanbul", "pass12345")
    user2_id = upsert_user(f"dm2_{suffix}@alalsat.local", "DM User 2", "Ankara", "pass12345")

    token1 = create_access_token({"sub": user1_id})
    token2 = create_access_token({"sub": user2_id})

    c = TestClient(main.app)

    # Not friends: sending should create pending request
    send = c.post(
        "/dm/send",
        json={"to_user_id": user2_id, "content": "selam, konuşabilir miyiz?"},
        headers={"token": f"Bearer {token1}"},
    )
    print("send:", send.status_code, send.json())
    conv_id = send.json().get("conversation_id")

    # Recipient should see it in incoming requests
    inc = c.get("/dm/requests/incoming", headers={"token": f"Bearer {token2}"})
    print("incoming requests:", inc.status_code, inc.json())

    # Recipient cannot reply before accept
    if conv_id:
        reply = c.post(
            f"/dm/conversations/{conv_id}/messages",
            json={"content": "merhaba"},
            headers={"token": f"Bearer {token2}"},
        )
        print("reply before accept:", reply.status_code, reply.json())

    # Accept => becomes active + friendship
    if conv_id:
        acc = c.post(
            f"/dm/conversations/{conv_id}/accept",
            headers={"token": f"Bearer {token2}"},
        )
        print("accept:", acc.status_code, acc.json())

    # Friend shortcut: should return existing conversation (created=False)
    if conv_id:
        shortcut = c.post(
            f"/dm/conversations/with/{user2_id}",
            headers={"token": f"Bearer {token1}"},
        )
        print("shortcut:", shortcut.status_code, shortcut.json())
        assert shortcut.status_code == 200
        assert shortcut.json().get("conversation_id") == conv_id

    # Now both can chat
    if conv_id:
        reply2 = c.post(
            f"/dm/conversations/{conv_id}/messages",
            json={"content": "tamam, konuşalım"},
            headers={"token": f"Bearer {token2}"},
        )
        print("reply after accept:", reply2.status_code, reply2.json())

    inbox1 = c.get("/dm/inbox", headers={"token": f"Bearer {token1}"})
    inbox2 = c.get("/dm/inbox", headers={"token": f"Bearer {token2}"})
    print("inbox user1:", inbox1.status_code, inbox1.json())
    print("inbox user2:", inbox2.status_code, inbox2.json())


if __name__ == "__main__":
    main_smoke()
