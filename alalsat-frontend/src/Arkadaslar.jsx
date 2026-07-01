import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

export default function Arkadaslar() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchFriends = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/friends`, {
        headers: { token: `Bearer ${token}` },
      });
      setFriends(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      setFriends([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;

    setSearchLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/users/search`, {
        params: { q: query },
        headers: { token: `Bearer ${token}` },
      });
      setResults(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const sendRequest = async (toUserId) => {
    setActionLoading(toUserId);
    try {
      await axios.post(
        `${API_BASE}/friends/requests`,
        { to_user_id: toUserId },
        { headers: { token: `Bearer ${token}` } }
      );
      alert('Arkadaşlık isteği gönderildi.');
    } catch (err) {
      alert(err?.response?.data?.detail || 'İstek gönderilemedi.');
    } finally {
      setActionLoading(null);
    }
  };

  const unfriend = async (friendUserId) => {
    if (!window.confirm('Bu kişiyi arkadaşlıktan çıkarmak istiyor musunuz?')) return;

    setActionLoading(friendUserId);
    try {
      await axios.delete(`${API_BASE}/friends/${friendUserId}`, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchFriends();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Silme işlemi başarısız.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Arkadaşlar</h1>
            <p className="text-gray-600 mt-1">Arkadaşlarını yönet, yeni arkadaş ekle.</p>
          </div>
          <button
            onClick={() => navigate('/arkadas-istekleri')}
            className="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold text-sm transition"
          >
            İstekler
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-extrabold">Arkadaş Listen</h2>
            <p className="text-sm text-gray-600 mt-1">Toplam: {friends.length}</p>

            {loading ? (
              <div className="flex justify-center py-14">
                <div className="animate-spin rounded-full h-9 w-9 border-b-4 border-blue-600"></div>
              </div>
            ) : friends.length === 0 ? (
              <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
                <div className="text-4xl">👥</div>
                <p className="font-semibold text-gray-800 mt-3">Henüz arkadaşın yok</p>
                <p className="text-sm text-gray-600 mt-1">Sağdan kullanıcı arayıp istek gönderebilirsin.</p>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {friends.map((f) => (
                  <div key={f.id} className="border border-gray-100 rounded-2xl p-4 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-extrabold text-gray-900 truncate">{f.full_name || f.email}</p>
                        <p className="text-xs text-gray-500 mt-1 truncate">📍 {f.city || 'Belirtilmemiş'}</p>
                      </div>
                      <button
                        onClick={() => unfriend(f.id)}
                        disabled={actionLoading === f.id}
                        className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                      >
                        {actionLoading === f.id ? '...' : 'Kaldır'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-extrabold">Kullanıcı Ara</h2>
            <form onSubmit={handleSearch} className="space-y-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="İsim, e-posta veya şehir"
                className="w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="submit"
                disabled={searchLoading || !q.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl font-bold text-sm transition disabled:opacity-50"
              >
                {searchLoading ? 'Aranıyor...' : 'Ara'}
              </button>
            </form>

            {results.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-500">Sonuçlar</p>
                {results.map((u) => (
                  <div key={u.id} className="border border-gray-100 rounded-2xl p-4 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-gray-500 mt-1 truncate">📍 {u.city || 'Belirtilmemiş'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => sendRequest(u.id)}
                        disabled={actionLoading === u.id}
                        className="bg-gray-900 hover:bg-black text-white px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                      >
                        {actionLoading === u.id ? '...' : 'İstek Gönder'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
