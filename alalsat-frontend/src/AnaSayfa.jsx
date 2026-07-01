import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const KATEGORILER = [
    "Tüm İlanlar", "Otomobil", "Arazi, SUV & Pickup", "Elektrikli Araçlar", "Motosiklet", 
    "Minivan & Panelvan", "Ticari Araçlar", "Kiralık Araçlar", "Deniz Araçları", 
    "Hasarlı Araçlar", "Karavan", "Klasik Araçlar", "Hava Araçları", "ATV", "UTV", "Engelli Plakalı Araçlar"
];

const AnaSayfa = ({ onCikis }) => {
    const navigate = useNavigate();
    const isLoggedIn = Boolean(localStorage.getItem('token'));
    const ilanlarBolumuRef = useRef(null);

    const goProtected = (path) => {
        if (!isLoggedIn) {
            navigate('/giris');
            return;
        }
        navigate(path);
    };

    const scrollToIlanlar = () => {
        const el = ilanlarBolumuRef.current;
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    
    // --- İLAN STATE'LERİ ---
    const [ilanlar, setIlanlar] = useState([]);
    const [seciliKategori, setSeciliKategori] = useState("Tüm İlanlar");
    const [loading, setLoading] = useState(true);

    // --- NAVBAR HIZLI FİLTRE STATE'LERİ ---
    const [hizliFiltre, setHizliFiltre] = useState({ vehicleStatus: "", heavyDamage: null });

    // --- DETAYLI ARAMA STATE'LERİ ---
    const [aramaMetni, setAramaMetni] = useState("");
    const [aramaKonum, setAramaKonum] = useState("");
    const [uygulananArama, setUygulananArama] = useState({ metin: "", konum: "" });

    // --- AI ASİSTAN STATE'LERİ ---
    const [aiSoru, setAiSoru] = useState("");
    const [aiCevap, setAiCevap] = useState("");
    const [aiYukleniyor, setAiYukleniyor] = useState(false);
    const [aiModalAcik, setAiModalAcik] = useState(false);
    const [aiMesajlar, setAiMesajlar] = useState([]); // { role: 'user' | 'assistant', content: string }
    const aiMesajlarRef = useRef(null);

    useEffect(() => {
        if (!aiModalAcik) return;
        const el = aiMesajlarRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [aiModalAcik, aiMesajlar]);

    // AI Asistan Fonksiyonu
    const handleAiSor = async (e) => {
        if (e?.preventDefault) e.preventDefault();
        const soru = aiSoru.trim();
        if (!soru) return;

        setAiYukleniyor(true);
        setAiSoru("");
        setAiCevap("");
        setAiMesajlar(prev => ([...prev, { role: 'user', content: soru }]));

        try {
            const res = await axios.post('http://127.0.0.1:8000/ai/soru', { soru });
            const cevap = res?.data?.hata ? ("Hata: " + res.data.hata) : (res?.data?.cevap || "Cevap alınamadı.");
            setAiCevap(cevap);
            setAiMesajlar(prev => ([...prev, { role: 'assistant', content: cevap }]));
        } catch (error) {
            const mesaj = "Bağlantı hatası oluştu. Lütfen tekrar deneyin.";
            setAiCevap(mesaj);
            setAiMesajlar(prev => ([...prev, { role: 'assistant', content: mesaj }]));
        } finally {
            setAiYukleniyor(false);
        }
    };

    // İlanları Backend'den Çekme
    useEffect(() => {
        const fetchIlanlar = async () => {
            try {
                const response = await axios.get('http://127.0.0.1:8000/ilanlar');
                if (Array.isArray(response.data)) {
                    setIlanlar(response.data);
                } else {
                    console.error("Gelen veri liste değil:", response.data);
                    setIlanlar([]); 
                }
            } catch (error) {
                console.error("İlanlar yüklenirken hata oluştu:", error);
                setIlanlar([]); 
            } finally {
                setLoading(false);
            }
        };
        fetchIlanlar();
    }, []);

    const normalizeText = (value) => (value ?? "").toString().toLocaleLowerCase('tr-TR').trim();

    const handleDetayliAra = (e) => {
        e.preventDefault();
        setUygulananArama({
            metin: aramaMetni.trim(),
            konum: aramaKonum.trim(),
        });
    };

    const handleNavbarHizliFiltre = (item) => {
        if (item === "Sıfır Araç") {
            setHizliFiltre(prev => ({ ...prev, vehicleStatus: prev.vehicleStatus === "Sıfır" ? "" : "Sıfır" }));
            return;
        }
        if (item === "İkinci El") {
            setHizliFiltre(prev => ({ ...prev, vehicleStatus: prev.vehicleStatus === "İkinci El" ? "" : "İkinci El" }));
            return;
        }
        if (item === "Hasarlı") {
            setHizliFiltre(prev => ({ ...prev, heavyDamage: prev.heavyDamage === true ? null : true }));
            return;
        }
        if (item === "Motosiklet") {
            setSeciliKategori(prev => (prev === "Motosiklet" ? "Tüm İlanlar" : "Motosiklet"));
            return;
        }
        if (item === "Ticari") {
            setSeciliKategori(prev => (prev === "Ticari Araçlar" ? "Tüm İlanlar" : "Ticari Araçlar"));
            return;
        }
    };

    // Seçilen kategori + detaylı arama kriterlerine göre filtreleme
    const filtrelenmisIlanlar = ilanlar
        .filter(ilan => seciliKategori === "Tüm İlanlar" ? true : ilan.category === seciliKategori)
        .filter(ilan => {
            if (!hizliFiltre.vehicleStatus) return true;
            return normalizeText(ilan.vehicle_status) === normalizeText(hizliFiltre.vehicleStatus);
        })
        .filter(ilan => {
            if (hizliFiltre.heavyDamage === null) return true;
            return Boolean(ilan.heavy_damage) === hizliFiltre.heavyDamage;
        })
        .filter(ilan => {
            const metin = normalizeText(uygulananArama.metin);
            if (!metin) return true;

            const searchable = normalizeText([
                ilan.title,
                ilan.brand,
                ilan.series,
                ilan.model,
                ilan.description,
            ].filter(Boolean).join(' '));

            return searchable.includes(metin);
        })
        .filter(ilan => {
            const konum = normalizeText(uygulananArama.konum);
            if (!konum) return true;
            return normalizeText(ilan.city).includes(konum);
        });

    return (
        <div className="min-h-screen bg-gray-950 text-gray-900 font-sans">
            {/* --- ÜST MENÜ (NAVBAR) --- */}
            <nav className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/70 backdrop-blur">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                    <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    >
                        <span className="text-3xl">🚗</span>
                        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-none">
                            <span className="text-blue-400">alal</span>
                            <span className="text-white">sat</span>
                            <span className="text-white/50 font-black">.com</span>
                        </h1>
                    </div>

                    <div className="hidden lg:flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                            className="px-4 py-2 rounded-full text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition"
                        >
                            Anasayfa
                        </button>
                        <button
                            type="button"
                            onClick={scrollToIlanlar}
                            className="px-4 py-2 rounded-full text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition"
                        >
                            Araçlar
                        </button>
                        <button
                            type="button"
                            onClick={() => setAiModalAcik(true)}
                            className="px-4 py-2 rounded-full text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition"
                        >
                            AI Değerlendirme
                        </button>
                        <button
                            type="button"
                            onClick={() => goProtected('/forum')}
                            className="px-4 py-2 rounded-full text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition"
                        >
                            Forum
                        </button>
                        <button
                            type="button"
                            onClick={() => goProtected('/arkadaslar')}
                            className="px-4 py-2 rounded-full text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition"
                        >
                            Arkadaşlar
                        </button>
                        <button
                            type="button"
                            onClick={() => goProtected('/sohbetler')}
                            className="px-4 py-2 rounded-full text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition"
                        >
                            Sohbet
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="hidden md:flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
                            {["Sıfır Araç", "İkinci El", "Motosiklet", "Hasarlı", "Ticari"].map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => handleNavbarHizliFiltre(item)}
                                    className="px-3 py-1.5 rounded-full text-xs font-bold text-white/80 hover:text-white hover:bg-white/10 transition"
                                >
                                    {item}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => navigate('/profil')}
                            className="flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 p-2 rounded-full transition"
                        >
                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">U</div>
                            <span className="font-semibold text-white/90 pr-2 hidden sm:block">Profil</span>
                        </button>

                        <button
                            onClick={onCikis}
                            className="hidden sm:block bg-white/5 hover:bg-white/10 text-white/90 px-4 py-2 rounded-full text-sm font-bold transition border border-white/10"
                        >
                            Çıkış
                        </button>

                        <button
                            onClick={() => navigate('/ilan-ver')}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-5 py-2.5 rounded-full text-sm font-extrabold shadow-md shadow-blue-500/20 transition flex items-center gap-2"
                        >
                            <span>➕</span> <span className="hidden sm:block">Ücretsiz İlan Ver</span>
                        </button>
                    </div>
                </div>
            </nav>

            {/* --- HERO --- */}
            <header className="relative overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-b from-blue-900/20 via-gray-950 to-gray-950" />
                <div className="absolute -top-40 -right-40 w-136 h-136 rounded-full bg-blue-600/10 blur-3xl" />
                <div className="absolute -bottom-48 -left-40 w-136 h-136 rounded-full bg-white/5 blur-3xl" />

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                        <div className="lg:col-span-6">
                            <p className="inline-flex items-center gap-2 text-xs font-extrabold tracking-wide text-white/70 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                                <span className="text-blue-300">AI</span> Destekli araç satış platformu
                            </p>
                            <h2 className="mt-5 text-4xl sm:text-5xl font-black tracking-tight text-white">
                                Alalsat ile
                                <span className="block text-blue-300">Akıllıca Al,</span>
                                Güvenle Sat.
                            </h2>
                            <p className="mt-5 text-white/70 text-sm sm:text-base leading-relaxed max-w-xl">
                                Yapay zeka destekli değerlendirme, akıllı eşleştirme ve güvenli iletişim altyapısıyla araç alım-satımında yeni nesil deneyim.
                            </p>

                            <div className="mt-7 flex flex-col sm:flex-row gap-3">
                                <button
                                    type="button"
                                    onClick={() => setAiModalAcik(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-extrabold text-sm transition shadow-md shadow-blue-500/20"
                                >
                                    ✨ AI Değerlendirme
                                </button>
                                <button
                                    type="button"
                                    onClick={scrollToIlanlar}
                                    className="bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-2xl font-extrabold text-sm transition border border-white/10"
                                >
                                    🚘 Araçları Keşfet
                                </button>
                            </div>
                        </div>

                        <div className="lg:col-span-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
                                    <p className="text-xs font-bold text-white/60">AI Değerlendirme Sonucu</p>
                                    <p className="text-2xl font-black text-white mt-2">1.245.000 TL</p>
                                    <p className="text-xs text-white/60 mt-1">Piyasa ortalamasına göre</p>
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
                                    <p className="text-xs font-bold text-white/60">Güven Skoru</p>
                                    <p className="text-2xl font-black text-white mt-2">9.2 / 10</p>
                                    <p className="text-xs text-white/60 mt-1">Çok güvenilir</p>
                                </div>
                                <div className="sm:col-span-2 bg-white/5 border border-white/10 rounded-3xl p-5">
                                    <p className="text-xs font-bold text-white/60">Piyasa Trendi</p>
                                    <div className="mt-3 h-14 rounded-2xl bg-linear-to-r from-blue-600/20 via-white/10 to-white/5 border border-white/10" />
                                    <p className="text-xs text-white/60 mt-2">Artan talep · Son 30 gün</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* --- ARAMA PANELİ --- */}
                    <div className="mt-10 bg-white rounded-3xl border border-gray-100 shadow-xl shadow-black/20 overflow-hidden">
                        <div className="px-6 pt-5">
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { label: 'Tümü', value: 'Tüm İlanlar' },
                                    { label: 'Otomobil', value: 'Otomobil' },
                                    { label: 'SUV & Arazi', value: 'Arazi, SUV & Pickup' },
                                    { label: 'Ticari', value: 'Ticari Araçlar' },
                                    { label: 'Elektrikli', value: 'Elektrikli Araçlar' },
                                    { label: 'Hibrit', value: 'Hibrit Araçlar' },
                                ].map((t) => (
                                    <button
                                        key={t.value}
                                        type="button"
                                        onClick={() => setSeciliKategori(t.value)}
                                        className={`px-4 py-2 rounded-full text-xs font-extrabold border transition ${
                                            seciliKategori === t.value
                                                ? 'bg-gray-900 text-white border-gray-900'
                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <form onSubmit={handleDetayliAra} className="p-6 grid grid-cols-1 md:grid-cols-6 gap-3">
                            <select
                                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200 md:col-span-2 cursor-pointer"
                                value={seciliKategori}
                                onChange={(e) => setSeciliKategori(e.target.value)}
                            >
                                {KATEGORILER.map((kat) => (
                                    <option key={kat} value={kat}>
                                        {kat}
                                    </option>
                                ))}
                            </select>

                            <input
                                type="text"
                                value={aramaMetni}
                                onChange={(e) => setAramaMetni(e.target.value)}
                                placeholder="Marka / Model / Kelime"
                                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200 md:col-span-2"
                            />

                            <input
                                type="text"
                                value={aramaKonum}
                                onChange={(e) => setAramaKonum(e.target.value)}
                                placeholder="Şehir / İlçe"
                                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
                            />

                            <button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-extrabold text-sm transition flex items-center justify-center gap-2"
                            >
                                🔎 Ara
                            </button>

                            <select
                                value={hizliFiltre.vehicleStatus}
                                onChange={(e) => setHizliFiltre((p) => ({ ...p, vehicleStatus: e.target.value }))}
                                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200 md:col-span-2"
                            >
                                <option value="">Araç Durumu (Tümü)</option>
                                <option value="Sıfır">Sıfır</option>
                                <option value="İkinci El">İkinci El</option>
                            </select>

                            <select
                                value={hizliFiltre.heavyDamage === null ? '' : hizliFiltre.heavyDamage ? '1' : '0'}
                                onChange={(e) =>
                                    setHizliFiltre((p) => ({
                                        ...p,
                                        heavyDamage: e.target.value === '' ? null : e.target.value === '1',
                                    }))
                                }
                                className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200 md:col-span-2"
                            >
                                <option value="">Hasar Durumu (Tümü)</option>
                                <option value="0">Hasarsız / Belirtilmemiş</option>
                                <option value="1">Hasarlı</option>
                            </select>

                            <div className="md:col-span-2 flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl">
                                <p className="text-xs text-gray-600 font-bold">AI ile size uygun araçları bulun</p>
                                <button
                                    type="button"
                                    onClick={() => setAiModalAcik(true)}
                                    className="text-xs font-extrabold text-blue-700 hover:text-blue-900 transition"
                                >
                                    Asistan
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </header>

            {/* --- ÖZELLİKLER --- */}
            <section className="bg-gray-950">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="text-center">
                        <p className="text-blue-300 text-xs font-extrabold tracking-wide">✨ Alalsat Farkı</p>
                        <h3 className="mt-2 text-2xl sm:text-3xl font-black text-white">Daha akıllı, daha güvenli</h3>
                        <p className="mt-3 text-sm text-white/60">İlan keşfinden sohbete kadar her adımda güçlü deneyim.</p>
                    </div>

                    <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            {
                                icon: '🧠',
                                title: 'AI Destekli Değerlendirme',
                                desc: 'Piyasa, fiyat ve teknik sorulara hızlı cevap.',
                            },
                            {
                                icon: '🛡️',
                                title: 'Güvenli Alışveriş',
                                desc: 'Doğrulama ve iletişim akışı ile daha güvenli süreç.',
                            },
                            {
                                icon: '🤝',
                                title: 'Arkadaş & Sohbet',
                                desc: 'Sadece arkadaşlar konuşur; istekler spawn kutusuna düşer.',
                            },
                            {
                                icon: '🧵',
                                title: 'Forum',
                                desc: 'Konu aç, yorum yap, beğen; toplulukla iletişim kur.',
                            },
                        ].map((f) => (
                            <div key={f.title} className="bg-white/5 border border-white/10 rounded-3xl p-6">
                                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
                                    {f.icon}
                                </div>
                                <p className="mt-4 font-extrabold text-white">{f.title}</p>
                                <p className="mt-2 text-sm text-white/60">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* --- İLANLAR --- */}
            <main ref={ilanlarBolumuRef} className="bg-gray-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        <div className="hidden lg:block bg-white p-5 rounded-3xl border border-gray-100 shadow-sm h-fit sticky top-24">
                            <h3 className="font-extrabold text-gray-800 mb-4 text-lg border-b border-gray-100 pb-3">Kategoriler</h3>
                            <ul className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                {KATEGORILER.map((kat) => (
                                    <li key={kat}>
                                        <button
                                            type="button"
                                            onClick={() => setSeciliKategori(kat)}
                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                                seciliKategori === kat
                                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                            }`}
                                        >
                                            {kat}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <SectionTitle title={seciliKategori === 'Tüm İlanlar' ? 'Öne Çıkan İlanlar' : `${seciliKategori} İlanları`} />
                                    <p className="text-sm text-gray-500 mt-1">Arama: {uygulananArama.metin || '—'} · Konum: {uygulananArama.konum || '—'}</p>
                                </div>
                                <span className="text-sm text-gray-500 font-bold shrink-0">{filtrelenmisIlanlar.length} ilan</span>
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-20">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600"></div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {Array.isArray(filtrelenmisIlanlar) && filtrelenmisIlanlar.length > 0 ? (
                                        filtrelenmisIlanlar.map((ilan) => <IlanKarti key={ilan.id} ilan={ilan} />)
                                    ) : (
                                        <div className="col-span-full bg-white p-10 rounded-2xl border border-dashed border-gray-300 text-center">
                                            <span className="text-4xl block mb-3">📭</span>
                                            <p className="text-gray-600 font-medium">Bu kriterlerde ilan bulunamadı.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-8">
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-100 bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl">🤖</span>
                                        <div className="min-w-0">
                                            <h2 className="text-xl font-extrabold text-gray-900 leading-tight">AI Asistan</h2>
                                            <p className="text-gray-600 text-sm">Fiyat, piyasa ve teknik sorularına hızlı cevap.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 space-y-4">
                                    {aiMesajlar.length > 0 && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                                            <p className="text-xs font-bold text-gray-500 mb-2">Son mesaj</p>
                                            <p className="text-sm text-gray-800 line-clamp-3 whitespace-pre-wrap">
                                                {aiMesajlar[aiMesajlar.length - 1]?.content}
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setAiModalAcik(true)}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-2xl font-bold text-sm transition shadow-md shadow-blue-100"
                                    >
                                        Asistanı Aç
                                    </button>

                                    <p className="text-xs text-gray-500">İpucu: Marka/model, yıl, fiyat veya şehir yazarak sorabilirsin.</p>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                <h2 className="text-lg font-extrabold text-gray-900 border-b pb-2">Son Haberler</h2>
                                <div className="space-y-3 text-sm text-gray-700 font-medium">
                                    <p className="hover:text-blue-600 cursor-pointer transition flex gap-2"><span>•</span> 2026 Model Araç Vergileri Açıklandı</p>
                                    <p className="hover:text-blue-600 cursor-pointer transition flex gap-2"><span>•</span> Elektrikli Araç Piyasasında Son Durum</p>
                                    <p className="hover:text-blue-600 cursor-pointer transition flex gap-2"><span>•</span> Araç Alırken Dikkat Edilmesi Gereken 10 Altın Kural</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* --- AI POPUP SOHBET --- */}
            {aiModalAcik && (
                <div className="fixed inset-0 z-60">
                    <div
                        className="absolute inset-0 bg-gray-900/40"
                        onClick={() => setAiModalAcik(false)}
                    />

                    <div className="absolute inset-0 flex items-end sm:items-center justify-center p-4">
                        <div className="w-full max-w-2xl bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-2xl">🤖</span>
                                    <div className="min-w-0">
                                        <h3 className="font-extrabold text-gray-900 leading-tight">AI Asistan</h3>
                                        <p className="text-xs text-gray-500">Sorunu yaz, gönder, cevabı anında gör.</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAiModalAcik(false)}
                                    className="px-3 py-1.5 rounded-full text-sm font-bold text-gray-600 hover:text-gray-900 hover:bg-white border border-gray-200 transition"
                                >
                                    Kapat
                                </button>
                            </div>

                            <div ref={aiMesajlarRef} className="p-5 max-h-[55vh] overflow-y-auto space-y-3 custom-scrollbar bg-white">
                                {aiMesajlar.length === 0 ? (
                                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center">
                                        <p className="text-sm font-semibold text-gray-800">Henüz mesaj yok</p>
                                        <p className="text-xs text-gray-500 mt-1">Örn: “2018 BMW 3.20d piyasası ne durumda?”</p>
                                    </div>
                                ) : (
                                    aiMesajlar.map((m, idx) => (
                                        <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div
                                                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed border ${
                                                    m.role === 'user'
                                                        ? 'bg-blue-600 text-white border-blue-600'
                                                        : 'bg-gray-50 text-gray-900 border-gray-200'
                                                }`}
                                            >
                                                {m.content}
                                            </div>
                                        </div>
                                    ))
                                )}

                                {aiYukleniyor && (
                                    <div className="flex justify-start">
                                        <div className="bg-gray-50 text-gray-700 border border-gray-200 rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                                            Düşünüyor...
                                        </div>
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleAiSor} className="p-5 border-t border-gray-100 bg-white">
                                <div className="flex gap-3">
                                    <textarea
                                        value={aiSoru}
                                        onChange={(e) => setAiSoru(e.target.value)}
                                        placeholder="Mesajını yaz..."
                                        className="flex-1 h-12 sm:h-12 bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                                    />
                                    <button
                                        type="submit"
                                        disabled={aiYukleniyor || !aiSoru.trim()}
                                        className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-2xl font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Gönder
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- YARDIMCI BİLEŞENLER ---
const SectionTitle = ({ title }) => (
    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
);

const IlanKarti = ({ ilan }) => {
    const navigate = useNavigate(); // İlana tıklayınca detay sayfasına gitmesini sağlar

    const formatFiyat = (fiyat) => new Intl.NumberFormat('tr-TR').format(fiyat);
    const gorsel = ilan.image_url || ilan.cover_image;

    return (
        <div 
            onClick={() => navigate(`/ilan/${ilan.id}`)} 
            className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all group cursor-pointer flex flex-col h-full"
        >
            <div className="overflow-hidden rounded-xl h-48 relative shrink-0 bg-gray-50">
                {gorsel ? (
                    <img 
                        src={gorsel} 
                        alt={ilan.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                        <span className="text-3xl mb-2">📷</span>
                        <span className="text-sm font-medium">Görsel Yok</span>
                    </div>
                )}
                <span className="absolute top-3 right-3 bg-blue-600/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">Yeni</span>
            </div>
            
            <div className="px-1 pt-4 flex flex-col flex-1 justify-between">
                <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition line-clamp-2 text-sm leading-snug">
                        {ilan.title || `${ilan.brand} ${ilan.model}`}
                    </h4>
                    <p className="text-2xl font-black text-blue-600 mt-2">
                        {formatFiyat(ilan.price)} TL
                    </p>
                </div>
                
                <div className="flex justify-between items-center text-xs font-medium text-gray-500 mt-4 pt-3 border-t border-gray-100">
                    <span className="flex items-center gap-1">📍 {ilan.city || 'Belirtilmemiş'}</span>
                    <span className="bg-gray-100 px-2 py-1 rounded text-gray-600">{ilan.year} Model</span>
                </div>
            </div>
        </div>
    );
};

export default AnaSayfa;