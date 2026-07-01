import os
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt
from dotenv import load_dotenv

# .env dosyasındaki gizli değişkenleri sisteme yükler
load_dotenv() 

# Şifreleme ayarları
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Güvenlik Ayarları (.env içinden çeker, bulamazsa yandaki varsayılanı kullanır)
SECRET_KEY = os.getenv("SECRET_KEY", "guvenlik_icin_bunu_degistirmelisin")
ALGORITHM = "HS256"

# Token Süreleri (Çift Token Mimarisi)
ACCESS_TOKEN_EXPIRE_MINUTES = 15     # 15 Dakika (Kısa ömürlü güvenlik token'ı)
REFRESH_TOKEN_EXPIRE_MINUTES = 10080 # 7 Gün (Arka planda oturumu yenileyecek token)

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str):
    # Verilerin başına/sonuna yanlışlıkla eklenen boşlukları temizleyelim
    return pwd_context.verify(plain_password.strip(), hashed_password.strip())

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    
    # Eğer özel bir süre verilmişse (Refresh Token için) onu kullan
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    # Verilmemişse varsayılan 15 dakikayı kullan (Access Token için)
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)