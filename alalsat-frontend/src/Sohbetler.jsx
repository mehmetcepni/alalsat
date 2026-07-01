import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

export default function Sohbetler() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const messageRef = useRef(null);

  const [tab, setTab] = useState('inbox'); // inbox | incoming | outgoing
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const [q, setQ] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [toUserId, setToUserId] = useState('');
  const [message, setMessage] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  const [showFriends, setShowFriends] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friends, setFriends] = useState([]);
  const [friendsQ, setFriendsQ] = useState('');
  const [openConvLoading, setOpenConvLoading] = useState(null);
  const [lastActivityByUser, setLastActivityByUser] = useState({});

  const [actionLoading, setActionLoading] = useState(null);

  const fetchTab = async () => {
    setLoading(true);
    try {
      const url =
        tab === 'inbox'
          ? `${API_BASE}/dm/inbox`
          : tab === 'incoming'
          ? `${API_BASE}/dm/requests/incoming`
          : `${API_BASE}/dm/requests/outgoing`;

      const res = await axios.get(url, { headers: { token: `Bearer ${token}` } });
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
      const arr = Array.isArray(res.data) ? res.data : [];
      setResults(arr);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchFriends = async () => {
    setFriendsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/friends`, {
        headers: { token: `Bearer ${token}` },
      });
      setFriends(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  };

  const fetchInboxActivity = async () => {
    try {
      const res = await axios.get(`${API_BASE}/dm/inbox`, {
        headers: { token: `Bearer ${token}` },
      });
      const arr = Array.isArray(res.data) ? res.data : [];
      const next = {};
      for (const it of arr) {
        const otherId = it?.other_user_id;
        const ts = it?.last_created_at || it?.updated_at;
        if (!otherId || !ts) continue;
        const t = new Date(ts).getTime();
        if (!Number.isFinite(t)) continue;
        next[String(otherId)] = Math.max(next[String(otherId)] || 0, t);
      }
      setLastActivityByUser(next);
    } catch (err) {
      console.error(err);
      setLastActivityByUser({});
    }
  };

  const toggleFriends = async () => {
    const next = !showFriends;
    setShowFriends(next);
    if (next) {
      if (friends.length === 0 && !friendsLoading) {
        await Promise.all([fetchFriends(), fetchInboxActivity()]);
      } else {
        // Refresh ordering info without blocking UI
        fetchInboxActivity();
      }
    }
  };

  const openConversationWithFriend = async (userId) => {
    setToUserId(userId);
    setOpenConvLoading(userId);
    try {
      const res = await axios.post(
        `${API_BASE}/dm/conversations/with/${userId}`,
        null,
        { headers: { token: `Bearer ${token}` } }
      );
      const convId = res?.data?.conversation_id;
      if (convId) navigate(`/sohbet/${convId}`);
    } catch (err) {
      alert(err?.response?.data?.detail || 'Sohbet açılamadı.');
    } finally {
      setOpenConvLoading(null);
    }
  };

  const normalizeText = (value) => (value ?? '').toString().toLocaleLowerCase('tr-TR').trim();
  const filteredFriends = friends
    .filter((f) => {
      const q2 = normalizeText(friendsQ);
      if (!q2) return true;
      const hay = normalizeText([f.full_name, f.email, f.city].filter(Boolean).join(' '));
      return hay.includes(q2);
    })
    .sort((a, b) => {
      const ta = lastActivityByUser[String(a.id)] || 0;
      const tb = lastActivityByUser[String(b.id)] || 0;
      if (ta !== tb) return tb - ta;
      const na = normalizeText(a.full_name || a.email || '');
      const nb = normalizeText(b.full_name || b.email || '');
      return na.localeCompare(nb, 'tr-TR');
    })
    .slice(0, 50);

  const handleSendFirst = async (e) => {
    e.preventDefault();
    const content = message.trim();
    if (!toUserId || !content) return;

    setSendLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/dm/send`,
        { to_user_id: toUserId, content },
        { headers: { token: `Bearer ${token}` } }
      );
      const convId = res?.data?.conversation_id;
      setMessage('');
      setToUserId('');
      setResults([]);
      setQ('');
      if (convId) navigate(`/sohbet/${convId}`);
      else fetchTab();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Mesaj gönderilemedi.');
    } finally {
      setSendLoading(false);
    }
  };

  const accept = async (conversationId) => {
    setActionLoading(conversationId);
    try {
      await axios.post(`${API_BASE}/dm/conversations/${conversationId}/accept`, null, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchTab();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Kabul edilemedi.');
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (conversationId) => {
    setActionLoading(conversationId);
    try {
      await axios.post(`${API_BASE}/dm/conversations/${conversationId}/reject`, null, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchTab();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Reddedilemedi.');
    } finally {
      setActionLoading(null);
    }
  };

  const cancel = async (conversationId) => {
    setActionLoading(conversationId);
    try {
      await axios.post(`${API_BASE}/dm/conversations/${conversationId}/cancel`, null, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchTab();
    } catch (err) {
      alert(err?.response?.data?.detail || 'İptal edilemedi.');
    } finally {
      setActionLoading(null);
    }
  };

  const TabButton = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-full text-sm font-extrabold transition border ${
        tab === id
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Sohbetler</h1>
            <p className="text-gray-600 mt-1">Arkadaşlar: direkt inbox. Arkadaş değilse: mesaj isteği (spawn).</p>
          </div>
          <button
            onClick={() => navigate('/profil')}
            className="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold text-sm transition"
          >
            Profil
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-extrabold">Yeni Mesaj</h2>
          <p className="text-sm text-gray-600 mt-1">
            Kullanıcı ara, mesajını yaz, gönder. Arkadaş değilsen karşı tarafın spawn kutusuna düşer.
          </p>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="İsim, e-posta veya şehir"
                  className="flex-1 bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="submit"
                  disabled={searchLoading || !q.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl font-extrabold text-sm transition disabled:opacity-50"
                >
                  {searchLoading ? '...' : 'Ara'}
                </button>

                <button
                  type="button"
                  onClick={toggleFriends}
                  className={`px-4 py-3 rounded-2xl font-extrabold text-sm transition border ${
                    showFriends
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                  }`}
                  title="Arkadaşlar"
                >
                  <span className="block leading-none">🤝</span>
                  <span className="block text-[10px] mt-1">Arkadaşlar</span>
                </button>
              </form>

              {showFriends && (
                <div className="border border-gray-100 rounded-2xl bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-extrabold text-gray-900">Arkadaşlar</p>
                      <p className="text-xs text-gray-500 mt-0.5">Sohbeti açmak için tıkla</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => Promise.all([fetchFriends(), fetchInboxActivity()])}
                      disabled={friendsLoading}
                      className="bg-white border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-xl font-bold text-xs transition disabled:opacity-50"
                    >
                      Yenile
                    </button>
                  </div>

                  <input
                    value={friendsQ}
                    onChange={(e) => setFriendsQ(e.target.value)}
                    placeholder="Arkadaş ara (isim / e-posta / şehir)"
                    className="mt-3 w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />

                  {friendsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-blue-600"></div>
                    </div>
                  ) : filteredFriends.length === 0 ? (
                    <div className="mt-3 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center">
                      <div className="text-3xl">🤝</div>
                      <p className="text-sm font-semibold text-gray-800 mt-2">Arkadaş bulunamadı</p>
                      <button
                        type="button"
                        onClick={() => navigate('/arkadaslar')}
                        className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-extrabold text-xs transition"
                      >
                        Arkadaşlar Sayfası
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredFriends.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => openConversationWithFriend(f.id)}
                          disabled={openConvLoading === f.id}
                          className={`text-left border rounded-2xl p-4 transition ${
                            toUserId === f.id
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-gray-100 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-extrabold text-gray-900 truncate">{f.full_name || f.email}</p>
                              <p className="text-xs text-gray-500 mt-1 truncate">📍 {f.city || 'Belirtilmemiş'}</p>
                            </div>
                            <span className="text-blue-600 font-black">{openConvLoading === f.id ? '...' : '→'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {results.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500">Sonuçlar</p>
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setToUserId(u.id)}
                      className={`w-full text-left border rounded-2xl p-4 transition ${
                        toUserId === u.id
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-100 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-extrabold text-gray-900 truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">📍 {u.city || 'Belirtilmemiş'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSendFirst} className="space-y-3">
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mesajını yaz..."
                className="w-full min-h-30 bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="submit"
                disabled={sendLoading || !toUserId || !message.trim()}
                className="w-full bg-gray-900 hover:bg-black text-white px-4 py-3 rounded-2xl font-extrabold text-sm transition disabled:opacity-50"
              >
                {sendLoading ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </form>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-wrap items-center gap-2">
            <TabButton id="inbox" label="Inbox" />
            <TabButton id="incoming" label="Spawn (Gelen)" />
            <TabButton id="outgoing" label="Gönderilen" />
          </div>

          {loading ? (
            <div className="flex justify-center py-14">
              <div className="animate-spin rounded-full h-9 w-9 border-b-4 border-blue-600"></div>
            </div>
          ) : items.length === 0 ? (
            <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
              <div className="text-4xl">💬</div>
              <p className="font-semibold text-gray-800 mt-3">Burada bir şey yok</p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((c) => {
                const conversationId = c.conversation_id;
                const name = c.other_full_name || c.other_email || 'Kullanıcı';
                const city = c.other_city || 'Belirtilmemiş';
                const last = c.last_content;

                return (
                  <div key={conversationId} className="border border-gray-100 rounded-2xl p-4 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/sohbet/${conversationId}`)}
                        className="text-left flex-1 min-w-0"
                      >
                        <p className="font-extrabold text-gray-900 truncate">{name}</p>
                        <p className="text-xs text-gray-500 mt-1 truncate">📍 {city}</p>
                        {tab === 'inbox' && (
                          <p className="text-sm text-gray-700 mt-2 truncate">{last || '—'}</p>
                        )}
                      </button>

                      {tab === 'incoming' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => reject(conversationId)}
                            disabled={actionLoading === conversationId}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                          >
                            Reddet
                          </button>
                          <button
                            onClick={() => accept(conversationId)}
                            disabled={actionLoading === conversationId}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                          >
                            Kabul
                          </button>
                        </div>
                      )}

                      {tab === 'outgoing' && (
                        <button
                          onClick={() => cancel(conversationId)}
                          disabled={actionLoading === conversationId}
                          className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                          İptal
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
