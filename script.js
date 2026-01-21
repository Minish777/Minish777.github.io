// Discord API клиент
class DiscordAPIClient {
    constructor(token) {
        this.token = token;
        this.baseURL = 'https://discord.com/api/v10';
        this.headers = {
            'Authorization': token,
            'Content-Type': 'application/json'
        };
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: { ...this.headers, ...options.headers }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        return await response.json();
    }

    // Получение данных пользователя
    async getCurrentUser() {
        return await this.request('/users/@me');
    }

    // Получение серверов
    async getGuilds() {
        return await this.request('/users/@me/guilds');
    }

    // Получение каналов сервера
    async getGuildChannels(guildId) {
        return await this.request(`/guilds/${guildId}/channels`);
    }

    // Получение сообщений канала
    async getChannelMessages(channelId, limit = 50) {
        return await this.request(`/channels/${channelId}/messages?limit=${limit}`);
    }

    // Отправка сообщения
    async sendMessage(channelId, content) {
        return await this.request(`/channels/${channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }

    // Получение участников канала (упрощенно)
    async getChannelMembers(channelId) {
        try {
            const channel = await this.request(`/channels/${channelId}`);
            if (channel.guild_id) {
                const members = await this.request(`/guilds/${channel.guild_id}/members?limit=50`);
                return members;
            }
            return [];
        } catch (error) {
            console.error('Ошибка получения участников:', error);
            return [];
        }
    }
}

// Глобальные переменные
let discordClient = null;
let currentGuildId = null;
let currentChannelId = null;
let currentUser = null;

// Инициализация приложения
async function initApp() {
    // Проверка токена
    const token = localStorage.getItem('discord_token');
    if (!token) {
        window.location.href = 'auth.html';
        return;
    }

    // Создание клиента
    discordClient = new DiscordAPIClient(token);

    try {
        // Загрузка данных пользователя
        currentUser = await discordClient.getCurrentUser();
        updateUserInfo(currentUser);

        // Загрузка серверов
        const guilds = await discordClient.getGuilds();
        displayGuilds(guilds);

        // Скрыть экран загрузки
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');

        // Загрузить настройки
        loadSettings();

    } catch (error) {
        console.error('Ошибка инициализации:', error);
        logout();
    }
}

// Обновление информации о пользователе
function updateUserInfo(user) {
    document.getElementById('username').textContent = user.username;
    document.getElementById('userStatus').textContent = `#${user.discriminator}`;
    
    const avatarEl = document.getElementById('userAvatar');
    if (user.avatar) {
        avatarEl.innerHTML = '';
        const img = document.createElement('img');
        img.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
        img.alt = user.username;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        avatarEl.appendChild(img);
    } else {
        avatarEl.innerHTML = `<i class="fas fa-user"></i>`;
    }
}

// Отображение серверов
function displayGuilds(guilds) {
    const serverList = document.getElementById('serverList');
    serverList.innerHTML = '';

    // Добавить кнопку добавления сервера
    const addServer = document.createElement('div');
    addServer.className = 'server-icon add-server';
    addServer.innerHTML = '<i class="fas fa-plus"></i>';
    addServer.title = 'Добавить сервер';
    addServer.onclick = () => alert('Для добавления сервера используйте официальный Discord клиент');
    serverList.appendChild(addServer);

    // Отобразить серверы
    guilds.forEach(guild => {
        const server = document.createElement('div');
        server.className = 'server-icon';
        server.dataset.guildId = guild.id;
        server.title = guild.name;
        
        if (guild.icon) {
            const img = document.createElement('img');
            img.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
            img.alt = guild.name;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.borderRadius = '50%';
            server.appendChild(img);
        } else {
            server.textContent = guild.name.charAt(0).toUpperCase();
            server.style.background = `hsl(${guild.id.charCodeAt(0) * 360 / 256}, 70%, 50%)`;
        }
        
        server.onclick = () => loadGuildChannels(guild);
        serverList.appendChild(server);
    });
}

// Загрузка каналов сервера
async function loadGuildChannels(guild) {
    currentGuildId = guild.id;
    
    // Обновить заголовок
    document.getElementById('guildHeader').innerHTML = `
        <h3>${guild.name}</h3>
    `;
    
    // Загрузить каналы
    try {
        const channels = await discordClient.getGuildChannels(guild.id);
        displayChannels(channels);
    } catch (error) {
        console.error('Ошибка загрузки каналов:', error);
        alert('Не удалось загрузить каналы сервера');
    }
}

// Отображение каналов
function displayChannels(channels) {
    const channelList = document.getElementById('channelList');
    channelList.innerHTML = '';
    
    // Группировка по категориям
    const categories = {};
    const noCategory = [];
    
    channels.forEach(channel => {
        if (channel.type === 4) { // Категория
            categories[channel.id] = {
                ...channel,
                channels: []
            };
        } else if (channel.type === 0) { // Текстовый канал
            if (channel.parent_id && categories[channel.parent_id]) {
                categories[channel.parent_id].channels.push(channel);
            } else {
                noCategory.push(channel);
            }
        }
    });
    
    // Отобразить каналы без категории
    if (noCategory.length > 0) {
        noCategory.forEach(channel => {
            addChannelItem(channel);
        });
    }
    
    // Отобразить категории и их каналы
    Object.values(categories).forEach(category => {
        if (category.channels.length > 0) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'channel-category';
            
            const header = document.createElement('div');
            header.className = 'category-header';
            header.innerHTML = `
                <span>${category.name.toUpperCase()}</span>
                <i class="fas fa-chevron-down"></i>
            `;
            categoryDiv.appendChild(header);
            
            const channelsContainer = document.createElement('div');
            channelsContainer.className = 'category-channels';
            
            category.channels.forEach(channel => {
                const channelItem = createChannelItem(channel);
                channelsContainer.appendChild(channelItem);
            });
            
            categoryDiv.appendChild(channelsContainer);
            channelList.appendChild(categoryDiv);
            
            // Сворачивание/разворачивание категории
            header.onclick = () => {
                const isHidden = channelsContainer.style.display === 'none';
                channelsContainer.style.display = isHidden ? 'block' : 'none';
                header.querySelector('i').className = isHidden 
                    ? 'fas fa-chevron-down' 
                    : 'fas fa-chevron-up';
            };
        }
    });
}

// Создание элемента канала
function createChannelItem(channel) {
    const channelItem = document.createElement('div');
    channelItem.className = 'channel-item';
    channelItem.dataset.channelId = channel.id;
    channelItem.innerHTML = `
        <i class="fas fa-hashtag"></i>
        <span>${channel.name}</span>
    `;
    
    channelItem.onclick = () => loadChannelMessages(channel);
    return channelItem;
}

function addChannelItem(channel) {
    const channelItem = createChannelItem(channel);
    document.getElementById('channelList').appendChild(channelItem);
}

// Загрузка сообщений канала
async function loadChannelMessages(channel) {
    currentChannelId = channel.id;
    
    // Обновить заголовок
    document.getElementById('chatHeader').innerHTML = `
        <div class="channel-info">
            <i class="fas fa-hashtag"></i>
            <span>${channel.name}</span>
        </div>
    `;
    
    // Активировать поле ввода
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.placeholder = `Написать сообщение в #${channel.name}`;
    messageInput.focus();
    
    // Загрузить сообщения
    try {
        const messages = await discordClient.getChannelMessages(channel.id);
        displayMessages(messages);
        
        // Загрузить участников
        const members = await discordClient.getChannelMembers(channel.id);
        displayMembers(members);
        
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
        document.getElementById('messagesContainer').innerHTML = `
            <div class="error-message">
                <h3>Ошибка загрузки сообщений</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Отображение сообщений
function displayMessages(messages) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <h1>Нет сообщений</h1>
                <p>Будьте первым, кто напишет в этом канале!</p>
            </div>
        `;
        return;
    }
    
    // Отсортировать по времени (старые сверху)
    messages.reverse().forEach(message => {
        const messageElement = createMessageElement(message);
        messagesContainer.appendChild(messageElement);
    });
    
    // Прокрутить вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Создание элемента сообщения
function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageDiv.innerHTML = `
        <div class="message-avatar">
            ${message.author.avatar 
                ? `<img src="https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png" 
                     alt="${message.author.username}">`
                : `<span>${message.author.username.charAt(0).toUpperCase()}</span>`
            }
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-author">${message.author.username}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${escapeHtml(message.content)}</div>
        </div>
    `;
    
    return messageDiv;
}

// Отображение участников
function displayMembers(members) {
    const membersList = document.getElementById('membersList');
    membersList.innerHTML = '';
    
    if (members.length === 0) {
        membersList.innerHTML = '<p class="no-members">Нет участников</p>';
        return;
    }
    
    members.forEach(member => {
        const memberItem = document.createElement('div');
        memberItem.className = 'member-item';
        
        memberItem.innerHTML = `
            <div class="member-avatar">
                ${member.user.avatar 
                    ? `<img src="https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png" 
                         alt="${member.user.username}">`
                    : `<span>${member.user.username.charAt(0).toUpperCase()}</span>`
                }
            </div>
            <span class="member-name">${member.user.username}</span>
        `;
        
        membersList.appendChild(memberItem);
    });
}

// Отправка сообщения
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content || !currentChannelId) return;
    
    try {
        await discordClient.sendMessage(currentChannelId, content);
        input.value = '';
        
        // Обновить сообщения
        const messages = await discordClient.getChannelMessages(currentChannelId);
        displayMessages(messages);
        
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        alert('Не удалось отправить сообщение');
    }
}

// Настройки
function loadSettings() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.getElementById('themeSelect').value = theme;
    applyTheme(theme);
    
    const notifications = localStorage.getItem('notifications') !== 'false';
    document.getElementById('notificationsToggle').checked = notifications;
}

function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Модальное окно настроек
function openSettings() {
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settingsModal').classList.add('hidden');
}

// Выход
function logout() {
    localStorage.removeItem('discord_token');
    window.location.href = 'auth.html';
}

// Вспомогательные функции
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', initApp);

// Отправка сообщения по Enter
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Кнопка отправки
document.getElementById('sendBtn').addEventListener('click', sendMessage);

// Обработчики настроек
document.getElementById('themeSelect').addEventListener('change', (e) => {
    applyTheme(e.target.value);
});

document.getElementById('notificationsToggle').addEventListener('change', (e) => {
    localStorage.setItem('notifications', e.target.checked);
});

// Закрытие модального окна при клике вне его
window.addEventListener('click', (e) => {
    const modal = document.getElementById('settingsModal');
    if (e.target === modal) {
        closeSettings();
    }
});
