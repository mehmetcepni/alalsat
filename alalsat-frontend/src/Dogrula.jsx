import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Dogrula = () => {
    const [kod, setKod] = useState('');
    const navigate = useNavigate();

    const handleDogrulama = async (e) => {
        e.preventDefault();
        try {
            // Backend'deki /auth/dogrula endpoint'ine kodu gönderiyoruz
            const res = await axios.post('http://127.0.0.1:8000/auth/dogrula', { token: kod });
            
            if (res.data.mesaj) {
                alert(res.data.mesaj);
                navigate('/giris'); // Doğrulama bitince Giriş sayfasına yönlendir
            } else {
                alert("Hata: " + res.data.hata);
            }
        } catch (err) {
            alert("Doğrulama işlemi başarısız oldu!");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full p-8 bg-white shadow-2xl rounded-3xl border border-blue-50">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">E-posta Doğrulama</h2>
                <p className="text-sm text-gray-500 text-center mb-6">
                    Lütfen mail kutunuza gelen doğrulama kodunu aşağıdaki alana yapıştırın.
                </p>
                <form onSubmit={handleDogrulama} className="space-y-4">
                    <input 
                        type="text" 
                        placeholder="Örn: 5f3d..." 
                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        onChange={(e) => setKod(e.target.value)}
                        required
                    />
                    <button className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition">
                        Hesabımı Aktif Et
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Dogrula;