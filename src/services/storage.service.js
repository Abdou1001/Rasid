import crypto from "crypto";
import { supabase } from "../config/supabase.js";

/**
 * توليد اسم ملف آمن وفريد للصور
 */
export const generateImageFileName = (originalMimetype = "image/jpeg") => {
    const extension = originalMimetype.split("/")[1] || "jpeg";
    const uniqueId = crypto.randomUUID();
    return `${uniqueId}.${extension}`;
};

/**
 * رفع ملف صورة إلى حاوية Supabase Storage
 */
export const uploadImage = async (bucket, filePath, buffer, contentType) => {
    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, buffer, {
            contentType,
            upsert: false,
        });

    if (error) {
        throw new Error(`فشل رفع الصورة إلى التخزين: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

    return {
        path: filePath,
        publicUrl: publicUrlData?.publicUrl || filePath,
    };
};

/**
 * استرجاع الرابط العام للصورة
 */
export const getPublicUrl = (bucket, filePath) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data?.publicUrl || filePath;
};

/**
 * حذف ملف واحد من التخزين
 */
export const deleteImage = async (bucket, filePath) => {
    try {
        const { error } = await supabase.storage.from(bucket).remove([filePath]);
        if (error) {
            console.error(`⚠️ تعذر حذف الملف [${filePath}] من الحاوية [${bucket}]:`, error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`⚠️ خطأ استثنائي أثناء حذف الملف [${filePath}]:`, err.message);
        return false;
    }
};

/**
 * التراجع عن رفع الملفات وحذفها عند فشل العمليات اللاحقة (Compensating Cleanup / Rollback)
 */
export const rollbackUploadedImages = async (bucket, filePaths = []) => {
    if (!filePaths || filePaths.length === 0) return true;

    try {
        const { error } = await supabase.storage.from(bucket).remove(filePaths);
        if (error) {
            console.error(`⚠️ فشل التراجع عن رفع الصور في الحاوية [${bucket}]:`, error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`⚠️ خطأ استثنائي أثناء تنفيذ rollback للصور:`, err.message);
        return false;
    }
};

export default {
    generateImageFileName,
    uploadImage,
    getPublicUrl,
    deleteImage,
    rollbackUploadedImages,
};
