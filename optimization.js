// Оптимизации для работы в РФ
class RUOptimizer {
    static init() {
        // Кэширование DNS
        this.prefetchDNS();
        
        // Предзагрузка критичных ресурсов
        this.preloadResources();
        
        // Оптимизация для медленных соединений
        this.optimizeForSlowConnections();
        
        // Сжатие данных
        this.enableCompression();
    }
    
    static prefetchDNS() {
        const domains = [
            'discord.com',
            'cdn.discordapp.com',
            'media.discordapp.net'
        ];
        
        domains.forEach(domain => {
            const link = document.createElement('link');
            link.rel = 'dns-prefetch';
            link.href = `https://${domain}`;
            document.head.appendChild(link);
        });
    }
    
    static preloadResources() {
        // Предзагрузка шрифтов (если используются)
        const preloads = [
            // Можно добавить шрифты если нужны
        ];
        
        preloads.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = resource.as;
            link.href = resource.href;
            document.head.appendChild(link);
        });
    }
    
    static optimizeForSlowConnections() {
        // Определение медленного соединения
        if (navigator.connection) {
            const connection = navigator.connection;
            const isSlow = connection.effectiveType === '2g' || 
                          connection.effectiveType === '3g' ||
                          connection.downlink < 1.0; // < 1 Mbps
            
            if (isSlow) {
                // Включаем режим для медленного интернета
                localStorage.setItem('low_bandwidth_mode', 'true');
                
                // Уменьшаем качество изображений
                window.LOW_BANDWIDTH = true;
                
                // Отключаем анимации
                document.documentElement.style.setProperty('--animation-duration', '0s');
            }
        }
    }
    
    static enableCompression() {
        // Используем WebP если поддерживается
        const supportsWebP = () => {
            const canvas = document.createElement('canvas');
            if (canvas.getContext && canvas.getContext('2d')) {
                return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
            }
            return false;
        };
        
        window.USE_WEBP = supportsWebP();
    }
    
    static getOptimizedImageUrl(url, size = 64) {
        if (!url) return url;
        
        // Добавляем параметры для оптимизации
        let optimizedUrl = url;
        
        if (window.LOW_BANDWIDTH) {
            size = Math.floor(size * 0.7); // Уменьшаем размер
        }
        
        if (!optimizedUrl.includes('?')) {
            optimizedUrl += '?';
        } else {
            optimizedUrl += '&';
        }
        
        optimizedUrl += `size=${size}`;
        
        // Пробуем WebP если поддерживается
        if (window.USE_WEBP && !optimizedUrl.includes('format=')) {
            optimizedUrl += '&format=webp';
        }
        
        // Добавляем параметр качества для JPEG
        if (optimizedUrl.includes('.jpg') || optimizedUrl.includes('.jpeg')) {
            optimizedUrl += '&quality=80';
        }
        
        return optimizedUrl;
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    RUOptimizer.init();
});
