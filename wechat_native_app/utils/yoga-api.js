/*----------------------------------------------------
 * utils/yoga-api.js  ◇ SmartYoga Mini-Program
 * - Handles uploading user videos for pose scoring.
 * - Provides URLs for resulting skeleton images.
 * - Downloads skeleton images to local temporary paths.
 *--------------------------------------------------*/

/** 后端 API 根域名 (HTTPS, whitelisted in WeChat admin panel) */
export const API_BASE_URL = 'https://api.yogasmart.cn';

/** Backend route for pose scoring and skeleton image generation. */
const SCORE_API_PATH = '/detect-pose-file'; // Current endpoint

/** Common headers for API requests (e.g., for auth tokens). */
const COMMON_HEADERS = {};

/* ---------- Utility Functions ---------- */

/**
 * Safely parses a JSON string.
 * @param {string} str - The string to parse.
 * @returns {object|null} The parsed object or null if parsing fails.
 */
function safeJSONParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * Builds a full URL from a base and a path.
 * @param {string} base - The base URL.
 * @param {string} path - The path component.
 * @returns {string} The full URL.
 */
function buildUrl(base, path) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Uploads a video file and gets the pose scoring results.
 * This function initiates a file upload and returns a Promise.
 * The `UploadTask` object, used for managing the upload (e.g., aborting),
 * is attached as a property named `uploadTask` to the returned Promise.
 *
 * Includes enhanced error logging for HTTP errors and invalid JSON responses.
 *
 * @param {string} filePath - The temporary path of the video file (e.g., from wx.chooseMedia).
 * @param {string} poseId - The ID of the current pose, used by the backend for classification.
 * @returns {Promise<object>} A Promise that resolves with the scoring result object from the backend
 *                            (typically `{ score: number, skeletonUrl: string, feedback?: string }`).
 *                            The Promise object will have an `uploadTask` property attached to it,
 *                            which is the `wx.UploadTask` instance.
 *                            Example usage:
 *                            ```javascript
 *                            const uploadPromise = uploadAndScore(videoPath, 'pose123');
 *                            uploadPromise.uploadTask.onProgressUpdate(res => console.log(res.progress));
 *                            uploadPromise.then(result => console.log(result))
 *                                       .catch(error => console.error(error));
 *                            // To abort: uploadPromise.uploadTask.abort();
 *                            ```
 */
export function uploadAndScore(filePath, poseId) {
  const url = buildUrl(API_BASE_URL, SCORE_API_PATH);

  // Create the promise
  const promise = new Promise((resolve, reject) => {
    const task = wx.uploadFile({ // wx.uploadFile is called, task is created
      url,
      filePath,
      name: 'file',          // Backend field name for the file
      header: COMMON_HEADERS,
      formData: { poseId },
      timeout: 60_000,       // 60s timeout
      success: ({ statusCode, data }) => {
        if (statusCode !== 200) {
          const errorMsg = `HTTP Error: ${statusCode}. URL: ${url}`;
          console.error(errorMsg, 'Response data:', data); // Enhanced logging
          reject(new Error(errorMsg + ` Data: ${data}`));
          return;
        }
        const json = safeJSONParse(data);
        if (json) {
          resolve(json); // Expected to be { score, skeletonUrl, feedback, ... }
        } else {
          const errorMsg = `Invalid JSON response. URL: ${url}, Status: ${statusCode}`;
          console.error(errorMsg, 'Raw data:', data); // Enhanced logging
          reject(new Error(errorMsg + ` Raw Data: ${data}`));
        }
      },
      fail: (err) => {
        console.error('wx.uploadFile failed. URL:', url, 'Error:', err); // Enhanced logging
        reject(err); // Reject with the original error object
      },
    });
    // Attach the task to the promise object so it can be accessed by the caller
    promise.uploadTask = task;
  });

  return promise; // Return the promise, which now has the task attached.
}

/**
 * Downloads a skeleton image to a local temporary path.
 * @param  {string} url - The public URL of the skeleton image (e.g., from backend).
 * @return {Promise<string>} A promise that resolves to the temporary file path.
 */
export function downloadSkeletonImage(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: ({ statusCode, tempFilePath }) =>
        statusCode === 200
          ? resolve(tempFilePath)
          : reject(new Error(`下载失败: HTTP ${statusCode}`)),
      fail: reject, // err object from wx.downloadFile
    });
  });
}

/* ------------------------------------------------------------------
 * Compatibility for older code: 'scorePose' is an alias for 'uploadAndScore'.
 * -----------------------------------------------------------------*/
export const scorePose = uploadAndScore;
