const { Telegraf } = require('telegraf');

// Helper: safely parse env var to number
function num(envVal) {
  if (envVal === undefined || envVal === null || String(envVal).trim() === '') return null;
  const n = Number(envVal);
  return Number.isFinite(n) ? n : null;
}

// Build topics config from env
function buildTopicsFromEnv() {
  const topics = [];

  const push = (id, name, isCrypto) => {
    const n = num(id);
    if (n !== null) topics.push({ id: n, name, isCrypto });
  };

  // Provided by the user (Prod)
  push(process.env.TELEGRAM_TOPIC_BTC_ID_PROD, 'Bitcoin (BTC)', true);
  push(process.env.TELEGRAM_TOPIC_ASTER_ID_PROD, 'Aster (ASTER)', true);
  push(process.env.TELEGRAM_TOPIC_NEWS_ID_PROD, 'News', false);
  push(process.env.TELEGRAM_TOPIC_SOLANA_ID_PROD, 'Solana (SOL)', true);
  push(process.env.TELEGRAM_TOPIC_CHAT_ID_PROD, 'Chat', false);
  push(process.env.TELEGRAM_TOPIC_TETHER_GOLD_ID_PROD, 'Tether Gold (XAUT)', true);
  push(process.env.TELEGRAM_TOPIC_LITECOIN_ID_PROD, 'Litecoin (LTC)', true);
  push(process.env.TELEGRAM_TOPIC_SUI_ID_PROD, 'Sui (SUI)', true);
  push(process.env.TELEGRAM_TOPIC_RIPPLE_ID_PROD, 'Ripple (XRP)', true);
  push(process.env.TELEGRAM_TOPIC_BINANCE_ID_PROD, 'BNB (BNB)', true);
  push(process.env.TELEGRAM_TOPIC_ETHEREUM_ID_PROD, 'Ethereum (ETH)', true);
  push(process.env.TELEGRAM_TOPIC_TON_ID_PROD, 'Toncoin (TON)', true);

  return topics;
}

function formatLogPrefix(chatId, topic) {
  const topicName = topic?.name || 'Unknown Topic';
  const tag = topic?.isCrypto ? 'CRYPTO' : 'OTHER';
  return `[Forum ${chatId}] [${tag}] [${topicName}]`;
}

// Extract text from various message types
function extractMessageText(message) {
  if (!message) return null;
  if (message.text) return message.text;
  if (message.caption) return message.caption; // for media
  // Fallback: try to stringify minimal
  try {
    return JSON.stringify({
      message_id: message.message_id,
      hasMedia: !!(message.photo || message.document || message.video || message.audio || message.voice || message.sticker),
      date: message.date,
    });
  } catch (_) {
    return null;
  }
}

function initForumWatcher(bot) {
  if (!(bot instanceof Telegraf)) {
    throw new Error('initForumWatcher(bot): bot must be an instance of Telegraf');
  }

  const forumChatId = num(process.env.TELEGRAM_FORUM_CHAT_ID_PROD);
  if (forumChatId === null) {
    console.warn('⚠️ TELEGRAM_FORUM_CHAT_ID_PROD не задан. Watcher для форума отключен.');
    return;
  }

  const topics = buildTopicsFromEnv();
  const topicById = new Map(topics.map(t => [t.id, t]));
  const cryptoTopicIds = new Set(topics.filter(t => t.isCrypto).map(t => t.id));

  // Optional: private DM notifications to a specific user
  const notifyUserId = num(process.env.TELEGRAM_NOTIFY_USER_ID);

  console.log('👀 Forum watcher enabled:');
  console.log(`   Chat ID: ${forumChatId}`);
  console.log(`   Topics total: ${topics.length}, crypto: ${cryptoTopicIds.size}`);
  if (notifyUserId !== null) {
    console.log(`   Private notify enabled → userId: ${notifyUserId}`);
  } else {
    console.log('   Private notify disabled (set TELEGRAM_NOTIFY_USER_ID to enable)');
  }

  // Handler for new messages
  bot.on('message', async (ctx) => {
    try {
      const chatId = ctx.chat?.id;
      const threadId = ctx.message?.message_thread_id;
      if (chatId !== forumChatId || !threadId) return; // only forum messages in specified chat
      if (!cryptoTopicIds.has(threadId)) return; // filter only crypto topics

      const topic = topicById.get(threadId);
      const text = extractMessageText(ctx.message);
      const prefix = formatLogPrefix(chatId, topic);
      
      console.log(`${prefix} New message`);
      if (text) console.log(`→ ${text}`);
      else console.log('→ [non-text message]');

      // Send private DM if configured
      if (notifyUserId !== null) {
        const header = `Новое сообщение в топике: ${topic?.name || 'Unknown Topic'} (CRYPTO)`;
        const body = text || '[non-text message]';
        const dm = `${header}\n\n${body}`;
        try {
          await bot.telegram.sendMessage(notifyUserId, dm);
        } catch (e) {
          console.error('Failed to send private DM:', e?.message || e);
        }
      }
    } catch (err) {
      console.error('Watcher error (message):', err?.message || err);
    }
  });

  // Handler for edited messages in topics (optional but useful)
  bot.on('edited_message', async (ctx) => {
    try {
      const chatId = ctx.chat?.id;
      const threadId = ctx.editedMessage?.message_thread_id;
      if (chatId !== forumChatId || !threadId) return;
      if (!cryptoTopicIds.has(threadId)) return;

      const topic = topicById.get(threadId);
      const text = extractMessageText(ctx.editedMessage);
      const prefix = formatLogPrefix(chatId, topic);
      
      console.log(`${prefix} Edited message`);
      if (text) console.log(`~ ${text}`);
      else console.log('~ [non-text message]');

      // Send private DM if configured (edited)
      if (notifyUserId !== null) {
        const header = `Изменение сообщения в топике: ${topic?.name || 'Unknown Topic'} (CRYPTO)`;
        const body = text || '[non-text message]';
        const dm = `${header}\n\n${body}`;
        try {
          await bot.telegram.sendMessage(notifyUserId, dm);
        } catch (e) {
          console.error('Failed to send private DM (edited):', e?.message || e);
        }
      }
    } catch (err) {
      console.error('Watcher error (edited_message):', err?.message || err);
    }
  });

  // Support channels with topics: new posts
  bot.on('channel_post', async (ctx) => {
    try {
      const chatId = ctx.chat?.id;
      const threadId = ctx.channelPost?.message_thread_id;
      if (chatId !== forumChatId || !threadId) return;
      if (!cryptoTopicIds.has(threadId)) return;

      const topic = topicById.get(threadId);
      const text = extractMessageText(ctx.channelPost);
      const prefix = formatLogPrefix(chatId, topic);

      console.log(`${prefix} Channel post`);
      if (text) console.log(`→ ${text}`);
      else console.log('→ [non-text message]');

      if (notifyUserId !== null) {
        const header = `Новый пост в канале/топике: ${topic?.name || 'Unknown Topic'} (CRYPTO)`;
        const body = text || '[non-text message]';
        const dm = `${header}\n\n${body}`;
        try { await bot.telegram.sendMessage(notifyUserId, dm); } catch (e) {
          console.error('Failed to send private DM (channel_post):', e?.message || e);
        }
      }
    } catch (err) {
      console.error('Watcher error (channel_post):', err?.message || err);
    }
  });

  // Support channels with topics: edited posts
  bot.on('edited_channel_post', async (ctx) => {
    try {
      const chatId = ctx.chat?.id;
      const threadId = ctx.editedChannelPost?.message_thread_id;
      if (chatId !== forumChatId || !threadId) return;
      if (!cryptoTopicIds.has(threadId)) return;

      const topic = topicById.get(threadId);
      const text = extractMessageText(ctx.editedChannelPost);
      const prefix = formatLogPrefix(chatId, topic);

      console.log(`${prefix} Edited channel post`);
      if (text) console.log(`~ ${text}`);
      else console.log('~ [non-text message]');

      if (notifyUserId !== null) {
        const header = `Изменение поста в канале/топике: ${topic?.name || 'Unknown Topic'} (CRYPTO)`;
        const body = text || '[non-text message]';
        const dm = `${header}\n\n${body}`;
        try { await bot.telegram.sendMessage(notifyUserId, dm); } catch (e) {
          console.error('Failed to send private DM (edited_channel_post):', e?.message || e);
        }
      }
    } catch (err) {
      console.error('Watcher error (edited_channel_post):', err?.message || err);
    }
  });
}

module.exports = { initForumWatcher };
