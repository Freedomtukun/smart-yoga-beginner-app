import { scorePose } from '../../utils/yoga-api.js';
const cloudSequenceService = require('../../utils/cloud-sequence-service.js');
const sequenceService      = require('../../utils/sequence-service.js');
const getText = v => (typeof v === 'object' ? (v.zh || v.en || '') : v);

// General Note on DevTools vs. Real Devices:
// Features like camera, video processing, and canvas manipulation can behave differently
// between WeChat DevTools and actual hardware. Thorough testing on a range of real
// devices is crucial to ensure reliability and performance. DevTools emulation may not
// perfectly replicate all hardware capabilities, timing nuances, or specific API behaviors.

Page({
  data:{
    level:'', currentSequence:null,currentPoseIndex:0,isPlaying:false,
    timeRemaining:0,loading:true,error:null,
    skeletonUrl:null,              // Main display skeleton image for the current pose
    // The following properties and related methods (onScoreSkeletonImageError, closeScoreModal) are potentially obsolete
    // due to the new Top 3 Frames display. Review WXML and UI before full removal.
    // scoreSkeletonImageUrl:null,    // Skeleton image for the scoring modal
    // showScoreModal:false,
    // poseScore:null,
    // isUploading:false, // Removed as it's unused
    timerId: null,
    // Old camera properties removed: showCamera, isRecording, cameraContext, cameraPosition
    recordedVideo: null, // Path to the video selected/recorded by the user

  isProcessingFrames: false,  // True if video frames are being extracted and analyzed
  frameAnalysisResults: [],   // Stores results from frame analysis
  topThreeFrames: [],         // Stores the top 3 frames with best scores for display
  isCancelling: false,        // Flag to indicate user-initiated cancellation of frame processing/upload
  currentUploadTasks: [],     // Array to store ongoing wx.UploadTask instances for cancellation
  failedUploads: [],          // Array to store info about failed uploads for potential retry
  videoMetadata: {            // Metadata of the video being processed
    duration: 0,
    width: 0,
    height: 0
  },
  frameExtractionCanvasContext: null, // Canvas context for the hidden frameExtractorCanvas
  frameExtractorVideoContext: null,  // Video context for the hidden frameExtractorVideo
  extractorVideoSrc: null, // Source for the hidden video element used in frame extraction
  },

  // Method to initialize canvas and video contexts for frame extraction
  initializeFrameExtractionResources: function() {
    if (!this.data.frameExtractionCanvasContext) {
      const ctx = wx.createCanvasContext('frameExtractorCanvas', this);
      if (!ctx) {
        console.error('[INITIALIZE_CTX_ERROR] Failed to create canvas context "frameExtractorCanvas". Subsequent operations involving this canvas will likely fail.');
      }
      this.setData({ frameExtractionCanvasContext: ctx });
    }
    if (!this.data.frameExtractorVideoContext) {
       const videoCtx = wx.createVideoContext('frameExtractorVideo', this);
       if (!videoCtx) {
        console.error('[INITIALIZE_CTX_ERROR] Failed to create video context "frameExtractorVideo". Subsequent operations involving this video element might be affected.');
      }
       this.setData({ frameExtractorVideoContext: videoCtx });
    }
  },

  // Called when the hidden video element (frameExtractorVideo) has loaded its metadata.
  onVideoLoadMetadata: function(e) {
    wx.hideLoading(); 

    const { duration, width, height } = e.detail;

    // NOTE (DevTools Reliability): WeChat DevTools may have limitations in accurately 
    // reporting video metadata. Testing on real devices is crucial.
    if (!duration || duration <= 0 || !width || width <= 0 || !height || height <= 0) {
      console.error('Invalid video metadata:', { duration, width, height });
      this.setData({ isProcessingFrames: false }); 

      wx.showModal({
        title: '提示',
        content: '当前环境或视频格式不支持，请在真机上重试。',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }

    this.setData({ 
      videoMetadata: { duration, width, height },
    });
    
    console.log('Video metadata successfully loaded and stored:', this.data.videoMetadata);
    this.startFrameExtractionLoop(); // Proceed to extract frames
  },

  // Core logic for extracting frames from the video.
  startFrameExtractionLoop: async function() {
    this.setData({
      isProcessingFrames: true,
      frameAnalysisResults: [],
      topThreeFrames: [],
      isCancelling: false, 
    });

    const { duration } = this.data.videoMetadata;
    let videoCtx = this.data.frameExtractorVideoContext;
    const canvasCtx = this.data.frameExtractionCanvasContext;

    if (!videoCtx || !canvasCtx) {
      console.error('[CTX_MISSING_ERROR] Frame extraction resources (video or canvas context) not available. Aborting.');
      this.setData({ isProcessingFrames: false });
      wx.showToast({ title: '资源错误', icon: 'none' });
      return;
    }

    const originalWidth = this.data.videoMetadata.width;
    const originalHeight = this.data.videoMetadata.height;
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    // Resize if width is too large, maintaining aspect ratio.
    if (originalWidth > 480) {
      targetWidth = 480;
      targetHeight = Math.round(originalHeight * (480 / originalWidth));
    }
    console.log(`Target dimensions for frame extraction: ${targetWidth}x${targetHeight}`);

    let extractedFramePaths = [];

    // Extract frames at 2-second intervals.
    for (let t = 0; t < duration; t += 2) {
      if (this.data.isCancelling) {
        console.log("Cancellation detected in frame extraction loop.");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }

      videoCtx.seek(t);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for seek to complete. TODO: Use onVideoSeeked event for better reliability.

      if (this.data.isCancelling) { /* Check again after delay */ break; }

      canvasCtx.drawImage('frameExtractorVideo', 0, 0, targetWidth, targetHeight);
      await new Promise(resolve => canvasCtx.draw(false, resolve));

      if (this.data.isCancelling) { /* Check again after draw */ break; }

      try {
        const frameData = await wx.canvasToTempFilePath({
          x: 0, y: 0,
          width: targetWidth, height: targetHeight,
          destWidth: targetWidth, destHeight: targetHeight,
          canvasId: 'frameExtractorCanvas',
          fileType: 'jpg', quality: 0.7
        }, this);
        extractedFramePaths.push(frameData.tempFilePath);
      } catch (err) {
        console.error(`[CANVAS_TO_TEMP_FILE_ERROR] Frame extraction to temp file failed at ${t}s:`, err);
      }
    }

    if (this.data.isCancelling) {
      console.log("Frame extraction cancelled.");
      this.setData({ isProcessingFrames: false, isCancelling: false });
      wx.hideLoading();
      return;
    }

    console.log('Frame extraction attempts finished. Paths:', extractedFramePaths);

    if (extractedFramePaths.length > 0) {
      this.analyzeFramesBatch(extractedFramePaths); // Proceed to analyze extracted frames
    } else {
      this.setData({ isProcessingFrames: false });
      wx.showToast({ title: '未能成功提取任何帧', icon: 'none' });
      console.warn('No frames were extracted from the video.');
    }
  },

  /**
   * Uploads a single frame for scoring using the `scorePose` utility.
   * `scorePose` (from `utils/yoga-api.js`) handles the actual `wx.uploadFile` call
   * and returns a Promise with an `uploadTask` property attached.
   * This function wraps that call, processes the result/error, and exposes both the
   * processed promise and the original `UploadTask`.
   * @param {string} framePath - Temporary path of the frame image to upload.
   * @param {string} poseId - ID of the pose being analyzed.
   * @returns {{promise: Promise<object>, task: wx.UploadTask}} 
   *          An object containing:
   *          - `promise`: A promise that resolves with adapted scoring results 
   *                       (e.g., `{ score, feedback, skeletonUrl, originalFramePath }`) or rejects with an adapted error.
   *          - `task`: The `wx.UploadTask` object from `scorePose`, for cancellation.
   */
  uploadFrameForScoring: function(framePath, poseId) {
    // scorePose (from utils/yoga-api.js) returns a promise with an 'uploadTask' property
    const apiPromise = scorePose(framePath, poseId); 
    
    const processingPromise = apiPromise
      .then(result => ({
        // Adapt the result structure to what analyzeFramesBatch expects
        score: result.score,
        // Provide default feedback if not present in API response
        feedback: result.feedback || "评分完成", 
        skeletonUrl: result.skeletonUrl,
        originalFramePath: framePath
      }))
      .catch(err => {
        // Adapt the error structure for consistent error handling upstream
        console.error('scorePose failed for frame', framePath, 'Error:', err);
        // Determine if the error was due to user cancellation
        const wasAborted = (err && err.wasAborted) || (err && err.errMsg && err.errMsg.includes('abort'));
        return Promise.reject({
          error: wasAborted ? 'Upload aborted by user.' : (err.message || `Upload failed: ${(err && err.errMsg) || 'Unknown error'}`),
          originalFramePath: framePath,
          details: err, // Original error details
          wasAborted: wasAborted
        });
      });

    return { promise: processingPromise, task: apiPromise.uploadTask };
  },

  // Handles user-initiated cancellation of ongoing frame processing and uploads.
  handleCancelUpload: function() {
    console.log("User initiated cancellation of frame processing/upload.");
    this.setData({ isCancelling: true }); // Signal loops and async operations to stop

    // Abort all ongoing wx.UploadTask instances
    if (this.data.currentUploadTasks && this.data.currentUploadTasks.length > 0) {
      console.log(`Attempting to abort ${this.data.currentUploadTasks.length} upload tasks.`);
      this.data.currentUploadTasks.forEach(task => {
        if (task && typeof task.abort === 'function') {
          task.abort();
        }
      });
    }

    // Reset relevant states
    this.setData({
      isProcessingFrames: false,
      currentUploadTasks: [], // Clear the list of tasks
      frameAnalysisResults: [],
      topThreeFrames: []
      // isCancelling is reset by individual loops/processes when they detect the flag,
      // or will be reset at the start of a new operation.
    });
    wx.hideLoading(); // Ensure any loading indicators are hidden
    wx.showToast({ title: 'Processing cancelled', icon: 'none' });
  },

  // Analyzes a batch of extracted frames by uploading them for scoring.
  // Manages UploadTasks for cancellation.
  analyzeFramesBatch: async function(framePathsArray, _poseId = null) {
    if (this.data.isCancelling) {
      console.log("analyzeFramesBatch: Skipped due to pending cancellation.");
      this.setData({ isProcessingFrames: false, isCancelling: false }); // Reset if detected early
      wx.hideLoading();
      return;
    }

    if (!framePathsArray || framePathsArray.length === 0) {
      if (!_poseId) { // Only show toast if it's an initial call, not a retry.
          wx.showToast({ title: '没有提取到帧进行分析', icon: 'none' });
      }
      this.setData({ isProcessingFrames: false });
      return;
    }

    this.setData({ isProcessingFrames: true, currentUploadTasks: [] }); // Reset tasks for this run
    wx.showLoading({ title: '分析帧中 (0%)...', mask: true });

    const poseId = _poseId || (this.data.currentSequence && this.data.currentSequence.poses[this.data.currentPoseIndex] && this.data.currentSequence.poses[this.data.currentPoseIndex].id);

    if (!poseId) {
        console.error('Critical: Pose ID not found for analysis in analyzeFramesBatch.');
        this.setData({ isProcessingFrames: false, isCancelling: false, currentUploadTasks: [] });
        wx.hideLoading();
        wx.showToast({ title: '无法确定体式ID进行分析', icon: 'none' });
        return;
    }

    const BATCH_SIZE = 3; // Number of frames to upload concurrently
    const totalFrames = framePathsArray.length;
    let processedCount = 0;
    let successfulUploads = 0;
    // `localBatchTasks` stores UploadTask instances for the current set of concurrent uploads.
    let localBatchTasks = []; 

    if (!_poseId) { // If it's an initial analysis, clear previous results.
      this.setData({ frameAnalysisResults: [] });
    }

    for (let i = 0; i < totalFrames; i += BATCH_SIZE) {
      if (this.data.isCancelling) {
        console.log("Cancellation detected in batch analysis main loop.");
        break; // Exit loop if cancellation is requested
      }

      const currentBatchPaths = framePathsArray.slice(i, i + BATCH_SIZE);
      let uploadPromises = [];
      localBatchTasks = []; // Reset for this physical batch of uploads

      for (const framePath of currentBatchPaths) {
        if (this.data.isCancelling) { break; } // Check before each upload

        processedCount++;
        wx.showLoading({ title: `Analysing frame ${processedCount}/${totalFrames}...`, mask: true });
        
        // `uploadFrameForScoring` returns a promise and the UploadTask.
        const { promise, task } = this.uploadFrameForScoring(framePath, poseId);
        uploadPromises.push(promise);
        if (task) { // Store the task for potential cancellation.
          localBatchTasks.push(task);
        }
      }
      
      // Add all tasks from this physical batch to the global list in page data.
      if (localBatchTasks.length > 0) {
        this.setData({ currentUploadTasks: [...this.data.currentUploadTasks, ...localBatchTasks] });
      }

      if (this.data.isCancelling) { break; } // Check after preparing batch

      const batchResults = await Promise.allSettled(uploadPromises);
      
      // Remove tasks of the completed/settled batch from the global list.
      if (localBatchTasks.length > 0) {
         this.setData(prev => ({
            currentUploadTasks: prev.currentUploadTasks.filter(t => !localBatchTasks.includes(t))
         }));
      }

      if (this.data.isCancelling) { break; } // Check after batch settlement
      
      let currentDataResults = this.data.frameAnalysisResults;
      batchResults.forEach(result => {
        // Process and store result, adapting structure as needed.
        // (Error details are already adapted by uploadFrameForScoring's catch block)
        currentDataResults.push(result.status === 'fulfilled' ? result.value : result.reason);
        if (result.status === 'fulfilled') successfulUploads++;
      });
      this.setData({ frameAnalysisResults: currentDataResults });
    } // End of BATCH_SIZE loop

    wx.hideLoading();
    
    // Final state reset if cancellation happened during the loops.
    if (this.data.isCancelling) {
        console.log("Frame analysis process was cancelled.");
        this.setData({ isProcessingFrames: false, isCancelling: false, currentUploadTasks: [] });
        return;
    }

    // Ensure all tasks are cleared from global list on normal completion.
    this.setData({ currentUploadTasks: [] }); 

    // Store information about uploads that genuinely failed (not cancelled).
    const sessionFailedUploads = this.data.frameAnalysisResults
      .filter(r => r.error && !r.wasCancelled)
      .map(r => ({ framePath: r.originalFramePath, poseId: r.poseId || poseId, error: r.error }));
    this.setData({ failedUploads: sessionFailedUploads });

    if (sessionFailedUploads.length > 0) {
      wx.showToast({ title: `${sessionFailedUploads.length} frames failed. Retry available.`, icon: 'none', duration: 3000 });
    }

    console.log('All frames analysis attempt complete. Results:', this.data.frameAnalysisResults);
    // Provide summary toast based on outcomes.
    if (successfulUploads === 0 && totalFrames > 0 && sessionFailedUploads.length === 0 && !this.data.isCancelling) { 
      wx.showToast({ title: '所有帧分析失败', icon: 'none', duration: 2000 });
    } else if (successfulUploads < totalFrames && successfulUploads > 0 && sessionFailedUploads.length === 0 && !this.data.isCancelling) {
      wx.showToast({ title: `部分帧分析失败 (${successfulUploads}/${totalFrames} 成功)`, icon: 'none', duration: 2000 });
    } else if (successfulUploads === totalFrames && totalFrames > 0) {
      console.log("All frames analyzed successfully.");
    }
    
    this.selectAndDisplayTopFrames(); // Display best results
    this.setData({ isCancelling: false }); // Ensure cancellation flag is reset on normal completion
  },

  // Allows user to retry uploading frames that previously failed.
  handleRetryFailedUploads: function() {
    if (!this.data.failedUploads || this.data.failedUploads.length === 0) {
      wx.showToast({ title: 'No failed uploads to retry.', icon: 'none' });
      return;
    }

    const framesToRetryInfo = [...this.data.failedUploads]; 
    const framesToRetryPaths = framesToRetryInfo.map(f => f.framePath);
    const poseIdForRetry = framesToRetryInfo[0]?.poseId; // Assumes all retries are for the same pose.

    this.setData({ failedUploads: [] }); // Clear list of failed uploads for this retry attempt.

    if (framesToRetryPaths.length > 0 && poseIdForRetry) {
      this.setData({ isProcessingFrames: true }); 

      // Filter out previous failed attempts for these specific frames from main results.
      let currentResults = this.data.frameAnalysisResults.filter(
        r => !framesToRetryPaths.includes(r.originalFramePath) || (r.originalFramePath && r.score > 0) 
      );
      this.setData({ frameAnalysisResults: currentResults });

      this.analyzeFramesBatch(framesToRetryPaths, poseIdForRetry); // Retry analysis
    } else {
      wx.showToast({ title: 'Nothing to retry or pose ID missing.', icon: 'none' });
      this.setData({ isProcessingFrames: false }); 
    }
  },

  // Selects and displays the top 3 frames based on their scores.
  selectAndDisplayTopFrames: function() {
    if (this.data.isCancelling) { // Don't proceed if cancellation is active
      this.setData({ isProcessingFrames: false, isCancelling: false, topThreeFrames: [] });
      return;
    }

    const results = this.data.frameAnalysisResults;
    this.setData({ isProcessingFrames: false }); // Analysis part is done

    if (!results || results.length === 0) {
      this.setData({ topThreeFrames: [] });
      return; 
    }

    // Filter for valid results (score > 0, skeletonUrl present, not cancelled)
    const validResults = results.filter(r => r && typeof r.score === 'number' && r.score > 0 && r.skeletonUrl && !r.wasCancelled);
    
    if (validResults.length === 0) {
      this.setData({ topThreeFrames: [] });
      // Show toast only if there were results but none were valid (and not due to cancellation)
      if (results.filter(r => !r.wasCancelled).length > 0) { 
         wx.showToast({ title: '未选出足够评分的帧展示', icon: 'none' });
      }
      return;
    }

    validResults.sort((a, b) => b.score - a.score); // Sort by score descending
    const topFrames = validResults.slice(0, 3); // Get top 3

    this.setData({ topThreeFrames: topFrames });
    console.log('Top 3 frames selected for display:', topFrames);

    if (topFrames.length > 0) {
        wx.showToast({ title: `最佳 ${topFrames.length} 帧已显示`, icon: 'success', duration: 2000 });
    }
    this.setData({ isCancelling: false }); // Reset flag if it was somehow stuck
  },

  // Prepares for video processing by setting up resources and the video source.
  processVideoForFrames: function(videoPath) {
    this.setData({ 
      isProcessingFrames: true, 
      topThreeFrames: [], 
      frameAnalysisResults: [],
      isCancelling: false, 
      currentUploadTasks: [] // Reset tasks for this new processing run
    }); 
    wx.showLoading({ title: '准备视频分析...', mask: true });
    
    this.initializeFrameExtractionResources(); // Ensure canvas/video elements are ready
    
    // Set the source for the hidden video element, which will trigger onVideoLoadMetadata
    this.setData({ extractorVideoSrc: videoPath });
  },

  // Optional: Placeholder for onVideoTimeUpdate from frameExtractorVideo
  onVideoTimeUpdate: function(e) {
    // console.log('Video timeupdate (frame extractor):', e.detail.currentTime); 
  },

  // Optional: Placeholder for onVideoSeeked from frameExtractorVideo
  onVideoSeeked: function(e) {
    // console.log('Video seeked (frame extractor):', e.detail.currentTime); 
  },

  // Main function called after a video is recorded or selected to start the scoring process.
  async uploadAndScore() {
    if (!this.data.recordedVideo) {
      wx.showToast({ title: '请先录制视频', icon: 'none' });
      return;
    }

    this.setData({ // Reset states for a new analysis run
      isProcessingFrames: true,
      topThreeFrames: [],
      frameAnalysisResults: [],
      isCancelling: false, 
      currentUploadTasks: [],
      failedUploads: [] 
    });

    wx.showLoading({ title: '处理准备中...', mask: true });

    try {
      // This will set extractorVideoSrc and trigger frame extraction via onVideoLoadMetadata -> startFrameExtractionLoop
      await this.processVideoForFrames(this.data.recordedVideo);
    } catch (error) {
      console.error('Error starting video processing pipeline in uploadAndScore:', error);
      this.setData({ isProcessingFrames: false, isCancelling: false }); 
      wx.hideLoading();
      wx.showToast({ title: '处理启动失败', icon: 'none' });
    }
  },

  // Page lifecycle: Load sequence data based on level from options.
  onLoad: function (options) {
    const level = options.level || 'beginner'; // Default to beginner
    this.setData({ level: level });
    this.loadSequenceData(level);
  },

  // Fetches and sets up the yoga sequence data.
  async loadSequenceData(level) {
    this.setData({ loading: true, error: null });
    wx.showLoading({ title: '加载中...' });
    try {
      // cloudSequenceService fetches sequence JSON (e.g., from COS via a cloud function)
      // and processes it (e.g., maps relative URLs to full URLs).
      const sequenceData = await cloudSequenceService.getProcessedSequence(level);
      
      if (sequenceData && sequenceData.poses && sequenceData.poses.length > 0) {
        const initialState = sequenceService.setSequence(sequenceData); // Initialize sequence state
        this.setData({
          ...initialState, 
          loading: false,
        });
        wx.hideLoading();
        wx.setNavigationBarTitle({ title: `${getText(initialState.currentSequence.name)} - ${initialState.currentPoseIndex + 1}/${initialState.currentSequence.poses.length}` });
      } else {
        console.error('No sequence data or empty poses array returned for level:', level);
        throw new Error('加载的序列数据无效'); // Invalid sequence data
      }
    } catch (err) {
      console.error('Failed to load sequence:', err);
      let userErrorMessage = '无法加载序列数据，请稍后重试。';
      let toastMessage = '加载失败，请稍后重试';

      // Handle specific error for missing signed URL (configuration issue)
      if (err && err.message === 'MISSING_SIGNED_URL') {
        userErrorMessage = '序列配置获取失败，请检查网络或稍后重试。';
        toastMessage = '序列配置获取失败';
      } else if (err && err.message) { // Other specific errors
        userErrorMessage = '加载序列时发生错误，请稍后重试。'; 
        toastMessage = '加载错误'; 
      }
      this.setData({ loading: false, error: userErrorMessage, currentSequence: null });
      wx.hideLoading();
      wx.showToast({ title: toastMessage, icon: 'none' });
      wx.setNavigationBarTitle({ title: '加载错误' }); 
    }
  },

  // Timer for pose duration.
  startTimer: function () {
    if (this.data.timerId) clearInterval(this.data.timerId); 

    const timerId = setInterval(() => {
      if (this.data.timeRemaining > 0) {
        this.setData({ timeRemaining: this.data.timeRemaining - 1 });
      } else {
        clearInterval(this.data.timerId);
        this.setData({ timerId: null });
        if (this.data.isPlaying) { 
          this.handleNext(); // Auto-proceed to next pose if playing
        }
      }
    }, 1000);
    this.setData({ timerId: timerId });
  },

  stopTimer: function () {
    if (this.data.timerId) {
      clearInterval(this.data.timerId);
      this.setData({ timerId: null });
    }
  },

  // Plays audio guidance for the current pose.
  playAudioGuidance: function (src) {
    return new Promise((resolve, reject) => {
      if (!src) {
        console.warn("No audio src provided to playAudioGuidance.");
        reject(new Error("No audio src provided."));
        return;
      }

      const audioCtx = wx.createInnerAudioContext({ useWebAudioImplement: false });
      audioCtx.src = src;
      audioCtx.onEnded(() => { audioCtx.destroy(); resolve(); });
      audioCtx.onError((error) => {
        console.error('Audio Error for src:', src, 'Error:', error.errMsg);
        wx.showToast({ title: '音频播放失败', icon: 'none' }); 
        audioCtx.destroy();
        reject(error);
      });
      audioCtx.play();
    });
  },

  handleBack: function () {
    this.stopTimer();
    wx.navigateBack();
  },

  // Moves to the next pose in the sequence.
  handleNext: function () {
    this.stopTimer();
    const { currentSequence, currentPoseIndex } = this.data;
    const nextState = sequenceService.nextPose(currentSequence, currentPoseIndex);

    if (nextState) {
      this.setData({
        currentPoseIndex: nextState.currentPoseIndex_new,
        timeRemaining: nextState.timeRemaining_new,
      });
      wx.setNavigationBarTitle({ title: `${getText(currentSequence.name)} - ${nextState.currentPoseIndex_new + 1}/${currentSequence.poses.length}` });
      
      if (this.data.isPlaying) {
        const newCurrentPose = currentSequence.poses[nextState.currentPoseIndex_new];
        this.playAudioGuidance(newCurrentPose.audioGuide).catch(e => console.error("Audio playback error in handleNext:", e));
        this.startTimer();
      }
    } else { // End of sequence
      wx.showToast({ title: '序列完成!', icon: 'success' });
      setTimeout(() => wx.redirectTo({ url: '/pages/index/index' }), 1500);
    }
  },

  // Toggles play/pause state for the sequence.
  togglePlayPause: function () {
    const { isPlaying_new } = sequenceService.togglePlayPause(this.data.isPlaying);
    this.setData({ isPlaying: isPlaying_new });

    if (isPlaying_new) {
      const currentPose = this.data.currentSequence.poses[this.data.currentPoseIndex];
      this.playAudioGuidance(currentPose.audioGuide).catch(e => console.error("Audio playback error in togglePlayPause:", e));
      this.startTimer();
    } else {
      this.stopTimer();
    }
  },

  // Handles user action to choose a video from album or record a new one.
  handleChooseOrRecordVideo: function() {
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: false, // Compression will be handled by frame extraction if needed
      maxDuration: 15,   // Max video duration
      camera: 'back',    
      success: (res) => {
        console.log("Video selected/recorded:", res);
        this.handleVideoValidation(res); // Validate and process the chosen video
      },
      fail: (err) => {
        console.error("wx.chooseVideo failed:", err);
        if (err.errMsg === 'chooseVideo:fail cancel' || err.errMsg.includes('cancel')) {
          wx.showToast({ title: '操作取消', icon: 'none' });
        } else {
          wx.showToast({ title: '选取视频失败', icon: 'none' });
        }
      }
    });
  },

  // Validates the chosen/recorded video (duration, size).
  handleVideoValidation: function(videoDetails) {
    console.log("handleVideoValidation called with:", videoDetails);

    if (videoDetails.duration > 15.5) { // Allow a small margin for duration
      wx.showModal({ title: '视频过长', content: '您选择的视频超过15秒，请重新选取或录制一个较短的视频。', showCancel: false, confirmText: '知道了'});
      return;
    }

    const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    if (videoDetails.size > MAX_SIZE_BYTES) {
      wx.showModal({ title: '视频文件过大', content: '您选择的视频超过10MB，请重新选取或录制一个较小的视频。', showCancel: false, confirmText: '知道了'});
      return;
    }

    console.log("Video validation passed. Path:", videoDetails.tempFilePath);
    this.setData({
      recordedVideo: videoDetails.tempFilePath, // Store path for processing
      topThreeFrames: [],       // Reset display for previous results
      frameAnalysisResults: [], // Reset analysis results
      failedUploads: []         // Reset failed uploads list
    });
    this.uploadAndScore(); // Start the frame extraction and scoring process
  },

  // --- The following camera methods (handleCameraPress, initCamera, etc.) are for a potential alternative UI ---
  // --- where the camera is embedded directly on the page, rather than using wx.chooseVideo. ---
  // --- They are kept for now but might be removed if wx.chooseVideo is the sole method for video input. ---
  handleCameraPress: function () { /* ... */ },
  initCamera: function() { /* ... */ },
  startRecording: function () { /* ... */ },
  stopRecording: function () { /* ... */ },
  retakeVideo: function() { /* ... */ },
  closeCamera: function () { /* ... */ },
  cameraError: function(e) { /* ... */ },
  toggleCamera: function() { /* ... */ },
  // --- End of alternative camera UI methods ---

  // Handles errors when loading pose images in the WXML.
  onImageError: function(e) {
    const currentImageUrl = this.data.currentSequence && 
                              this.data.currentSequence.poses[this.data.currentPoseIndex] &&
                              this.data.currentSequence.poses[this.data.currentPoseIndex].image_url;
    console.warn('Image load error for URL:', currentImageUrl || e.target.id || e.target.src, 'Error details:', e.detail.errMsg);
  },

  // Page lifecycle: Stop timer when page is hidden.
  onHide: function () {
    this.stopTimer();
  },

  // Page lifecycle: Stop timer and destroy audio context when page is unloaded.
  onUnload: function () {
    this.stopTimer(); 
    // Audio context for meditation page is handled there; sequence page audio is short-lived.
  },
});
