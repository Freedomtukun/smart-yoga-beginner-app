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
    skeletonUrl:null,              // 主界面骨架图
    // The following properties and related methods (onScoreSkeletonImageError, closeScoreModal) are potentially obsolete
    // due to the new Top 3 Frames display. Review WXML and UI before full removal.
    // scoreSkeletonImageUrl:null,    // 评分弹窗骨架图
    // showScoreModal:false,
    // poseScore:null,
    // isUploading:false, // Removed as it's unused
    timerId: null,
    // Old camera properties removed: showCamera, isRecording, cameraContext, cameraPosition
    recordedVideo: null, // This is now set by wx.chooseVideo -> handleVideoValidation

  isProcessingFrames: false,
  frameAnalysisResults: [],
  topThreeFrames: [],
  isCancelling: false,          // Flag to indicate user-initiated cancellation
  currentUploadTasks: [],     // Array to store ongoing wx.uploadFile tasks
  failedUploads: [],          // Array to store info about failed uploads for retry
  videoMetadata: {              // Object to hold metadata (duration, width, height) of the video being processed
    duration: 0,
    width: 0,
    height: 0
  },
  frameExtractionCanvasContext: null, // Holds the canvas context for the hidden frameExtractorCanvas
  frameExtractorVideoContext: null,  // Holds the video context for the hidden frameExtractorVideo (can be created when needed)
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
    // Video context for frameExtractorVideo is created when its src is set,
    // or can be created explicitly if needed for early interaction.
    if (!this.data.frameExtractorVideoContext) {
       const videoCtx = wx.createVideoContext('frameExtractorVideo', this);
       if (!videoCtx) {
        console.error('[INITIALIZE_CTX_ERROR] Failed to create video context "frameExtractorVideo". Subsequent operations involving this video element might be affected.');
      }
       this.setData({ frameExtractorVideoContext: videoCtx });
    }
  },

  onVideoLoadMetadata: function(e) {
    wx.hideLoading(); 

    const { duration, width, height } = e.detail;

    // NOTE (DevTools Reliability): WeChat DevTools may have limitations in accurately 
    // reporting video metadata (duration, width, height) for all video formats or scenarios.
    // The error modal implemented below is a general safeguard.
    // Testing on real devices is crucial for validating video processing capabilities.
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
      // isProcessingFrames is set to true by startFrameExtractionLoop or its caller (processVideoForFrames)
      // No need to set isProcessingFrames: true here, as startFrameExtractionLoop will manage it.
    });
    
    console.log('Video metadata successfully loaded and stored:', this.data.videoMetadata);
    this.startFrameExtractionLoop();
  },

  // Core logic for extracting frames
  startFrameExtractionLoop: async function() {
    // Reset states at the beginning of frame extraction.
    this.setData({
      isProcessingFrames: true,
      frameAnalysisResults: [],
      topThreeFrames: [],
      isCancelling: false, // Ensure cancellation flag is reset
      // Consider resetting extractorVideoSrc if it causes issues being stale, though usually it's fine.
      // extractorVideoSrc: null 
    });

    const { duration, width, height } = this.data.videoMetadata;
    let videoCtx = this.data.frameExtractorVideoContext;
    const canvasCtx = this.data.frameExtractionCanvasContext;

    if (!videoCtx) {
        console.warn("frameExtractorVideoContext not found, attempting to create.");
        videoCtx = wx.createVideoContext('frameExtractorVideo', this);
        this.setData({ frameExtractorVideoContext: videoCtx });
        if(!videoCtx) { // This check is slightly redundant due to the one in initializeFrameExtractionResources, but good for safety.
            console.error('[CTX_MISSING_ERROR] Frame extractor video context (frameExtractorVideo) failed to create dynamically. Aborting frame extraction. Ensure initializeFrameExtractionResources was called or video src was set.');
            this.setData({ isProcessingFrames: false });
            wx.showToast({ title: '视频资源错误', icon: 'none' });
            return;
        }
    }
    
    if (!canvasCtx) {
      console.error('[CTX_MISSING_ERROR] Frame extraction canvas context (frameExtractorCanvas) not found in this.data. Aborting frame extraction. Ensure initializeFrameExtractionResources was called and succeeded.');
      this.setData({ isProcessingFrames: false });
      wx.showToast({ title: '绘图资源错误', icon: 'none' });
      return;
    }

    // Calculate target dimensions for resizing
    const originalWidth = this.data.videoMetadata.width;
    const originalHeight = this.data.videoMetadata.height;
    let targetWidth;
    let targetHeight;

    if (originalWidth > 480) {
      targetWidth = 480;
      targetHeight = Math.round(originalHeight * (480 / originalWidth));
    } else {
      targetWidth = originalWidth;
      targetHeight = originalHeight;
    }
    console.log(`Target dimensions for extraction: ${targetWidth}x${targetHeight}`);

    let extractedFramePaths = [];

    for (let t = 0; t < duration; t += 2) {
      if (this.data.isCancelling) {
        console.log("Cancellation detected in frame extraction loop (start).");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }

      console.log(`Seeking video to ${t}s. Current video src: ${this.data.extractorVideoSrc}`);
      videoCtx.seek(t);
      
      // TODO: Refactor to use onVideoSeeked or onVideoTimeUpdate for better reliability
      await new Promise(resolve => setTimeout(resolve, 500)); 
      if (this.data.isCancelling) {
        console.log("Cancellation detected in frame extraction loop (after seek delay).");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }

      if (this.data.isCancelling) { 
        console.log("Cancellation detected in frame extraction loop (before drawImage).");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }
      console.log(`Attempting to draw video frame at ${t}s to canvas 'frameExtractorCanvas'.`);
      canvasCtx.drawImage('frameExtractorVideo', 0, 0, targetWidth, targetHeight);
      
      await new Promise(resolve => {
        canvasCtx.draw(false, () => {
          resolve();
        });
      });

      if (this.data.isCancelling) { 
        console.log("Cancellation detected in frame extraction loop (before canvasToTempFilePath).");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }
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
        console.error(`[CANVAS_TO_TEMP_FILE_ERROR] Frame extraction to temp file failed at ${t}s. This could be due to issues with canvas drawing, resource limits, or invalid parameters. Video time: ${t}, Canvas dimensions: ${targetWidth}x${targetHeight}. Error:`, err);
        // If one frame fails, log and continue. Consider a failure threshold later.
      }
    }

    if (this.data.isCancelling) {
      console.log("Cancellation detected after frame extraction loop.");
      this.setData({ isProcessingFrames: false, isCancelling: false });
      wx.hideLoading();
      return;
    }

    console.log('All frames extracted attempts finished. Paths:', extractedFramePaths);

    if (extractedFramePaths.length > 0) {
      this.analyzeFramesBatch(extractedFramePaths);
    } else {
      // If no frames, and not cancelling, it's a normal failure to extract.
      if (!this.data.isCancelling) {
        this.setData({ isProcessingFrames: false });
        wx.showToast({ title: '未能成功提取任何帧', icon: 'none' });
        console.warn('No frames were extracted from the video.');
      }
      // If isCancelling was true, it would have been caught above.
    }
  },

  uploadFrameForScoring: function(framePath, poseId) {
    const BASE_API_URL = 'https://yogamaster.aiforcause.cn';
    const SCORING_ENDPOINT = BASE_API_URL + '/detect-pose-file';
    let task; // Declare task variable
    const promise = new Promise((resolve, reject) => {
      task = wx.uploadFile({ // Assign to task
        url: SCORING_ENDPOINT,
        filePath: framePath,
        name: 'file',
        formData: {
          poseId: poseId,
          // Add any other required parameters for the API, e.g., user_id if needed
        },
        success: (res) => {
          try {
            const resultData = JSON.parse(res.data);
            if (res.statusCode === 200 && resultData.success) {
              resolve({
                score: resultData.data?.score,
                feedback: resultData.data?.feedback,
                skeletonUrl: resultData.data?.skeleton_image_url,
                originalFramePath: framePath
              });
            } else {
              console.error('API Error for frame', framePath, 'Status:', res.statusCode, 'Response:', resultData);
              reject({
                error: `API error: ${resultData.message || 'Unknown error'} (Status: ${res.statusCode})`,
                originalFramePath: framePath,
                details: resultData
              });
            }
          } catch (parseError) {
            console.error('Error parsing API response for frame', framePath, parseError, res.data);
            reject({
              error: 'Failed to parse API response.',
              originalFramePath: framePath,
              details: res.data
            });
          }
        },
        fail: (err) => {
          // Check if the failure was due to abortion
          if (err.errMsg && err.errMsg.includes('abort')) {
            console.log('Upload task aborted for frame:', framePath);
            reject({
              error: 'Upload aborted by user.',
              originalFramePath: framePath,
              wasAborted: true // Custom flag
            });
          } else {
            console.error('wx.uploadFile failed for frame', framePath, err);
            reject({
              error: `Upload failed: ${err.errMsg}`,
              originalFramePath: framePath,
              details: err
            });
          }
        }
      });
    });
    return { promise, task }; // Return both
  },

  handleCancelUpload: function() {
    console.log("User initiated cancellation.");
    this.setData({ isCancelling: true });

    // Abort ongoing upload tasks
    if (this.data.currentUploadTasks && this.data.currentUploadTasks.length > 0) {
      console.log(`Attempting to abort ${this.data.currentUploadTasks.length} upload tasks.`);
      this.data.currentUploadTasks.forEach(task => {
        if (task && typeof task.abort === 'function') {
          task.abort();
        }
      });
    }

    // Reset relevant states
    // Note: isCancelling will be reset by the loops when they detect it, or if already done, no harm.
    // Setting isProcessingFrames to false here helps stop UI indicators.
    this.setData({
      isProcessingFrames: false,
      // isUploading: false, // Removed
      currentUploadTasks: [], // Clear tasks
      frameAnalysisResults: [],
      topThreeFrames: []
      // isCancelling: false, // Let loops handle this for now to ensure they exit cleanly.
                           // Or, set it here and ensure loops also set it to false upon exit.
                           // For safety, loops will set it to false.
    });
    wx.hideLoading();
    wx.showToast({ title: 'Processing cancelled', icon: 'none' });
  },

  analyzeFramesBatch: async function(framePathsArray, _poseId = null) {
    if (this.data.isCancelling) { // Early exit if cancellation already requested
      console.log("analyzeFramesBatch: Cancellation detected at start.");
      this.setData({ isProcessingFrames: false, isCancelling: false });
      wx.hideLoading();
      return;
    }

    if (!framePathsArray || framePathsArray.length === 0) {
      // If called with empty array (e.g. from retry logic with no failed uploads)
      // ensure processing is false and don't show "no frames" toast if it was a retry call.
      if (!_poseId) { // Only show toast if it's an initial call, not a retry of an empty list
          wx.showToast({ title: '没有提取到帧进行分析', icon: 'none' });
      }
      this.setData({ isProcessingFrames: false });
      return;
    }

    this.setData({ isProcessingFrames: true, currentUploadTasks: [] });
    wx.showLoading({ title: '分析帧中 (0%)...', mask: true });

    const poseId = _poseId || (this.data.currentSequence && this.data.currentSequence.poses[this.data.currentPoseIndex] && this.data.currentSequence.poses[this.data.currentPoseIndex].id);

    if (!poseId) {
        console.error('Critical: Pose ID not found for analysis.');
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        wx.showToast({ title: '无法确定体式ID进行分析', icon: 'none' });
        return;
    }

    const BATCH_SIZE = 3;
    const totalFrames = framePathsArray.length;
    let processedCount = 0;
    let successfulUploads = 0;

    // If this is not a retry call, clear previous frameAnalysisResults.
    // For retries, we append to the existing (filtered) results.
    if (!_poseId) {
      this.setData({ frameAnalysisResults: [] });
    }

    for (let i = 0; i < totalFrames; i += BATCH_SIZE) {
      if (this.data.isCancelling) {
        console.log("Cancellation detected in batch analysis main loop.");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }

      const currentBatchPaths = framePathsArray.slice(i, i + BATCH_SIZE);
      let uploadPromises = [];
      let batchUploadTasks = [];

      for (const framePath of currentBatchPaths) {
        if (this.data.isCancelling) {
          console.log("Cancellation detected before processing a frame in a batch.");
          break; 
        }
        processedCount++;
        wx.showLoading({ title: `Analysing frame ${processedCount}/${totalFrames}...`, mask: true });
        
        const { promise, task } = this.uploadFrameForScoring(framePath, poseId);
        uploadPromises.push(promise);
        batchUploadTasks.push(task);
        this.setData({ currentUploadTasks: [...this.data.currentUploadTasks, task] });
      }

      if (this.data.isCancelling) { 
        console.log("Cancellation detected after processing a partial batch or inner loop break.");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }

      const batchResults = await Promise.allSettled(uploadPromises);
      
      this.setData({ 
        currentUploadTasks: this.data.currentUploadTasks.filter(t => !batchUploadTasks.includes(t))
      });

      if (this.data.isCancelling) {
        console.log("Cancellation detected after Promise.allSettled for a batch.");
        this.setData({ isProcessingFrames: false, isCancelling: false });
        wx.hideLoading();
        return;
      }
      
      let currentDataResults = this.data.frameAnalysisResults;

      batchResults.forEach(result => {
        let frameOutcome;
        if (result.status === 'fulfilled') {
          frameOutcome = result.value;
          successfulUploads++;
        } else {
          console.error('Frame analysis failed:', result.reason);
          if (result.reason && result.reason.wasAborted) {
            frameOutcome = {
              score: 0, feedback: 'Upload cancelled by user.', skeletonUrl: null,
              originalFramePath: result.reason.originalFramePath, error: result.reason.error, wasCancelled: true
            };
          } else {
            // This is a genuine failure, store all necessary info
            frameOutcome = {
              score: 0, feedback: '分析失败: ' + (result.reason.error || '未知错误'), skeletonUrl: null,
              originalFramePath: result.reason.originalFramePath, 
              error: result.reason.error || result.reason.details || 'Unknown upload error',
              poseId: poseId 
            };
          }
        }
        currentDataResults.push(frameOutcome);
      });
      this.setData({ frameAnalysisResults: currentDataResults });
    }

    wx.hideLoading();
    
    if (this.data.isCancelling) {
        console.log("Cancellation detected at the end of analyzeFramesBatch before final processing.");
        this.setData({ isProcessingFrames: false, isCancelling: false, currentUploadTasks: [] });
        return;
    }

    this.setData({ currentUploadTasks: [] }); 

    const sessionFailedUploads = this.data.frameAnalysisResults
      .filter(r => r.error && !r.wasCancelled)
      .map(r => ({
        framePath: r.originalFramePath,
        poseId: r.poseId || poseId, 
        error: r.error
      }));
      
    this.setData({ failedUploads: sessionFailedUploads });

    if (sessionFailedUploads.length > 0) {
      console.log(`${sessionFailedUploads.length} frames failed to upload. User can be prompted to retry.`);
      wx.showToast({ title: `${sessionFailedUploads.length} frames failed. Retry available.`, icon: 'none', duration: 3000 });
    }

    console.log('All frames analysis attempt complete:', this.data.frameAnalysisResults);

    if (successfulUploads === 0 && totalFrames > 0 && sessionFailedUploads.length === 0) { 
      wx.showToast({ title: '所有帧分析失败', icon: 'none', duration: 2000 });
    } else if (successfulUploads < totalFrames && successfulUploads > 0 && sessionFailedUploads.length === 0) {
      wx.showToast({ title: `部分帧分析失败 (${successfulUploads}/${totalFrames} 成功)`, icon: 'none', duration: 2000 });
    } else if (successfulUploads === totalFrames && totalFrames > 0) {
      console.log("All frames analyzed successfully.");
    }
    
    this.selectAndDisplayTopFrames();
    this.setData({ isCancelling: false });
  },

  handleRetryFailedUploads: function() {
    if (!this.data.failedUploads || this.data.failedUploads.length === 0) {
      wx.showToast({ title: 'No failed uploads to retry.', icon: 'none' });
      return;
    }

    const framesToRetryInfo = [...this.data.failedUploads]; 
    const framesToRetryPaths = framesToRetryInfo.map(f => f.framePath);
    // Assuming all failed uploads in a session belong to the same poseId for simplicity.
    const poseIdForRetry = framesToRetryInfo[0]?.poseId; 

    this.setData({ failedUploads: [] }); 

    if (framesToRetryPaths.length > 0 && poseIdForRetry) {
      this.setData({ isProcessingFrames: true }); 

      let currentResults = this.data.frameAnalysisResults.filter(
        r => !framesToRetryPaths.includes(r.originalFramePath) || (r.originalFramePath && r.score > 0) 
      );
      this.setData({ frameAnalysisResults: currentResults });

      this.analyzeFramesBatch(framesToRetryPaths, poseIdForRetry);
    } else {
      wx.showToast({ title: 'Nothing to retry or pose ID missing.', icon: 'none' });
      this.setData({ isProcessingFrames: false }); 
    }
  },

  selectAndDisplayTopFrames: function() {
    if (this.data.isCancelling) {
      // console.log("selectAndDisplayTopFrames: Skipped due to cancellation flag."); // Retained for its value
      this.setData({ isProcessingFrames: false, isCancelling: false, topThreeFrames: [] });
      return;
    }

    const results = this.data.frameAnalysisResults;
    this.setData({ isProcessingFrames: false }); 

    if (!results || results.length === 0) {
      this.setData({ topThreeFrames: [] });
      return; 
    }

    const validResults = results.filter(r => r && typeof r.score === 'number' && r.score > 0 && r.skeletonUrl && !r.wasCancelled);
    
    if (validResults.length === 0) {
      this.setData({ topThreeFrames: [] });
      if (results.filter(r => !r.wasCancelled).length > 0) { 
         wx.showToast({ title: '未选出足够评分的帧展示', icon: 'none' });
      }
      return;
    }

    validResults.sort((a, b) => b.score - a.score);
    const topFrames = validResults.slice(0, 3);

    this.setData({ topThreeFrames: topFrames });
    console.log('Top 3 frames selected for display:', topFrames);

    // if (this.data.showScoreModal) { this.setData({ showScoreModal: false }); } // Commented out as part of cleanup
    // if (this.data.showCamera) this.setData({ showCamera: false }); // showCamera is removed from data

    if (topFrames.length > 0) {
        wx.showToast({ title: `最佳 ${topFrames.length} 帧已显示`, icon: 'success', duration: 2000 });
    }
    this.setData({ isCancelling: false });
  },

  processVideoForFrames: function(videoPath) {
    this.setData({ 
      isProcessingFrames: true, 
      topThreeFrames: [], 
      frameAnalysisResults: [],
      isCancelling: false, 
      currentUploadTasks: [] 
    }); 
    wx.showLoading({ title: '准备视频分析...', mask: true });
    
    this.initializeFrameExtractionResources();
    
    this.setData({ extractorVideoSrc: videoPath }, () => {
        // console.log('extractorVideoSrc has been set. Video should start loading.'); // Removed
    });
  },

  // Optional: Placeholder for onVideoTimeUpdate
  onVideoTimeUpdate: function(e) {
    // console.log('Video timeupdate (frame extractor):', e.detail.currentTime); // Kept as it's already commented
  },

  // Optional: Placeholder for onVideoSeeked
  onVideoSeeked: function(e) {
    // console.log('Video seeked (frame extractor):', e.detail.currentTime); // Kept as it's already commented
  },

  async uploadAndScore() {
    if (!this.data.recordedVideo) {
      wx.showToast({ title: '请先录制视频', icon: 'none' });
      return;
    }

    this.setData({
      isProcessingFrames: true,
      topThreeFrames: [],
      frameAnalysisResults: [],
      // isUploading: false, // Removed
      // poseScore: null, // Commented out
      // scoreSkeletonImageUrl: null, // Commented out
      isCancelling: false, 
      currentUploadTasks: [],
      failedUploads: [] 
    });

    wx.showLoading({ title: '处理准备中...', mask: true });

    try {
      await this.processVideoForFrames(this.data.recordedVideo);
    } catch (error) {
      console.error('Error starting video processing pipeline in uploadAndScore:', error);
      this.setData({ isProcessingFrames: false, isCancelling: false }); 
      wx.hideLoading();
      wx.showToast({ title: '处理启动失败', icon: 'none' });
    }
  },

  // onScoreSkeletonImageError(e){
  //   console.error('骨架图加载失败:',this.data.scoreSkeletonImageUrl,e.detail.errMsg);
  //   this.setData({scoreSkeletonImageUrl:null});
  //   wx.showToast({title:'骨架图加载失败',icon:'none'});
  // },

  onLoad: function (options) {
    const level = options.level || 'beginner';
    this.setData({ level: level });
    this.loadSequenceData(level);
  },

  async loadSequenceData(level) {
    this.setData({ loading: true, error: null });
    wx.showLoading({ title: '加载中...' });
    try {
      const sequenceData = await cloudSequenceService.getProcessedSequence(level);
      
      if (sequenceData && sequenceData.poses && sequenceData.poses.length > 0) {
        const initialState = sequenceService.setSequence(sequenceData); 
        this.setData({
          ...initialState, 
          loading: false,
        });
        wx.hideLoading();
        wx.setNavigationBarTitle({ title: `${getText(initialState.currentSequence.name)} - ${initialState.currentPoseIndex + 1}/${initialState.currentSequence.poses.length}` });
      } else {
        console.error('No sequence data or empty poses array returned for level:', level);
        throw new Error('加载的序列数据无效'); 
      }
    } catch (err) {
      console.error('Failed to load sequence:', err);
      let userErrorMessage = '无法加载序列数据，请稍后重试。';
      let toastMessage = '加载失败，请稍后重试';

      if (err && err.message === 'MISSING_SIGNED_URL') {
        userErrorMessage = '序列配置获取失败，请检查网络或稍后重试。';
        toastMessage = '序列配置获取失败';
      } else if (err && err.message) { 
        userErrorMessage = '加载序列时发生错误，请稍后重试。'; 
        toastMessage = '加载错误'; 
      }
      this.setData({
        loading: false,
        error: userErrorMessage,
        currentSequence: null,
      });
      wx.hideLoading();
      wx.showToast({ title: toastMessage, icon: 'none' });
      wx.setNavigationBarTitle({ title: '加载错误' }); 
    }
  },

  startTimer: function () {
    if (this.data.timerId) clearInterval(this.data.timerId); 

    const timerId = setInterval(() => {
      if (this.data.timeRemaining > 0) {
        const newTimeRemaining = this.data.timeRemaining - 1;
        this.setData({ timeRemaining: newTimeRemaining });
      } else {
        clearInterval(this.data.timerId);
        this.setData({ timerId: null });
        if (this.data.isPlaying) { 
          this.handleNext(); 
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

  playAudioGuidance: function (src) {
    return new Promise((resolve, reject) => {
      if (!src) {
        console.warn("No audio src provided to playAudioGuidance.");
        reject(new Error("No audio src provided."));
        return;
      }

      const audioCtx = wx.createInnerAudioContext({ useWebAudioImplement: false });
      audioCtx.src = src;

      audioCtx.onEnded(() => {
        audioCtx.destroy();
        resolve();
      });

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
        this.playAudioGuidance(newCurrentPose.audioGuide)
          .then(() => {})
          .catch(error => {
            console.error("Audio playback error in handleNext:", error);
            // Toast is already shown in playAudioGuidance
          });
        this.startTimer();
      }
    } else {
      wx.showToast({ title: '序列完成!', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/index/index' });
      }, 1500);
    }
  },

  togglePlayPause: function () {
    const { isPlaying_new } = sequenceService.togglePlayPause(this.data.isPlaying);
    this.setData({ isPlaying: isPlaying_new });

    if (isPlaying_new) {
      const currentPose = this.data.currentSequence.poses[this.data.currentPoseIndex];
      this.playAudioGuidance(currentPose.audioGuide)
        .then(() => {})
        .catch(error => {
          console.error("Audio playback error in togglePlayPause:", error);
          // Toast is already shown in playAudioGuidance
        });
      this.startTimer();
    } else {
      this.stopTimer();
    }
  },

  // New entry point for choosing or recording video
  handleChooseOrRecordVideo: function() {
    // if (this.data.showCamera) { // showCamera is removed from data
    //   this.setData({ showCamera: false }); 
    // }

    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: false, // We will do our own compression
      maxDuration: 15,   // Enforce 15-second limit
      camera: 'back',    // Default to back camera
      success: (res) => {
        console.log("Video selected/recorded:", res);
        // res contains tempFilePath, duration, size, height, width
        this.handleVideoValidation({
          tempFilePath: res.tempFilePath,
          duration: res.duration,
          size: res.size,
          width: res.width,
          height: res.height
        });
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

  handleVideoValidation: function(videoDetails) {
    console.log("handleVideoValidation called with:", videoDetails);

    // 1. Validate Duration
    if (videoDetails.duration > 15.5) {
      console.warn("Video duration exceeds 15s:", videoDetails.duration);
      wx.showModal({
        title: '视频过长',
        content: '您选择的视频超过15秒，请重新选取或录制一个较短的视频。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    // 2. Validate File Size
    const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    if (videoDetails.size > MAX_SIZE_BYTES) {
      console.warn("Video size exceeds 10MB:", videoDetails.size);
      wx.showModal({
        title: '视频文件过大',
        content: '您选择的视频超过10MB，请重新选取或录制一个较小的视频。',
        showCancel: false,
        confirmText: '知道了'
      });
      return;
    }

    // 3. If Checks Pass
    console.log("Video validation passed. Path:", videoDetails.tempFilePath);
    this.setData({
      recordedVideo: videoDetails.tempFilePath,
      topThreeFrames: [],
      frameAnalysisResults: [],
      failedUploads: [] 
    });
    this.uploadAndScore(); // Start frame extraction and upload
  },

  handleCameraPress: function () {
    wx.getSetting({
      success: (res) => {
        if (!res.authSetting['scope.camera']) {
          wx.authorize({
            scope: 'scope.camera',
            success: () => this.initCamera(),
            fail: () => {
              wx.showModal({
                title: '授权失败',
                content: '您需要授权摄像头权限才能使用此功能。是否前往设置页面重新授权？',
                success: (modalRes) => { if (modalRes.confirm) wx.openSetting(); }
              });
            }
          });
        } else {
          this.initCamera();
        }
      }
    });
  },

  initCamera: function() {
    if (!this.data.cameraContext) {
        this.setData({ cameraContext: wx.createCameraContext('myCamera') });
    }
    this.setData({ showCamera: true, recordedVideo: null, isRecording: false, poseScore: null, skeletonUrl: null }); 
  },

  startRecording: function () {
    if (!this.data.cameraContext) {
        console.error("Camera context not initialized");
        wx.showToast({ title: '相机未准备好', icon: 'none'});
        return;
    }
    this.data.cameraContext.startRecord({
      success: () => this.setData({ isRecording: true }),
      fail: (err) => {
        console.error("Start recording failed", err);
        wx.showToast({ title: '开始录制失败', icon: 'none'});
      }
    });
  },

  stopRecording: function () {
    if (!this.data.cameraContext) {
        console.error("Camera context not initialized for stopping");
        return;
    }
    this.data.cameraContext.stopRecord({
      success: (res) => {
        this.setData({ 
          isRecording: false, 
          recordedVideo: res.tempVideoPath,
          isProcessingFrames: false, 
          topThreeFrames: [],        
          frameAnalysisResults: []   
        });
      },
      fail: (err) => {
        console.error("Stop recording failed", err);
        this.setData({ isRecording: false });
        wx.showToast({ title: '停止录制失败', icon: 'none'});
      }
    });
  },
  
  retakeVideo: function() {
    this.setData({ recordedVideo: null, isRecording: false, poseScore: null, skeletonUrl: null }); 
  },

  closeCamera: function () {
    if (this.data.isRecording) {
        this.stopRecording(); 
    }
    this.setData({ showCamera: false, recordedVideo: null, isRecording: false, poseScore: null, skeletonUrl: null }); 
  },

  cameraError: function(e) {
    console.error('Camera error:', e.detail);
    wx.showToast({ title: '相机错误: ' + (e.detail.errMsg || '未知错误'), icon: 'none' });
    this.setData({ showCamera: false });
  },

  toggleCamera: function() {
    const newPosition = this.data.cameraPosition === 'front' ? 'back' : 'front';
    this.setData({ cameraPosition: newPosition });
  },

  // closeScoreModal: function () {
  //   this.setData({ 
  //     // showScoreModal: false, // Commented out
  //     // poseScore: null, // Commented out
  //     // scoreSkeletonImageUrl: null // Commented out
  //   }); 
  // },

  onImageError: function(e) {
    const currentImageUrl = this.data.currentSequence && 
                              this.data.currentSequence.poses[this.data.currentPoseIndex] &&
                              this.data.currentSequence.poses[this.data.currentPoseIndex].image_url;
    if (currentImageUrl) {
      console.warn('Image load error for URL:', currentImageUrl, 'Error details:', e.detail.errMsg);
    } else {
      console.warn('Image load error, current pose image_url unavailable. Event src:', e.target.id || e.target.src, 'Error details:', e.detail.errMsg);
    }
  },

  onHide: function () {
    this.stopTimer();
  },

  onUnload: function () {
    this.stopTimer(); 
  },
});
