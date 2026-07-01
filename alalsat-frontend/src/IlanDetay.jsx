import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const IlanDetay = () => {
    const { id } = useParams(); // URL'deki ilan ID'sini yakalar
    const navigate = useNavigate();
    const [ilan, setIlan] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchIlanDetay = async () => {
            try {
                const res = await axios.get(`http://127.0.0.1:8000/ilan/${id}`);
                setIlan(res.data);
            } catch (err) {
                alert("İlan bulunamadı veya silinmiş olabilir.");
                navigate('/');
            } finally {
                setLoading(false);
            }
        };
        fetchIlanDetay();
    }, [id, navigate]);

    if (loading) return <div className="flex justify-center mt-20"><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div></div>;
    if (!ilan) return null;

    // Fiyatı güzelleştir
    const formatFiyat = (fiyat) => new Intl.NumberFormat('tr-TR').format(fiyat);

    return (
        <div className="bg-gray-50 min-h-screen py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                {/* Üst Başlık */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">{ilan.title}</h1>
                        <p className="text-gray-500 mt-1">{ilan.city} • İlan No: <span className="font-mono text-gray-700">{ilan.id.split('-')[0]}</span></p>
                    </div>
                    <div className="text-3xl font-black text-blue-600">
                        {formatFiyat(ilan.price)} TL
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* SOL KOLON: Resim ve Açıklama */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Büyük Resim */}
                        <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100 h-[400px] md:h-[500px]">
                            <img 
                                src={ilan.image_url || 'https://via.placeholder.com/800x500?text=Görsel+Yok'} 
                                alt={ilan.title} 
                                className="w-full h-full object-cover rounded-xl"
                            />
                        </div>

                        {/* İlan Açıklaması */}
                        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-100">
                            <h3 className="text-xl font-bold text-gray-900 border-b pb-3 mb-4">İlan Açıklaması</h3>
                            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {ilan.description}
                            </p>
                        </div>
                    </div>

                    {/* SAĞ KOLON: Satıcı Bilgileri ve Teknik Özellikler */}
                    <div className="space-y-6">
                        
                        {/* Satıcı Kartı */}
                        <div className="bg-blue-600 rounded-2xl p-6 shadow-lg shadow-blue-200 text-white">
                            <h3 className="text-blue-100 text-sm font-bold uppercase tracking-wider mb-4">Satıcı Bilgileri</h3>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-blue-600 text-2xl font-black">
                                    {ilan.seller_name?.charAt(0).toUpperCase() || 'S'}
                                </div>
                                <div>
                                    <p className="font-bold text-lg">{ilan.seller_name || 'Gizli Satıcı'}</p>
                                    <p className="text-blue-200 text-sm">{ilan.seller_type}</p>
                                </div>
                            </div>
                            <button className="w-full bg-white text-blue-600 py-3 rounded-xl font-bold text-lg hover:bg-gray-50 transition shadow-sm">
                                📞 {ilan.seller_phone || 'Telefon Gizli'}
                            </button>
                        </div>

                        {/* Teknik Özellikler Tablosu (İşte o 24 veri burada kullanılıyor!) */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <h3 className="text-lg font-bold text-gray-900 bg-gray-50 p-4 border-b">Araç Bilgileri</h3>
                            <ul className="divide-y divide-gray-100 text-sm">
                                {[
                                    { label: 'Marka', value: ilan.brand },
                                    { label: 'Seri', value: ilan.series },
                                    { label: 'Model', value: ilan.model },
                                    { label: 'Yıl', value: ilan.year },
                                    { label: 'Kilometre', value: `${formatFiyat(ilan.mileage)} km` },
                                    { label: 'Vites Tipi', value: ilan.transmission },
                                    { label: 'Yakıt Tipi', value: ilan.fuel_type },
                                    { label: 'Kasa Tipi', value: ilan.body_type },
                                    { label: 'Motor Gücü', value: `${ilan.engine_power} HP` },
                                    { label: 'Motor Hacmi', value: `${ilan.engine_capacity} cc` },
                                    { label: 'Çekiş', value: ilan.drive_type },
                                    { label: 'Renk', value: ilan.color },
                                    { label: 'Durumu', value: ilan.vehicle_status },
                                    { label: 'Garanti', value: ilan.has_warranty ? 'Evet' : 'Hayır' },
                                    { label: 'Ağır Hasar', value: ilan.heavy_damage ? 'Evet' : 'Hayır' },
                                    { label: 'Plaka/Uyruk', value: ilan.plate_nationality },
                                    { label: 'Takas', value: ilan.exchangeable ? 'Yapılır' : 'Yapılmaz' }
                                ].map((item, idx) => (
                                    <li key={idx} className="flex justify-between p-4 hover:bg-gray-50 transition">
                                        <span className="text-gray-500 font-medium">{item.label}</span>
                                        <span className="text-gray-900 font-bold text-right">{item.value || '-'}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default IlanDetay;