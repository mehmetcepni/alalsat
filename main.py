import time 
import secrets # Güvenli token üretmek için standart Python kütüphanesi
import psycopg2.extras
from mail_utils import send_mail
from ai_service import ask_gemini, generate_listing_description
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Header, HTTPException, Body, Query

import psycopg2
from psycopg2.extras import RealDictCursor
from auth_utils import hash_password, verify_password, create_access_token
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

import shutil
import os
from fastapi.staticfiles import StaticFiles
from fastapi import UploadFile, File
from fastapi import WebSocket, WebSocketDisconnect
from ai_service import validate_gemini_configuration



# 1. Önce app oluşturulur
app = FastAPI()

# 2. CORS AYARLARI HEMEN BURADA OLMALI (En üstte!)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], # Yıldız yerine açık adres verelim
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)


@app.on_event("startup")
def check_ai_configuration() -> None:
    is_valid, message = validate_gemini_configuration()
    if is_valid:
        print(f"AI konfigurasyonu kontrol edildi: {message}")
    else:
        print(f"UYARI: {message}")


class VehicleCreate(BaseModel):
    category: str
    title: str
    price: int
    city: str
    description: str
    brand: str
    series: str
    model: str
    year: int
    mileage: int
    fuel_type: str
    transmission: str
    vehicle_status: str
    body_type: str
    engine_power: int
    engine_capacity: int
    drive_type: str
    color: str
    has_warranty: str
    heavy_damage: str
    plate_nationality: str
    seller_type: str
    exchangeable: str


class FriendRequestCreate(BaseModel):
    to_user_id: UUID


class DMSendCreate(BaseModel):
    to_user_id: UUID
    content: str


class DMMessageCreate(BaseModel):
    content: str


class ForumThreadCreate(BaseModel):
    category_id: Optional[UUID] = None
    title: str
    content: str


class ForumPostCreate(BaseModel):
    content: str


def get_current_user_id(token: str) -> UUID:
    try:
        from jose import jwt
        from auth_utils import SECRET_KEY, ALGORITHM

        actual_token = token.replace("Bearer ", "").strip()
        payload = jwt.decode(actual_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise Exception("Token içinde user bulunamadı")
        return UUID(str(user_id))
    except Exception:
        raise HTTPException(status_code=401, detail="Geçersiz token")


def get_current_user_id_optional(token: Optional[str]) -> Optional[UUID]:
    if not token:
        return None
    try:
        return get_current_user_id(token)
    except HTTPException:
        return None

    
def get_db_connection():
    # Kendi veritabanı bilgilerine göre burayı kontrol et
    conn = psycopg2.connect(
        dbname="postgres",
        user="postgres",
        password="password123",
        host="127.0.0.1",
        port="5433"
    )
    return conn


class DMConnectionManager:
    def __init__(self):
        self._rooms: dict[str, set[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        self._rooms.setdefault(room_id, set()).add(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self._rooms:
            self._rooms[room_id].discard(websocket)
            if not self._rooms[room_id]:
                del self._rooms[room_id]

    async def broadcast(self, room_id: str, payload: dict):
        websockets = list(self._rooms.get(room_id, set()))
        for ws in websockets:
            try:
                await ws.send_json(payload)
            except Exception:
                # Connection might be gone
                self.disconnect(room_id, ws)


dm_ws = DMConnectionManager()


def _save_upload_file_limited(upload_file: UploadFile, destination_path: str, max_bytes: int = 10 * 1024 * 1024) -> int:
    total = 0
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)
    with open(destination_path, "wb") as out:
        while True:
            chunk = upload_file.file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(status_code=413, detail="Dosya 10MB limitini aşıyor")
            out.write(chunk)
    return total


def _are_friends(cur, user_a: UUID, user_b: UUID) -> bool:
    low, high = sorted([user_a, user_b])
    cur.execute(
        "SELECT 1 FROM friendships WHERE user_low=%s AND user_high=%s",
        (str(low), str(high)),
    )
    return cur.fetchone() is not None


def _get_existing_dm_conversation(cur, user_a: UUID, user_b: UUID):
    cur.execute(
        """
        SELECT c.id, c.status, c.requested_by, c.requested_to, c.updated_at
        FROM dm_conversations c
        JOIN dm_participants p1 ON p1.conversation_id = c.id AND p1.user_id = %s
        JOIN dm_participants p2 ON p2.conversation_id = c.id AND p2.user_id = %s
        ORDER BY c.updated_at DESC
        LIMIT 1
        """,
        (str(user_a), str(user_b)),
    )
    return cur.fetchone()


def _ensure_dm_participants(cur, conversation_id: UUID, user_a: UUID, user_b: UUID):
    cur.execute(
        """
        INSERT INTO dm_participants (conversation_id, user_id)
        VALUES (%s, %s), (%s, %s)
        ON CONFLICT DO NOTHING
        """,
        (str(conversation_id), str(user_a), str(conversation_id), str(user_b)),
    )


def _get_other_user_for_conversation(cur, conversation_id: UUID, current_user_id: UUID):
    cur.execute(
        """
        SELECT u.id, u.full_name, u.email, u.city
        FROM dm_participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.conversation_id = %s AND p.user_id <> %s
        LIMIT 1
        """,
        (str(conversation_id), str(current_user_id)),
    )
    return cur.fetchone()


def _assert_dm_participant(cur, conversation_id: UUID, user_id: UUID):
    cur.execute(
        "SELECT 1 FROM dm_participants WHERE conversation_id=%s AND user_id=%s",
        (str(conversation_id), str(user_id)),
    )
    if not cur.fetchone():
        raise HTTPException(status_code=403, detail="Bu sohbete erişim yok")


@app.get("/")
def home():
    return {"mesaj": "AlalSat API Sunucusu Çalışıyor!"}





@app.post("/kayit")
def register(data: dict = Body(...)):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        email = data.get("email")
        sifre_raw = data.get("sifre")
        isim = data.get("isim")
        
        # 1. Şifreyi hashle
        from auth_utils import pwd_context
        hashed = pwd_context.hash(str(sifre_raw))
        
        # 2. Kayıt Doğrulama Token'ı üret (6 haneli veya hex)
        verify_token = secrets.token_hex(16)
        
        # 3. Veritabanına is_verified=FALSE ve reset_token (veya yeni kolon) ile kaydet
        # Not: reset_token sütununu doğrulama için de kullanabiliriz 
        # veya 'verification_token' diye yeni sütun açtıysan onu yaz.
        cur.execute("""
            INSERT INTO users (email, password_hash, full_name, phone, city, is_verified, reset_token)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id;
        """, (email, hashed, isim, data.get("telefon"), data.get("sehir"), False, verify_token))
        
        new_id = cur.fetchone()[0]
        conn.commit()
        
        # 4. Doğrulama Maili Gönder
        konu = "AlalSat - Hesabınızı Doğrulayın"
        mesaj = f"Hoş geldin {isim}! Hesabını aktif etmek için doğrulama kodun: {verify_token}"
        send_mail(email, konu, mesaj)
        
        cur.close()
        conn.close()
        
        return {"mesaj": "Kayıt oluşturuldu. Lütfen e-postanıza gelen kod ile hesabınızı doğrulayın.", "user_id": str(new_id)}
        
    except Exception as e:
        return {"hata": str(e)}
    


@app.post("/auth/dogrula")
def verify_email(data: dict = Body(...)):
    token = data.get("token")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Token'ı ara ve is_verified'ı TRUE yap
    cur.execute("SELECT id FROM users WHERE reset_token = %s", (token,))
    user = cur.fetchone()
    
    if not user:
        return {"hata": "Geçersiz doğrulama kodu!"}
    
    cur.execute("UPDATE users SET is_verified = TRUE, reset_token = NULL WHERE id = %s", (user[0],))
    conn.commit()
    cur.close()
    conn.close()
    
    return {"mesaj": "Tebrikler! Hesabınız doğrulandı. Artık giriş yapabilirsiniz."}


@app.post("/giris")
def login(data: dict = Body(...)):
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        email = data.get("email")
        sifre_raw = data.get("sifre")

        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        
        if not user:
            return {"hata": "E-posta veya şifre yanlış"}

        # --- TERMİNALDEN KONTROL İÇİN (Hata anında buraya bak) ---
        print(f"Giriş denemesi: {email}")
        print(f"DB'den gelen Hash: {user['password_hash'][:20]}...") 
        
        # verify_password(ham_şifre, hashlenmiş_şifre)
        if not verify_password(str(sifre_raw), str(user["password_hash"])):
            return {"hata": "E-posta veya şifre yanlış"}
        
        # Doğrulama kontrolü 
        if user.get("is_verified") == False:
             return {"hata": "Lütfen önce e-posta adresinizi doğrulayın!"}
        
        access_token = create_access_token(data={"sub": str(user["id"])})
        
        cur.close()
        conn.close()
        return {"access_token": access_token, "token_type": "bearer"}
        
    except Exception as e:
        # Hatayı terminale detaylıca yazdırıyoruz 
        print(f"--- KRİTİK GİRİŞ HATASI --- \n{e}")
        return {"hata_detayi": str(e)}

@app.post("/auth/sifre-unuttum")
def forgot_password(data: dict = Body(...)):
    email = data.get("email")
    
    if not email:
        return {"hata": "Lütfen e-posta adresinizi girin."}

    conn = get_db_connection()
    cur = conn.cursor()
    
    # 1. Kullanıcı veritabanında var mı?
    cur.execute("SELECT id, full_name FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    
    if not user:
        cur.close()
        conn.close()
        # Güvenlik için e-posta yoksa bile "kod gönderildi" mesajı vermek yaygın bir pratiktir
        return {"mesaj": "Eğer e-posta sistemimizde kayıtlıysa sıfırlama kodu gönderilmiştir."}
    
    # 2. Güvenli bir sıfırlama token'ı üret (16 karakterli hex)
    reset_token = secrets.token_hex(16)
    
    # 3. Token'ı veritabanına kaydet
    cur.execute("UPDATE users SET reset_token = %s WHERE email = %s", (reset_token, email))
    conn.commit()
    cur.close()
    conn.close()
    
    # 4. Kullanıcıya mail gönder
    konu = "AlalSat - Şifre Sıfırlama Talebi"
    mesaj = f"Merhaba {user[1]},\n\nŞifrenizi sıfırlamak için kullanmanız gereken kod: {reset_token}\n\nEğer bu talebi siz yapmadıysanız lütfen bu maili dikkate almayın."
    
    if send_mail(email, konu, mesaj):
        return {"mesaj": "Sıfırlama kodu başarıyla e-postanıza gönderildi."}
    else:
        return {"hata": "Mail gönderilirken teknik bir hata oluştu."}

@app.post("/auth/sifre-sifirla")
def reset_password(data: dict = Body(...)):
    try:
        token = data.get("token")
        yeni_sifre = data.get("yeni_sifre")
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Token kontrolü
        cur.execute("SELECT id FROM users WHERE reset_token = %s", (token,))
        user = cur.fetchone()
        
        if not user:
            cur.close()
            conn.close()
            return {"hata": "Geçersiz veya süresi dolmuş token!"}
        
        # 1. Şifreyi hashleyerek hazırla (Güvenlik için şart!)
        from auth_utils import pwd_context
        hashed_password = pwd_context.hash(str(yeni_sifre))
        
        # 2. SORGUDAYI DÜZELT: 'password' yerine 'password_hash' yazıyoruz
        cur.execute(
            "UPDATE users SET password_hash = %s, reset_token = NULL WHERE reset_token = %s", 
            (hashed_password, token)
        )
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {"mesaj": "Şifreniz başarıyla güncellendi!"}
    except Exception as e:
        print(f"Hata detayı: {e}")
        return {"hata": "Bir sorun oluştu."}


# --- USERS: Basit arama (arkadaş ekleme için) ---
@app.get("/users/search")
def search_users(q: str = Query("", min_length=1), token: str = Header(...)):
    current_user_id = get_current_user_id(token)

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Email/full_name/city üzerinde basit arama
        query = """
            SELECT id, full_name, email, city
            FROM users
            WHERE id <> %s
              AND (
                LOWER(COALESCE(full_name, '')) LIKE LOWER(%s)
                OR LOWER(email) LIKE LOWER(%s)
                OR LOWER(COALESCE(city, '')) LIKE LOWER(%s)
              )
            ORDER BY full_name NULLS LAST
            LIMIT 20
        """
        like = f"%{q}%"
        cur.execute(query, (str(current_user_id), like, like, like))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


# --- FRIENDSHIPS (istek -> kabul, iki taraflı) ---
@app.post("/friends/requests")
def create_friend_request(payload: FriendRequestCreate, token: str = Header(...)):
    from_user_id = get_current_user_id(token)
    to_user_id = payload.to_user_id

    if str(from_user_id) == str(to_user_id):
        raise HTTPException(status_code=400, detail="Kendinize arkadaşlık isteği gönderemezsiniz.")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Kullanıcı var mı?
        cur.execute("SELECT id FROM users WHERE id = %s", (str(to_user_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

        # Zaten arkadaş mı?
        low, high = sorted([from_user_id, UUID(str(to_user_id))])
        cur.execute(
            "SELECT 1 FROM friendships WHERE user_low=%s AND user_high=%s",
            (str(low), str(high)),
        )
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Zaten arkadaşsınız.")

        # Bekleyen istek var mı? (iki yönde)
        cur.execute(
            """
            SELECT id, from_user_id, to_user_id
            FROM friend_requests
            WHERE status='pending'
              AND ((from_user_id=%s AND to_user_id=%s) OR (from_user_id=%s AND to_user_id=%s))
            """,
            (str(from_user_id), str(to_user_id), str(to_user_id), str(from_user_id)),
        )
        existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="Zaten bekleyen bir arkadaşlık isteği var.")

        cur.execute(
            """
            INSERT INTO friend_requests (from_user_id, to_user_id, status)
            VALUES (%s, %s, 'pending')
            RETURNING id
            """,
            (str(from_user_id), str(to_user_id)),
        )
        request_id = cur.fetchone()["id"]
        conn.commit()
        return {"mesaj": "Arkadaşlık isteği gönderildi.", "request_id": str(request_id)}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"İstek oluşturulamadı: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.get("/friends/requests/incoming")
def list_incoming_requests(token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT fr.id, fr.from_user_id, fr.to_user_id, fr.status, fr.created_at,
                   u.full_name as from_full_name, u.email as from_email, u.city as from_city
            FROM friend_requests fr
            JOIN users u ON u.id = fr.from_user_id
            WHERE fr.to_user_id = %s AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
            """,
            (str(user_id),),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.get("/friends/requests/outgoing")
def list_outgoing_requests(token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT fr.id, fr.from_user_id, fr.to_user_id, fr.status, fr.created_at,
                   u.full_name as to_full_name, u.email as to_email, u.city as to_city
            FROM friend_requests fr
            JOIN users u ON u.id = fr.to_user_id
            WHERE fr.from_user_id = %s AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
            """,
            (str(user_id),),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.post("/friends/requests/{request_id}/accept")
def accept_friend_request(request_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id, from_user_id, to_user_id, status
            FROM friend_requests
            WHERE id = %s
            """,
            (str(request_id),),
        )
        fr = cur.fetchone()
        if not fr:
            raise HTTPException(status_code=404, detail="İstek bulunamadı.")
        if str(fr["to_user_id"]) != str(user_id):
            raise HTTPException(status_code=403, detail="Bu isteği kabul etme yetkiniz yok.")
        if fr["status"] != "pending":
            raise HTTPException(status_code=400, detail="Bu istek artık beklemede değil.")

        # İsteği accepted yap
        cur.execute(
            "UPDATE friend_requests SET status='accepted', responded_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(request_id),),
        )

        # Friendships insert (normalize)
        from_id = UUID(str(fr["from_user_id"]))
        to_id = UUID(str(fr["to_user_id"]))
        low, high = sorted([from_id, to_id])
        cur.execute(
            """
            INSERT INTO friendships (user_low, user_high)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (str(low), str(high)),
        )

        conn.commit()
        return {"mesaj": "Arkadaşlık isteği kabul edildi."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Kabul işlemi başarısız: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/friends/requests/{request_id}/reject")
def reject_friend_request(request_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id, to_user_id, status FROM friend_requests WHERE id=%s",
            (str(request_id),),
        )
        fr = cur.fetchone()
        if not fr:
            raise HTTPException(status_code=404, detail="İstek bulunamadı.")
        if str(fr["to_user_id"]) != str(user_id):
            raise HTTPException(status_code=403, detail="Bu isteği reddetme yetkiniz yok.")
        if fr["status"] != "pending":
            raise HTTPException(status_code=400, detail="Bu istek artık beklemede değil.")

        cur.execute(
            "UPDATE friend_requests SET status='rejected', responded_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(request_id),),
        )
        conn.commit()
        return {"mesaj": "Arkadaşlık isteği reddedildi."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Reddetme işlemi başarısız: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/friends/requests/{request_id}/cancel")
def cancel_friend_request(request_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id, from_user_id, status FROM friend_requests WHERE id=%s",
            (str(request_id),),
        )
        fr = cur.fetchone()
        if not fr:
            raise HTTPException(status_code=404, detail="İstek bulunamadı.")
        if str(fr["from_user_id"]) != str(user_id):
            raise HTTPException(status_code=403, detail="Bu isteği iptal etme yetkiniz yok.")
        if fr["status"] != "pending":
            raise HTTPException(status_code=400, detail="Bu istek artık beklemede değil.")

        cur.execute(
            "UPDATE friend_requests SET status='cancelled', responded_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(request_id),),
        )
        conn.commit()
        return {"mesaj": "Arkadaşlık isteği iptal edildi."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"İptal işlemi başarısız: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.get("/friends")
def list_friends(token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT
                u.id,
                u.full_name,
                u.email,
                u.city,
                f.created_at as friends_since
            FROM friendships f
            JOIN users u
              ON u.id = CASE
                WHEN f.user_low = %s THEN f.user_high
                ELSE f.user_low
              END
            WHERE f.user_low = %s OR f.user_high = %s
            ORDER BY f.created_at DESC
            """,
            (str(user_id), str(user_id), str(user_id)),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.delete("/friends/{friend_user_id}")
def delete_friend(friend_user_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    if str(friend_user_id) == str(user_id):
        raise HTTPException(status_code=400, detail="Geçersiz kullanıcı")

    low, high = sorted([user_id, UUID(str(friend_user_id))])

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM friendships WHERE user_low=%s AND user_high=%s",
            (str(low), str(high)),
        )
        conn.commit()
        return {"mesaj": "Arkadaşlıktan çıkarıldı."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Silme işlemi başarısız: {str(e)}")
    finally:
        cur.close()
        conn.close()
    
    


# --- DIRECT MESSAGES (spawn kutusu / inbox) ---
@app.get("/dm/inbox")
def dm_list_inbox(token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            WITH my_convs AS (
                SELECT c.id, c.status, c.updated_at
                FROM dm_conversations c
                JOIN dm_participants p ON p.conversation_id = c.id
                WHERE p.user_id = %s AND c.status = 'active'
            ), last_msg AS (
                SELECT DISTINCT ON (m.conversation_id)
                    m.conversation_id,
                    m.content as last_content,
                    m.created_at as last_created_at
                FROM dm_messages m
                JOIN my_convs mc ON mc.id = m.conversation_id
                ORDER BY m.conversation_id, m.created_at DESC
            )
            SELECT mc.id as conversation_id, mc.status, mc.updated_at,
                   u.id as other_user_id, u.full_name as other_full_name, u.email as other_email, u.city as other_city,
                   lm.last_content, lm.last_created_at
            FROM my_convs mc
            JOIN dm_participants p2 ON p2.conversation_id = mc.id AND p2.user_id <> %s
            JOIN users u ON u.id = p2.user_id
            LEFT JOIN last_msg lm ON lm.conversation_id = mc.id
            ORDER BY COALESCE(lm.last_created_at, mc.updated_at) DESC
            LIMIT 50
            """,
            (str(user_id), str(user_id)),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.get("/dm/requests/incoming")
def dm_list_incoming_requests(token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT c.id as conversation_id, c.status, c.updated_at, c.requested_by, c.requested_to,
                   u.id as other_user_id, u.full_name as other_full_name, u.email as other_email, u.city as other_city
            FROM dm_conversations c
            JOIN users u ON u.id = c.requested_by
            WHERE c.status = 'pending' AND c.requested_to = %s
            ORDER BY c.updated_at DESC
            LIMIT 50
            """,
            (str(user_id),),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.get("/dm/requests/outgoing")
def dm_list_outgoing_requests(token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT c.id as conversation_id, c.status, c.updated_at, c.requested_by, c.requested_to,
                   u.id as other_user_id, u.full_name as other_full_name, u.email as other_email, u.city as other_city
            FROM dm_conversations c
            JOIN users u ON u.id = c.requested_to
            WHERE c.status = 'pending' AND c.requested_by = %s
            ORDER BY c.updated_at DESC
            LIMIT 50
            """,
            (str(user_id),),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.get("/dm/conversations/{conversation_id}")
def dm_get_conversation(conversation_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, conversation_id, user_id)
        cur.execute(
            "SELECT id, status, requested_by, requested_to, created_at, updated_at FROM dm_conversations WHERE id=%s",
            (str(conversation_id),),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
        other = _get_other_user_for_conversation(cur, conversation_id, user_id)
        return {"conversation": conv, "other_user": other}
    finally:
        cur.close()
        conn.close()


@app.get("/dm/conversations/{conversation_id}/messages")
def dm_list_messages(conversation_id: UUID, token: str = Header(...), limit: int = Query(50, ge=1, le=200)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, conversation_id, user_id)
        cur.execute(
            """
            SELECT
                m.id, m.conversation_id, m.sender_id, m.content, m.created_at,
                u.full_name as sender_full_name, u.email as sender_email,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', a.id,
                            'file_url', a.file_url,
                            'file_name', a.file_name,
                            'mime_type', a.mime_type,
                            'size_bytes', a.size_bytes,
                            'created_at', a.created_at
                        )
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'::json
                ) as attachments
            FROM dm_messages m
            JOIN users u ON u.id = m.sender_id
            LEFT JOIN dm_attachments a ON a.message_id = m.id
            WHERE m.conversation_id = %s
            GROUP BY m.id, u.full_name, u.email
            ORDER BY m.created_at ASC
            LIMIT %s
            """,
            (str(conversation_id), limit),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.post("/dm/send")
def dm_send(payload: DMSendCreate, token: str = Header(...)):
    from_user_id = get_current_user_id(token)
    to_user_id = payload.to_user_id
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Mesaj boş olamaz")
    if str(from_user_id) == str(to_user_id):
        raise HTTPException(status_code=400, detail="Kendinize mesaj gönderemezsiniz")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id FROM users WHERE id=%s", (str(to_user_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

        is_friends = _are_friends(cur, from_user_id, UUID(str(to_user_id)))
        existing = _get_existing_dm_conversation(cur, from_user_id, UUID(str(to_user_id)))

        if existing:
            conversation_id = UUID(str(existing["id"]))
            status = existing.get("status")
            requested_by = existing.get("requested_by")
            requested_to = existing.get("requested_to")

            if status == "pending" and str(requested_to) == str(from_user_id):
                raise HTTPException(status_code=403, detail="Bu kullanıcıdan gelen mesaj isteğini önce kabul edin")

            if is_friends and status != "active":
                cur.execute(
                    """
                    UPDATE dm_conversations
                    SET status='active', requested_by=NULL, requested_to=NULL, updated_at=CURRENT_TIMESTAMP
                    WHERE id=%s
                    """,
                    (str(conversation_id),),
                )
            elif not is_friends and status != "pending":
                cur.execute(
                    """
                    UPDATE dm_conversations
                    SET status='pending', requested_by=%s, requested_to=%s, updated_at=CURRENT_TIMESTAMP
                    WHERE id=%s
                    """,
                    (str(from_user_id), str(to_user_id), str(conversation_id)),
                )
        else:
            status = "active" if is_friends else "pending"
            cur.execute(
                """
                INSERT INTO dm_conversations (status, requested_by, requested_to)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (
                    status,
                    str(from_user_id) if status == "pending" else None,
                    str(to_user_id) if status == "pending" else None,
                ),
            )
            conversation_id = UUID(str(cur.fetchone()["id"]))
            _ensure_dm_participants(cur, conversation_id, from_user_id, UUID(str(to_user_id)))

        cur.execute(
            """
            INSERT INTO dm_messages (conversation_id, sender_id, content)
            VALUES (%s, %s, %s)
            RETURNING id, created_at
            """,
            (str(conversation_id), str(from_user_id), content),
        )
        msg = cur.fetchone()
        cur.execute(
            "UPDATE dm_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(conversation_id),),
        )
        conn.commit()
        return {
            "conversation_id": str(conversation_id),
            "message_id": str(msg["id"]),
            "created_at": msg["created_at"],
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Mesaj gönderilemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/dm/conversations/with/{other_user_id}")
def dm_get_or_create_conversation_with(other_user_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    if str(user_id) == str(other_user_id):
        raise HTTPException(status_code=400, detail="Geçersiz kullanıcı")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id FROM users WHERE id=%s", (str(other_user_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

        # Friends-only shortcut: this endpoint is for opening chats with friends quickly.
        if not _are_friends(cur, user_id, other_user_id):
            raise HTTPException(status_code=403, detail="Sohbeti hızlı açmak için önce arkadaş olmalısınız")

        existing = _get_existing_dm_conversation(cur, user_id, other_user_id)
        if existing:
            conversation_id = UUID(str(existing["id"]))
            if existing.get("status") != "active":
                cur.execute(
                    """
                    UPDATE dm_conversations
                    SET status='active', requested_by=NULL, requested_to=NULL, updated_at=CURRENT_TIMESTAMP
                    WHERE id=%s
                    """,
                    (str(conversation_id),),
                )
                conn.commit()
            return {"conversation_id": str(conversation_id), "created": False}

        cur.execute(
            """
            INSERT INTO dm_conversations (status, requested_by, requested_to)
            VALUES ('active', NULL, NULL)
            RETURNING id
            """
        )
        conversation_id = UUID(str(cur.fetchone()["id"]))
        _ensure_dm_participants(cur, conversation_id, user_id, other_user_id)
        conn.commit()
        return {"conversation_id": str(conversation_id), "created": True}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Sohbet açılamadı: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/dm/conversations/{conversation_id}/accept")
def dm_accept_request(conversation_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, conversation_id, user_id)
        cur.execute(
            "SELECT id, status, requested_by, requested_to FROM dm_conversations WHERE id=%s",
            (str(conversation_id),),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
        if conv["status"] != "pending":
            raise HTTPException(status_code=400, detail="Bu sohbet beklemede değil")
        if str(conv["requested_to"]) != str(user_id):
            raise HTTPException(status_code=403, detail="Bu isteği kabul etme yetkiniz yok")

        requester_id = UUID(str(conv["requested_by"]))
        accepter_id = UUID(str(conv["requested_to"]))

        # Accept DM request => make them friends (friends-only chatting rule)
        low, high = sorted([requester_id, accepter_id])
        cur.execute(
            "INSERT INTO friendships (user_low, user_high) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (str(low), str(high)),
        )

        cur.execute(
            """
            UPDATE dm_conversations
            SET status='active', requested_by=NULL, requested_to=NULL, updated_at=CURRENT_TIMESTAMP
            WHERE id=%s
            """,
            (str(conversation_id),),
        )
        conn.commit()
        return {"mesaj": "Mesaj isteği kabul edildi."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Kabul edilemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/dm/conversations/{conversation_id}/reject")
def dm_reject_request(conversation_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, conversation_id, user_id)
        cur.execute(
            "SELECT status, requested_to FROM dm_conversations WHERE id=%s",
            (str(conversation_id),),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
        if conv["status"] != "pending":
            raise HTTPException(status_code=400, detail="Bu sohbet beklemede değil")
        if str(conv["requested_to"]) != str(user_id):
            raise HTTPException(status_code=403, detail="Bu isteği reddetme yetkiniz yok")

        cur.execute(
            "UPDATE dm_conversations SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(conversation_id),),
        )
        conn.commit()
        return {"mesaj": "Mesaj isteği reddedildi."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Reddedilemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/dm/conversations/{conversation_id}/cancel")
def dm_cancel_request(conversation_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, conversation_id, user_id)
        cur.execute(
            "SELECT status, requested_by FROM dm_conversations WHERE id=%s",
            (str(conversation_id),),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
        if conv["status"] != "pending":
            raise HTTPException(status_code=400, detail="Bu sohbet beklemede değil")
        if str(conv["requested_by"]) != str(user_id):
            raise HTTPException(status_code=403, detail="Bu isteği iptal etme yetkiniz yok")

        cur.execute(
            "UPDATE dm_conversations SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(conversation_id),),
        )
        conn.commit()
        return {"mesaj": "Mesaj isteği iptal edildi."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"İptal edilemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/dm/conversations/{conversation_id}/messages")
def dm_send_message(conversation_id: UUID, payload: DMMessageCreate, token: str = Header(...)):
    user_id = get_current_user_id(token)
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Mesaj boş olamaz")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, conversation_id, user_id)
        cur.execute(
            "SELECT status, requested_by, requested_to FROM dm_conversations WHERE id=%s",
            (str(conversation_id),),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Sohbet bulunamadı")

        if conv["status"] == "pending" and str(conv["requested_to"]) == str(user_id):
            raise HTTPException(status_code=403, detail="Mesaj yazmak için isteği kabul edin")
        if conv["status"] not in ("active", "pending"):
            raise HTTPException(status_code=400, detail="Bu sohbete mesaj gönderilemez")

        cur.execute(
            """
            INSERT INTO dm_messages (conversation_id, sender_id, content)
            VALUES (%s, %s, %s)
            RETURNING id, created_at
            """,
            (str(conversation_id), str(user_id), content),
        )
        msg = cur.fetchone()
        cur.execute(
            "UPDATE dm_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(conversation_id),),
        )
        # Fetch sender display info for realtime broadcast
        cur.execute("SELECT full_name, email FROM users WHERE id=%s", (str(user_id),))
        sender = cur.fetchone() or {}

        conn.commit()

        message_payload = {
            "type": "message",
            "message": {
                "id": str(msg["id"]),
                "conversation_id": str(conversation_id),
                "sender_id": str(user_id),
                "content": content,
                "created_at": msg["created_at"].isoformat() if hasattr(msg["created_at"], "isoformat") else msg["created_at"],
                "sender_full_name": sender.get("full_name"),
                "sender_email": sender.get("email"),
                "attachments": [],
            },
        }
        try:
            import asyncio

            asyncio.create_task(dm_ws.broadcast(str(conversation_id), message_payload))
        except Exception:
            pass

        return {"message_id": str(msg["id"]), "created_at": msg["created_at"]}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Mesaj gönderilemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/dm/conversations/{conversation_id}/attachments")
async def dm_send_attachment(
    conversation_id: UUID,
    token: str = Header(...),
    file: UploadFile = File(...),
    content: Optional[str] = Query(None),
):
    user_id = get_current_user_id(token)
    caption = (content or "").strip() if content is not None else None

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, conversation_id, user_id)
        cur.execute(
            "SELECT status, requested_by, requested_to FROM dm_conversations WHERE id=%s",
            (str(conversation_id),),
        )
        conv = cur.fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Sohbet bulunamadı")

        if conv["status"] == "pending" and str(conv["requested_to"]) == str(user_id):
            raise HTTPException(status_code=403, detail="Dosya göndermek için isteği kabul edin")
        if conv["status"] not in ("active", "pending"):
            raise HTTPException(status_code=400, detail="Bu sohbete dosya gönderilemez")

        # Create message row first
        cur.execute(
            """
            INSERT INTO dm_messages (conversation_id, sender_id, content)
            VALUES (%s, %s, %s)
            RETURNING id, created_at
            """,
            (str(conversation_id), str(user_id), caption),
        )
        msg = cur.fetchone()
        message_id = UUID(str(msg["id"]))

        # Save file under existing static directory
        safe_name = os.path.basename(file.filename or "file")
        unique_name = f"{conversation_id}_{message_id}_{safe_name}"
        dm_dir = os.path.join(UPLOAD_DIR, "dm")
        file_path = os.path.join(dm_dir, unique_name)
        size_bytes = _save_upload_file_limited(file, file_path)

        file_url = f"http://127.0.0.1:8000/static/dm/{unique_name}"
        cur.execute(
            """
            INSERT INTO dm_attachments (message_id, file_url, file_name, mime_type, size_bytes)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (
                str(message_id),
                file_url,
                safe_name,
                file.content_type,
                int(size_bytes),
            ),
        )
        att = cur.fetchone()

        cur.execute(
            "UPDATE dm_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(conversation_id),),
        )

        cur.execute("SELECT full_name, email FROM users WHERE id=%s", (str(user_id),))
        sender = cur.fetchone() or {}

        conn.commit()

        message_payload = {
            "type": "message",
            "message": {
                "id": str(message_id),
                "conversation_id": str(conversation_id),
                "sender_id": str(user_id),
                "content": caption,
                "created_at": msg["created_at"].isoformat() if hasattr(msg["created_at"], "isoformat") else msg["created_at"],
                "sender_full_name": sender.get("full_name"),
                "sender_email": sender.get("email"),
                "attachments": [
                    {
                        "id": str(att["id"]),
                        "file_url": file_url,
                        "file_name": safe_name,
                        "mime_type": file.content_type,
                        "size_bytes": int(size_bytes),
                        "created_at": att["created_at"].isoformat() if hasattr(att["created_at"], "isoformat") else att["created_at"],
                    }
                ],
            },
        }

        try:
            await dm_ws.broadcast(str(conversation_id), message_payload)
        except Exception:
            pass

        return {"message_id": str(message_id), "attachment_url": file_url}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Dosya gönderilemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.websocket("/ws/dm/{conversation_id}")
async def dm_websocket(conversation_id: str, websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        user_id = get_current_user_id(token)
    except HTTPException:
        await websocket.close(code=1008)
        return

    # Validate participant
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        _assert_dm_participant(cur, UUID(conversation_id), user_id)
    except HTTPException:
        cur.close()
        conn.close()
        await websocket.close(code=1008)
        return
    finally:
        cur.close()
        conn.close()

    room_id = conversation_id
    await dm_ws.connect(room_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if msg_type != "message":
                continue

            content = (data.get("content") or "").strip()
            if not content:
                continue

            # Persist message with same rules as REST
            conn = get_db_connection()
            cur = conn.cursor(cursor_factory=RealDictCursor)
            try:
                _assert_dm_participant(cur, UUID(conversation_id), user_id)
                cur.execute(
                    "SELECT status, requested_by, requested_to FROM dm_conversations WHERE id=%s",
                    (conversation_id,),
                )
                conv = cur.fetchone()
                if not conv:
                    raise HTTPException(status_code=404, detail="Sohbet bulunamadı")
                if conv["status"] == "pending" and str(conv["requested_to"]) == str(user_id):
                    raise HTTPException(status_code=403, detail="Mesaj yazmak için isteği kabul edin")
                if conv["status"] not in ("active", "pending"):
                    raise HTTPException(status_code=400, detail="Bu sohbete mesaj gönderilemez")

                cur.execute(
                    """
                    INSERT INTO dm_messages (conversation_id, sender_id, content)
                    VALUES (%s, %s, %s)
                    RETURNING id, created_at
                    """,
                    (conversation_id, str(user_id), content),
                )
                msg = cur.fetchone()
                cur.execute(
                    "UPDATE dm_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                    (conversation_id,),
                )
                cur.execute("SELECT full_name, email FROM users WHERE id=%s", (str(user_id),))
                sender = cur.fetchone() or {}
                conn.commit()

                await dm_ws.broadcast(
                    room_id,
                    {
                        "type": "message",
                        "message": {
                            "id": str(msg["id"]),
                            "conversation_id": conversation_id,
                            "sender_id": str(user_id),
                            "content": content,
                            "created_at": msg["created_at"].isoformat() if hasattr(msg["created_at"], "isoformat") else msg["created_at"],
                            "sender_full_name": sender.get("full_name"),
                            "sender_email": sender.get("email"),
                            "attachments": [],
                        },
                    },
                )
            except HTTPException as e:
                conn.rollback()
                await websocket.send_json({"type": "error", "detail": e.detail})
            except Exception:
                conn.rollback()
                await websocket.send_json({"type": "error", "detail": "Mesaj gönderilemedi"})
            finally:
                cur.close()
                conn.close()
    except WebSocketDisconnect:
        dm_ws.disconnect(room_id, websocket)
    except Exception:
        dm_ws.disconnect(room_id, websocket)
        try:
            await websocket.close()
        except Exception:
            pass


# --- FORUM (MVP) ---
@app.get("/forum/categories")
def forum_list_categories():
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT id, name, created_at
            FROM forum_categories
            ORDER BY name ASC
            """
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.get("/forum/threads")
def forum_list_threads(
    category_id: Optional[UUID] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if category_id:
            cur.execute(
                """
                SELECT
                    t.id, t.category_id, c.name as category_name,
                    t.author_id, u.full_name as author_full_name, u.email as author_email,
                    t.title, t.content, t.created_at, t.updated_at
                FROM forum_threads t
                LEFT JOIN forum_categories c ON c.id = t.category_id
                JOIN users u ON u.id = t.author_id
                WHERE t.category_id = %s
                ORDER BY t.updated_at DESC
                LIMIT %s OFFSET %s
                """,
                (str(category_id), limit, offset),
            )
        else:
            cur.execute(
                """
                SELECT
                    t.id, t.category_id, c.name as category_name,
                    t.author_id, u.full_name as author_full_name, u.email as author_email,
                    t.title, t.content, t.created_at, t.updated_at
                FROM forum_threads t
                LEFT JOIN forum_categories c ON c.id = t.category_id
                JOIN users u ON u.id = t.author_id
                ORDER BY t.updated_at DESC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.post("/forum/threads")
def forum_create_thread(payload: ForumThreadCreate, token: str = Header(...)):
    user_id = get_current_user_id(token)
    title = (payload.title or "").strip()
    content = (payload.content or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="Başlık ve içerik zorunlu")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if payload.category_id:
            cur.execute("SELECT id FROM forum_categories WHERE id=%s", (str(payload.category_id),))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Kategori bulunamadı")

        cur.execute(
            """
            INSERT INTO forum_threads (category_id, author_id, title, content)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (str(payload.category_id) if payload.category_id else None, str(user_id), title, content),
        )
        thread_id = cur.fetchone()["id"]
        conn.commit()
        return {"thread_id": str(thread_id)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Konu oluşturulamadı: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.get("/forum/threads/{thread_id}")
def forum_get_thread(thread_id: UUID):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """
            SELECT
                t.id, t.category_id, c.name as category_name,
                t.author_id, u.full_name as author_full_name, u.email as author_email,
                t.title, t.content, t.created_at, t.updated_at
            FROM forum_threads t
            LEFT JOIN forum_categories c ON c.id = t.category_id
            JOIN users u ON u.id = t.author_id
            WHERE t.id = %s
            """,
            (str(thread_id),),
        )
        thread = cur.fetchone()
        if not thread:
            raise HTTPException(status_code=404, detail="Konu bulunamadı")
        return thread
    finally:
        cur.close()
        conn.close()


@app.get("/forum/threads/{thread_id}/posts")
def forum_list_posts(
    thread_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    token: Optional[str] = Header(None),
):
    user_id = get_current_user_id_optional(token)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id FROM forum_threads WHERE id=%s", (str(thread_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Konu bulunamadı")

        cur.execute(
            """
            SELECT
                p.id, p.thread_id, p.author_id, u.full_name as author_full_name, u.email as author_email,
                p.content, p.created_at, p.updated_at,
                COALESCE(l.like_count, 0) as like_count,
                CASE WHEN ml.user_id IS NULL THEN FALSE ELSE TRUE END as liked_by_me
            FROM forum_posts p
            JOIN users u ON u.id = p.author_id
            LEFT JOIN (
                SELECT post_id, COUNT(*)::int as like_count
                FROM forum_post_likes
                GROUP BY post_id
            ) l ON l.post_id = p.id
            LEFT JOIN forum_post_likes ml ON ml.post_id = p.id AND ml.user_id = %s
            WHERE p.thread_id = %s
            ORDER BY p.created_at ASC
            LIMIT %s OFFSET %s
            """,
            (str(user_id) if user_id else None, str(thread_id), limit, offset),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@app.post("/forum/threads/{thread_id}/posts")
def forum_create_post(thread_id: UUID, payload: ForumPostCreate, token: str = Header(...)):
    user_id = get_current_user_id(token)
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Yorum boş olamaz")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id FROM forum_threads WHERE id=%s", (str(thread_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Konu bulunamadı")

        cur.execute(
            """
            INSERT INTO forum_posts (thread_id, author_id, content)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (str(thread_id), str(user_id), content),
        )
        post_id = cur.fetchone()["id"]
        cur.execute(
            "UPDATE forum_threads SET updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (str(thread_id),),
        )
        conn.commit()
        return {"post_id": str(post_id)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Yorum eklenemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.post("/forum/posts/{post_id}/like")
def forum_like_post(post_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM forum_posts WHERE id=%s", (str(post_id),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Yorum bulunamadı")
        cur.execute(
            "INSERT INTO forum_post_likes (post_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (str(post_id), str(user_id)),
        )
        conn.commit()
        return {"mesaj": "Beğenildi"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Beğenilemedi: {str(e)}")
    finally:
        cur.close()
        conn.close()


@app.delete("/forum/posts/{post_id}/like")
def forum_unlike_post(post_id: UUID, token: str = Header(...)):
    user_id = get_current_user_id(token)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM forum_post_likes WHERE post_id=%s AND user_id=%s", (str(post_id), str(user_id)))
        conn.commit()
        return {"mesaj": "Beğeni kaldırıldı"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Beğeni kaldırılamadı: {str(e)}")
    finally:
        cur.close()
        conn.close()



# --- HESAP DONDURMA (FREEZE) ---
@app.post("/auth/hesap-dondurma")
def freeze_account(token: str = Header(...)):
    try:
        from jose import jwt
        from auth_utils import SECRET_KEY, ALGORITHM
        payload = jwt.decode(token.replace("Bearer ", ""), SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        conn = get_db_connection()
        cur = conn.cursor()
        
        # 1. Mevcut durumu kontrol et
        cur.execute("SELECT account_status FROM users WHERE id = %s", (user_id,))
        status = cur.fetchone()[0]
        
        if status == 'frozen':
            cur.close()
            conn.close()
            return {"mesaj": "Hesabınız zaten dondurulmuş durumda."}

        # 2. Eğer aktifse dondur
        cur.execute("UPDATE users SET account_status = 'frozen' WHERE id = %s", (user_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"mesaj": "Hesabınız başarıyla donduruldu."}
    except Exception as e:
        print(f"Hata: {e}")
        raise HTTPException(status_code=401, detail="Yetkisiz veya geçersiz işlem!")

# --- HESAP AKTİFLEŞTİRME (UNFREEZE) ---
# Not: Hesap dondurulduğunda kullanıcı giriş yapamayacağı için 
# bu işlem genellikle 'şifremi unuttum' gibi mail onayıyla yapılır.
@app.post("/auth/hesap-aktif et")
def unfreeze_account(data: dict = Body(...)):
    email = data.get("email")
    if not email:
        return {"hata": "E-posta adresi gerekli."}

    conn = get_db_connection()
    cur = conn.cursor()
    
    # 1. Mevcut durumu kontrol et
    cur.execute("SELECT account_status FROM users WHERE email = %s", (email,))
    result = cur.fetchone()
    
    if not result:
        cur.close()
        conn.close()
        return {"hata": "Bu e-posta adresine ait kullanıcı bulunamadı."}
        
    status = result[0]
    
    if status == 'active':
        cur.close()
        conn.close()
        return {"mesaj": "Hesabınız zaten aktif durumda."}

    # 2. Eğer dondurulmuşsa aktif et
    cur.execute("UPDATE users SET account_status = 'active' WHERE email = %s", (email,))
    conn.commit()
    cur.close()
    conn.close()
    return {"mesaj": "Hoş geldiniz! Hesabınız tekrar aktif edildi."}

# --- HESAP SİLME (DELETE) ---
@app.delete("/auth/hesap-sil")
def delete_account(token: str = Header(...)):
    try:
        from jose import jwt
        from auth_utils import SECRET_KEY, ALGORITHM
        actual_token = token.replace("Bearer ", "").strip()
        payload = jwt.decode(actual_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        conn = get_db_connection()
        cur = conn.cursor()
        
        # Önce bu kullanıcıya ait resimleri ve ilanları silmeliyiz (Foreign Key kısıtlaması varsa)
        cur.execute("DELETE FROM vehicle_images WHERE vehicle_id IN (SELECT id FROM vehicles WHERE seller_id = %s)", (user_id,))
        cur.execute("DELETE FROM vehicles WHERE seller_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        return {"mesaj": "Hesabınız ve tüm verileriniz kalıcı olarak silindi."}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Silme işlemi başarısız!")
    

@app.get("/ilanlar") # React ile uyumlu olması için /ilanlar yaptık
def get_vehicles():
    try:
        conn = get_db_connection()
        import psycopg2.extras 
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        query = """
            SELECT v.*, i.image_url as cover_image 
            FROM vehicles v
            LEFT JOIN vehicle_images i ON v.id = i.vehicle_id AND i.is_cover = TRUE
            ORDER BY v.created_at DESC
        """
        cur.execute(query)
        ilanlar = cur.fetchall() # Değişken adı: ilanlar
        
        cur.close()
        conn.close()
        return ilanlar # Değişken adını ilanlar olarak düzelttik
    except Exception as e:
        print(f"Hata: {e}")
        return {"hata": str(e)}

@app.post("/arac-ekle")
def add_vehicle(vehicle: VehicleCreate, token: str = Header(...)):
    try:
        # 1. Token temizleme (Daha sağlam yöntem)
        actual_token = token.replace("Bearer ", "").strip()
        
        # DEBUG: Terminalde token'ı gör (Sorun çözülünce bu satırı silebilirsin)
        print(f"Gelen Token: |{actual_token}|") 

        from jose import jwt
        from auth_utils import SECRET_KEY, ALGORITHM
        
        # Token boşsa direkt hata fırlat
        if not actual_token or actual_token == "null" or actual_token == "undefined":
            raise Exception("Token bulunamadı veya geçersiz.")

        payload = jwt.decode(actual_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        # 2. Veritabanına bağlan
        conn = get_db_connection()
        cur = conn.cursor() 
        
        # 3. Yeni genişletilmiş sorgu (Tüm yeni sütunlar burada)
        # 3. YENİ VE EKSİKSİZ SQL SORGUSU (Tam 24 Sütun, 24 Parametre)
        query = """
            INSERT INTO vehicles (
                seller_id, category, title, brand, series, model, year, price, mileage, 
                fuel_type, transmission, city, description, vehicle_status, 
                body_type, engine_power, engine_capacity, drive_type, color, 
                has_warranty, heavy_damage, plate_nationality, seller_type, exchangeable
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s
            ) RETURNING id;
        """
        
        # 4. Verileri Pydantic modelinden Çekme (Sıralama SQL ile BİREBİR aynı olmalı)
        cur.execute(query, (
            user_id, 
            vehicle.category, 
            vehicle.title, 
            vehicle.brand, 
            vehicle.series, 
            vehicle.model, 
            vehicle.year, 
            vehicle.price, 
            vehicle.mileage, 
            vehicle.fuel_type, 
            vehicle.transmission, 
            vehicle.city, 
            vehicle.description, 
            vehicle.vehicle_status,
            vehicle.body_type, 
            vehicle.engine_power, 
            vehicle.engine_capacity, 
            vehicle.drive_type, 
            vehicle.color, 
            True if vehicle.has_warranty == "Evet" else False,   # ÇEVİRİ YAPILDI
            True if vehicle.heavy_damage == "Evet" else False,   # ÇEVİRİ YAPILDI 
            vehicle.plate_nationality, 
            vehicle.seller_type, 
            True if vehicle.exchangeable == "Evet" else False    # ÇEVİRİ YAPILDI
        ))
        
        vehicle_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        
        return {"mesaj": "İlan başarıyla eklendi!", "ilan_id": str(vehicle_id)}
        
    except Exception as e:
        print(f"Hata detayı: {e}") # Terminale hatayı yazdır ki görebilelim
        raise HTTPException(status_code=400, detail=f"İlan eklenemedi: {str(e)}")
    

# 1. Resim ekleme fonksiyonu (Frontend buraya resim URL'si gönderecek)
@app.post("/ilan-foto-yukle/{vehicle_id}")
async def upload_image(vehicle_id: str, file: UploadFile = File(...)):
    try:
        # Dosya adını benzersiz yapalım (Çakışma olmasın)
        file_path = os.path.join(UPLOAD_DIR, f"{vehicle_id}_{file.filename}")
        
        # Dosyayı diske kaydet
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Veritabanına kaydedilecek URL (Backend adresi + dosya yolu)
        image_url = f"http://127.0.0.1:8000/static/{vehicle_id}_{file.filename}"
        
        # Veritabanına kaydet
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO vehicle_images (vehicle_id, image_url, is_cover)
            VALUES (%s, %s, %s)
        """, (vehicle_id, image_url, True))
        conn.commit()
        cur.close()
        conn.close()
        
        return {"mesaj": "Dosya başarıyla yüklendi", "url": image_url}
    except Exception as e:
        return {"hata": str(e)}

# Yüklenen resimlerin kaydedileceği klasörü oluştur
UPLOAD_DIR = "uploaded_images"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Bu klasörü dışarıya açıyoruz (Tarayıcıdan erişebilmek için)
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")



@app.get("/ilan/{ilan_id}")
 # Terminalde bu mesajı görmelisin
def get_vehicle_detail(ilan_id: str):
    try:

        
        ilan_id = ilan_id.strip()
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # İlan bilgilerini, satıcının adını/telefonunu ve araç resmini birleştirerek (JOIN) çekiyoruz
        query = """
            SELECT 
                v.*, 
                u.full_name as seller_name, 
                u.phone as seller_phone,
                i.image_url
            FROM vehicles v
            LEFT JOIN users u ON v.seller_id = u.id
            LEFT JOIN vehicle_images i ON v.id = i.vehicle_id AND i.is_cover = TRUE
            WHERE v.id = %s
        """
        cur.execute(query, (ilan_id,))
        ilan = cur.fetchone()
        
        cur.close()
        conn.close()
        
        if not ilan:
            raise HTTPException(status_code=404, detail="İlan bulunamadı.")
            
        return ilan
    except Exception as e:
        print(f"Hata: {e}")
        raise HTTPException(status_code=400, detail="İlan detayları yüklenemedi.")


@app.get("/kullanici-bilgileri")
def get_user_info(token: str = Header(...)):
    try:
        from jose import jwt
        from auth_utils import SECRET_KEY, ALGORITHM
        actual_token = token.replace("Bearer ", "").strip()
        payload = jwt.decode(actual_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # Kullanıcının temel bilgilerini seçiyoruz
        cur.execute("SELECT email, full_name, phone, city, account_status FROM users WHERE id = %s", (user_id,))
        user_info = cur.fetchone()
        
        cur.close()
        conn.close()
        return user_info
    except Exception as e:
        raise HTTPException(status_code=401, detail="Kullanıcı bilgileri alınamadı")


@app.get("/kullanici-ilanlari")
def get_user_vehicles(token: str = Header(...)):
    try:
        from jose import jwt
        from auth_utils import SECRET_KEY, ALGORITHM
        actual_token = token.replace("Bearer ", "").strip()
        payload = jwt.decode(actual_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        # Sadece bu kullanıcıya ait ilanları getiriyoruz
        cur.execute("""
            SELECT v.*, i.image_url 
            FROM vehicles v 
            LEFT JOIN vehicle_images i ON v.id = i.vehicle_id AND i.is_cover = TRUE
            WHERE v.seller_id = %s
        """, (user_id,))
        
        ilanlar = cur.fetchall()
        cur.close()
        conn.close()
        return ilanlar
    except Exception as e:
        raise HTTPException(status_code=401, detail="İlanlar yüklenemedi")


@app.delete("/ilan-sil/{ilan_id}")
def delete_vehicle(ilan_id: str, token: str = Header(...)):
    try:
        # 1. Token'ı çöz ve işlemi kimin yaptığını bul
        from jose import jwt
        from auth_utils import SECRET_KEY, ALGORITHM
        actual_token = token.replace("Bearer ", "").strip()
        payload = jwt.decode(actual_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        conn = get_db_connection()
        cur = conn.cursor()

        # 2. GÜVENLİK KONTROLÜ: İlan gerçekten bu kullanıcıya mı ait?
        cur.execute("SELECT seller_id FROM vehicles WHERE id = %s", (ilan_id,))
        result = cur.fetchone()

        if not result:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Böyle bir ilan bulunamadı.")
            
        if str(result[0]) != str(user_id):
            cur.close()
            conn.close()
            raise HTTPException(status_code=403, detail="Sadece kendi ilanlarınızı silebilirsiniz!")

        # 3. SİLME İŞLEMİ (Önce resimler, sonra ilan)
        # PostgreSQL'de Foreign Key (Yabancı Anahtar) hatası almamak için 
        # önce bu ilana bağlı olan resimleri siliyoruz.
        cur.execute("DELETE FROM vehicle_images WHERE vehicle_id = %s", (ilan_id,))
        
        # Resimler silindikten sonra asıl ilanı siliyoruz.
        cur.execute("DELETE FROM vehicles WHERE id = %s", (ilan_id,))

        # Değişiklikleri kaydet
        conn.commit()
        cur.close()
        conn.close()

        return {"mesaj": "İlan ve bağlı görseller başarıyla silindi."}

    except HTTPException:
        # Kendi fırlattığımız hataları (403, 404) bozmadan geri gönder
        raise
    except Exception as e:
        print(f"Silme Hatası: {e}")
        raise HTTPException(status_code=400, detail="İlan silinirken teknik bir hata oluştu.")


@app.post("/ai/soru")
def ai_query(data: dict = Body(...)):
    soru = data.get("soru")
    if not soru:
        return {"hata": "Lütfen bir soru sorunuz."}
    
    try:
        cevap = ask_gemini(soru)
        return {"cevap": cevap}
    except Exception as e:
        return {"hata": f"AI servisi şu an çalışmıyor: {str(e)}"}


@app.post("/ai/ilan-aciklama")
def ai_listing_description(data: dict = Body(...)):
    try:
        aciklama = generate_listing_description(data)
        return {"aciklama": aciklama}
    except Exception as e:
        return {"hata": f"İlan açıklaması oluşturulamadı: {str(e)}"}