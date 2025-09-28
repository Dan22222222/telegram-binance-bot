require('dotenv').config();
const { Telegraf } = require('telegraf');
const TradingBot = require('./trade');

// Load environment variables
const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ALLOWED_CHAT_ID,
  BINANCE_API_KEY,
  BINANCE_API_SECRET,
  TESTNET
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

// Initialize trading bot (Binance)
const trading = new TradingBot(
  BINANCE_API_KEY || '',
  BINANCE_API_SECRET || '',
  (typeof TESTNET === 'string' ? TESTNET.toLowerCase() !== 'false' : true)
);

// Initialize Telegram bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Optional restriction to a single chat/user
let allowedChatId = null;
if (TELEGRAM_ALLOWED_CHAT_ID && TELEGRAM_ALLOWED_CHAT_ID.trim() !== '') {
  const parsed = Number(TELEGRAM_ALLOWED_CHAT_ID);
  if (!Number.isNaN(parsed)) {
    allowedChatId = parsed;
  }
}

// Middleware to restrict bot usage by chat id if set
bot.use((ctx, next) => {
  if (!allowedChatId) return next();
  const chatId = ctx.chat?.id;
  if (chatId === allowedChatId) return next();
  try {
    return ctx.reply('⛔️ Доступ к боту ограничен.');
  } catch (_) {
    return; // ignore errors in middleware
  }
});

// /start command handler
bot.start(async (ctx) => {
  const firstName = ctx.from?.first_name || 'трейдер';
  await ctx.reply(
    [
      `Привет, ${firstName}! 👋`,
      'Я бот для торговли на Binance Futures.',
      '',
      'Отправь торговую команду в формате:',
      'BUY|SELL SYMBOL LEVERAGE x QUANTITY [SL=price] [TP=price] [HOLD]',
      'Например: BUY BTCUSDT 20x 0.01 SL=42000 TP=45000',
      '',
      'Дополнительно:',
      '- /balance — показать баланс',
      '- /positions — показать открытые позиции'
    ].join('\n')
  );
});

// Balance command
bot.command('balance', async (ctx) => {
  try {
    const info = await trading.getAccountInfo();
    await ctx.reply(
      `💰 Баланс\n` +
      `Общий: ${info.totalWalletBalance} USDT\n` +
      `Доступный: ${info.availableBalance} USDT`
    );
  } catch (err) {
    await ctx.reply(`❌ Ошибка получения баланса: ${err?.message || err}`);
  }
});

// Positions command
bot.command('positions', async (ctx) => {
  try {
    const positions = await trading.getOpenPositions();
    if (!positions || positions.length === 0) {
      return ctx.reply('📊 Нет открытых позиций');
    }
    const lines = positions.map((p) => `${p.symbol}: ${p.positionAmt} (PnL: ${p.unRealizedProfit} USDT)`);
    await ctx.reply(['📊 Открытые позиции:', ...lines].join('\n'));
  } catch (err) {
    await ctx.reply(`❌ Ошибка получения позиций: ${err?.message || err}`);
  }
});

// Handle plain text trade commands
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  // Ignore slash commands here (handled above)
  if (text.startsWith('/')) return;

  await ctx.reply('⏳ Обрабатываю команду...');
  try {
    const ok = await trading.processCommand(text);
    if (ok) {
      await ctx.reply('✅ Команда выполнена');
    } else {
      await ctx.reply('❌ Неверный формат команды. Проверьте синтаксис.');
    }
  } catch (err) {
    await ctx.reply(`❌ Ошибка выполнения команды: ${err?.message || err}`);
  }
});

// Start bot
bot.launch()
  .then(() => console.log('🤖 Telegram бот запущен. Отправьте /start в чат.'))
  .catch((err) => {
    console.error('❌ Не удалось запустить Telegram бота:', err?.message || err);
    process.exit(1);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
