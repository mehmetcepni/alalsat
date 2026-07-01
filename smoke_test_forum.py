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
    user_id = upsert_user("forum1@alalsat.local", "Forum User", "İzmir", "pass12345")
    token = create_access_token({"sub": user_id})

    c = TestClient(main.app)

    cats = c.get("/forum/categories")
    print("categories:", cats.status_code)
    assert cats.status_code == 200
    categories = cats.json()
    assert isinstance(categories, list) and len(categories) >= 1
    category_id = categories[0]["id"]

    thr = c.post(
        "/forum/threads",
        json={"category_id": category_id, "title": "Test Konu", "content": "İlk içerik"},
        headers={"token": f"Bearer {token}"},
    )
    print("create thread:", thr.status_code, thr.json())
    assert thr.status_code == 200
    thread_id = thr.json()["thread_id"]

    get_thr = c.get(f"/forum/threads/{thread_id}")
    print("get thread:", get_thr.status_code)
    assert get_thr.status_code == 200

    post = c.post(
        f"/forum/threads/{thread_id}/posts",
        json={"content": "İlk yorum"},
        headers={"token": f"Bearer {token}"},
    )
    print("create post:", post.status_code, post.json())
    assert post.status_code == 200
    post_id = post.json()["post_id"]

    posts = c.get(f"/forum/threads/{thread_id}/posts")
    print("list posts:", posts.status_code, posts.json())
    assert posts.status_code == 200

    posts_authed = c.get(
        f"/forum/threads/{thread_id}/posts",
        headers={"token": f"Bearer {token}"},
    )
    assert posts_authed.status_code == 200
    assert posts_authed.json()[0].get("liked_by_me") in (False, True)

    like = c.post(
        f"/forum/posts/{post_id}/like",
        headers={"token": f"Bearer {token}"},
    )
    print("like:", like.status_code, like.json())
    assert like.status_code == 200

    posts_after_like = c.get(
        f"/forum/threads/{thread_id}/posts",
        headers={"token": f"Bearer {token}"},
    )
    assert posts_after_like.status_code == 200
    assert posts_after_like.json()[0].get("liked_by_me") is True

    unlike = c.delete(
        f"/forum/posts/{post_id}/like",
        headers={"token": f"Bearer {token}"},
    )
    print("unlike:", unlike.status_code, unlike.json())
    assert unlike.status_code == 200

    posts_after_unlike = c.get(
        f"/forum/threads/{thread_id}/posts",
        headers={"token": f"Bearer {token}"},
    )
    assert posts_after_unlike.status_code == 200
    assert posts_after_unlike.json()[0].get("liked_by_me") is False

    print("✅ Forum smoke OK")


if __name__ == "__main__":
    main_smoke()
