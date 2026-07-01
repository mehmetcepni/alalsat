import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

export default function SohbetDetay() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [loading, setLoading] = useState(true);
  const [conv, setConv] = useState(null);
  const [other, setOther] = useState(null);
  const [messages, setMessages] = useState([]);

  const [text, setText] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const listRef = useRef(null);
  const wsRef = useRef(null);

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
      const [cRes, mRes] = await Promise.all([
        axios.get(`${API_BASE}/dm/conversations/${conversationId}`, {
          headers: { token: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE}/dm/conversations/${conversationId}/messages`, {
          headers: { token: `Bearer ${token}` },
          params: { limit: 200 },
        }),
      ]);
      setConv(cRes.data?.conversation || null);
      setOther(cRes.data?.other_user || null);
      setMessages(Array.isArray(mRes.data) ? mRes.data : []);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.detail || 'Sohbet yüklenemedi.');
      navigate('/sohbetler');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const wsUrl = `ws://127.0.0.1:8000/ws/dm/${conversationId}?token=${encodeURIComponent(token || '')}`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'message' && payload.message) {
            setMessages((prev) => {
              const exists = prev.some((m) => String(m.id) === String(payload.message.id));
              if (exists) return prev;
              return [...prev, payload.message];
            });
          }
          if (payload?.type === 'error' && payload.detail) {
            console.warn('ws error:', payload.detail);
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        // ignore; REST will still work
      };

      return () => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      };
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const isPending = conv?.status === 'pending';
  const isRequestedToMe = isPending && conv?.requested_to && currentUserId && String(conv.requested_to) === String(currentUserId);
  const isRequestedByMe = isPending && conv?.requested_by && currentUserId && String(conv.requested_by) === String(currentUserId);

  const accept = async () => {
    setActionLoading(true);
    try {
      await axios.post(`${API_BASE}/dm/conversations/${conversationId}/accept`, null, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchAll();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Kabul edilemedi.');
    } finally {
      setActionLoading(false);
    }
  };

  const reject = async () => {
    setActionLoading(true);
    try {
      await axios.post(`${API_BASE}/dm/conversations/${conversationId}/reject`, null, {
        headers: { token: `Bearer ${token}` },
      });
      navigate('/sohbetler');
    } catch (err) {
      alert(err?.response?.data?.detail || 'Reddedilemedi.');
    } finally {
      setActionLoading(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    setSendLoading(true);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', content }));
      } else {
        await axios.post(
          `${API_BASE}/dm/conversations/${conversationId}/messages`,
          { content },
          { headers: { token: `Bearer ${token}` } }
        );
      }
      setText('');
      // If REST path was used, refresh to get sender info/attachments
      // WS path appends optimistically via onmessage
    } catch (err) {
      alert(err?.response?.data?.detail || 'Mesaj gönderilemedi.');
    } finally {
      setSendLoading(false);
    }
  };

  const sendFile = async () => {
    if (!file) return;
    setFileLoading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append('file', file);
      const caption = text.trim();

      await axios.post(
        `${API_BASE}/dm/conversations/${conversationId}/attachments`,
        form,
        {
          headers: { token: `Bearer ${token}` },
          params: caption ? { content: caption } : {},
          onUploadProgress: (evt) => {
            const total = evt.total || 0;
            if (!total) {
              setUploadProgress((p) => (p === 0 ? 5 : p));
              return;
            }
            const pct = Math.min(100, Math.round((evt.loaded * 100) / total));
            setUploadProgress(pct);
          },
        }
      );

      setFile(null);
      setText('');
      setUploadProgress(0);
      // Upload endpoint broadcasts over WS; no refetch needed
    } catch (err) {
      alert(err?.response?.data?.detail || 'Dosya gönderilemedi.');
    } finally {
      setFileLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  const otherName = other?.full_name || other?.email || 'Kullanıcı';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={() => navigate('/sohbetler')}
              className="text-sm font-bold text-gray-500 hover:text-gray-900 transition"
              type="button"
            >
              ← Sohbetler
            </button>
            <h1 className="text-xl sm:text-2xl font-extrabold truncate mt-1">{otherName}</h1>
            <p className="text-xs text-gray-500 mt-1 truncate">📍 {other?.city || 'Belirtilmemiş'}</p>
          </div>

          {isPending && (
            <div className="flex items-center gap-2">
              {isRequestedToMe ? (
                <>
                  <button
                    onClick={reject}
                    disabled={actionLoading}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                    type="button"
                  >
                    Reddet
                  </button>
                  <button
                    onClick={accept}
                    disabled={actionLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                    type="button"
                  >
                    Kabul
                  </button>
                </>
              ) : (
                <span className="text-xs font-extrabold bg-yellow-50 text-yellow-800 border border-yellow-100 px-3 py-2 rounded-xl">
                  Mesaj isteği gönderildi
                </span>
              )}
            </div>
          )}
        </div>

        {isPending && isRequestedByMe && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 text-sm text-yellow-900">
            Bu kişi henüz arkadaşın değil. Mesajın “spawn kutusuna” düştü. Karşı taraf kabul edince sohbet aktif olur.
          </div>
        )}

        {isPending && isRequestedToMe && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
            Bu sohbet bir mesaj isteği. Kabul ederseniz arkadaş olursunuz ve sohbet aktif olur.
          </div>
        )}

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div ref={listRef} className="h-[55vh] overflow-y-auto p-5 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-10">Henüz mesaj yok.</div>
            ) : (
              messages.map((m) => {
                const isMine = currentUserId && String(m.sender_id) === String(currentUserId);
                return (
                  <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm border ${
                        isMine
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-gray-50 text-gray-900 border-gray-200'
                      }`}
                    >
                      {m.content ? (
                        <div className="whitespace-pre-wrap wrap-break-word">{m.content}</div>
                      ) : null}

                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {m.attachments.map((a) => {
                            const isImage = (a.mime_type || '').startsWith('image/');
                            return (
                              <div key={a.id} className="space-y-2">
                                {isImage ? (
                                  <a href={a.file_url} target="_blank" rel="noreferrer">
                                    <img
                                      src={a.file_url}
                                      alt={a.file_name || 'image'}
                                      className="max-h-56 rounded-xl border border-white/10"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={a.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-extrabold border ${
                                      isMine
                                        ? 'bg-white/10 border-white/20 text-white'
                                        : 'bg-white border-gray-200 text-gray-800'
                                    }`}
                                  >
                                    📎 {a.file_name || 'dosya'}
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className={`text-[11px] mt-2 ${isMine ? 'text-white/70' : 'text-gray-500'}`}>
                        {new Date(m.created_at).toLocaleString('tr-TR')}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 border-t border-gray-100 space-y-2">
            {file ? (
              <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-gray-900 truncate">📎 {file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fileLoading ? `Yükleniyor... %${uploadProgress || 0}` : 'Dosya seçildi'}
                  </p>
                  {fileLoading ? (
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-blue-600 rounded-full transition-all"
                        style={{ width: `${uploadProgress || 5}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={fileLoading}
                  className="text-sm font-extrabold text-gray-500 hover:text-gray-900"
                >
                  Kaldır
                </button>
              </div>
            ) : null}

            <form onSubmit={send} className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isPending && isRequestedToMe ? 'Mesaj yazmak için kabul edin...' : 'Mesaj yaz...'}
                disabled={sendLoading || fileLoading || (isPending && isRequestedToMe)}
                className="flex-1 bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
              />

              <label
                className={`px-4 py-3 rounded-2xl font-extrabold text-sm border transition cursor-pointer ${
                  isPending && isRequestedToMe
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : 'bg-white hover:bg-gray-50 text-gray-800 border-gray-200'
                }`}
              >
                Dosya
                <input
                  type="file"
                  className="hidden"
                  disabled={isPending && isRequestedToMe}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>

              {file ? (
                <button
                  type="button"
                  onClick={sendFile}
                  disabled={fileLoading || (isPending && isRequestedToMe)}
                  className="bg-gray-900 hover:bg-black text-white px-4 py-3 rounded-2xl font-extrabold text-sm transition disabled:opacity-50"
                >
                  {fileLoading ? `Yükleniyor %${uploadProgress || 0}` : 'Yükle'}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={sendLoading || !text.trim() || (isPending && isRequestedToMe)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-2xl font-extrabold text-sm transition disabled:opacity-50"
                >
                  {sendLoading ? '...' : 'Gönder'}
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
