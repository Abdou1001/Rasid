export const CACHE_KEYS = {
    // Hospital
    HOSPITAL: "hospital",

    // Departments
    DEPARTMENTS: "departments",
    DEPARTMENT: (id) => `department:${id}`,

    // Doctors
    DOCTORS: "doctors",
    DOCTOR: (id) => `doctor:${id}`,

    // Doctor Schedules
    DOCTOR_SCHEDULES: "doctor-schedules",
    DOCTOR_SCHEDULE: (id) => `doctor-schedule:${id}`,

    // Doctor & Department Relations
    DOCTOR_DEPARTMENT: (id) => `doctor-department:${id}`,
    DOCTOR_DEPARTMENTS: (doctorId) => `doctor:${doctorId}:departments`,
    DEPARTMENT_DOCTORS: (departmentId) => `department:${departmentId}:doctors`,

    // Ads
    ADS: "ads",
    AD: (id) => `ad:${id}`,

    // BANK ACCOUNTS
    BANK_ACCOUNTS: "bank-accounts",
    BANK_ACCOUNT: (id) => `bank-account:${id}`,

    // DASHBOARD
    DASHBOARD: "dashboard-statistics",
    APPOINTMENTS_CHART: "appointments-chart",
};

export const CACHE_TTL = {
    HOSPITAL: 86400, // 24 ساعة
    DEPARTMENTS: 86400, // 24 ساعة
    DOCTORS: 43200, // 12 ساعة
    DOCTOR_DEPARTMENTS: 86400, // 24 ساعة
    DOCTOR_SCHEDULES: 86400, // 24 ساعة
    DOCTOR_SCHEDULE: 86400, // 24 ساعة
    ADS: 21600, // 6 ساعات
    BANK_ACCOUNTS: 60 * 60 * 6, // 6 ساعات
    DASHBOARD: 300, // 5 دقائق
};
