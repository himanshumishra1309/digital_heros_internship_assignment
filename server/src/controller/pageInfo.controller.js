import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fetchPage } from "../script/fetchPage.js";

const fetchPageInfo = asyncHandler(async(req, res) => {
  const {url} = req.body;

  if(!url){
    throw new ApiError(400, "Url is required");
  }

  const data  = await fetchPage(url);

  if(!data){
    throw new ApiError(500, "Unable to fetch and parse the Url's data");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      data,
      "Page fetched successfully"
    )
  )
})

export {fetchPageInfo}