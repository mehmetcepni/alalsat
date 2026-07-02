import os
from google import genai
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv


load_dotenv()

# --- AYARLAR ---
# API anahtarini kodda tutma, ortam degiskeninden oku.
# Bazi ortamlarda anahtar GOOGLE_API_KEY olarak tanimli olabilir.
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
client = None
DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres",
    "password": "password123",
    "host": "127.0.0.1",
    "port": "5433"
}

def get_inventory():
    """Veritabanından güncel araç listesini çeker."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT brand, model, year, price, city FROM vehicles;")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        if not rows:
            return "Şu an sistemde hiç araç ilanı bulunmuyor."
            
        inventory_text = "Sistemdeki Mevcut Araçlar:\n"
        for r in rows:
            inventory_text += f"- {r['year']} {r['brand']} {r['model']}, {r['price']} TL, Şehir: {r['city']}\n"
        return inventory_text
    except Exception as e:
        print(f"DB Hatası: {e}")
        return "Envanter bilgisi şu an teknik bir sorun nedeniyle alınamadı."


def get_gemini_api_key():
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def get_gemini_client():
    """Gemini istemcisini ilk kullanımda oluşturur."""
    global client

    if client is not None:
        return client

    gemini_api_key = get_gemini_api_key()

    if not gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY (veya GOOGLE_API_KEY) ortam degiskeni tanimli degil.")

    client = genai.Client(api_key=gemini_api_key, http_options={"api_version": "v1"})
    return client

def ask_gemini(user_query: str):
    inventory = get_inventory()
    
    try:
        gemini_client = get_gemini_client()
        target_model = DEFAULT_GEMINI_MODEL

        # Model listeleme bazi anahtarlarda engellenebildigi icin sadece best-effort yap.
        try:
            available_models = [m.name for m in gemini_client.models.list()]
            print(f"DEBUG - Kullanilabilir modeller: {available_models}")

            for model_name in [
                "gemini-1.5-flash",
                "gemini-1.0-pro",
                "gemini-pro",
                "models/gemini-1.5-flash",
            ]:
                if any(model_name in m for m in available_models):
                    target_model = model_name
                    break
        except Exception as list_error:
            print(f"DEBUG - Model listesi alinamadi, varsayilan model kullanilacak: {list_error}")

        print(f"DEBUG - Seçilen model: {target_model}")

        response = gemini_client.models.generate_content(
            model=target_model,
            contents=f"""
            Sen 'alalsat' araç platformu asistanısın. 
            Görevin, aşağıdaki envantere göre kullanıcıya kısa ve öz bilgi vermektir.
            
            ENVANTER:
            {inventory}
            
            KULLANICI SORUSU: {user_query}
            """
        )
        return response.text

    except Exception as e:
        print(f"KRİTİK HATA: {e}")
        return "Üzgünüm, şu an cevap veremiyorum. (Hata detayı terminalde.)"