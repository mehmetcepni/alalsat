import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

export default function ForumKonu() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState(null);
  const [posts, setPosts] = useState([]);

  const [text, setText] = useState('');
  const [sendLoading, setSendLoading] = useState(false);

  const [likeLoading, setLikeLoading] = useState(null);

  const currentUserId = useMemo(() => {
    try {
      const payload = JSON.parse(atob((token || '').split('.')[1] || ''));
      return payload?.sub || null;
    } catch {
      return null;
    }
  }, [token]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        axios.get(`${API_BASE}/forum/threads/${threadId}`),
        axios.get(`${API_BASE}/forum/threads/${threadId}/posts`, {
          params: { limit: 200, offset: 0 },
          headers: token ? { token: `Bearer ${token}` } : {},
        }),
      ]);
      setThread(tRes.data || null);
      setPosts(Array.isArray(pRes.data) ? pRes.data : []);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.detail || 'Konu yüklenemedi.');
      navigate('/forum');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const addPost = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    setSendLoading(true);
    try {
      await axios.post(
        `${API_BASE}/forum/threads/${threadId}/posts`,
        { content },
        { headers: { token: `Bearer ${token}` } }
      );
      setText('');
      await fetchAll();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Yorum eklenemedi.');
    } finally {
      setSendLoading(false);
    }
  };

  const toggleLike = async (postId) => {
    if (!token) {
      alert('Beğenmek için giriş yapmalısın.');
      return;
    }

    setLikeLoading(postId);
    const post = posts.find((p) => String(p.id) === String(postId));
    const isLiked = Boolean(post?.liked_by_me);
    try {
      if (!isLiked) {
        await axios.post(`${API_BASE}/forum/posts/${postId}/like`, null, {
          headers: { token: `Bearer ${token}` },
        });
      } else {
        await axios.delete(`${API_BASE}/forum/posts/${postId}/like`, {
          headers: { token: `Bearer ${token}` },
        });
      }
      await fetchAll();
    } catch (err) {
      alert(err?.response?.data?.detail || 'İşlem başarısız.');
    } finally {
      setLikeLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <button
            type="button"
            onClick={() => navigate('/forum')}
            className="text-sm font-bold text-gray-500 hover:text-gray-900 transition"
          >
            ← Foruma dön
          </button>

          <div className="mt-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{thread?.title}</h1>
            <p className="text-xs text-gray-500 mt-2">
              {thread?.category_name ? `#${thread.category_name} · ` : ''}
              {thread?.author_full_name || thread?.author_email || 'Kullanıcı'}
              {thread?.updated_at ? ` · ${new Date(thread.updated_at).toLocaleString('tr-TR')}` : ''}
            </p>
            <div className="mt-5 bg-gray-50 border border-gray-200 rounded-2xl p-5">
              <div className="whitespace-pre-wrap text-gray-800">{thread?.content}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold">Yorumlar</h2>
              <p className="text-sm text-gray-600 mt-1">Toplam: {posts.length}</p>
            </div>
            <button
              type="button"
              onClick={fetchAll}
              className="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold text-sm transition"
            >
              Yenile
            </button>
          </div>

          {posts.length === 0 ? (
            <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
              <div className="text-4xl">💭</div>
              <p className="font-semibold text-gray-800 mt-3">Henüz yorum yok</p>
              <p className="text-sm text-gray-600 mt-1">İlk yorumu sen yaz.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {posts.map((p) => {
                const isMine = currentUserId && String(p.author_id) === String(currentUserId);
                const isLiked = Boolean(p.liked_by_me);
                return (
                  <div key={p.id} className="border border-gray-100 rounded-2xl p-5 bg-white">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-extrabold text-gray-900 truncate">
                          {p.author_full_name || p.author_email || 'Kullanıcı'}
                          {isMine ? ' · (sen)' : ''}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {p.created_at ? new Date(p.created_at).toLocaleString('tr-TR') : '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold bg-gray-50 border border-gray-200 text-gray-800 px-3 py-2 rounded-xl">
                          👍 {p.like_count || 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleLike(p.id)}
                          disabled={likeLoading === p.id}
                          className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition disabled:opacity-50 ${
                            isLiked
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {likeLoading === p.id ? '...' : isLiked ? 'Beğenildi' : 'Beğen'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4">
                      <div className="whitespace-pre-wrap text-gray-800">{p.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-extrabold">Yorum Yaz</h2>
          <p className="text-sm text-gray-600 mt-1">Saygılı ve faydalı olmaya dikkat et.</p>

          <form onSubmit={addPost} className="mt-4 space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Yorumun..."
              className="w-full min-h-32 bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              disabled={sendLoading || !text.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl font-extrabold text-sm transition disabled:opacity-50"
            >
              {sendLoading ? 'Gönderiliyor...' : 'Yorumu Gönder'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
