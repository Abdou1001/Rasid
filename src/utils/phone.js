/**
 * أداة معالجة وتوحيد أرقام الهواتف اليمنية
 * تدعم الصيغة المحلية: 7XXXXXXXX (9 أرقام)
 * والصيغة الدولية: 9677XXXXXXXX / +9677XXXXXXXX / 009677XXXXXXXX
 */

export const normalizePhone = (phone) => {
    if (!phone || typeof phone !== "string") return "";

    // إزالة الفراغات والرموز الخاصة
    let cleaned = phone.trim().replace(/[\s\-\(\)\+]/g, "");

    // إزالة البادئة الدولية 00967 أو 967
    if (cleaned.startsWith("00967")) {
        cleaned = cleaned.slice(5);
    } else if (cleaned.startsWith("967")) {
        cleaned = cleaned.slice(3);
    }

    // إزالة الصفر المسبوق إن وجد مثل 07XXXXXXXX
    if (cleaned.startsWith("0") && cleaned.length === 10) {
        cleaned = cleaned.slice(1);
    }

    return cleaned;
};

export const isValidYemeniPhone = (phone) => {
    const normalized = normalizePhone(phone);
    // الأرقام النقالة في اليمن تبدأ بـ 7 وتتكون من 9 أرقام (70, 71, 73, 77, 78)
    return /^7[0-9]{8}$/.test(normalized);
};

export default {
    normalizePhone,
    isValidYemeniPhone,
};
