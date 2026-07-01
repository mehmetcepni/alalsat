import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Ilanlarim = () => {
    const [ilanlar, setIlanlar] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchIlanlar = async () => {
            try {
                const res = await axios.get('http://127.0.0.1:8000/kullanici-ilanlari', {
                    headers: { 'token': `Bearer ${token}` }
                });
                setIlanlar(res.data);
            } catch (error) {
                console.error("İlanlar çekilemedi:", error);
            } finally {
                setYukleniyor(false);
            }
        };
        fetchIlanlar();
    }, [token]);

    const ilanSil = async (id) => {
        if (!window.confirm("Bu ilanı kalıcı olarak silmek istediğinize emin misiniz?")) return;
        
        try {
            await axios.delete(`http://127.0.0.1:8000/ilan-sil/${id}`, {
                headers: { 'token': `Bearer ${token}` }
            });
            // Ekrandan silinen ilanı kaldır
            setIlanlar(ilanlar.filter(i => i.id !== id));
        } catch (error) {
            alert("İlan silinirken bir hata oluştu.");
        }
    };

    // Fiyatı daha okunabilir hale getiren yardımcı fonksiyon (Örn: 1.250.000)
    const formatFiyat = (fiyat) => {
        return new Intl.NumberFormat('tr-TR').format(fiyat);
    };

    // 1. Yüklenme Durumu
    if (yukleniyor) {
        return (
            <div className="flex justify-center items-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto mt-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Yayındaki İlanlarım</h2>
                    <p className="text-gray-500 mt-1">Sisteme yüklediğiniz tüm araçları buradan yönetebilirsiniz.</p>
                </div>
                <button 
                    onClick={() => navigate('/ilan-ver')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-200 transition-all"
                >
                    + Yeni İlan Ver
                </button>
            </div>

            {/* 2. Boş Durum (Hiç ilan yoksa) */}
            {ilanlar.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                    <div className="text-6xl mb-4">🚗</div>
                    <h3 className="text-xl font-bold text-gray-700 mb-2">Henüz bir ilanınız yok</h3>
                    <p className="text-gray-500 mb-6">Hemen ilk aracınızı sisteme yükleyerek alıcılara ulaşın.</p>
                    <button 
                        onClick={() => navigate('/ilan-ver')}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        İlk İlanını Oluştur →
                    </button>
                </div>
            ) : (
                /* 3. İlan Listesi (Grid ve Card Yapısı) */
                <div className="grid grid-cols-1 gap-6">
                    {ilanlar.map(ilan => (
                        <div key={ilan.id} className="flex flex-col sm:flex-row items-center bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow rounded-2xl overflow-hidden p-4 gap-6">
                            
                            {/* İlan Resmi */}
                            <img 
                                src={ilan.image_url || 'https://via.placeholder.com/300x200?text=Görsel+Yok'} 
                                alt={`${ilan.brand} ${ilan.model}`}
                                className="w-full sm:w-48 h-32 object-cover rounded-xl border border-gray-100" 
                            />
                            
                            {/* İlan Bilgileri */}
                            <div className="flex-1 w-full text-center sm:text-left">
                                <h4 className="text-xl font-bold text-gray-800">{ilan.brand} {ilan.model}</h4>
                                <div className="flex flex-wrap gap-2 justify-center sm:justify-start mt-2 text-sm text-gray-500 font-medium">
                                    <span className="bg-gray-100 px-2 py-1 rounded-md">{ilan.year}</span>
                                    <span className="bg-gray-100 px-2 py-1 rounded-md">{ilan.city || 'Konum Yok'}</span>
                                </div>
                                <p className="text-2xl font-extrabold text-blue-600 mt-3">{formatFiyat(ilan.price)} TL</p>
                            </div>
                            
                            {/* Aksiyon Butonları */}
                            <div className="w-full sm:w-auto flex flex-col gap-2">
                                <button 
                                    onClick={() => ilanSil(ilan.id)} 
                                    className="w-full sm:w-auto px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl font-bold transition-colors border border-red-100 hover:border-red-600"
                                >
                                    İlanı Kaldır
                                </button>
                            </div>

                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Ilanlarim;