/*----------------------------------------------------
 * utils/yoga-api.js  ◇ SmartYoga Mini-Program
 * - 上传用户视频 → 获取姿势评分 & 骨架图 URL
 * - 下载骨架图到本地 temp 路径
 *--------------------------------------------------*/

/** 后端 API 根域名 —— 必须 https 且已在小程序“服务器域名”白名单 */
export const API_BASE_URL = 'https://api.yogasmart.cn';

/** 后端路由，如有调整改这一行即可 */
const SCORE_API_PATH = '/api/score_pose';

/** 鉴权 / 公共头部，可在此注入 token、Cookie 等 */
const COMMON_HEADERS = {};

/* ---------- 工具函数 ---------- */
function safeJSONParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function buildUrl(base, path) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * 上传视频并获取评分
 * @param {string} filePath  wx.chooseMedia 返回的临时视频路径
 * @param {string} poseId    当前姿势 ID（后端用来分类）
 * @returns {Promise<{score:number, skeletonUrl:string}>}
 */
export function uploadAndScore(filePath, poseId) {
  const url = buildUrl(API_BASE_URL, SCORE_API_PATH);

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name: 'file',          // 后端字段名
      header: COMMON_HEADERS,
      formData: { poseId },
      timeout: 60_000,       // 60s 超时
      success: ({ statusCode, data }) => {
        if (statusCode !== 200) {
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }
        const json = safeJSONParse(data);
        json ? resolve(json)
             : reject(new Error('后端返回非 JSON'));
      },
      fail: reject,
    });
  });
}

/**
 * 下载骨架图到本地临时路径
 * @param  {string} url  后端返回的公开 URL
 * @return {Promise<string>} tempFilePath
 */
export function downloadSkeletonImage(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success: ({ statusCode, tempFilePath }) =>
        statusCode === 200
          ? resolve(tempFilePath)
          : reject(new Error(`下载失败: HTTP ${statusCode}`)),
      fail: reject,
    });
  });
}

/* ------------------------------------------------------------------
 * 兼容旧代码：保留旧函数名 `scorePose`
 * -----------------------------------------------------------------*/
export const scorePose = uploadAndScore;
