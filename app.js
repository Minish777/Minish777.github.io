// ==================== КОНФИГУРАЦИЯ ====================
const CONFIG = {
    API_BASE: 'https://discord.com/api/v10',
    CDN_BASE: 'https://cdn.discordapp.com',
    CACHE_TTL: 60000, // 1 минута кэширования
    MAX_REQUESTS_PER_SECOND: 2, // Ограничение для API
    RETRY_DELAY: 1000,
    MAX_RETRIES: 3
};

// ==================== КЭШ ====================
const cache = {
    data: new Map(),
    timeouts: new Map(),
    
    set(key, value, ttl = CONFIG.CACHE_TTL) {
        this.data.set(key, {
            value,
            timestamp: Date.now(),
            ttl
        });
        
        // Автоочистка
        if (this.timeouts.has(key)) {
            clearTimeout(this.timeouts.get(key));
        }
        
        this.timeouts.set(key, setTimeout(() => {
            this.data.delete(key);
            this.timeouts.delete(key);
        }, ttl));
    },
    
    get(key) {
        const item = this.data.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > item.ttl) {
            this.data.delete(key);
            if (this.timeouts.has(key)) {
                clearTimeout(this.timeouts.get(key));
                this.timeouts.delete(key);
            }
            return null;
        }
        
        return item.value;
    },
    
    clear() {
        this.data.clear();
        this.timeouts.forEach(timeout => clearTimeout(timeout));
        this.timeouts.clear();
    }
};

// ==================== API КЛИЕНТ ====================
class DiscordAPIClient {
    constructor(token) {
        this.token = token;
        this.queue = [];
        this.processing = false;
        this.lastRequestTime = 0;
    }

    async request(endpoint, options = {}) {
        const cacheKey = endpoint + JSON.stringify(options);
        const cached = cache.get(cacheKey);
        if (cached && !options.force) {
            return cached;
        }

        return new Promise((resolve, reject) => {
            this.queue.push({
                endpoint,
                options,
                resolve,
                reject,
                retries: 0
            });
            
            if (!this.processing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        
        // Ограничение 2 запроса в секунду
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;
        const delay = Math.max(0, 500 - timeSinceLast); // 2 запроса/сек
        
        setTimeout(async () => {
            const item = this.queue.shift();
            if (!item) {
                this.processing = false;
                return;
            }

            try {
                const url = `${CONFIG.API_BASE}${item.endpoint}`;
                const response = await fetch(url, {
                    ...item.options,
                    headers: {
                        'Authorization': this.token,
                        'Content-Type': 'application/json',
                        ...item.options.headers
                    }
                });

                if (!response.ok) {
                    if (response.status === 429) { // Rate limit
                        const retryAfter = parseInt(response.headers.get('Retry-After') || '1') * 1000;
                        setTimeout(() => {
                            this.queue.unshift(item);
                            this.processQueue();
                        }, retryAfter);
                        return;
                    }
                    
                    if (item.retries < CONFIG.MAX_RETRIES) {
                        item.retries++;
                        setTimeout(() => {
                            this.queue.unshift(item);
                            this.processQueue();
                        }, CONFIG.RETRY_DELAY * item.retries);
                        return;
                    }
                    
                    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                }

                const data = await response.json();
                
                // Кэшируем успешные ответы
                const cacheKey = item.endpoint + JSON.stringify(item.options);
                cache.set(cacheKey, data);
                
                item.resolve(data);
                this.lastRequestTime = Date.now();
                
            } catch (error) {
                if (item.retries < CONFIG.MAX_RETRIES) {
                    item.retries++;
                    setTimeout(() => {
                        this.queue.unshift(item);
                        this.processQueue();
                    }, CONFIG.RETRY_DELAY * item.retries);
                    return;
                }
                item.reject(error);
            }
            
            // Обрабатываем следующий элемент
            this.processQueue();
        }, delay);
    }

    // Оптимизированные методы
    async getCurrentUser() {
        return this.request('/users/@me');
    }

    async getGuilds() {
        return this.request('/users/@me/guilds');
    }

    async getGuildChannels(guildId) {
        return this.request(`/guilds/${guildId}/channels`);
    }

    async getChannelMessages(channelId, limit = 30) {
        return this.request(`/channels/${channelId}/messages?limit=${limit}`);
    }

    async sendMessage(channelId, content) {
        return this.request(`/channels/${channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }
}

// ==================== UI КОМПОНЕНТЫ ====================
const UI = {
    // Создание элемента с оптимизацией
    createElement(tag, props = {}, children = []) {
        const el = document.createElement(tag);
        
        Object.entries(props).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'onClick') {
                el.addEventListener('click', value);
            } else if (key === 'style') {
                Object.assign(el.style, value);
            } else if (key.startsWith('on')) {
                const event = key.toLowerCase().substring(2);
                el.addEventListener(event, value);
            } else {
                el.setAttribute(key, value);
            }
        });
        
        children.forEach(child => {
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else if (child) {
                el.appendChild(child);
            }
        });
        
        return el;
    },

    // Ленивая загрузка изображений
    createLazyImage(src, alt, className = '') {
        const img = this.createElement('img', {
            className,
            'data-src': src,
            alt,
            style: {
                opacity: '0',
                transition: 'opacity 0.3s'
            }
        });
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.onload = () => {
                        img.style.opacity = '1';
                    };
                    observer.unobserve(img);
                }
            });
        });
        
        observer.observe(img);
        return img;
    }
};

// ==================== ГЛАВНОЕ ПРИЛОЖЕНИЕ ====================
class DiscordApp {
    constructor() {
        this.client = null;
        this.currentUser = null;
        this.currentGuild = null;
        this.currentChannel = null;
        this.isInitialized = false;
        
        this.state = {
            guilds: [],
            channels: [],
            messages: [],
            members: []
        };
    }

    async initialize() {
        try {
            const token = localStorage.getItem('discord_token');
            if (!token) {
                window.location.href = 'login.html';
                return;
            }

            this.client = new DiscordAPIClient(token);
            
            // Параллельная загрузка основных данных
            const [user, guilds] = await Promise.all([
                this.client.getCurrentUser(),
                this.client.getGuilds()
            ]);
            
            this.currentUser = user;
            this.state.guilds = guilds;
            
            // Скрываем экран загрузки
            this.hideLoadingScreen();
            
            // Рендерим интерфейс
            this.render();
            
            // Предзагружаем первый сервер
            if (guilds.length > 0) {
                setTimeout(() => this.selectGuild(guilds[0]), 100);
            }
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.showError('Ошибка загрузки. Проверьте подключение к интернету.');
        }
    }

    hideLoadingScreen() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.add('hidden');
            setTimeout(() => {
                loading.style.display = 'none';
            }, 300);
        }
    }

    showError(message) {
        const errorEl = UI.createElement('div', {
            className: 'error-overlay',
            style: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.9)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: '10000',
                color: 'white',
                textAlign: 'center',
                padding: '20px'
            }
        }, [
            UI.createElement('div', {}, [
                UI.createElement('h2', { style: { color: '#ff6b6b', marginBottom: '20px' } }, ['Ошибка']),
                UI.createElement('p', { style: { marginBottom: '20px' } }, [message]),
                UI.createElement('button', {
                    onClick: () => window.location.reload(),
                    style: {
                        background: '#5865f2',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }
                }, ['Перезагрузить'])
            ])
        ]);
        
        document.body.appendChild(errorEl);
    }

    render() {
        const app = document.getElementById('app');
        app.innerHTML = '';
        
        // Минималистичный интерфейс
        app.appendChild(this.createLayout());
        
        // Загружаем стили динамически
        this.loadStyles();
    }

    createLayout() {
        return UI.createElement('div', { className: 'app-layout' }, [
            // Боковая панель серверов
            UI.createElement('div', { className: 'servers-panel' }, [
                UI.createElement('div', { className: 'user-profile' }, [
                    UI.createLazyImage(
                        this.currentUser?.avatar 
                            ? `${CONFIG.CDN_BASE}/avatars/${this.currentUser.id}/${this.currentUser.avatar}.png?size=64`
                            : 'https://cdn.discordapp.com/embed/avatars/0.png',
                        this.currentUser?.username || 'User',
                        'user-avatar'
                    )
                ]),
                UI.createElement('div', { 
                    id: 'guilds-list',
                    className: 'guilds-list' 
                })
            ]),
            
            // Панель каналов
            UI.createElement('div', { className: 'channels-panel' }, [
                UI.createElement('div', { 
                    id: 'guild-header',
                    className: 'guild-header'
                }, ['Выберите сервер']),
                UI.createElement('div', { 
                    id: 'channels-list',
                    className: 'channels-list' 
                })
            ]),
            
            // Основное окно чата
            UI.createElement('div', { className: 'chat-panel' }, [
                UI.createElement('div', { 
                    id: 'channel-header',
                    className: 'channel-header'
                }, ['Выберите канал']),
                
                UI.createElement('div', { 
                    id: 'messages-container',
                    className: 'messages-container'
                }),
                
                UI.createElement('div', { className: 'message-input-wrapper' }, [
                    UI.createElement('input', {
                        id: 'message-input',
                        type: 'text',
                        placeholder: 'Написать сообщение...',
                        disabled: true,
                        onKeyPress: (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                this.sendCurrentMessage();
                            }
                        }
                    }),
                    UI.createElement('button', {
                        id: 'send-button',
                        onClick: () => this.sendCurrentMessage(),
                        disabled: true
                    }, ['➤'])
                ])
            ])
        ]);
    }

    async selectGuild(guild) {
        this.currentGuild = guild;
        
        // Обновляем заголовок
        const header = document.getElementById('guild-header');
        if (header) {
            header.innerHTML = '';
            header.appendChild(
                UI.createElement('span', { style: { fontWeight: 'bold' } }, [guild.name])
            );
        }
        
        // Загружаем каналы
        try {
            const channels = await this.client.getGuildChannels(guild.id);
            this.state.channels = channels;
            this.renderChannels(channels);
        } catch (error) {
            console.error('Ошибка загрузки каналов:', error);
        }
    }

    async selectChannel(channel) {
        this.currentChannel = channel;
        
        // Обновляем заголовок
        const header = document.getElementById('channel-header');
        if (header) {
            header.innerHTML = '';
            header.appendChild(
                UI.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                    UI.createElement('span', {}, ['#']),
                    UI.createElement('span', { style: { fontWeight: 'bold' } }, [channel.name])
                ])
            );
        }
        
        // Активируем поле ввода
        const input = document.getElementById('message-input');
        const button = document.getElementById('send-button');
        if (input && button) {
            input.disabled = false;
            button.disabled = false;
            input.placeholder = `Сообщение в #${channel.name}`;
            input.focus();
        }
        
        // Загружаем сообщения
        try {
            const messages = await this.client.getChannelMessages(channel.id);
            this.state.messages = messages;
            this.renderMessages(messages);
        } catch (error) {
            console.error('Ошибка загрузки сообщений:', error);
        }
    }

    renderGuilds(guilds) {
        const container = document.getElementById('guilds-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        guilds.forEach(guild => {
            const guildEl = UI.createElement('div', {
                className: 'guild-item',
                onClick: () => this.selectGuild(guild),
                title: guild.name
            }, [
                guild.icon 
                    ? UI.createLazyImage(
                        `${CONFIG.CDN_BASE}/icons/${guild.id}/${guild.icon}.png?size=64`,
                        guild.name,
                        'guild-icon'
                      )
                    : UI.createElement('div', { 
                        className: 'guild-icon-placeholder',
                        style: {
                            background: `hsl(${guild.id.charCodeAt(0) % 360}, 70%, 50%)`,
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            width: '48px',
                            height: '48px',
                            fontSize: '18px',
                            fontWeight: 'bold'
                        }
                      }, [guild.name.charAt(0).toUpperCase()])
            ]);
            
            container.appendChild(guildEl);
        });
    }

    renderChannels(channels) {
        const container = document.getElementById('channels-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Только текстовые каналы
        const textChannels = channels.filter(ch => ch.type === 0);
        
        if (textChannels.length === 0) {
            container.appendChild(
                UI.createElement('div', { 
                    className: 'no-channels',
                    style: { color: '#888', padding: '10px', textAlign: 'center' }
                }, ['Нет текстовых каналов'])
            );
            return;
        }
        
        textChannels.forEach(channel => {
            const channelEl = UI.createElement('div', {
                className: 'channel-item',
                onClick: () => this.selectChannel(channel)
            }, [
                UI.createElement('span', { style: { color: '#888', marginRight: '8px' } }, ['#']),
                UI.createElement('span', {}, [channel.name])
            ]);
            
            container.appendChild(channelEl);
        });
    }

    renderMessages(messages) {
        const container = document.getElementById('messages-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (messages.length === 0) {
            container.appendChild(
                UI.createElement('div', { 
                    className: 'no-messages',
                    style: { 
                        textAlign: 'center',
                        padding: '40px',
                        color: '#888'
                    }
                }, [
                    UI.createElement('h3', { style: { marginBottom: '10px' } }, ['Нет сообщений']),
                    UI.createElement('p', {}, ['Напишите первое сообщение!'])
                ])
            );
            return;
        }
        
        // Виртуализация для большого количества сообщений
        const fragment = document.createDocumentFragment();
        const visibleMessages = messages.slice(-30); // Последние 30 сообщений
        
        visibleMessages.forEach(msg => {
            const msgEl = UI.createElement('div', {
                className: 'message-item',
                style: {
                    padding: '8px 16px',
                    marginBottom: '4px',
                    borderRadius: '4px',
                    transition: 'background 0.2s'
                },
                onMouseEnter: (e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)',
                onMouseLeave: (e) => e.currentTarget.style.background = 'transparent'
            }, [
                UI.createElement('div', { style: { display: 'flex', gap: '12px' } }, [
                    UI.createElement('div', { style: { flexShrink: '0' } }, [
                        msg.author.avatar
                            ? UI.createLazyImage(
                                `${CONFIG.CDN_BASE}/avatars/${msg.author.id}/${msg.author.avatar}.png?size=40`,
                                msg.author.username,
                                'message-avatar'
                              )
                            : UI.createElement('div', {
                                className: 'message-avatar-placeholder',
                                style: {
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    background: `hsl(${msg.author.id.charCodeAt(0) % 360}, 70%, 50%)`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '16px'
                                }
                              }, [msg.author.username.charAt(0).toUpperCase()])
                    ]),
                    
                    UI.createElement('div', { style: { flexGrow: '1' } }, [
                        UI.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' } }, [
                            UI.createElement('span', { 
                                style: { 
                                    fontWeight: 'bold',
                                    fontSize: '16px',
                                    color: '#fff'
                                }
                            }, [msg.author.username]),
                            UI.createElement('span', { 
                                style: { 
                                    fontSize: '12px',
                                    color: '#888'
                                }
                            }, [new Date(msg.timestamp).toLocaleTimeString('ru-RU', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            })])
                        ]),
                        UI.createElement('div', { 
                            className: 'message-content',
                            style: { fontSize: '15px', lineHeight: '1.4' }
                        }, [msg.content])
                    ])
                ])
            ]);
            
            fragment.appendChild(msgEl);
        });
        
        container.appendChild(fragment);
        
        // Автопрокрутка вниз
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    async sendCurrentMessage() {
        const input = document.getElementById('message-input');
        const content = input?.value.trim();
        
        if (!content || !this.currentChannel) return;
        
        try {
            await this.client.sendMessage(this.currentChannel.id, content);
            input.value = '';
            
            // Обновляем сообщения
            const messages = await this.client.getChannelMessages(this.currentChannel.id);
            this.state.messages = messages;
            this.renderMessages(messages);
            
        } catch (error) {
            console.error('Ошибка отправки:', error);
            alert('Не удалось отправить сообщение');
        }
    }

    loadStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Основные стили */
            .app-layout {
                display: flex;
                height: 100vh;
                width: 100vw;
                background: var(--bg-primary, #36393f);
                color: var(--text-normal, #dcddde);
            }
            
            /* Панель серверов */
            .servers-panel {
                width: 70px;
                background: var(--bg-secondary, #2f3136);
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 12px 0;
                overflow-y: auto;
            }
            
            .user-profile {
                margin-bottom: 20px;
            }
            
            .user-avatar {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid transparent;
                transition: border-color 0.2s;
            }
            
            .user-avatar:hover {
                border-color: #5865f2;
            }
            
            .guilds-list {
                width: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }
            
            .guild-item {
                cursor: pointer;
                transition: transform 0.2s;
            }
            
            .guild-item:hover {
                transform: scale(1.05);
            }
            
            .guild-icon {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                object-fit: cover;
                transition: border-radius 0.2s;
            }
            
            .guild-item:hover .guild-icon {
                border-radius: 30%;
            }
            
            /* Панель каналов */
            .channels-panel {
                width: 240px;
                background: var(--bg-secondary, #2f3136);
                display: flex;
                flex-direction: column;
                border-right: 1px solid rgba(0,0,0,0.2);
            }
            
            .guild-header {
                padding: 16px;
                font-weight: bold;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                background: rgba(0,0,0,0.1);
            }
            
            .channels-list {
                flex-grow: 1;
                padding: 8px;
                overflow-y: auto;
            }
            
            .channel-item {
                padding: 8px 12px;
                margin: 2px 0;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.2s;
                font-size: 14px;
            }
            
            .channel-item:hover {
                background: rgba(255,255,255,0.05);
            }
            
            /* Окно чата */
            .chat-panel {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                min-width: 0; /* Для правильной работы flex */
            }
            
            .channel-header {
                padding: 16px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                font-size: 16px;
                background: rgba(0,0,0,0.1);
            }
            
            .messages-container {
                flex-grow: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .message-input-wrapper {
                padding: 16px;
                background: rgba(0,0,0,0.1);
                border-top: 1px solid rgba(255,255,255,0.1);
            }
            
            .message-input-wrapper input {
                width: 100%;
                padding: 12px 16px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                color: white;
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s;
            }
            
            .message-input-wrapper input:focus {
                border-color: #5865f2;
            }
            
            .message-input-wrapper input:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .message-input-wrapper button {
                margin-top: 8px;
                width: 100%;
                padding: 10px;
                background: #5865f2;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                transition: background 0.2s;
            }
            
            .message-input-wrapper button:hover:not(:disabled) {
                background: #4752c4;
            }
            
            .message-input-wrapper button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* Адаптивность */
            @media (max-width: 768px) {
                .channels-panel {
                    position: fixed;
                    left: 70px;
                    top: 0;
                    bottom: 0;
                    z-index: 100;
                    transform: translateX(-100%);
                    transition: transform 0.3s;
                }
                
                .channels-panel.active {
                    transform: translateX(0);
                }
            }
            
            /* Прокрутка */
            ::-webkit-scrollbar {
                width: 6px;
            }
            
            ::-webkit-scrollbar-track {
                background: transparent;
            }
            
            ::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.1);
                border-radius: 3px;
            }
            
            ::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.2);
            }
            
            /* Анимации */
            .fade-in {
                animation: fadeIn 0.3s ease;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
        `;
        
        document.head.appendChild(style);
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
let appInstance = null;

async function initializeApp() {
    if (appInstance) return appInstance;
    
    appInstance = new DiscordApp();
    await appInstance.initialize();
    
    // Отображаем серверы после инициализации
    setTimeout(() => {
        appInstance.renderGuilds(appInstance.state.guilds);
    }, 100);
    
    return appInstance;
}

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // Маленькая задержка для показа экрана загрузки
    setTimeout(() => {
        initializeApp().catch(error => {
            console.error('Ошибка запуска приложения:', error);
            document.getElementById('loading').innerHTML = 
                '<div style="color: #ff6b6b; text-align: center;">Ошибка загрузки. Обновите страницу.</div>';
        });
    }, 100);
});

// Экспорт для отладки
window.DiscordApp = DiscordApp;
