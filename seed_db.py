import psycopg2
from psycopg2.extras import execute_values

def seed_data():
    try:
        conn = psycopg2.connect(
            user="postgres",
            password="password123",
            host="127.0.0.1",
            port="5433",
            database="postgres"
        )
        cur = conn.cursor()

        print("🌱 Veriler ekleniyor...")

        # 1. Önce bir test kullanıcısı (Satıcı) ekleyelim ve ID'sini alalım
        cur.execute("""
            INSERT INTO users (email, password_hash, full_name, phone, city)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id;
        """, ("deneme@alalsat.com", "hash_123456", "Mehmet Galeri", "05551112233", "İstanbul"))
        
        seller_id = cur.fetchone()[0]

        # 2. Bu satıcıya bağlı araçları ekleyelim
        vehicles_data = [
            (seller_id, "Temiz Aile Arabası", "Toyota", "Corolla", 2020, 1200000.00, 45000, "Benzin", "Otomatik", "İstanbul"),
            (seller_id, "Hatasız Boyasız SUV", "Dacia", "Duster", 2022, 950000.00, 12000, "Dizel", "Manuel", "Ankara"),
            (seller_id, "Ekonomik Şehir Arabası", "Fiat", "Egea", 2019, 750000.00, 85000, "Benzin", "Manuel", "İzmir")
        ]

        query = """
            INSERT INTO vehicles (seller_id, title, brand, model, year, price, mileage, fuel_type, transmission, city)
            VALUES %s
        """
        
        execute_values(cur, query, vehicles_data)

        conn.commit()
        print(f"✅ Başarılı! 1 kullanıcı ve {len(vehicles_data)} araç eklendi.")

        cur.close()
        conn.close()
    except Exception as error:
        print(f"❌ Veri ekleme hatası: {error}")

if __name__ == "__main__":
    seed_data()