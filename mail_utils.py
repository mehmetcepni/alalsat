import smtplib
from email.message import EmailMessage

# Burayı kendi bilgilerinle doldur
GMAIL_USER = "mehmetcepni3434@gmail.com"
GMAIL_APP_PASSWORD = "qzbt jvld wktr dvvk"

def send_mail(target_email, subject, body):
    msg = EmailMessage()
    msg.set_content(body)
    msg['Subject'] = subject
    msg['From'] = 'mehmetcepni3434@gmail.com'
    msg['To'] = target_email

    #smtp ayarları
    try:
        # SSL (Port 465) kullanarak güvenli bağlantı kuruyoruz
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print(f"Mail gönderme hatası: {e}")
        return False