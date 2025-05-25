const yogaApi = require('../../utils/yoga-api.js');
const sequenceService = require('../../utils/sequence-service.js');

Page({
  data: {
    level: '',
    currentSequence: null,
    currentPoseIndex: 0,
    isPlaying: false,
    timeRemaining: 0,
    loading: true,
    error: null,
    soundContext: null,
    timerId: null,

    showCamera: false,
    isRecording: false,
    recordedVideo: null,
    cameraContext: null,
    isUploading: false,

    showScoreModal: false,
    poseScore: null, // Will now store { code, score, feedback, suggestions, message }
  },

  onLoad: function (options) {
    const level = options.level || 'beginner';
    this.setData({ level: level });
    this.loadSequenceData(level);

    const soundCtx = wx.createInnerAudioContext({ useWebAudioImplement: false });
    this.setData({ soundContext: soundCtx });
    
    this.data.soundContext.onEnded(() => {
      console.log('Audio ended');
      // If isPlaying was true, and timer reached 0, handleNext would have been called.
      // If audio ends before timer (e.g. short audio), timer will continue.
      // If user pauses, then audio is paused.
      // This onEnded might be useful if we want specific action when only audio finishes.
    });
    this.data.soundContext.onError((res) => {
      console.error('Audio Error:', res.errMsg);
      wx.showToast({ title: '音频播放失败', icon: 'none' });
    });
  },

  async loadSequenceData(level) {
    this.setData({ loading: true, error: null });
    try {
      const sequenceData = await yogaApi.loadPoseSequence(level);
      if (sequenceData && sequenceData.poses && sequenceData.poses.length > 0) {
        // Use sequenceService to set the initial state based on the fetched data
        const initialState = sequenceService.setSequence(sequenceData);
        this.setData({
          ...initialState, // currentSequence, currentPoseIndex, isPlaying, timeRemaining
          loading: false,
        });
        // Note: yoga-api.js mock data currently returns sequenceData.name as a string.
        // JSDoc expects name: {en, zh}. If mock data is updated, this needs to be sequenceData.name.zh
        wx.setNavigationBarTitle({ title: `${sequenceData.name} - ${initialState.currentPoseIndex + 1}/${initialState.currentSequence.poses.length}` });
      } else {
        console.error('No sequence data or empty poses array returned for level:', level);
        throw new Error('No valid sequence data returned');
      }
    } catch (err) {
      console.error('Failed to load sequence:', err);
      this.setData({
        loading: false,
        error: '无法加载序列数据，请稍后重试。',
        currentSequence: null, // Clear sequence on error
      });
      wx.setNavigationBarTitle({ title: '错误' });
    }
  },

  startTimer: function () {
    if (this.data.timerId) clearInterval(this.data.timerId); 

    const timerId = setInterval(() => {
      if (this.data.timeRemaining > 0) {
        // Direct setData for timer is fine, or use sequenceService.setTimeRemaining
        this.setData(sequenceService.setTimeRemaining(this.data.timeRemaining - 1));
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

  playAudioGuidance: function (audioUrl) {
    // audioUrl in current mock data is a full URL.
    // JSDoc for Pose in services suggests audioGuide is a filename.
    // This will work with current mock data, but needs adjustment if mock data aligns with JSDoc.
    if (audioUrl && this.data.soundContext) {
      this.data.soundContext.stop(); 
      this.data.soundContext.src = audioUrl;
      this.data.soundContext.play();
    } else {
      console.warn("No audio URL for current pose or sound context not ready.");
    }
  },

  handleBack: function () {
    if (this.data.soundContext) this.data.soundContext.stop();
    this.stopTimer();
    // Reset sequence state if navigating away from the page completely
    // This depends on desired behavior. For now, just navigate back.
    // const resetState = sequenceService.resetSequence();
    // this.setData(resetState);
    wx.navigateBack();
  },

  handleNext: function () {
    this.stopTimer();
    if (this.data.soundContext) this.data.soundContext.stop();

    const { currentSequence, currentPoseIndex } = this.data;
    const nextState = sequenceService.nextPose(currentSequence, currentPoseIndex);

    if (nextState) {
      this.setData({
        currentPoseIndex: nextState.currentPoseIndex_new,
        timeRemaining: nextState.timeRemaining_new,
        // isPlaying state is preserved from current data.isPlaying, or set explicitly if needed
      });
      // Note: currentSequence.name is a string in current mock data.
      wx.setNavigationBarTitle({ title: `${currentSequence.name} - ${nextState.currentPoseIndex_new + 1}/${currentSequence.poses.length}` });
      
      if (this.data.isPlaying) {
        const newCurrentPose = currentSequence.poses[nextState.currentPoseIndex_new];
        this.playAudioGuidance(newCurrentPose.audio_url); // Assumes audio_url from mock data
        this.startTimer();
      }
    } else {
      // Sequence finished
      wx.showToast({ title: '序列完成!', icon: 'success' });
      setTimeout(() => {
        // Optionally reset state before redirecting
        // this.setData(sequenceService.resetSequence());
        wx.redirectTo({ url: '/pages/index/index' });
      }, 1500);
    }
  },

  togglePlayPause: function () {
    const { isPlaying_new } = sequenceService.togglePlayPause(this.data.isPlaying);
    this.setData({ isPlaying: isPlaying_new });

    if (isPlaying_new) {
      const currentPose = this.data.currentSequence.poses[this.data.currentPoseIndex];
      this.playAudioGuidance(currentPose.audio_url); // Assumes audio_url from mock data
      this.startTimer();
    } else {
      if (this.data.soundContext) this.data.soundContext.pause();
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
    this.setData({ showCamera: true, recordedVideo: null, isRecording: false, poseScore: null });
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
    if (!this.data.recordedVideo) {
      wx.showToast({ title: '没有录制的视频', icon: 'none' });
      return;
    }
    this.setData({ isUploading: true });
    
    try {
      const currentPoseId = this.data.currentSequence.poses[this.data.currentPoseIndex].id;
      const scoreData = await yogaApi.scorePoseVideo(currentPoseId, this.data.recordedVideo);
      // scoreData should be: { code, score, feedback, suggestions, message }
      if (scoreData && scoreData.code === 0) {
        this.setData({
          poseScore: scoreData, // Contains score, feedback, suggestions
          isUploading: false,
          showScoreModal: true,
          showCamera: false, 
          recordedVideo: null,
        });
      } else {
        throw new Error(scoreData.message || '评分服务返回错误');
      }
    } catch (err) {
      console.error('Upload and score failed:', err);
      this.setData({
        isUploading: false,
        poseScore: { score: 'N/A', feedback: `评分失败: ${err.message}`, suggestions: [] },
        showScoreModal: true, // Show modal even on error to inform user
        // showCamera: false, // Optionally keep camera open or close
      });
    }
  },
  
  retakeVideo: function() {
    this.setData({ recordedVideo: null, isRecording: false, poseScore: null });
  },

  closeCamera: function () {
    if (this.data.isRecording) {
        this.stopRecording(); 
    }
    this.setData({ showCamera: false, recordedVideo: null, isRecording: false, poseScore: null });
  },

  cameraError: function(e) {
    console.error('Camera error:', e.detail);
    wx.showToast({ title: '相机错误: ' + (e.detail.errMsg || '未知错误'), icon: 'none' });
    this.setData({ showCamera: false });
  },

  // --- Score Modal Methods ---
  closeScoreModal: function () {
    this.setData({ showScoreModal: false, poseScore: null });
    // Decide if camera should re-open or stay closed
  },

  onUnload: function () {
    if (this.data.soundContext) {
      this.data.soundContext.destroy();
    }
    this.stopTimer(); 
    // Consider resetting all sequence state if page is unloaded
    // this.setData(sequenceService.resetSequence());
  },
});
