// smart-yoga-beginner-app/services/yoga-api.ts converted to wechat_native_app/utils/yoga-api.js

/**
 * @typedef {Object} Pose
 * @property {string} id
 * @property {number} duration
 * @property {number} [breathCount]
 * @property {string} [audioGuide] // This is a filename, e.g., "pose_1_mountain_tadasa.mp3"
 * @property {{en: string, zh: string}} instructions
 * @property {{en: string, zh: string}} [transitionHint]
 */

/**
 * @typedef {Object} Sequence
 * @property {string} id
 * @property {{en: string, zh: string}} name
 * @property {number} difficulty // e.g., 1 for beginner, 2 for intermediate
 * @property {number} duration // Total sequence duration in seconds
 * @property {{en: string, zh: string}} description
 * @property {Pose[]} poses
 * @property {{introduction: string, backgroundMusic: string}} audioGuide // Filenames/paths
 */

/**
 * @typedef {Object} PoseScoreResponse
 * @property {number} code // 0 for success
 * @property {number} score
 * @property {string} feedback
 * @property {string[]} suggestions
 * @property {string} [message]
 */

// --- Mock Data and Functions ---
// NOTE: This mock data does NOT currently align with the JSDoc definitions above.
// It would need to be updated in a separate step to match the new type definitions.
const mockSequences = {
  beginner: {
    id: 'seq_beginner',
    name: '初学者序列', // Should be {en: "Beginner Sequence", zh: "初学者序列"}
    level: 'beginner', // Should be difficulty: 1
    // Missing: duration (total), description, audioGuide (object) for Sequence
    poses: [
      // Pose objects here also need to align with the new Pose JSDoc
      // e.g., instructions should be {en: "...", zh: "..."}
      // image_url is not in new JSDoc, audio_url should be audioGuide (filename)
      { id: 'pose_1', name: '山式', instructions: '双脚并拢站立，身体挺直，双臂自然垂放于身体两侧。保持均匀呼吸。', duration: 30, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/mountain.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/mountain_pose_guide.mp3' },
      { id: 'pose_2', name: '下犬式', instructions: '从山式开始，身体前屈，双手撑地，双脚向后移动，使身体呈倒V形。', duration: 45, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/downward_dog.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/downward_dog_guide.mp3' },
      { id: 'pose_3', name: '战士一式', instructions: '从下犬式开始，右脚向前迈一大步至双手之间，弯曲右膝，左腿伸直，双臂向上举过头顶。', duration: 40, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/warrior_one.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/warrior1_guide.mp3' },
      { id: 'pose_4', name: '树式', instructions: '山式站立，弯曲右膝，将右脚掌贴在左大腿内侧。双手在胸前合十。', duration: 35, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/tree.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/tree_pose_guide.mp3' },
    ],
  },
  intermediate: {
    id: 'seq_intermediate',
    name: '中级序列',
    level: 'intermediate', // Should be difficulty: 2
    poses: [
      { id: 'pose_5', name: '三角式', instructions: '双脚分开约一腿长，右脚向外转90度，左脚稍内扣。双臂侧平举，身体向右侧弯曲。', duration: 35, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/triangle.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/triangle_guide.mp3' },
      { id: 'pose_6', name: '半月式', instructions: '从三角式开始，右手在右脚前方撑地，抬起左腿，使身体和左腿平行于地面。', duration: 50, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/half_moon.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/halfmoon_guide.mp3' },
      { id: 'pose_7', name: '反向战士式', instructions: '从战士二式开始，身体向后倾，左手沿着左腿向下滑动，右臂向上伸展。', duration: 40, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/reverse_warrior.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/reverse_warrior_guide.mp3' },
    ],
  },
   advanced: {
    id: 'seq_advanced',
    name: '高级序列',
    level: 'advanced', // Should be difficulty: 3
    poses: [
      { id: 'pose_8', name: '头倒立', instructions: '谨慎练习。双手十指交叉抱住头部后方，小臂撑地，头顶轻触地面，双腿向上伸直。', duration: 60, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/headstand.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/headstand_guide.mp3' },
      { id: 'pose_9', name: '手倒立', instructions: '极具挑战性。双手撑地，与肩同宽，运用核心力量将双腿向上踢起并控制平衡。', duration: 30, image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/handstand.jpg', audio_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/handstand_guide.mp3' },
    ],
  }
};

/**
 * Simulates calling a WeChat cloud function.
 * @param {string} name - The name of the cloud function.
 * @param {object} data - The data to pass to the cloud function.
 * @returns {Promise<object>} - The result from the cloud function.
 */
async function mockCloudFunction(name, data) {
  console.log(`Mock Cloud Function Called: ${name} with data:`, data);
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (name === 'getSequence') {
        // The 'level' parameter here (e.g., 'beginner') would need to be mapped to 'difficulty' (e.g., 1)
        // if the mockSequences data structure was updated.
        const sequence = mockSequences[data.level]; 
        if (sequence) {
          resolve({ result: sequence, errMsg: 'ok' });
        } else {
          reject({ errMsg: 'Sequence not found', errCode: -1 });
        }
      } else if (name === 'scorePose') {
        // This mock response needs to align with PoseScoreResponse JSDoc
        resolve({ 
          result: { // This structure should match PoseScoreResponse
            code: 0,
            score: Math.floor(Math.random() * 40) + 60, // Score between 60-99
            feedback: '姿势标准度有待提高，请关注核心稳定性。',
            suggestions: ['注意呼吸节奏', '尝试保持更久'],
            // videoAnalysisUrl is not in PoseScoreResponse, message is optional
          }, 
          errMsg: 'ok' 
        });
      } else {
        reject({ errMsg: 'Unknown function name', errCode: -2 });
      }
    }, 1000); // Simulate network delay
  });
}

/**
 * Fetches yoga sequence data.
 * In a real app, this would call a backend API or a cloud function.
 * @param {string} level - The difficulty level of the sequence (e.g., "beginner"). 
 *                         This 'level' (string) would ideally be mapped to a 'difficulty' (number)
 *                         if the backend expects a number.
 * @returns {Promise<Sequence>} A promise that resolves to the sequence data.
 */
async function loadPoseSequence(level) {
  console.log(`Requesting pose sequence for level: ${level}`);
  // In a real WeChat Mini Program, you would use wx.cloud.callFunction
  // For now, we use the mock function for testing locally or if not using cloud functions.
  try {
    // const response = await wx.cloud.callFunction({ name: 'getSequence', data: { level } }); // or data: {difficulty: mapLevelToDifficulty(level)}
    const response = await mockCloudFunction('getSequence', { level });
    if (response.errMsg === 'ok' && response.result) {
      return response.result; // This result should conform to the Sequence JSDoc
    } else {
      console.error('Failed to load sequence from cloud function:', response.errMsg);
      throw new Error(`Failed to load sequence: ${response.errMsg}`);
    }
  } catch (error) {
    console.error('Error loading pose sequence:', error);
    const sequence = mockSequences[level];
    if (sequence) {
      console.warn(`Falling back to local mock data for level: ${level}`);
      return sequence; // This result should conform to the Sequence JSDoc
    }
    throw new Error(`Failed to load sequence for level ${level}: ${error.message}`);
  }
}

/**
 * Submits a video of a yoga pose for scoring.
 * In a real app, this would upload the video and then call a backend API.
 * @param {string} poseId - The ID of the pose.
 * @param {string} videoPath - The local path to the video file.
 * @returns {Promise<PoseScoreResponse>} A promise that resolves to the scoring result.
 */
async function scorePoseVideo(poseId, videoPath) {
  console.log(`Scoring video for pose ${poseId} at path: ${videoPath}`);
  
  try {
    const mockFileID = `mock-cloud://user-videos/${Date.now()}-${poseId}.mp4`;
    console.log('Mock video upload successful, mockFileID:', mockFileID);

    const scoreResponse = await mockCloudFunction('scorePose', { poseId, videoFileID: mockFileID });

    if (scoreResponse.errMsg === 'ok' && scoreResponse.result) {
      return scoreResponse.result; // This result should conform to PoseScoreResponse JSDoc
    } else {
      console.error('Failed to score pose from cloud function:', scoreResponse.errMsg);
      throw new Error(`Failed to score pose: ${scoreResponse.errMsg}`);
    }
  } catch (error) {
    console.error('Error scoring pose video:', error);
    throw new Error(`Failed to score pose video for ${poseId}: ${error.message}`);
  }
}

module.exports = {
  loadPoseSequence,
  scorePoseVideo
};
