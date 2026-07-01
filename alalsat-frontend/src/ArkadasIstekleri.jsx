import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:8000';

export default function ArkadasIstekleri() {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [inRes, outRes] = await Promise.all([
        axios.get(`${API_BASE}/friends/requests/incoming`, { headers: { token: `Bearer ${token}` } }),
        axios.get(`${API_BASE}/friends/requests/outgoing`, { headers: { token: `Bearer ${token}` } }),
      ]);
      setIncoming(Array.isArray(inRes.data) ? inRes.data : []);
      setOutgoing(Array.isArray(outRes.data) ? outRes.data : []);
    } catch (e) {
      console.error(e);
      setIncoming([]);
      setOutgoing([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = async (id) => {
    setActionLoading(id);
    try {
      await axios.post(`${API_BASE}/friends/requests/${id}/accept`, null, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchAll();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Kabul edilemedi.');
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (id) => {
    setActionLoading(id);
    try {
      await axios.post(`${API_BASE}/friends/requests/${id}/reject`, null, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchAll();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Reddedilemedi.');
    } finally {
      setActionLoading(null);
    }
  };

  const cancel = async (id) => {
    setActionLoading(id);
    try {
      await axios.post(`${API_BASE}/friends/requests/${id}/cancel`, null, {
        headers: { token: `Bearer ${token}` },
      });
      await fetchAll();
    } catch (err) {
      alert(err?.response?.data?.detail || 'İptal edilemedi.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Arkadaşlık İstekleri</h1>
            <p className="text-gray-600 mt-1">Gelen ve giden istekleri yönet.</p>
          </div>
          <button
            onClick={() => navigate('/arkadaslar')}
            className="bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-xl font-bold text-sm transition"
          >
            Arkadaşlar
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-14">
            <div className="animate-spin rounded-full h-9 w-9 border-b-4 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-extrabold">Gelen İstekler</h2>
              <p className="text-sm text-gray-600 mt-1">{incoming.length} istek</p>

              {incoming.length === 0 ? (
                <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
                  <div className="text-4xl">📥</div>
                  <p className="font-semibold text-gray-800 mt-3">Gelen istek yok</p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {incoming.map((r) => (
                    <div key={r.id} className="border border-gray-100 rounded-2xl p-4 bg-white">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-extrabold text-gray-900 truncate">{r.from_full_name || r.from_email}</p>
                          <p className="text-xs text-gray-500 mt-1 truncate">📍 {r.from_city || 'Belirtilmemiş'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => reject(r.id)}
                            disabled={actionLoading === r.id}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                          >
                            Reddet
                          </button>
                          <button
                            onClick={() => accept(r.id)}
                            disabled={actionLoading === r.id}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                          >
                            Kabul Et
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-extrabold">Giden İstekler</h2>
              <p className="text-sm text-gray-600 mt-1">{outgoing.length} istek</p>

              {outgoing.length === 0 ? (
                <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center">
                  <div className="text-4xl">📤</div>
                  <p className="font-semibold text-gray-800 mt-3">Giden istek yok</p>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {outgoing.map((r) => (
                    <div key={r.id} className="border border-gray-100 rounded-2xl p-4 bg-white">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-extrabold text-gray-900 truncate">{r.to_full_name || r.to_email}</p>
                          <p className="text-xs text-gray-500 mt-1 truncate">📍 {r.to_city || 'Belirtilmemiş'}</p>
                        </div>
                        <button
                          onClick={() => cancel(r.id)}
                          disabled={actionLoading === r.id}
                          className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
