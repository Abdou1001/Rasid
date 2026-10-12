export const sendSuccess = (res, {
    statusCode = 200,
    message,
    results,
    pagination,
} = {}) => {
    const response = { status: "success" };
    if (message !== undefined) response.message = message;
    if (pagination !== undefined) response.pagination = pagination;
    if (results !== undefined) response.results = results;
    return res.status(statusCode).json(response);
};

export default sendSuccess;
