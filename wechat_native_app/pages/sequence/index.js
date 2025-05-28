import { scorePose } from '../../utils/yoga-api.js';
const cloudSequenceService = require('../../utils/cloud-sequence-service.js');
const sequenceService      = require('../../utils/sequence-service.js');
const getText = v => (typeof v === 'object' ? (v.zh || v.en || '') : v);

Page({
  data:{
    level:'', currentSequence:null,currentPoseIndex:0,isPlaying:false,
    timeRemaining:0,loading:true,error:null,
    skeletonUrl:null,              // 主界面骨架图
    scoreSkeletonImageUrl:null,    // 评分弹窗骨架图
    showScoreModal:false,isUploading:false,
    poseScore:null,
    // Merged from original data:
    timerId: null,
    showCamera: false,
    isRecording: false,
    recordedVideo: null,
    cameraContext: null,
    cameraPosition: 'back',

  // New properties for frame extraction and analysis:
  isProcessingFrames: false,      // Boolean flag to show/hide frame processing progress UI
  frameAnalysisResults: [],     // Array to store {score, skeletonUrl, feedback, originalFramePath, error} for each analyzed frame
  topThreeFrames: [],           // Array to store the top 3 frames {score, skeletonUrl, feedback} for display
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
      this.setData({ frameExtractionCanvasContext: ctx });
      console.log('Frame extraction canvas context initialized.');
    }
    // Video context for frameExtractorVideo is created when its src is set,
    // or can be created explicitly if needed for early interaction.
    // For now, we'll rely on it being available after src is set.
    // If direct control before loading is needed:
    if (!this.data.frameExtractorVideoContext) {
       const videoCtx = wx.createVideoContext('frameExtractorVideo', this);
       this.setData({ frameExtractorVideoContext: videoCtx });
       console.log('Frame extractor video context explicitly created.');
    }
  },

  // Called when the hidden video's metadata is loaded
  onVideoLoadMetadata: function(e) {
    const { duration, width, height } = e.detail;
    this.setData({
      videoMetadata: { duration, width, height }
    });
    console.log('Video metadata loaded for frame extraction:', this.data.videoMetadata);
    // Enhanced check for duration
    if (!duration || duration <= 0) {
      console.error('Invalid video metadata or duration:', e.detail);
      this.setData({ isProcessingFrames: false }); // Ensure loading state is turned off
      wx.showToast({ title: '视频加载失败，无法分析', icon: 'none' });
      return;
    }
    this.startFrameExtractionLoop();
  },

  // Core logic for extracting frames
  startFrameExtractionLoop: async function() {
    // Reset states at the beginning of frame extraction.
    this.setData({ 
      isProcessingFrames: true, 
      frameAnalysisResults: [], 
      topThreeFrames: [],
      // Consider resetting extractorVideoSrc if it causes issues being stale, though usually it's fine.
      // extractorVideoSrc: null 
    });
    console.log('Starting frame extraction loop...');

    const { duration, width, height } = this.data.videoMetadata;
    let videoCtx = this.data.frameExtractorVideoContext;
    const canvasCtx = this.data.frameExtractionCanvasContext;

    if (!videoCtx) {
        console.warn("frameExtractorVideoContext not found, attempting to create.");
        videoCtx = wx.createVideoContext('frameExtractorVideo', this);
        this.setData({ frameExtractorVideoContext: videoCtx });
        if(!videoCtx) {
            console.error('Failed to create frameExtractorVideoContext. Aborting frame extraction.');
            this.setData({ isProcessingFrames: false });
            wx.showToast({ title: '无法控制视频', icon: 'none' });
            return;
        }
    }
    
    if (!canvasCtx) {
      console.error('frameExtractionCanvasContext not found. Aborting frame extraction.');
      this.setData({ isProcessingFrames: false });
      wx.showToast({ title: '无法绘图', icon: 'none' });
      return;
    }

    const canvasWidth = 360; 
    const canvasHeight = Math.round(canvasWidth * (height / width)) || 640; 
    console.log(`Canvas dimensions for extraction: ${canvasWidth}x${canvasHeight}`);

    let extractedFramePaths = [];

    for (let t = 0; t < duration; t++) {
      console.log(`Seeking to ${t}s`);
      videoCtx.seek(t);
      
      // Wait for seek to complete. Using a delay for now.
      // TODO: Refactor to use onVideoSeeked or onVideoTimeUpdate for better reliability
      await new Promise(resolve => setTimeout(resolve, 500)); 

      console.log(`Drawing frame at ${t}s to canvas frameExtractorCanvas`);
      // Attempting to draw by ID. The video element itself is 'frameExtractorVideo'.
      canvasCtx.drawImage('frameExtractorVideo', 0, 0, canvasWidth, canvasHeight);
      
      // Wait for draw to complete
      await new Promise(resolve => {
        canvasCtx.draw(false, () => {
          console.log(`Canvas draw completed for time ${t}s`);
          resolve();
        });
      });

      try {
        const frameData = await wx.canvasToTempFilePath({
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
          destWidth: canvasWidth,
          destHeight: canvasHeight,
          canvasId: 'frameExtractorCanvas',
          fileType: 'jpg',
          quality: 0.8
        }, this); // 'this' context is important here
        extractedFramePaths.push(frameData.tempFilePath);
        console.log(`Extracted frame ${extractedFramePaths.length}/${Math.floor(duration)}: ${frameData.tempFilePath}`);
      } catch (err) {
        console.error(`Frame extraction to temp file failed at ${t}s:`, err);
        // If one frame fails, log and continue. Consider a failure threshold later.
      }
    }

    console.log('All frames extracted attempts finished. Paths:', extractedFramePaths);

    if (extractedFramePaths.length > 0) {
      this.analyzeFramesBatch(extractedFramePaths);
    } else {
      this.setData({ isProcessingFrames: false }); // Ensure this is set on failure
      wx.showToast({ title: '未能成功提取任何帧', icon: 'none' });
      console.warn('No frames were extracted from the video.');
    }
  },

  uploadFrameForScoring: async function(framePath, poseId) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: 'https://yogamaster.aiforcause.cn/api/score_pose', // Actual API endpoint
        filePath: framePath,
        name: 'file', // Assuming 'file' is the expected name for the frame file by the API
        formData: {
          poseId: poseId,
          // Add any other required parameters for the API, e.g., user_id if needed
        },
        success: (res) => {
          try {
            const resultData = JSON.parse(res.data);
            // Assuming API returns a structure like { success: true, data: { score, feedback, skeleton_image_url } }
            // or { success: false, message: "error message" }
            if (res.statusCode === 200 && resultData.success) {
              resolve({
                score: resultData.data?.score,
                feedback: resultData.data?.feedback,
                skeletonUrl: resultData.data?.skeleton_image_url, // Key matches API assumption
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
              details: res.data // Include raw response data for debugging
            });
          }
        },
        fail: (err) => {
          console.error('wx.uploadFile failed for frame', framePath, err);
          reject({
            error: `Upload failed: ${err.errMsg}`,
            originalFramePath: framePath,
            details: err
          });
        }
      });
    });
  },

  analyzeFramesBatch: async function(framePathsArray) {
    if (!framePathsArray || framePathsArray.length === 0) {
      console.log('No frames to analyze.');
      this.setData({ isProcessingFrames: false });
      wx.showToast({ title: '没有提取到帧进行分析', icon: 'none' });
      return;
    }

    this.setData({ isProcessingFrames: true }); 
    wx.showLoading({ title: '分析帧中 (0%)...', mask: true });

    // Enhanced check for poseId availability
    if (!this.data.currentSequence || 
        !this.data.currentSequence.poses[this.data.currentPoseIndex] || 
        !this.data.currentSequence.poses[this.data.currentPoseIndex].id) {
      console.error('Current pose ID is not available for analysis.');
      this.setData({ isProcessingFrames: false });
      wx.hideLoading(); // Hide loading before showing toast
      wx.showToast({ title: '无法获取当前体式ID', icon: 'none' });
      return;
    }
    const poseId = this.data.currentSequence.poses[this.data.currentPoseIndex].id;

    let uploadPromises = [];
    for (const framePath of framePathsArray) {
      uploadPromises.push(this.uploadFrameForScoring(framePath, poseId));
    }

    const results = await Promise.allSettled(uploadPromises);
    
    let analysisResults = [];
    let successfulUploads = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        analysisResults.push(result.value);
        successfulUploads++;
      } else {
        console.error('Frame analysis failed:', result.reason);
        analysisResults.push({
          score: 0, 
          feedback: '分析失败: ' + (result.reason.error || '未知错误'),
          skeletonUrl: null, 
          originalFramePath: result.reason.originalFramePath,
          error: result.reason.details || result.reason.error
        });
      }
      // Update loading message
      const progress = Math.round(((index + 1) / framePathsArray.length) * 100);
      wx.showLoading({ title: `分析帧中 (${progress}%)...`, mask: true });
    });
    
    wx.hideLoading();
    this.setData({
      frameAnalysisResults: analysisResults,
      // isProcessingFrames will be set to false by selectAndDisplayTopFrames or if errors occur there
    });
    
    console.log('All frames analysis attempt complete:', analysisResults);

    // Enhanced UI Feedback based on analysis results
    const totalFrames = framePathsArray.length;
    if (successfulUploads === 0 && totalFrames > 0) {
      wx.showToast({ title: '所有帧分析失败', icon: 'none', duration: 2000 });
    } else if (successfulUploads < totalFrames && successfulUploads > 0) {
      wx.showToast({ title: `部分帧分析失败 (${successfulUploads}/${totalFrames} 成功)`, icon: 'none', duration: 2000 });
    } else if (successfulUploads === totalFrames && totalFrames > 0) {
      // This toast might be redundant if selectAndDisplayTopFrames shows a success message
      // wx.showToast({ title: `所有帧分析成功!`, icon: 'success', duration: 2000 });
      console.log("All frames analyzed successfully.");
    }
    // No specific toast if totalFrames is 0, as that's handled earlier.
    
    this.selectAndDisplayTopFrames(); // This will handle final UI updates and potential further toasts
  },

  selectAndDisplayTopFrames: function() {
    const results = this.data.frameAnalysisResults;

    // Ensure isProcessingFrames is turned off here as this is a final step in the flow.
    this.setData({ isProcessingFrames: false });

    if (!results || results.length === 0) {
      console.log('No analysis results to select from for top frames.');
      this.setData({ topThreeFrames: [] }); 
      // If analyzeFramesBatch already showed "All frames analysis failed", this might be redundant.
      // Consider if a toast is needed here if results are empty.
      // For example, if analyzeFramesBatch didn't show a specific "all failed" toast.
      return;
    }

    // Filter for valid results that have a numeric score
    const validResults = results.filter(r => r && typeof r.score === 'number' && r.score > 0 && r.skeletonUrl);
    
    if (validResults.length === 0) {
      console.log('No valid frames with scores found to display as top frames.');
      this.setData({ topThreeFrames: [] });
      // If analyzeFramesBatch indicated some successes but they didn't meet criteria (score > 0, skeletonUrl)
      // then a toast here is useful.
      if (results.some(r => r && typeof r.score === 'number')) { // Check if there were any results at all
         wx.showToast({ title: '未选出足够评分的帧展示', icon: 'none' });
      }
      return;
    }

    // Sort by score in descending order
    validResults.sort((a, b) => b.score - a.score);

    // Select top 3 frames
    const topFrames = validResults.slice(0, 3);

    this.setData({ topThreeFrames: topFrames });
    console.log('Top 3 frames selected for display:', topFrames);

    // Decision on modals:
    // The new topThreeFrames UI is designed to be a separate section.
    // If the regular single-video score modal (showScoreModal) is open,
    // it might be confusing to also show the top three.
    // For now, let's explicitly hide the single score modal if it's showing,
    // and ensure the camera modal is also closed to provide a clean view for top frames.
    if (this.data.showScoreModal) {
      this.setData({ showScoreModal: false });
    }
    if (this.data.showCamera) {
        // This implies the user is done with recording and camera view.
        // However, if the top 3 frames are shown *within* the camera modal area,
        // this line would be removed. Based on previous WXML, it's outside.
        // Closing camera modal makes sense to show the results clearly.
        this.setData({ showCamera: false });
    }

    if (topFrames.length > 0) {
        wx.showToast({
            title: `最佳 ${topFrames.length} 帧已显示`,
            icon: 'success',
            duration: 2000
        });
    }
  },

  // Entry point for processing video for frames
  processVideoForFrames: function(videoPath) {
    console.log('Starting video processing for frames:', videoPath);
    // Setting isProcessingFrames true here provides immediate feedback
    this.setData({ isProcessingFrames: true, topThreeFrames: [], frameAnalysisResults: [] }); 
    wx.showLoading({ title: '准备视频分析...', mask: true }); // Mask to prevent user interaction
    
    this.initializeFrameExtractionResources(); // This is synchronous
    
    // Set the src for the hidden video, which should trigger onVideoLoadMetadata
    this.setData({ extractorVideoSrc: videoPath }, () => {
        // wx.hideLoading(); // Loading is hidden by onVideoLoadMetadata or its error paths
        console.log('extractorVideoSrc has been set. Video should start loading.');
        // The actual processing starts when onVideoLoadMetadata is triggered.
        // If onVideoLoadMetadata fails to trigger, isProcessingFrames might remain true.
        // Consider a timeout here to reset isProcessingFrames if metadata doesn't load.
        // For now, assume onVideoLoadMetadata or onVideoError (if we had it) would handle it.
    });
  },
  
  // Optional: Placeholder for onVideoTimeUpdate
  onVideoTimeUpdate: function(e) {
    // console.log('Video timeupdate (frame extractor):', e.detail.currentTime);
  },

  // Optional: Placeholder for onVideoSeeked
  onVideoSeeked: function(e) {
    // console.log('Video seeked (frame extractor):', e.detail.currentTime);
  },

  // IMPORTANT NOTE: For videos recorded using the in-page camera, 
  // frame extraction and analysis are now automatically started by processVideoForFrames()
  // called from stopRecording(). This function (uploadAndScore) as it relates to 
  // this.data.recordedVideo (which is a video path) is superseded by that new flow.
  // If this function was also intended to handle single IMAGE uploads from other sources 
  // (e.g. chosen from gallery), that specific logic path would need to be distinct and preserved.
  async uploadAndScore(){
    if(!this.data.recordedVideo){wx.showToast({title:'没有录制的视频',icon:'none'});return;}
    this.setData({isUploading:true});
    try{
      const res = await scorePose(this.data.recordedVideo,
                 this.data.currentSequence.poses[this.data.currentPoseIndex].id);
      const result = res.data?.result ?? res.data;
      const {score,feedback,suggestions,skeleton_url,skeleton_image_url}=result;
      this.setData({
        poseScore:{score,feedback,suggestions},
        skeletonUrl:             skeleton_url        || null,
        scoreSkeletonImageUrl:   skeleton_image_url  || null,
        showScoreModal:true,
        isUploading:false
      });
    }catch(e){
      console.error('评分接口失败',e);
      let errMsg = '评分失败';
      // Try to get a more specific error message
      if (e && e.data && e.data.message) errMsg = e.data.message;
      else if (e && e.message) errMsg = e.message; 
      else if (e && e.errMsg) errMsg = e.errMsg; 
      wx.showToast({title: errMsg, icon:'none'});
      this.setData({isUploading:false}); 
    }
  },

  onScoreSkeletonImageError(e){
    console.error('骨架图加载失败:',this.data.scoreSkeletonImageUrl,e.detail.errMsg);
    this.setData({scoreSkeletonImageUrl:null});
    wx.showToast({title:'骨架图加载失败',icon:'none'});
  },

  onLoad: function (options) {
    const level = options.level || 'beginner';
    this.setData({ level: level });
    this.loadSequenceData(level);

    // Removed soundContext initialization and global handlers
  },

  async loadSequenceData(level) {
    this.setData({ loading: true, error: null });
    wx.showLoading({ title: '加载中...' });
    try {
      // Fetches sequence data with mapped URLs (e.g., pose.image_url, pose.audioGuide are full URLs)
      const sequenceData = await cloudSequenceService.getProcessedSequence(level);
      
      if (sequenceData && sequenceData.poses && sequenceData.poses.length > 0) {
        // sequenceService.setSequence initializes state based on the fetched sequence
        const initialState = sequenceService.setSequence(sequenceData); 
        this.setData({
          ...initialState, // currentSequence, currentPoseIndex, isPlaying, timeRemaining
          loading: false,
        });
        wx.hideLoading();
        // Assuming sequenceData.name is {en: "...", zh: "..."} as per JSDoc
        // and cloudSequenceService returns data in this structure.
        wx.setNavigationBarTitle({ title: `${getText(initialState.currentSequence.name)} - ${initialState.currentPoseIndex + 1}/${initialState.currentSequence.poses.length}` });
      } else {
        console.error('No sequence data or empty poses array returned for level:', level);
        throw new Error('加载的序列数据无效'); // More user-friendly error
      }
    } catch (err) {
      console.error('Failed to load sequence:', err);
      let userErrorMessage = '无法加载序列数据，请稍后重试。';
      let toastMessage = '加载失败，请稍后重试';

      if (err && err.message === 'MISSING_SIGNED_URL') {
        userErrorMessage = '序列配置获取失败，请检查网络或稍后重试。';
        toastMessage = '序列配置获取失败';
      } else if (err && err.message) { // Covers '加载的序列数据无效' and other specific messages from cloud service
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
        console.log('Timer tick:', newTimeRemaining); 
        this.setData({ timeRemaining: newTimeRemaining });
      } else {
        console.log('Timer ended, clearing interval.'); 
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
        console.log('Audio ended for src:', src);
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
      console.log("Attempting to play audio from URL:", src);
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
          .then(() => {
            console.log('Audio finished playing in handleNext');
          })
          .catch(error => {
            console.error("Audio playback error in handleNext:", error);
            wx.showToast({ title: '音频播放失败', icon: 'none' });
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
        .then(() => {
          console.log('Audio finished playing in togglePlayPause');
        })
        .catch(error => {
          console.error("Audio playback error in togglePlayPause:", error);
            wx.showToast({ title: '音频播放失败', icon: 'none' });
        });
      this.startTimer();
    } else {
      this.stopTimer();
    }
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
        this.setData({ isRecording: false, recordedVideo: res.tempVideoPath });
        // ---- MODIFICATION: Start frame processing instead of direct upload ----
        console.log('Video recording stopped. Temp path:', res.tempVideoPath);
        this.processVideoForFrames(res.tempVideoPath);
        // Comment out or remove direct upload if frame analysis replaces it or precedes it
        // this.uploadAndScore(); 
        // ---- END MODIFICATION ----
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

  closeScoreModal: function () {
    this.setData({ showScoreModal: false, poseScore: null, scoreSkeletonImageUrl: null }); 
  },

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
