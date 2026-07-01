import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Profil = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const token = localStorage.getItem('token');

    // --- ŞİFRE SIFIRLAMA MODAL STATELERİ ---
    const [isModalAcik, setIsModalAcik] = useState(false);
    const [sifreAdim, setSifreAdim] = useState(1); // 1: Email Onayı, 2: Kod ve Yeni Şifre
    const [email, setEmail] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [yeniSifre, setYeniSifre] = useState('');
    const [islemBekliyor, setIslemBekliyor] = useState(false);
    const [mesaj, setMesaj] = useState({ tip: '', metin: '' });

    // 1. Kullanıcı Bilgilerini Çekme
    useEffect(() => {
        const fetchUserInfo = async () => {
            try {
                const res = await axios.get('http://127.0.0.1:8000/kullanici-bilgileri', {
                    headers: { 'token': `Bearer ${token}` }
                });
                setUser(res.data);
                setEmail(res.data.email); // Şifre sıfırlama için maili otomatik doldur
            } catch (err) {
                console.error("Bilgiler çekilemedi", err);
                if (err.response?.status === 401) handleCikis();
            }
        };
        if (token) fetchUserInfo();
    }, [token]);

    // 2. Çıkış İşlemi
    const handleCikis = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token'); // Refresh token varsa onu da sil
        window.location.href = "/giris";
    };

    // 3. Hesap Dondurma
    const handleHesapDondur = async () => {
        if (!window.confirm("Hesabınızı dondurmak istediğinize emin misiniz? Giriş yapana kadar ilanlarınız gizlenebilir.")) return;
        try {
            const res = await axios.post('http://127.0.0.1:8000/auth/hesap-dondurma', {}, {
                headers: { 'token': `Bearer ${token}` }
            });
            alert(res.data.mesaj || "Hesabınız donduruldu.");
            handleCikis();
        } catch (err) { 
            alert("İşlem başarısız: " + (err.response?.data?.detail || "Sunucu hatası")); 
        }
    };

    // 4. Hesap Silme
    const handleHesapSil = async () => {
        const onay = window.confirm("DİKKAT! Hesabınız ve tüm ilanlarınız kalıcı olarak silinecek. Bu işlem geri alınamaz. Onaylıyor musunuz?");
        if (!onay) return;
        
        try {
            const res = await axios.delete('http://127.0.0.1:8000/auth/hesap-sil', {
                headers: { 'token': `Bearer ${token}` }
            });
            alert(res.data.mesaj || "Hesabınız başarıyla silindi.");
            handleCikis();
        } catch (err) { 
            alert("Hesap silinirken bir hata oluştu."); 
        }
    };

    // --- ŞİFRE SIFIRLAMA FONKSİYONLARI ---

    // 1. Aşama: Kod Gönder
    const handleKodGonder = async (e) => {
        e.preventDefault();
        setIslemBekliyor(true);
        setMesaj({ tip: '', metin: '' });

        try {
            const res = await axios.post('http://127.0.0.1:8000/auth/sifre-unuttum', { email });
            if (res.data.hata) {
                setMesaj({ tip: 'hata', metin: res.data.hata });
            } else {
                setMesaj({ tip: 'basari', metin: res.data.mesaj });
                setSifreAdim(2); // İkinci adıma geç
            }
        } catch (err) {
            setMesaj({ tip: 'hata', metin: "Mail gönderilirken bir hata oluştu." });
        } finally {
            setIslemBekliyor(false);
        }
    };

    // 2. Aşama: Şifreyi Güncelle
    const handleSifreSifirla = async (e) => {
        e.preventDefault();
        setIslemBekliyor(true);
        setMesaj({ tip: '', metin: '' });

        try {
            const res = await axios.post('http://127.0.0.1:8000/auth/sifre-sifirla', { 
                token: resetToken, 
                yeni_sifre: yeniSifre 
            });

            if (res.data.hata) {
                setMesaj({ tip: 'hata', metin: res.data.hata });
            } else {
                alert(res.data.mesaj + " Güvenliğiniz için lütfen yeni şifrenizle tekrar giriş yapın.");
                handleCikis(); // Şifre değiştiği için çıkış yaptırılır
            }
        } catch (err) {
            setMesaj({ tip: 'hata', metin: "Şifre güncellenirken sunucu hatası oluştu." });
        } finally {
            setIslemBekliyor(false);
        }
    };

    const kapatVeTemizle = () => {
        setIsModalAcik(false);
        setSifreAdim(1);
        setResetToken('');
        setYeniSifre('');
        setMesaj({ tip: '', metin: '' });
    };

    // --- RENDER ---
    if (!user) return (
        <div className="flex justify-center mt-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto mt-10 p-4 space-y-6">
            
            {/* 1. KULLANICI BİLGİ KARTI */}
            <div className="bg-white shadow-md rounded-2xl p-6 border border-gray-100 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                            {user.full_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">{user.full_name}</h2>
                            <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                    </div>
                    {/* YENİ EKLENEN ŞİFRE DEĞİŞTİR BUTONU */}
                    <button 
                        onClick={() => setIsModalAcik(true)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-xl text-sm font-bold transition w-full sm:w-auto"
                    >
                        🔒 Şifremi Değiştir
                    </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
                    <div>
                        <p className="text-gray-400 font-semibold">Şehir</p>
                        <p className="text-gray-700">{user.city || "Belirtilmemiş"}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 font-semibold">Telefon</p>
                        <p className="text-gray-700">{user.phone || "Belirtilmemiş"}</p>
                    </div>
                </div>
            </div>

            {/* 2. İLAN YÖNETİMİ */}
            <div className="bg-white shadow-md rounded-2xl overflow-hidden border border-gray-100">
                <button 
                    onClick={() => navigate('/ilanlarim')}
                    className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition"
                >
                    <div className="text-left">
                        <h3 className="font-bold text-gray-800">İlanlarım</h3>
                        <p className="text-xs text-gray-500">Yayınladığınız araçları görün ve düzenleyin</p>
                    </div>
                    <span className="text-blue-600 font-bold text-xl">→</span>
                </button>
            </div>

            {/* 2.1 SOSYAL */}
            <div className="bg-white shadow-md rounded-2xl overflow-hidden border border-gray-100">
                <div className="p-5 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800">Sosyal</h3>
                    <p className="text-xs text-gray-500">Arkadaşlar ve sohbetler</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3">
                    <button
                        onClick={() => navigate('/arkadaslar')}
                        className="p-5 hover:bg-gray-50 transition text-left border-b sm:border-b-0 sm:border-r border-gray-100"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-gray-800">Arkadaşlar</p>
                                <p className="text-xs text-gray-500">İstek gönder / kabul et</p>
                            </div>
                            <span className="text-blue-600 font-bold text-xl">→</span>
                        </div>
                    </button>
                    <button
                        onClick={() => navigate('/sohbetler')}
                        className="p-5 hover:bg-gray-50 transition text-left border-b sm:border-b-0 sm:border-r border-gray-100"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-gray-800">Sohbetler</p>
                                <p className="text-xs text-gray-500">Inbox / Spawn kutusu</p>
                            </div>
                            <span className="text-blue-600 font-bold text-xl">→</span>
                        </div>
                    </button>

                    <button
                        onClick={() => navigate('/forum')}
                        className="p-5 hover:bg-gray-50 transition text-left"
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-gray-800">Forum</p>
                                <p className="text-xs text-gray-500">Konular / yorumlar</p>
                            </div>
                            <span className="text-blue-600 font-bold text-xl">→</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* 3. TEHLİKELİ İŞLEMLER */}
            <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                <h3 className="text-red-700 font-bold mb-4">Hesap Yönetimi</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                        onClick={handleHesapDondur}
                        className="flex-1 bg-white border border-red-200 text-red-600 py-3 rounded-xl font-semibold hover:bg-red-100 transition"
                    >
                        Hesabı Dondur
                    </button>
                    <button 
                        onClick={handleHesapSil}
                        className="flex-1 bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition shadow-sm"
                    >
                        Hesabı Kalıcı Olarak Sil
                    </button>
                </div>
                <button 
                    onClick={handleCikis}
                    className="w-full mt-4 text-gray-500 text-sm font-medium hover:underline"
                >
                    Güvenli Çıkış Yap
                </button>
            </div>

            {/* --- ŞİFRE SIFIRLAMA MODALI --- */}
            {isModalAcik && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl relative">
                        <button onClick={kapatVeTemizle} className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 text-xl font-bold">✕</button>
                        
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                            {sifreAdim === 1 ? 'Şifre Değiştirme' : 'Yeni Şifre Belirle'}
                        </h3>
                        <p className="text-gray-500 text-sm mb-6">
                            {sifreAdim === 1 
                                ? 'Güvenliğiniz için kayıtlı e-posta adresinize bir doğrulama kodu göndereceğiz.' 
                                : 'Lütfen e-postanıza gelen kodu ve yeni şifrenizi girin.'}
                        </p>

                        {mesaj.metin && (
                            <div className={`p-4 rounded-xl mb-6 text-sm font-bold ${mesaj.tip === 'hata' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                                {mesaj.metin}
                            </div>
                        )}

                        {/* Aşama 1 Formu */}
                        {sifreAdim === 1 && (
                            <form onSubmit={handleKodGonder} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">E-Posta Adresiniz</label>
                                    <input 
                                        type="email" 
                                        value={email} 
                                        disabled // Profildeyiz, maile müdahale edemesin
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 outline-none"
                                    />
                                </div>
                                <button 
                                    type="submit" 
                                    disabled={islemBekliyor}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl font-bold transition disabled:opacity-50"
                                >
                                    {islemBekliyor ? 'Gönderiliyor...' : 'Doğrulama Kodu Gönder'}
                                </button>
                            </form>
                        )}

                        {/* Aşama 2 Formu */}
                        {sifreAdim === 2 && (
                            <form onSubmit={handleSifreSifirla} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">E-Postaya Gelen Kod</label>
                                    <input 
                                        type="text" 
                                        value={resetToken} 
                                        onChange={(e) => setResetToken(e.target.value)} 
                                        required 
                                        placeholder="16 Haneli Kod"
                                        className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center tracking-widest text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Yeni Şifreniz</label>
                                    <input 
                                        type="password" 
                                        value={yeniSifre} 
                                        onChange={(e) => setYeniSifre(e.target.value)} 
                                        required 
                                        placeholder="••••••••"
                                        className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <button 
                                    type="submit" 
                                    disabled={islemBekliyor}
                                    className="w-full bg-green-600 hover:bg-green-700 text-white p-3 rounded-xl font-bold transition disabled:opacity-50"
                                >
                                    {islemBekliyor ? 'Güncelleniyor...' : 'Şifremi Güncelle'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Profil;