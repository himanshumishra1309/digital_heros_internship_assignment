import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fetchPage } from "../script/fetchPage.js";
import { cache, normalizeUrl } from "../script/cache.js";

const fetchPageInfo = asyncHandler(async (req, res) => {
  const { url } = req.body;

  if (!url) {
    throw new ApiError(400, "Url is required");
  }

  const cacheKey = normalizeUrl(url);
  const cached = cache.get(cacheKey);

  if (cached) {
    return res.status(200).json(
      new ApiResponse(200, { ...cached, cached: true }, "Page fetched successfully (cached)")
    );
  }

  const data = await fetchPage(url);
  cache.set(cacheKey, data);

  return res.status(200).json(
    new ApiResponse(200, { ...data, cached: false }, "Page fetched successfully")
  );
});

export { fetchPageInfo };