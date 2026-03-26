import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, doc, setDoc, getDoc, query, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- FIREBASE SETUP ---
let db: any = null;
let auth: any = null;

async function initFirebase() {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const firebaseApp = initializeApp(config);
      db = getFirestore(firebaseApp, config.firestoreDatabaseId);
      auth = getAuth(firebaseApp);
      await signInAnonymously(auth);
      console.log('Firebase initialized and signed in anonymously.');
    } else {
      console.warn('firebase-applet-config.json not found. Falling back to local JSON if needed.');
    }
  } catch (e) {
    console.error('Error initializing Firebase:', e);
  }
}

// Call initFirebase immediately
initFirebase();

// --- DATABASE SETUP (Firestore) ---
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

interface Config {
  telegramToken: string;
  groqApiKey: string;
  isWebhookSet: boolean;
}

interface DB {
  messages: Message[];
  summaries: Summary[];
  config: Config;
}

const defaultDb: DB = {
  messages: [],
  summaries: [],
  config: {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    isWebhookSet: false,
  },
};

async function readDb(): Promise<DB> {
  if (!db) return defaultDb;
  try {
    const configDoc = await getDoc(doc(db, 'config', 'main'));
    const config = configDoc.exists() ? configDoc.data() as Config : defaultDb.config;

    const messagesSnapshot = await getDocs(query(collection(db, 'messages'), orderBy('timestamp', 'desc'), limit(2000)));
    const messages = messagesSnapshot.docs.map(d => d.data() as Message).reverse();

    const summariesSnapshot = await getDocs(query(collection(db, 'summaries'), orderBy('timestamp', 'desc'), limit(100)));
    const summaries = summariesSnapshot.docs.map(d => d.data() as Summary).reverse();

    return { messages, summaries, config };
  } catch (e) {
    console.error('Error reading from Firestore:', e);
    return defaultDb;
  }
}

async function writeDb(data: DB) {
  if (!db) return;
  try {
    await setDoc(doc(db, 'config', 'main'), data.config);
    // Note: In a real app, we wouldn't rewrite all messages.
    // We will update processTelegramUpdate to write individual messages instead.
  } catch (e) {
    console.error('Error writing to Firestore:', e);
  }
}

// --- TELEGRAM HELPER ---
async function sendMessage(chatId: string, text: string, token: string) {
  if (!token) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }), // Removed parse_mode to prevent markdown parsing errors
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram API Error:', data.description);
    }
  } catch (e) {
    console.error('Error sending Telegram message:', e);
  }
}

// --- GROQ HELPER ---
async function summarizeWithGroq(text: string, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error('Groq API Key is missing');
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'Bạn là một trợ lý ảo chuyên tóm tắt tin nhắn nhóm chat Telegram. Hãy đọc đoạn hội thoại, tóm tắt ngắn gọn, súc tích, trích xuất các quyết định quan trọng, công việc được giao (nếu có) bằng tiếng Việt. Trình bày rõ ràng bằng gạch đầu dòng.',
      },
      {
        role: 'user',
        content: `Tóm tắt đoạn hội thoại sau:\n\n${text}`,
      },
    ],
    model: 'llama-3.3-70b-versatile',
  });
  return completion.choices[0]?.message?.content || 'Không thể tạo tóm tắt.';
}

// --- TELEGRAM MESSAGE PROCESSING ---
async function processTelegramUpdate(update: any, dbData: DB) {
  if (update.message && update.message.text) {
    const msg = update.message;
    const chatId = msg.chat.id.toString();
    const chatTitle = msg.chat.title || msg.chat.first_name || 'Private Chat';
    const sender = msg.from.first_name || msg.from.username || 'User';
    const text = msg.text;

    if (text.startsWith('/tomtat')) {
      // Handle summary command
      await sendMessage(chatId, '⏳ Đang tổng hợp và tóm tắt tin nhắn...', dbData.config.telegramToken);
      
      const recentMsgs = dbData.messages.filter((m) => m.chatId === chatId).slice(-50);
      
      if (recentMsgs.length === 0) {
        await sendMessage(chatId, 'Không có tin nhắn nào gần đây để tóm tắt.', dbData.config.telegramToken);
      } else {
        const conversation = recentMsgs.map((m) => `${m.sender}: ${m.text}`).join('\n');
        try {
          const summaryText = await summarizeWithGroq(conversation, dbData.config.groqApiKey);
          await sendMessage(chatId, `📝 **TÓM TẮT TRÒ CHUYỆN:**\n\n${summaryText}`, dbData.config.telegramToken);
          
          const summaryObj: Summary = {
            id: Date.now().toString(),
            chatId,
            chatTitle,
            summary: summaryText,
            timestamp: Date.now(),
          };
          if (db) await setDoc(doc(db, 'summaries', summaryObj.id), summaryObj);
        } catch (e: any) {
          console.error(e);
          await sendMessage(chatId, `❌ Lỗi khi gọi API Groq: ${e.message}`, dbData.config.telegramToken);
        }
      }
    } else {
      // Store normal message
      const messageObj: Message = {
        id: msg.message_id?.toString() || Date.now().toString(),
        chatId,
        chatTitle,
        sender,
        text,
        timestamp: Date.now(),
      };
      if (db) await setDoc(doc(db, 'messages', messageObj.id), messageObj);
    }
  }
}

// --- TELEGRAM LONG POLLING ---
let isPolling = false;
let lastUpdateId = 0;
let currentPollingToken = '';

async function pollTelegram() {
  if (!isPolling || !currentPollingToken) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${currentPollingToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
    const data = await res.json();
    if (data.ok && data.result.length > 0) {
      const dbData = await readDb();
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        await processTelegramUpdate(update, dbData);
      }
    }
  } catch (e) {
    // Ignore network errors during polling to prevent log spam
  }
  
  if (isPolling) {
    setTimeout(pollTelegram, 1000);
  }
}

export async function startPolling(token: string) {
  if (!token) return;
  currentPollingToken = token;
  isPolling = false; // Stop existing loop
  
  // Delete webhook to allow getUpdates to work
  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
  } catch (e) {
    console.error('Failed to delete webhook', e);
  }

  console.log('Started Telegram long polling...');
  isPolling = true;
  pollTelegram();
}

// --- API ROUTES ---

// Telegram Webhook (Kept for compatibility, but we use long polling now)
app.post('/api/webhook', async (req, res) => {
  const dbData = await readDb();
  await processTelegramUpdate(req.body, dbData);
  res.sendStatus(200);
});

// Dashboard APIs
app.get('/api/stats', async (req, res) => {
  try {
    const dbData = await readDb();
    const groupId = req.query.groupId as string;
    
    // Ensure arrays exist to prevent crashes
    const messages = dbData.messages || [];
    const summaries = dbData.summaries || [];
    
    // Get unique groups for the dropdown
    const groupsMap = new Map<string, string>();
    messages.forEach(m => {
      if (m.chatId && m.chatTitle) {
        groupsMap.set(m.chatId.toString(), m.chatTitle);
      }
    });
    const groups = Array.from(groupsMap.entries()).map(([id, name]) => ({ id, name }));

    // Filter messages by groupId if provided
    const filteredMessages = groupId ? messages.filter(m => m.chatId?.toString() === groupId) : messages;
    const filteredSummaries = groupId ? summaries.filter(s => s.chatId?.toString() === groupId) : summaries;
    
    // Calculate messages per day for the chart
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const chartData = last7Days.map(date => {
      return {
        date,
        messages: filteredMessages.filter(m => new Date(m.timestamp).toISOString().split('T')[0] === date).length,
        summaries: filteredSummaries.filter(s => new Date(s.timestamp).toISOString().split('T')[0] === date).length,
      };
    });

    // Calculate user trends (Top 5 most active users in the last 7 days)
    const recentMessages = filteredMessages.filter(m => {
      const date = new Date(m.timestamp).toISOString().split('T')[0];
      return last7Days.includes(date);
    });

    const senderCounts: Record<string, number> = {};
    recentMessages.forEach(m => {
      senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1;
    });

    const topSenders = Object.entries(senderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);

    const userTrendData = last7Days.map(date => {
      const dayData: any = { date };
      topSenders.forEach(sender => {
        dayData[sender] = 0;
      });
      dayData['Khác'] = 0;

      const msgsOnDate = recentMessages.filter(m => new Date(m.timestamp).toISOString().split('T')[0] === date);
      msgsOnDate.forEach(m => {
        if (topSenders.includes(m.sender)) {
          dayData[m.sender]++;
        } else {
          dayData['Khác']++;
        }
      });
      return dayData;
    });

    const uniqueGroups = new Set(messages.map(m => m.chatId)).size;

    res.json({
      totalMessages: filteredMessages.length,
      totalSummaries: filteredSummaries.length,
      activeGroups: uniqueGroups,
      chartData,
      userTrendData,
      topSenders,
      groups
    });
  } catch (error: any) {
    console.error('Error in /api/stats:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const dbData = await readDb();
    const messages = dbData.messages || [];
    // Return last 50 messages, sorted newest first
    const recent = [...messages].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    res.json(recent);
  } catch (error: any) {
    console.error('Error in /api/messages:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.get('/api/summaries', async (req, res) => {
  try {
    const dbData = await readDb();
    const summaries = dbData.summaries || [];
    const recent = [...summaries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    res.json(recent);
  } catch (error: any) {
    console.error('Error in /api/summaries:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.get('/api/config', async (req, res) => {
  try {
    const dbData = await readDb();
    const config = dbData.config || {};
    res.json({
      telegramToken: config.telegramToken ? '***' + config.telegramToken.slice(-4) : '',
      groqApiKey: config.groqApiKey ? '***' + config.groqApiKey.slice(-4) : '',
      isWebhookSet: config.isWebhookSet || false,
    });
  } catch (error: any) {
    console.error('Error in /api/config:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.post('/api/config', async (req, res) => {
  const dbData = await readDb();
  const { telegramToken, groqApiKey } = req.body;
  
  if (telegramToken && !telegramToken.includes('***')) {
    dbData.config.telegramToken = telegramToken;
    startPolling(telegramToken); // Restart polling with new token
  }
  if (groqApiKey && !groqApiKey.includes('***')) {
    dbData.config.groqApiKey = groqApiKey;
  }
  
  await writeDb(dbData);
  res.json({ success: true });
});

app.post('/api/set-webhook', async (req, res) => {
  const dbData = await readDb();
  
  if (!dbData.config.telegramToken) {
    return res.status(400).json({ error: 'Telegram Token is not set' });
  }
  
  // We now use Long Polling instead of Webhooks to bypass AI Studio proxy issues.
  // This endpoint just deletes the webhook and ensures polling is running.
  try {
    await fetch(`https://api.telegram.org/bot${dbData.config.telegramToken}/deleteWebhook?drop_pending_updates=false`);
    startPolling(dbData.config.telegramToken);
    dbData.config.isWebhookSet = true;
    await writeDb(dbData);
    res.json({ success: true, message: 'Đã chuyển sang chế độ Long Polling thành công!' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/debug', async (req, res) => {
  const dbData = await readDb();
  if (!dbData.config.telegramToken) {
    return res.json({ error: 'Chưa có Telegram Token' });
  }
  try {
    // Check webhook info (should be empty/deleted now)
    const url = `https://api.telegram.org/bot${dbData.config.telegramToken}/getWebhookInfo`;
    const response = await fetch(url);
    const data = await response.json();
    
    // Add polling status
    res.json({
      polling_active: isPolling,
      current_token_set: !!currentPollingToken,
      webhook_info: data.result || data
    });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

// --- VITE MIDDLEWARE ---
async function startServer() {
  const dbData = await readDb();
  if (dbData.config.telegramToken) {
    startPolling(dbData.config.telegramToken);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
