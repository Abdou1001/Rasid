import AsyncHandler from "express-async-handler";
import { sendSuccess } from "../../utils/response.js";
import { getClearCookieOptions } from "../../utils/token.js";

// @Desc تسجيل الخروج ومسح ملف تعريف الارتباط
// @Route POST /api/auth/logout
// @Access Private / Public
export const logout = AsyncHandler(async (req, res) => {
    res.clearCookie("token", getClearCookieOptions());

    return sendSuccess(res, {
        statusCode: 200,
        message: "تم تسجيل الخروج بنجاح",
    });
});

export default logout;
