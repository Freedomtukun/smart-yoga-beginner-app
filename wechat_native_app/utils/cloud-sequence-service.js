/**
 * @typedef {Object} Pose
 * @property {string} id
 * @property {number} duration
 * @property {number} [breathCount]
 * @property {string} [audioGuide] // This is a filename, e.g., "pose_1_mountain_tadasa.mp3"
 * @property {{en: string, zh: string}} instructions
 * @property {{en: string, zh: string}} [transitionHint]
 * @property {string} [image_url] // Added by processSequenceData
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

const COS_BASE = "https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/";
const sequenceCache = {}; // Simple in-memory cache

/**
 * Maps a relative resource path to a full COS URL.
 * @param {string} path - The resource path.
 * @param {'generic' | 'audio' | 'pose_image' | 'pose_audio'} [type='generic'] - The type of resource, to help apply specific mapping rules.
 * @returns {string} The full URL.
 */
function mapResourceUrl(path, type = 'generic') {
  if (!path) return ''; // Return empty if path is undefined or empty
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  switch (type) {
    case 'pose_image': // Expects pose.id as path
      return `${COS_BASE}images/poses/${path}.jpg`;
    case 'pose_audio': // Expects pose.audioGuide (filename) as path
      return `${COS_BASE}audio/poses/${path}`;
    case 'audio': // Generic audio like background music or intro
      if (path.startsWith("audio/")) { // Already has audio/ prefix
          return COS_BASE + path;
      }
      return `${COS_BASE}audio/${path}`; // Assuming it's a filename under a general audio folder
    default: // Generic path, could be an image or other asset
      // If it's a bare filename for general audio, prefix with audio/
      if (!path.includes('/') && path.endsWith('.mp3')) {
        return `${COS_BASE}audio/${path}`;
      }
      // If it's an image path that's not a special pose_image ID
      if (path.startsWith("images/")) {
          return COS_BASE + path;
      }
      // Fallback for other generic paths - might need more rules
      return COS_BASE + path; 
  }
}

/**
 * Processes the raw sequence JSON by mapping resource URLs.
 * @param {object} sequenceJson - The raw sequence data from COS.
 * @returns {Sequence} The processed sequence data with full URLs.
 */
function processSequenceData(sequenceJson) {
  if (!sequenceJson) return null;

  const processed = { ...sequenceJson }; // Shallow copy

  if (processed.poses && Array.isArray(processed.poses)) {
    processed.poses = processed.poses.map(pose => {
      const newPose = { ...pose };
      if (newPose.audioGuide) {
        newPose.audioGuide = mapResourceUrl(newPose.audioGuide, 'pose_audio');
      }
      // The pose.id is used to generate the image_url
      // The original JSDoc for Pose didn't have image_url, but it's a common requirement.
      // The SequenceScreen's JS used image_url from a mock.
      // Here, we generate it based on pose.id, assuming pose.id is the image filename base.
      newPose.image_url = mapResourceUrl(newPose.id, 'pose_image');
      return newPose;
    });
  }

  if (processed.audioGuide && typeof processed.audioGuide === 'object') {
    const newAudioGuide = { ...processed.audioGuide };
    if (newAudioGuide.introduction) {
      newAudioGuide.introduction = mapResourceUrl(newAudioGuide.introduction, 'audio');
    }
    if (newAudioGuide.backgroundMusic) {
      newAudioGuide.backgroundMusic = mapResourceUrl(newAudioGuide.backgroundMusic, 'audio');
    }
    processed.audioGuide = newAudioGuide;
  }
  
  // Ensure the returned object matches the Sequence JSDoc structure.
  // The input sequenceJson might have slightly different field names or structures
  // than the final Sequence type. This function is the place to align them.
  // For now, assuming sequenceJson is already close to Sequence structure.
  return processed;
}

/**
 * Fetches, processes, and caches a yoga sequence.
 * @param {'beginner' | 'intermediate' | 'advanced'} level - The difficulty level.
 * @returns {Promise<Sequence>} A promise that resolves to the processed sequence data.
 */
async function getProcessedSequence(level) {
  if (sequenceCache[level]) {
    console.log(`Returning cached sequence for level: ${level}`);
    return Promise.resolve(sequenceCache[level]); // Return a resolved promise for consistency
  }

  console.log(`Fetching sequence for level: ${level} from cloud.`);
  try {
    const cloudResult = await wx.cloud.callFunction({
      name: 'yoga-platform', // Name of your main cloud function dispatcher
      data: {
        action: 'loadPoseSequence', // Action to perform within the cloud function
        level: level
      }
    });

    console.log('Cloud function result:', cloudResult);

    if (cloudResult.result && cloudResult.result.signedUrl) {
      const signedUrl = cloudResult.result.signedUrl;
      
      return new Promise((resolve, reject) => {
        wx.request({
          url: signedUrl,
          method: 'GET',
          dataType: 'json', // Expect JSON data
          success: (res) => {
            if (res.statusCode === 200 && res.data) {
              console.log('Successfully fetched sequence JSON from COS:', res.data);
              const processedData = processSequenceData(res.data);
              if (processedData) {
                sequenceCache[level] = processedData; // Cache the processed data
                resolve(processedData);
              } else {
                console.error('Failed to process sequence data.');
                reject(new Error('Failed to process sequence data.'));
              }
            } else {
              console.error('Failed to download sequence JSON from COS. Status:', res.statusCode, 'Data:', res.data);
              reject(new Error(`Failed to download sequence JSON. Status: ${res.statusCode}`));
            }
          },
          fail: (err) => {
            console.error('wx.request failed for sequence JSON:', err);
            reject(new Error(`wx.request failed: ${err.errMsg}`));
          }
        });
      });
    } else {
      console.error('Cloud function did not return a signedUrl or result:', cloudResult);
      throw new Error('Invalid response from cloud function for fetching sequence.');
    }
  } catch (error) {
    console.error('Error calling cloud function or processing sequence:', error);
    // Rethrow or return a structured error. For simplicity, rethrowing.
    // In a real app, might want to return a user-friendly error object or code.
    throw error; 
  }
}

module.exports = {
  getProcessedSequence,
  // Exposing these for potential testing or direct use if ever needed, but typically only getProcessedSequence is used.
  mapResourceUrl, 
  processSequenceData 
};
