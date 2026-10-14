/**
 * مفاتيح وأوقات انتهاء صلاحية الكاش لنظام إدارة الهواتف المفقودة
 */

export const CACHE_KEYS = {
    // المستخدمون
    USER: (id) => `users:${id}`,
    USERS_LIST: (page, limit) => `users:list:page:${page}:limit:${limit}`,

    // أقسام الشرطة
    POLICE_STATIONS: "police_stations:all",
    POLICE_STATION: (id) => `police_stations:${id}`,
    POLICE_STATIONS_LIST: (queryString = "default") => `police_stations:list:${queryString}`,

    // إحصائيات لوحة التحكم
    DASHBOARD_STATS: "dashboard:stats",
};

export const CACHE_TTL = {
    USER: 3600, // ساعة واحدة
    USERS_LIST: 1800, // 30 دقيقة
    POLICE_STATIONS: 86400, // 24 ساعة
    DASHBOARD_STATS: 300, // 5 دقائق
};

export default {
    CACHE_KEYS,
    CACHE_TTL,
};
