import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const KATEGORILER = [
    "Otomobil", "Arazi, SUV & Pickup", "Elektrikli Araçlar", "Motosiklet", 
    "Minivan & Panelvan", "Ticari Araçlar", "Kiralık Araçlar", "Deniz Araçları", 
    "Hasarlı Araçlar", "Karavan", "Klasik Araçlar", "Hava Araçları", "ATV", "UTV", "Engelli Plakalı Araçlar"
];

// Tasarımda inputları daha temiz yazmak için küçük bir yardımcı bileşen
const InputWrapper = ({ label, children }) => (
    <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">{label} <span className="text-red-500">*</span></label>
        {children}
    </div>
);

const IlanVer = () => {
    const navigate = useNavigate();
    const [selectedFile, setSelectedFile] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(false);
    const [aciklamaUretmeYukleniyor, setAciklamaUretmeYukleniyor] = useState(false);
    
    // Backend'in beklediği tüm alanlar burada eksiksiz tanımlandı
    const [arac, setArac] = useState({
        category: '',
        title: '',
        price: '',
        city: '',
        description: '',
        brand: '',
        series: '',
        model: '',
        year: '',
        mileage: '',
        fuel_type: '',
        transmission: '',
        vehicle_status: '',
        body_type: '',
        engine_power: '',
        engine_capacity: '',
        drive_type: '',
        color: '',
        has_warranty: '',
        heavy_damage: '',
        plate_nationality: '',
        seller_type: '',
        exchangeable: ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setArac(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleAiAciklamaUret = async () => {
        const rawToken = localStorage.getItem('token');

        if (!rawToken || rawToken === "undefined") {
            alert("Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.");
            navigate('/giris');
            return;
        }

        setAciklamaUretmeYukleniyor(true);
        try {
            const res = await axios.post('http://127.0.0.1:8000/ai/ilan-aciklama', arac, {
                headers: { 'token': `Bearer ${rawToken}` }
            });

            if (res.data?.hata) {
                alert(res.data.hata);
                return;
            }

            const generated = (res.data?.aciklama || '').trim();
            if (!generated) {
                alert('AI açıklama üretemedi.');
                return;
            }

            setArac(prev => ({ ...prev, description: generated }));
        } catch (err) {
            console.error('AI açıklama üretme hatası:', err);
            alert(err.response?.data?.detail || err.response?.data?.hata || 'AI açıklama oluşturulamadı.');
        } finally {
            setAciklamaUretmeYukleniyor(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setYukleniyor(true);
        const rawToken = localStorage.getItem('token'); 
        
        if (!rawToken || rawToken === "undefined") {
            alert("Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.");
            navigate('/giris');
            return;
        }

        try {
            // 1. İlan Bilgilerini Gönder
            const res = await axios.post('http://127.0.0.1:8000/arac-ekle', arac, {
                headers: { 'token': `Bearer ${rawToken}` }
            });
            
            const yeniIlanId = res.data.ilan_id;

            // 2. Fotoğraf Seçildiyse Gönder
            if (yeniIlanId && selectedFile) {
                const formData = new FormData();
                formData.append('file', selectedFile);

                await axios.post(`http://127.0.0.1:8000/ilan-foto-yukle/${yeniIlanId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }
            
            alert("İlanınız başarıyla yayınlandı!");
            navigate('/ilanlarim');
            
        } catch (err) {
            console.error("Hata:", err);
            alert("İlan eklenirken bir hata oluştu: " + (err.response?.data?.detail || err.message));
        } finally {
            setYukleniyor(false);
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen py-10">
            <div className="max-w-4xl mx-auto bg-white p-8 md:p-10 rounded-3xl shadow-xl border border-gray-100">
                
                <div className="border-b border-gray-100 pb-6 mb-8">
                    <h2 className="text-3xl font-extrabold text-gray-900">Ücretsiz İlan Ver</h2>
                    <p className="text-gray-500 mt-2">Araç bilgilerinizi eksiksiz ve doğru bir şekilde doldurarak alıcılara güven verin.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    
                    {/* --- 1. TEMEL BİLGİLER --- */}
                    <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 space-y-4">
                        <h3 className="text-lg font-bold text-blue-800 border-b border-blue-200 pb-2 mb-4">1. Temel Bilgiler</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <InputWrapper label="Kategori">
                                <select name="category" value={arac.category} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                                    <option value="">Seçiniz</option>
                                    {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                            </InputWrapper>
                            
                            <InputWrapper label="İlan Başlığı">
                                <input type="text" name="title" value={arac.title} onChange={handleChange} required placeholder="Örn: Sahibinden temiz, bakımlı..." className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Fiyat (TL)">
                                <input type="number" name="price" value={arac.price} onChange={handleChange} required placeholder="Örn: 850000" min="0" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Şehir">
                                <input type="text" name="city" value={arac.city} onChange={handleChange} required placeholder="Örn: İstanbul" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>
                        </div>
                    </div>

                    {/* --- 2. ARAÇ DETAYLARI --- */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">2. Araç Detayları</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <InputWrapper label="Marka">
                                <input type="text" name="brand" value={arac.brand} onChange={handleChange} required placeholder="Örn: Renault" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Seri">
                                <input type="text" name="series" value={arac.series} onChange={handleChange} required placeholder="Örn: Megane" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Model">
                                <input type="text" name="model" value={arac.model} onChange={handleChange} required placeholder="Örn: 1.5 dCi Touch" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Yıl">
                                <input type="number" name="year" value={arac.year} onChange={handleChange} required placeholder="Örn: 2018" min="1900" max="2026" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Kilometre (KM)">
                                <input type="number" name="mileage" value={arac.mileage} onChange={handleChange} required placeholder="Örn: 125000" min="0" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Renk">
                                <input type="text" name="color" value={arac.color} onChange={handleChange} required placeholder="Örn: Beyaz" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>
                        </div>
                    </div>

                    {/* --- 3. TEKNİK ÖZELLİKLER --- */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">3. Teknik Özellikler</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <InputWrapper label="Yakıt Tipi">
                                <select name="fuel_type" value={arac.fuel_type} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Benzin">Benzin</option>
                                    <option value="Dizel">Dizel</option>
                                    <option value="Benzin & LPG">Benzin & LPG</option>
                                    <option value="Hibrit">Hibrit</option>
                                    <option value="Elektrik">Elektrik</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Vites Tipi">
                                <select name="transmission" value={arac.transmission} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Manuel">Manuel</option>
                                    <option value="Otomatik">Otomatik</option>
                                    <option value="Yarı Otomatik">Yarı Otomatik</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Kasa Tipi">
                                <select name="body_type" value={arac.body_type} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Sedan">Sedan</option>
                                    <option value="Hatchback (5 Kapı)">Hatchback (5 Kapı)</option>
                                    <option value="Hatchback (3 Kapı)">Hatchback (3 Kapı)</option>
                                    <option value="Station Wagon">Station Wagon</option>
                                    <option value="SUV">SUV</option>
                                    <option value="Coupe">Coupe</option>
                                    <option value="Minivan">Minivan</option>
                                    <option value="Cabrio">Cabrio</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Motor Gücü (HP)">
                                <input type="number" name="engine_power" value={arac.engine_power} onChange={handleChange} required placeholder="Örn: 110" min="0" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Motor Hacmi (CC)">
                                <input type="number" name="engine_capacity" value={arac.engine_capacity} onChange={handleChange} required placeholder="Örn: 1461" min="0" className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" />
                            </InputWrapper>

                            <InputWrapper label="Çekiş">
                                <select name="drive_type" value={arac.drive_type} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Önden Çekiş">Önden Çekiş</option>
                                    <option value="Arkadan İtiş">Arkadan İtiş</option>
                                    <option value="4x4 (AWD/4WD)">4x4 (AWD/4WD)</option>
                                </select>
                            </InputWrapper>
                        </div>
                    </div>

                    {/* --- 4. DURUM & SATIŞ BİLGİLERİ --- */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">4. Durum ve Satış Bilgileri</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <InputWrapper label="Araç Durumu">
                                <select name="vehicle_status" value={arac.vehicle_status} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="İkinci El">İkinci El</option>
                                    <option value="Sıfır">Sıfır</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Kimden">
                                <select name="seller_type" value={arac.seller_type} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Sahibinden">Sahibinden</option>
                                    <option value="Galeriden">Galeriden</option>
                                    <option value="Yetkili Bayiden">Yetkili Bayiden</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Plaka / Uyruk">
                                <select name="plate_nationality" value={arac.plate_nationality} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Türkiye (TR) Plakalı">Türkiye (TR) Plakalı</option>
                                    <option value="Yabancı Plakalı">Yabancı Plakalı</option>
                                    <option value="Misafir (MA-MZ) Plakalı">Misafir (MA-MZ) Plakalı</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Garanti">
                                <select name="has_warranty" value={arac.has_warranty} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Evet">Evet</option>
                                    <option value="Hayır">Hayır</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Ağır Hasar Kayıtlı">
                                <select name="heavy_damage" value={arac.heavy_damage} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Evet">Evet</option>
                                    <option value="Hayır">Hayır</option>
                                </select>
                            </InputWrapper>

                            <InputWrapper label="Takas">
                                <select name="exchangeable" value={arac.exchangeable} onChange={handleChange} required className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500">
                                    <option value="">Seçiniz</option>
                                    <option value="Evet">Evet</option>
                                    <option value="Hayır">Hayır</option>
                                </select>
                            </InputWrapper>
                        </div>
                    </div>

                    {/* --- 5. AÇIKLAMA & FOTOĞRAF --- */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">5. Açıklama & Görsel</h3>
                        
                        <InputWrapper label="İlan Açıklaması">
                            <div className="flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={handleAiAciklamaUret}
                                    disabled={aciklamaUretmeYukleniyor}
                                    className={`self-start px-4 py-2 rounded-xl text-sm font-bold transition ${aciklamaUretmeYukleniyor ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                >
                                    {aciklamaUretmeYukleniyor ? 'AI açıklama oluşturuluyor...' : 'AI ile Açıklama Oluştur'}
                                </button>
                                <textarea 
                                    name="description" 
                                    value={arac.description} 
                                    onChange={handleChange} 
                                    required 
                                    placeholder="Aracınızın durumunu, ekstra donanımlarını, bakım geçmişini buraya yazabilirsiniz..." 
                                    className="w-full p-4 border border-gray-200 rounded-xl h-32 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                />
                            </div>
                        </InputWrapper>

                        <div className="bg-gray-50 border-2 border-dashed border-gray-300 p-8 rounded-xl text-center">
                            <div className="text-4xl mb-3">📷</div>
                            <label className="cursor-pointer">
                                <span className="bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50">Vitrin Fotoğrafı Seç</span>
                                <input type="file" onChange={handleFileChange} accept="image/*" className="hidden" required />
                            </label>
                            {selectedFile && <p className="mt-4 text-green-600 font-bold text-sm">Seçilen Dosya: {selectedFile.name}</p>}
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={yukleniyor}
                        className={`w-full py-4 text-white text-lg font-bold rounded-xl shadow-xl transition-all ${yukleniyor ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-200'}`}
                    >
                        {yukleniyor ? 'İlan Sisteme Kaydediliyor...' : 'İlanı Yayınla'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default IlanVer;