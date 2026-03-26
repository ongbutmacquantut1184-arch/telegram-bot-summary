import { useEffect, useState } from 'react';
import { format } from 'date-fns';

interface Message {
  id: string;
  chatId: string;
  chatTitle: string;
  sender: string;
  text: string;
  timestamp: number;
}

interface Summary {
  id: string;
  chatId: string;
  chatTitle: string;
  summary: string;
  timestamp: number;
}

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [activeTab, setActiveTab] = useState<'messages' | 'summaries'>('messages');

  useEffect(() => {
    fetch('/api/messages')
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(setMessages)
      .catch(console.error);
    
    fetch('/api/summaries')
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(setSummaries)
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Dữ liệu trò chuyện</h2>
        <div className="bg-gray-200 p-1 rounded-lg flex gap-1">
          <button
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'messages' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Tin nhắn gần đây
          </button>
          <button
            onClick={() => setActiveTab('summaries')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'summaries' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Lịch sử tóm tắt
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {activeTab === 'messages' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-sm">
                  <th className="px-6 py-4 font-medium">Thời gian</th>
                  <th className="px-6 py-4 font-medium">Nhóm</th>
                  <th className="px-6 py-4 font-medium">Người gửi</th>
                  <th className="px-6 py-4 font-medium">Nội dung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {messages.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Chưa có tin nhắn nào</td></tr>
                ) : (
                  messages.map((msg) => (
                    <tr key={msg.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        {format(new Date(msg.timestamp), 'dd/MM/yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{msg.chatTitle}</td>
                      <td className="px-6 py-4 text-gray-600">{msg.sender}</td>
                      <td className="px-6 py-4 text-gray-800 max-w-md truncate">{msg.text}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {summaries.length === 0 ? (
              <div className="text-center text-gray-500 py-8">Chưa có tóm tắt nào được tạo</div>
            ) : (
              summaries.map((summary) => (
                <div key={summary.id} className="border border-gray-100 bg-gray-50 rounded-lg p-5">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-bold text-blue-700">{summary.chatTitle}</span>
                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-200">
                      {format(new Date(summary.timestamp), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  <div className="text-gray-800 whitespace-pre-wrap text-sm leading-relaxed">
                    {summary.summary}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
