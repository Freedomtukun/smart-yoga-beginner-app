// const yogaApi = require('../../utils/yoga-api.js'); // Removed
const cloudSequenceService = require('../../utils/cloud-sequence-service.js');
const sequenceService = require('../../utils/sequence-service.js');

const getText = v => (typeof v === 'object' ? (v.zh || v.en || '') : v);

Page({
  data: {
    level: '',
    currentSequence: null, // Will be populated by cloudSequenceService and processed by sequenceService
    currentPoseIndex: 0,
    isPlaying: false,
    timeRemaining: 0,
    loading: true,
    error: null,
    // soundContext: null, // Removed as per refactoring
    timerId: null,

    showCamera: false,
    isRecording: false,
    recordedVideo: null,
    cameraContext: null,
    cameraPosition: 'back', // Added cameraPosition
    isUploading: false,

    showScoreModal: false,
    poseScore: null, // Structure might change based on TODO in uploadAndScore
    skeletonUrl: null, // Added skeletonUrl
    scoreSkeletonImageUrl: null, // Added for score modal skeleton image
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
        // Keep existing behavior for other specific errors if err.message is somewhat user-friendly
        // or create a more generic one.
        // For this case, let's make it generic if not MISSING_SIGNED_URL
        userErrorMessage = '加载序列时发生错误，请稍后重试。'; // As per current prompt's example
        toastMessage = '加载错误'; // As per current prompt's example
        // If we want to retain the specific error message from the throw:
        // userErrorMessage = err.message; 
        // toastMessage = err.message.length > 20 ? '加载错误' : err.message; // Keep toast short
      }
      // For other generic errors where err.message might be empty/undefined, 
      // the default userErrorMessage and toastMessage will be used.

      this.setData({
        loading: false,
        error: userErrorMessage,
        currentSequence: null,
      });
      wx.hideLoading();
      wx.showToast({ title: toastMessage, icon: 'none' });
      wx.setNavigationBarTitle({ title: '加载错误' }); // More generic title on error
    }
  },

  startTimer: function () {
    if (this.data.timerId) clearInterval(this.data.timerId); 

    const timerId = setInterval(() => {
      if (this.data.timeRemaining > 0) {
        // Ensure this.data.timeRemaining is accessed before it's potentially changed by setData
        const newTimeRemaining = this.data.timeRemaining - 1;
        console.log('Timer tick:', newTimeRemaining); // Debug line, ensure it's present
        this.setData({ timeRemaining: newTimeRemaining });
        // Note: This change assumes sequenceService.setTimeRemaining(val) simply returns { timeRemaining: val }
        // or that direct update is preferred. If sequenceService.setTimeRemaining had other side effects
        // or returned a more complex state object, the original call:
        // this.setData(sequenceService.setTimeRemaining(newTimeRemaining));
        // would be more appropriate to preserve that full functionality.
        // Given that sequenceService.setTimeRemaining typically is just a formatter like:
        // setTimeRemaining: newTime => ({ timeRemaining: newTime }),
        // this direct setData call is functionally equivalent and more explicit for timeRemaining.
      } else {
        console.log('Timer ended, clearing interval.'); // Added log for clarity
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
        wx.showToast({ title: '音频播放失败', icon: 'none' }); // Keep toast for direct error
        audioCtx.destroy();
        reject(error);
      });
      
      // For wx.createInnerAudioContext, play() does not return a Promise.
      // Errors during play initiation are typically handled by the onError callback.
      audioCtx.play();
      console.log("Attempting to play audio from URL:", src);
    });
  },

  handleBack: function () {
    // Removed soundContext.stop()
    this.stopTimer();
    wx.navigateBack();
  },

  handleNext: function () {
    this.stopTimer();
    // Removed soundContext.stop()

    const { currentSequence, currentPoseIndex } = this.data;
    const nextState = sequenceService.nextPose(currentSequence, currentPoseIndex);

    if (nextState) {
      this.setData({
        currentPoseIndex: nextState.currentPoseIndex_new,
        timeRemaining: nextState.timeRemaining_new,
      });
      // currentSequence.name.zh should be available if loadSequenceData was successful
      wx.setNavigationBarTitle({ title: `${getText(currentSequence.name)} - ${nextState.currentPoseIndex_new + 1}/${currentSequence.poses.length}` });
      
      if (this.data.isPlaying) {
        const newCurrentPose = currentSequence.poses[nextState.currentPoseIndex_new];
        this.playAudioGuidance(newCurrentPose.audioGuide)
          .then(() => {
            console.log('Audio finished playing in handleNext');
            // Optional: Any logic to run after audio successfully finishes in this context
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
          // Optional: Any logic to run after audio successfully finishes in this context
        })
        .catch(error => {
          console.error("Audio playback error in togglePlayPause:", error);
            wx.showToast({ title: '音频播放失败', icon: 'none' });
        });
      this.startTimer();
    } else {
      // Removed soundContext.pause()
      this.stopTimer();
    }
  },

  // --- Camera Methods ---
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
    this.setData({ showCamera: true, recordedVideo: null, isRecording: false, poseScore: null, skeletonUrl: null }); // Reset skeletonUrl
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
      },
      fail: (err) => {
        console.error("Stop recording failed", err);
        this.setData({ isRecording: false });
        wx.showToast({ title: '停止录制失败', icon: 'none'});
      }
    });
  },

  async uploadAndScore() {
    // TODO: Integrate real pose-scoring cloud function call here.
    // This function would likely involve:
    // 1. Uploading this.data.recordedVideo to cloud storage (e.g., COS via a cloud function).
    // 2. Calling another cloud function with the video's cloud path and this.data.currentSequence.poses[this.data.currentPoseIndex].id.
    // 3. Receiving score, feedback, suggestions from that cloud function.
    // 4. Updating this.setData({ poseScore: resultFromServer, ... })

    if (!this.data.recordedVideo) {
      wx.showToast({ title: '没有录制的视频', icon: 'none' });
      return;
    }
    this.setData({ isUploading: true });
    
    // Mocking the scoring process for now
    console.log("Simulating upload and score for video:", this.data.recordedVideo);
    console.log("Current Pose ID for scoring:", this.data.currentSequence.poses[this.data.currentPoseIndex].id);

    setTimeout(() => {
      const mockScoreResult = {
        // Conforming to PoseScoreResponse structure from JSDoc in yoga-api.js (now cloud-sequence-service.js)
        code: 0, 
        score: Math.floor(Math.random() * 30) + 70, // Random score between 70-99
        feedback: "模拟评分：体式完成度良好，请注意保持平衡。",
        suggestions: ["模拟建议：下次尝试更深度的伸展。", "模拟建议：保持呼吸平稳。"],
        skeleton_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/skeleton/mock_user_pose_overlay.png', // For main page
        skeleton_image_url: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/skeleton/mock_user_pose_overlay.png' // For score modal
      };

      // Fallback logic for main page skeletonUrl
      // Assuming the mock response structure is { result: { skeleton_url: '...' } }
      // For the current mock, mockScoreResult directly contains skeleton_url
      let finalSkeletonUrl = mockScoreResult.skeleton_url ? mockScoreResult.skeleton_url : '/assets/images/adaptive-icon.png'; 
      // If the backend response structure is actually res.result.skeleton_url, it would be:
      // let resFromServer = { result: mockScoreResult }; // Simulate nesting if needed
      // let finalSkeletonUrl = (resFromServer.result && resFromServer.result.skeleton_url) ? resFromServer.result.skeleton_url : '/assets/images/adaptive-icon.png';
      // For now, sticking to direct access on mockScoreResult as per current mock structure.
      
      let urlFromApiForModal = mockScoreResult.skeleton_image_url;

      this.setData({
        poseScore: mockScoreResult,
        skeletonUrl: finalSkeletonUrl, // Use finalSkeletonUrl with fallback (for main page)
        scoreSkeletonImageUrl: urlFromApiForModal || null, // For score modal
        isUploading: false,
        showScoreModal: true,
        showCamera: false, 
        recordedVideo: null,
      });
    }, 2000); // Simulate upload and scoring delay
  },
  
  retakeVideo: function() {
    this.setData({ recordedVideo: null, isRecording: false, poseScore: null, skeletonUrl: null }); // Reset skeletonUrl
  },

  closeCamera: function () {
    if (this.data.isRecording) {
        this.stopRecording(); 
    }
    this.setData({ showCamera: false, recordedVideo: null, isRecording: false, poseScore: null, skeletonUrl: null }); // Reset skeletonUrl
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

  // --- Score Modal Methods ---
  closeScoreModal: function () {
    this.setData({ showScoreModal: false, poseScore: null, scoreSkeletonImageUrl: null }); // Reset scoreSkeletonImageUrl
  },

  onImageError: function(e) {
    const currentImageUrl = this.data.currentSequence && 
                              this.data.currentSequence.poses[this.data.currentPoseIndex] &&
                              this.data.currentSequence.poses[this.data.currentPoseIndex].image_url;
    if (currentImageUrl) {
      console.warn('Image load error for URL:', currentImageUrl, 'Error details:', e.detail.errMsg);
    } else {
      // Fallback if current pose data or image_url is somehow not available when error fires
      console.warn('Image load error, current pose image_url unavailable. Event src:', e.target.id || e.target.src, 'Error details:', e.detail.errMsg);
    }
  },

  onScoreSkeletonImageError: function(e) {
    console.error('Error loading skeleton image in score modal. URL attempted:', this.data.scoreSkeletonImageUrl, 'Error message:', e.detail.errMsg);
    // Set to null to trigger the fallback text in WXML
    this.setData({ scoreSkeletonImageUrl: null }); 
  },

  onHide: function () {
    this.stopTimer();
  },

  onUnload: function () {
    // Removed soundContext.destroy()
    this.stopTimer(); 
  },
});
