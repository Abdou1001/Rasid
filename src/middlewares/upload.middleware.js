import multer from "multer";

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


// Upload multiple images
export const uploadMultipleImages = (fieldName, maxCount = 5) =>
    upload.array(fieldName, maxCount);
