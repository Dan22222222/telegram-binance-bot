const Binance = require('binance-api-node').default;

class TradingBot {
    constructor(apiKey, apiSecret, testnet = true) {
        this.client = Binance({
            apiKey: apiKey,
            apiSecret: apiSecret,
            test: testnet,
            futures: true
        });
    }

    /**
     * Парсит входящую команду и извлекает торговые параметры
     * Примеры команд:
     * "BUY BTCUSDT 20x 0.01 SL=42000 TP=45000"
     * "SELL ETHUSDT 10x 0.1 HOLD"
     * @param {string} command - входящая команда
     * @returns {object|null} - объект с параметрами торговли или null при ошибке
     */
    parseCommand(command) {
        try {
            const parts = command.trim().split(/\s+/);
            
            if (parts.length < 4) {
                throw new Error('Недостаточно параметров в команде');
            }

            const direction = parts[0].toUpperCase();
            const symbol = parts[1].toUpperCase();
            const leverageStr = parts[2];
            const quantity = parseFloat(parts[3]);

            // Проверка направления сделки
            if (!['BUY', 'SELL'].includes(direction)) {
                throw new Error('Неверное направление сделки. Используйте BUY или SELL');
            }

            // Парсинг плеча
            const leverage = parseInt(leverageStr.replace('x', ''));
            if (isNaN(leverage) || leverage < 1 || leverage > 125) {
                throw new Error('Неверное значение плеча');
            }

            // Проверка количества
            if (isNaN(quantity) || quantity <= 0) {
                throw new Error('Неверное количество для ордера');
            }

            const tradeParams = {
                side: direction === 'BUY' ? 'LONG' : 'SHORT',
                symbol: symbol,
                leverage: leverage,
                quantity: quantity,
                stopLoss: null,
                takeProfit: null,
                hold: false
            };

            // Парсинг дополнительных параметров (SL, TP, HOLD)
            for (let i = 4; i < parts.length; i++) {
                const param = parts[i];
                
                if (param.startsWith('SL=')) {
                    const slValue = parseFloat(param.split('=')[1]);
                    if (!isNaN(slValue)) {
                        tradeParams.stopLoss = slValue;
                    }
                } else if (param.startsWith('TP=')) {
                    const tpValue = parseFloat(param.split('=')[1]);
                    if (!isNaN(tpValue)) {
                        tradeParams.takeProfit = tpValue;
                    }
                } else if (param.toUpperCase() === 'HOLD') {
                    tradeParams.hold = true;
                }
            }

            return tradeParams;
        } catch (error) {
            console.error('Ошибка: неверный формат команды -', error.message);
            return null;
        }
    }

    /**
     * Устанавливает плечо для торговой пары
     * @param {string} symbol - торговая пара
     * @param {number} leverage - плечо
     */
    async setLeverage(symbol, leverage) {
        try {
            await this.client.futuresLeverage({
                symbol: symbol,
                leverage: leverage
            });
            console.log(`✅ Плечо ${leverage}x установлено для ${symbol}`);
        } catch (error) {
            console.error(`❌ Ошибка установки плеча для ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * Получает текущую цену символа
     * @param {string} symbol - торговая пара
     * @returns {number} - текущая цена
     */
    async getCurrentPrice(symbol) {
        try {
            const ticker = await this.client.futuresPrices({ symbol: symbol });
            return parseFloat(ticker[symbol]);
        } catch (error) {
            console.error(`❌ Ошибка получения цены для ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * Размещает рыночный ордер
     * @param {object} tradeParams - параметры торговли
     */
    async placeMarketOrder(tradeParams) {
        try {
            const { symbol, side, quantity, leverage } = tradeParams;
            
            // Устанавливаем плечо
            await this.setLeverage(symbol, leverage);

            // Определяем направление ордера для Binance API
            const orderSide = side === 'LONG' ? 'BUY' : 'SELL';

            // Размещаем рыночный ордер
            const order = await this.client.futuresOrder({
                symbol: symbol,
                side: orderSide,
                type: 'MARKET',
                quantity: quantity.toString()
            });

            console.log(`✅ Рыночный ордер размещен:`);
            console.log(`   Символ: ${symbol}`);
            console.log(`   Направление: ${side}`);
            console.log(`   Количество: ${quantity}`);
            console.log(`   Плечо: ${leverage}x`);
            console.log(`   Order ID: ${order.orderId}`);

            return order;
        } catch (error) {
            console.error('❌ Ошибка размещения рыночного ордера:', error.message);
            throw error;
        }
    }

    /**
     * Размещает стоп-лосс ордер
     * @param {string} symbol - торговая пара
     * @param {string} side - направление (противоположное основной позиции)
     * @param {number} quantity - количество
     * @param {number} stopPrice - цена стоп-лосса
     */
    async placeStopLossOrder(symbol, side, quantity, stopPrice) {
        try {
            const order = await this.client.futuresOrder({
                symbol: symbol,
                side: side,
                type: 'STOP_MARKET',
                quantity: quantity.toString(),
                stopPrice: stopPrice.toString(),
                timeInForce: 'GTC'
            });

            console.log(`✅ Стоп-лосс ордер размещен по цене ${stopPrice}`);
            return order;
        } catch (error) {
            console.error('❌ Ошибка размещения стоп-лосс ордера:', error.message);
            throw error;
        }
    }

    /**
     * Размещает тейк-профит ордер
     * @param {string} symbol - торговая пара
     * @param {string} side - направление (противоположное основной позиции)
     * @param {number} quantity - количество
     * @param {number} takeProfitPrice - цена тейк-профита
     */
    async placeTakeProfitOrder(symbol, side, quantity, takeProfitPrice) {
        try {
            const order = await this.client.futuresOrder({
                symbol: symbol,
                side: side,
                type: 'TAKE_PROFIT_MARKET',
                quantity: quantity.toString(),
                stopPrice: takeProfitPrice.toString(),
                timeInForce: 'GTC'
            });

            console.log(`✅ Тейк-профит ордер размещен по цене ${takeProfitPrice}`);
            return order;
        } catch (error) {
            console.error('❌ Ошибка размещения тейк-профит ордера:', error.message);
            throw error;
        }
    }

    /**
     * Выполняет торговую операцию на основе параметров
     * @param {object} tradeParams - параметры торговли
     */
    async executeTrade(tradeParams) {
        try {
            console.log('\n🚀 Начинаем выполнение торговой операции...');
            console.log('Параметры:', tradeParams);

            // Размещаем основной рыночный ордер
            const mainOrder = await this.placeMarketOrder(tradeParams);

            // Если не режим HOLD, размещаем стоп-лосс и тейк-профит
            if (!tradeParams.hold) {
                const { symbol, side, quantity, stopLoss, takeProfit } = tradeParams;
                
                // Определяем противоположное направление для закрытия позиции
                const closeSide = side === 'LONG' ? 'SELL' : 'BUY';

                // Размещаем стоп-лосс, если указан
                if (stopLoss) {
                    await this.placeStopLossOrder(symbol, closeSide, quantity, stopLoss);
                }

                // Размещаем тейк-профит, если указан
                if (takeProfit) {
                    await this.placeTakeProfitOrder(symbol, closeSide, quantity, takeProfit);
                }
            } else {
                console.log('📋 Режим HOLD активен - дополнительные ордера не размещаются');
            }

            console.log('✅ Торговая операция успешно выполнена!\n');
            return mainOrder;

        } catch (error) {
            console.error('❌ Ошибка выполнения торговой операции:', error.message);
            throw error;
        }
    }

    /**
     * Обрабатывает входящую команду и выполняет торговлю
     * @param {string} command - входящая команда
     */
    async processCommand(command) {
        console.log(`\n📨 Получена команда: "${command}"`);
        
        const tradeParams = this.parseCommand(command);
        
        if (!tradeParams) {
            return false;
        }

        try {
            await this.executeTrade(tradeParams);
            return true;
        } catch (error) {
            console.error('❌ Не удалось выполнить торговую операцию:', error.message);
            return false;
        }
    }

    /**
     * Получает информацию о балансе аккаунта
     */
    async getAccountInfo() {
        try {
            const accountInfo = await this.client.futuresAccountInfo();
            console.log('\n💰 Информация об аккаунте:');
            console.log(`Общий баланс: ${accountInfo.totalWalletBalance} USDT`);
            console.log(`Доступный баланс: ${accountInfo.availableBalance} USDT`);
            
            return accountInfo;
        } catch (error) {
            console.error('❌ Ошибка получения информации об аккаунте:', error.message);
            throw error;
        }
    }

    /**
     * Получает открытые позиции
     */
    async getOpenPositions() {
        try {
            const positions = await this.client.futuresPositionRisk();
            const openPositions = positions.filter(pos => parseFloat(pos.positionAmt) !== 0);
            
            console.log('\n📊 Открытые позиции:');
            if (openPositions.length === 0) {
                console.log('Нет открытых позиций');
            } else {
                openPositions.forEach(pos => {
                    console.log(`${pos.symbol}: ${pos.positionAmt} (PnL: ${pos.unRealizedProfit} USDT)`);
                });
            }
            
            return openPositions;
        } catch (error) {
            console.error('❌ Ошибка получения открытых позиций:', error.message);
            throw error;
        }
    }
}

module.exports = TradingBot;
