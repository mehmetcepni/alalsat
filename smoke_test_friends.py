import psycopg2
from fastapi.testclient import TestClient

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
    user1_id = upsert_user("test1@alalsat.local", "Test User 1", "İstanbul", "pass12345")
    user2_id = upsert_user("test2@alalsat.local", "Test User 2", "Ankara", "pass12345")

    token1 = create_access_token({"sub": user1_id})
    token2 = create_access_token({"sub": user2_id})

    c = TestClient(main.app)

    # Create request
    r = c.post(
        "/friends/requests",
        json={"to_user_id": user2_id},
        headers={"token": f"Bearer {token1}"},
    )
    print("create:", r.status_code, r.json())

    # Incoming list
    incoming = c.get(
        "/friends/requests/incoming",
        headers={"token": f"Bearer {token2}"},
    )
    print("incoming:", incoming.status_code, incoming.json())

    if incoming.status_code == 200 and incoming.json():
        req_id = incoming.json()[0]["id"]
        acc = c.post(
            f"/friends/requests/{req_id}/accept",
            headers={"token": f"Bearer {token2}"},
        )
        print("accept:", acc.status_code, acc.json())

    # Friends list
    f1 = c.get("/friends", headers={"token": f"Bearer {token1}"})
    f2 = c.get("/friends", headers={"token": f"Bearer {token2}"})
    print("friends user1:", f1.status_code, f1.json())
    print("friends user2:", f2.status_code, f2.json())


if __name__ == "__main__":
    main_smoke()
