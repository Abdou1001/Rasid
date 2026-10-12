export const getPagination = (page = 1, limit = 10) => {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    const from = (parsedPage - 1) * parsedLimit;
    const to = from + parsedLimit - 1;

    return {
        page: parsedPage,
        limit: parsedLimit,
        from,
        to,
    };
};

export const buildPagination = (totalCount = 0, page = 1, limit = 10) => {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const totalPages = Math.ceil(totalCount / parsedLimit) || 1;

    return {
        total: totalCount,
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPrevPage: parsedPage > 1,
    };
};

export default {
    getPagination,
    buildPagination,
};
