import os
import traceback
from google import genai
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv


load_dotenv()

# --- AYARLAR ---
# API anahtarini kodda tutma, ortam degiskeninden oku.
# Bazi ortamlarda anahtar GOOGLE_API_KEY olarak tanimli olabilir.
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
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


def validate_gemini_configuration() -> tuple[bool, str]:
    api_key = get_gemini_api_key()
    if api_key:
        return True, "Gemini API anahtari bulundu."

    return False, "GEMINI_API_KEY veya GOOGLE_API_KEY ortam degiskeni tanimli degil. AI asistani calisamayacak."


def get_gemini_client():
    """Gemini istemcisini ilk kullanımda oluşturur."""
    global client

    if client is not None:
        return client

    gemini_api_key = get_gemini_api_key()

    if not gemini_api_key:
        print("KRITIK HATA: GEMINI_API_KEY veya GOOGLE_API_KEY ortam degiskeni tanimli degil.")
        raise RuntimeError("GEMINI_API_KEY (veya GOOGLE_API_KEY) ortam degiskeni tanimli degil.")

    client = genai.Client(api_key=gemini_api_key, http_options={"api_version": "v1"})
    return client


def _get_available_model(gemini_client):
    target_model = DEFAULT_GEMINI_MODEL

    try:
        available_models = [m.name for m in gemini_client.models.list()]
        print(f"DEBUG - Kullanilabilir modeller: {available_models}")

        model_candidates = [
            "gemini-2.5-flash",
            "models/gemini-2.5-flash",
            "gemini-2.5-pro",
            "models/gemini-2.5-pro",
            "gemini-1.5-flash",
            "models/gemini-1.5-flash",
            "gemini-pro",
            "models/gemini-pro",
        ]

        for candidate in model_candidates:
            if any(candidate == available or available.endswith(f"/{candidate}") or candidate in available for available in available_models):
                target_model = candidate
                break
    except Exception as list_error:
        print(f"DEBUG - Model listesi alinamadi, varsayilan model kullanilacak: {list_error}")

    print(f"DEBUG - Seçilen model: {target_model}")
    return target_model


def _generate_gemini_text(prompt: str):
    gemini_client = get_gemini_client()
    target_model = _get_available_model(gemini_client)

    response = gemini_client.models.generate_content(
        model=target_model,
        contents=prompt,
    )

    if getattr(response, "text", None):
        return response.text

    print("KRITIK HATA: Gemini yanit uretmedi veya text alani bos geldi.")
    raise RuntimeError("Gemini yanit uretmedi.")

def ask_gemini(user_query: str):
    inventory = get_inventory()
    
    try:
        return _generate_gemini_text(
            f"""
            Sen 'alalsat' araç platformu asistanısın. 
            Görevin, aşağıdaki envantere göre kullanıcıya kısa ve öz bilgi vermektir.
            
            ENVANTER:
            {inventory}
            
            KULLANICI SORUSU: {user_query}
            """
        )

    except Exception as e:
        print(f"KRITIK HATA: {e}")
        traceback.print_exc()
        raise RuntimeError(f"AI servisinde hata: {e}") from e


def generate_listing_description(vehicle_data: dict):
    try:
        prompt = f"""
        Sen AlAlSat için Türkçe ilan açıklaması yazan bir asistansın.
        Kullanıcıya profesyonel, doğal ve güven veren bir araç ilanı açıklaması üret.

        Kurallar:
        - Sadece ilan açıklaması yaz.
        - Başlık veya madde işaretleri kullanma.
        - En fazla 2 kısa paragraf yaz.
        - Uydurma bilgi ekleme.
        - Verilen bilgileri akıcı bir satış metnine dönüştür.

        İLAN BİLGİLERİ:
        - Kategori: {vehicle_data.get('category', '')}
        - Başlık: {vehicle_data.get('title', '')}
        - Marka: {vehicle_data.get('brand', '')}
        - Seri: {vehicle_data.get('series', '')}
        - Model: {vehicle_data.get('model', '')}
        - Yıl: {vehicle_data.get('year', '')}
        - Kilometre: {vehicle_data.get('mileage', '')}
        - Yakıt: {vehicle_data.get('fuel_type', '')}
        - Vites: {vehicle_data.get('transmission', '')}
        - Araç Durumu: {vehicle_data.get('vehicle_status', '')}
        - Kasa Tipi: {vehicle_data.get('body_type', '')}
        - Motor Gücü: {vehicle_data.get('engine_power', '')}
        - Motor Hacmi: {vehicle_data.get('engine_capacity', '')}
        - Çekiş: {vehicle_data.get('drive_type', '')}
        - Renk: {vehicle_data.get('color', '')}
        - Garanti: {vehicle_data.get('has_warranty', '')}
        - Ağır Hasar: {vehicle_data.get('heavy_damage', '')}
        - Plaka / Uyruk: {vehicle_data.get('plate_nationality', '')}
        - Kimden: {vehicle_data.get('seller_type', '')}
        - Takas: {vehicle_data.get('exchangeable', '')}
        - Şehir: {vehicle_data.get('city', '')}
        """
        return _generate_gemini_text(prompt)

    except Exception as e:
        print(f"KRITIK HATA: {e}")
        traceback.print_exc()
        raise RuntimeError(f"İlan açıklaması üretilemedi: {e}") from e