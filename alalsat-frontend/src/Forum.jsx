import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

export default function Forum() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [threads, setThreads] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(true);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const selectedCategoryName = useMemo(() => {
    if (!selectedCategoryId) return 'Tümü';
    const c = categories.find((x) => String(x.id) === String(selectedCategoryId));
    return c?.name || 'Kategori';
  }, [categories, selectedCategoryId]);

  const fetchCategories = async () => {
    setLoadingCats(true);
    try {
      const res = await axios.get(`${API_BASE}/forum/categories`);
      const arr = Array.isArray(res.data) ? res.data : [];
      setCategories(arr);
    } catch (e) {
      console.error(e);
      setCategories([]);
    } finally {
      setLoadingCats(false);
    }
  };

  const fetchThreads = async () => {
    setLoadingThreads(true);
    try {
      const res = await axios.get(`${API_BASE}/forum/threads`, {
        params: selectedCategoryId ? { category_id: selectedCategoryId, limit: 20, offset: 0 } : { limit: 20, offset: 0 },
      });
      setThreads(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      setThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId]);

  const createThread = async (e) => {
    e.preventDefault();
    const t = title.trim();
    const c = content.trim();
    if (!t || !c) return;

    setCreateLoading(true);
    try {
      const payload = {
        category_id: selectedCategoryId || null,
        title: t,
        content: c,
      };

      const res = await axios.post(`${API_BASE}/forum/threads`, payload, {
        headers: { token: `Bearer ${token}` },
      });

      const threadId = res?.data?.thread_id;
      setTitle('');
      setContent('');

      if (threadId) navigate(`/forum/konu/${threadId}`);
      else fetchThreads();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Konu oluşturulamadı.');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Forum</h1>
            <p className="text-gray-600 mt-1">Kategori seç, konulara göz at, yeni konu aç.</p>
          </div>
          <button
            onClick={() => navigate('/profil')}
            className="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold text-sm transition"
            type="button"
          >
            Profil
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-extrabold">Kategoriler</h2>

            {loadingCats ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-9 w-9 border-b-4 border-blue-600"></div>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('')}
                  className={`w-full text-left px-4 py-3 rounded-2xl border transition ${
                    selectedCategoryId
                      ? 'bg-white border-gray-200 hover:bg-gray-50'
                      : 'bg-gray-900 text-white border-gray-900'
                  }`}
                >
                  Tümü
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(String(cat.id))}
                    className={`w-full text-left px-4 py-3 rounded-2xl border transition ${
                      String(selectedCategoryId) === String(cat.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold">Konular</h2>
                  <p className="text-sm text-gray-600 mt-1">Kategori: {selectedCategoryName}</p>
                </div>
                <button
                  type="button"
                  onClick={fetchThreads}
                  className="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold text-sm transition"
                >
                  Yenile
                </button>
              </div>

              {loadingThreads ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-9 w-9 border-b-4 border-blue-600"></div>
                </div>
              ) : threads.length === 0 ? (
                <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
                  <div className="text-4xl">🧵</div>
                  <p className="font-semibold text-gray-800 mt-3">Konu bulunamadı</p>
                  <p className="text-sm text-gray-600 mt-1">İlk konuyu aşağıdan açabilirsin.</p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => navigate(`/forum/konu/${t.id}`)}
                      className="w-full text-left border border-gray-100 hover:border-gray-200 hover:bg-gray-50 rounded-2xl p-5 transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-extrabold text-gray-900 truncate">{t.title}</p>
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            {t.category_name ? `#${t.category_name} · ` : ''}
                            {t.author_full_name || t.author_email || 'Kullanıcı'}
                          </p>
                          <p className="text-sm text-gray-700 mt-3 line-clamp-2">{t.content}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">Son güncelleme</p>
                          <p className="text-xs font-bold text-gray-800">
                            {t.updated_at ? new Date(t.updated_at).toLocaleString('tr-TR') : '—'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-extrabold">Yeni Konu Aç</h2>
              <p className="text-sm text-gray-600 mt-1">Seçili kategoriye konu ekler.</p>

              <form onSubmit={createThread} className="mt-4 space-y-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Başlık"
                  className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Konu içeriği..."
                  className="w-full min-h-40 bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="submit"
                  disabled={createLoading || !title.trim() || !content.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-extrabold text-sm transition disabled:opacity-50"
                >
                  {createLoading ? 'Oluşturuluyor...' : 'Konu Oluştur'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
