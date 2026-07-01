import psycopg2

try:
    connection = psycopg2.connect(
        user="postgres",
        password="password123",
        host="127.0.0.1",
        port="5433",  # Burayı 5433 yaptık
        database="postgres"
    )
    print("🚀 Tebrikler! Veritabanına başarıyla bağlandın.")
    connection.close()
except Exception as error:
    print(f"❌ Bağlantı hatası: {error}")