// OAuth авторизация
function startOAuth() {
    const clientId = 'ВАШ_CLIENT_ID'; // Зарегистрируйте приложение на https://discord.com/developers/applications
    const redirectUri = encodeURIComponent(window.location.origin + '/auth.html');
    const scopes = encodeURIComponent('identify guilds messages.read');
    
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scopes}`;
    
    window.location.href = oauthUrl;
}

// Обработка OAuth callback
function handleOAuthCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    
    if (token) {
        localStorage.setItem('discord_token', token);
        window.location.href = 'index.html';
    }
}

// Вход по токену
function loginWithToken() {
    const tokenInput = document.getElementById('tokenInput');
    const token = tokenInput.value.trim();
    
    if (!token) {
        alert('Введите токен');
        return;
    }
    
    // Проверка формата токена
    if (!token.match(/^[A-Za-z0-9_-]{59}$/)) {
        alert('Неверный формат токена. Токен должен содержать 59 символов.');
        return;
    }
    
    // Проверка токена
    checkToken(token).then(isValid => {
        if (isValid) {
            localStorage.setItem('discord_token', token);
            window.location.href = 'index.html';
        } else {
            alert('Неверный токен. Проверьте правильность ввода.');
        }
    }).catch(error => {
        console.error('Ошибка проверки токена:', error);
        alert('Ошибка проверки токена. Проверьте подключение к интернету.');
    });
}

// Проверка токена
async function checkToken(token) {
    try {
        const response = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': token }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

// Показать/скрыть токен
function toggleTokenVisibility() {
    const input = document.getElementById('tokenInput');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// Инициализация страницы авторизации
function initAuthPage() {
    // Проверить, не авторизован ли уже пользователь
    if (localStorage.getItem('discord_token')) {
        window.location.href = 'index.html';
        return;
    }
    
    // Обработать OAuth callback если есть хэш
    if (window.location.hash.includes('access_token')) {
        handleOAuthCallback();
    }
    
    // Обработчик Enter для поля токена
    document.getElementById('tokenInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginWithToken();
        }
    });
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', initAuthPage);
