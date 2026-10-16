import multer from "multer";
import ApiError from "../utils/ApiError.js";


// These types allow to upload
const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

// Save in RAM temporarily
const storage = multer.memoryStorage();

// Allow images only
const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
        return cb(null, true);
    }

    return cb(new Error("يسمح فقط برفع صور بصيغة JPG أو PNG أو WEBP"), false);
};

// Configure the multer
const upload = multer({
    storage,
    // Fliter
    fileFilter,
    // Max file size (5MB)
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

// Upload single image
export const uploadSingleImage = (fieldName) =>
    upload.single(fieldName);

// Upload multiple images (supports 'images', 'image', or any field name up to maxCount)
export const uploadMultipleImages = (fieldName = "images", maxCount = 5) => {
    const uploadAny = upload.any();

    return (req, res, next) => {
        uploadAny(req, res, (err) => {
            if (err) return next(err);
            if (!req.files) req.files = [];

            if (req.files.length > maxCount) {
                return next(new ApiError(`لا يمكن رفع أكثر من ${maxCount} صور في الطلب الواحد`, 400));
            }

            next();
        });
    };
};
