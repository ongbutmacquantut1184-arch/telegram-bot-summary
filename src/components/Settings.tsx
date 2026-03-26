import React, { useState, useEffect } from 'react';
import { Save, Link as LinkIcon, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

export default function Settings() {
  const [tokens, setTokens] = useState({ telegramToken: '', groqApiKey: '' });
  const [isWebhookSet, setIsWebhookSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [webhookMessage, setWebhookMessage] = useState({ text: '', type: '' });
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then((data) => {
        setTokens({ telegramToken: data.telegramToken, groqApiKey: data.groqApiKey });
        setIsWebhookSet(data.isWebhookSet);
      })
      .catch(console.error);
  }, []);

  const checkWebhookStatus = async () => {
    try {
      const res = await fetch('/api/debug');
      const data = await res.json();
      setDebugInfo(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens),
      });
      if (res.ok) {
        setMessage({ text: 'Lưu cấu hình thành công!', type: 'success' });
      } else {
        setMessage({ text: 'Lỗi khi lưu cấu hình.', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Lỗi kết nối máy chủ.', type: 'error' });
    }
    setSaving(false);
  };

  const handleSetWebhook = async () => {
    setWebhookMessage({ text: 'Đang kết nối...', type: 'info' });
    try {
      let appUrl = window.location.origin;
      
      // AI Studio dev URLs are protected by login (causing 302 Found error for Telegram).
      // We must use the public shared URL (ais-pre-...) for the webhook.
      if (appUrl.includes('ais-dev-')) {
        appUrl = appUrl.replace('ais-dev-', 'ais-pre-');
      }
      
      const res = await fetch('/api/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUrl }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setIsWebhookSet(true);
        setWebhookMessage({ text: 'Kết nối Webhook thành công!', type: 'success' });
      } else {
        setWebhookMessage({ text: `Lỗi: ${data.error}`, type: 'error' });
      }
    } catch (err) {
      setWebhookMessage({ text: 'Không thể kết nối đến máy chủ.', type: 'error' });
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Cài đặt hệ thống</h2>

      {/* API Keys Form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-gray-800">Cấu hình API</h3>
          <p className="text-sm text-gray-500">Nhập Token của Telegram Bot và API Key của Groq.</p>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Telegram Bot Token</label>
            <input
              type="text"
              value={tokens.telegramToken}
              onChange={(e) => setTokens({ ...tokens, telegramToken: e.target.value })}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <p className="text-xs text-gray-500">Lấy từ @BotFather trên Telegram.</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Groq API Key</label>
            <input
              type="password"
              value={tokens.groqApiKey}
              onChange={(e) => setTokens({ ...tokens, groqApiKey: e.target.value })}
              placeholder="gsk_..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <p className="text-xs text-gray-500">Lấy từ console.groq.com (Miễn phí).</p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            {message.text ? (
              <span className={`text-sm flex items-center gap-1 ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {message.text}
              </span>
            ) : <span />}
            
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </form>
      </div>

      {/* Webhook Setup */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-gray-800">Kết nối Telegram (Long Polling)</h3>
          <p className="text-sm text-gray-500">Kích hoạt để bot có thể nhận tin nhắn tự động.</p>
        </div>
        
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-800">Trạng thái:</span>
                {isWebhookSet ? (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">
                    <CheckCircle size={14} /> Đã kết nối
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold">
                    <AlertCircle size={14} /> Chưa kết nối
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 max-w-md">
                Nhấn nút bên cạnh để đăng ký kết nối với Telegram. Bạn cần lưu Token trước khi thực hiện.
              </p>
            </div>
            
            <button
              onClick={handleSetWebhook}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              <LinkIcon size={18} />
              Kết nối Bot
            </button>
          </div>

          {webhookMessage.text && (
            <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
              webhookMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
              webhookMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {webhookMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {webhookMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* Debug Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-gray-800">Kiểm tra lỗi (Debug)</h3>
            <p className="text-sm text-gray-500">Xem trạng thái kết nối thực tế từ Telegram.</p>
          </div>
          <button
            onClick={checkWebhookStatus}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            <RefreshCw size={16} />
            Kiểm tra ngay
          </button>
        </div>
        
        {debugInfo && (
          <div className="p-6 bg-gray-900 text-green-400 font-mono text-xs overflow-x-auto">
            <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
