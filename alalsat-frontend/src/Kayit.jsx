import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Kayit = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    sifre: '',
    isim: '',
    telefon: '',
    sehir: ''
  });

  const handleKayit = async (e) => {
    e.preventDefault();
    try {
      // Backend'deki /kayit endpoint'ine veriyi gönderiyoruz
      const res = await axios.post('http://127.0.0.1:8000/kayit', formData);
      
      if (res.data.mesaj) {
        alert(res.data.mesaj); // "Kayıt oluşturuldu. Lütfen doğrulayın..."
        navigate('/dogrula');  // Seni az önce oluşturduğumuz sayfaya atar
      } else if (res.data.hata) {
        alert("Hata: " + res.data.hata);
      }
    } catch (err) {
      console.error(err);
      alert("Kayıt sırasında bir hata oluştu: " + (err.response?.data?.hata || err.message));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
        <h2 className="text-3xl font-bold text-center text-blue-600 mb-8">AlalSat'a Katıl</h2>
        <form onSubmit={handleKayit} className="space-y-4">
          <input 
            type="text" placeholder="Ad Soyad" required
            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
            onChange={(e) => setFormData({...formData, isim: e.target.value})}
          />
          <input 
            type="email" placeholder="E-posta" required
            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />
          <input 
            type="password" placeholder="Şifre" required
            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
            onChange={(e) => setFormData({...formData, sifre: e.target.value})}
          />
          <input 
            type="text" placeholder="Telefon"
            className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
            onChange={(e) => setFormData({...formData, telefon: e.target.value})}
          />
          <input 
            type="text" placeholder="Şehir"
          className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-100"
          onChange={(e) => setFormData({...formData, sehir: e.target.value})}
          />
          <button className="w-full bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700 transition">
            Ücretsiz Kayıt Ol
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Zaten hesabın var mı? <span onClick={() => navigate('/giris')} className="text-blue-600 cursor-pointer font-bold">Giriş Yap</span>
        </p>
      </div>
    </div>
  );
};

export default Kayit;