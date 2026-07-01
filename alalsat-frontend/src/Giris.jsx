import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom'; // Yönlendirme için ekledik

const Giris = () => {
  const [email, setEmail] = useState('');
  const [sifre, setSifre] = useState('');
  const [mesaj, setMesaj] = useState('');
  const navigate = useNavigate(); // Navigasyon fonksiyonunu tanımladık

  const handleGiris = async (e) => {
    e.preventDefault();
    setMesaj(""); // Eski mesajı temizle
    
    try {
      const response = await axios.post('http://127.0.0.1:8000/giris', {
        email: email,
        sifre: sifre
      });

      // Backend'den gelen cevabı kontrol et
      if (response.data.access_token) {
        localStorage.setItem('token', response.data.access_token);
        setMesaj("Giriş Başarılı! Yönlendiriliyorsunuz...");
        
        // App.jsx'teki isLoggedIn durumunu tetiklemek için sayfayı yeniliyoruz
        setTimeout(() => {
          window.location.href = "/"; 
        }, 1000);
      } else {
        // Backend'den token yerine hata mesajı geldiyse
        setMesaj("Hata: " + (response.data.hata || "Giriş başarısız"));
      }
    } catch (error) {
      // Axios hatası (400, 401, 500 vb.)
      setMesaj("Hata: " + (error.response?.data?.hata || "Sunucuya bağlanılamadı"));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl shadow-xl border border-gray-100">
        <div className="text-center">
          <h2 className="text-4xl font-black text-blue-600 tracking-tight italic">alal<span className="text-gray-900">sat</span></h2>
          <p className="text-gray-500 mt-2 text-sm font-medium">Hemen giriş yap ve ilanları keşfet!</p>
        </div>

        <form className="space-y-4" onSubmit={handleGiris}>
          <div>
            <label className="block text-sm font-semibold text-gray-700">E-posta</label>
            <input 
              type="email" 
              className="w-full px-4 py-3 mt-1 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition"
              placeholder="mail@ornek.com"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Şifre</label>
            <input 
              type="password" 
              className="w-full px-4 py-3 mt-1 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition"
              placeholder="••••••••"
              onChange={(e) => setSifre(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="w-full py-3 text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition duration-200 font-bold shadow-lg shadow-blue-100">
            Giriş Yap
          </button>
        </form>

        {/* --- YENİ EKLEDİĞİMİZ KAYIT OL BUTONU --- */}
        <div className="pt-4 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-600">
            Henüz hesabın yok mu?{" "}
            <button 
              onClick={() => navigate('/kayit')} 
              className="text-blue-600 font-bold hover:underline"
            >
              Ücretsiz Kayıt Ol
            </button>
          </p>
        </div>

        {mesaj && (
          <div className={`p-3 rounded-lg text-center text-sm font-bold ${mesaj.includes("Başarılı") ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
            {mesaj}
          </div>
        )}
      </div>
    </div>
  );
};

export default Giris;