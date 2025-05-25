// const yogaApi = require('../../utils/yoga-api.js'); // Removed
const cloudSequenceService = require('../../utils/cloud-sequence-service.js');
const sequenceService = require('../../utils/sequence-service.js');

Page({
  data: {
    level: '',
    currentSequence: null, // Will be populated by cloudSequenceService and processed by sequenceService
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
    poseScore: null, // Structure might change based on TODO in uploadAndScore
  },

  onLoad: function (options) {
    const level = options.level || 'beginner';
    this.setData({ level: level });
    this.loadSequenceData(level);

    const soundCtx = wx.createInnerAudioContext({ useWebAudioImplement: false });
    this.setData({ soundContext: soundCtx });
    
    this.data.soundContext.onEnded(() => {
      console.log('Audio ended');
      // Logic for when audio naturally ends
    });
    this.data.soundContext.onError((res) => {
      console.error('Audio Error:', res.errMsg);
      wx.showToast({ title: '音频播放失败', icon: 'none' });
    });
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
        wx.setNavigationBarTitle({ title: `${initialState.currentSequence.name.zh} - ${initialState.currentPoseIndex + 1}/${initialState.currentSequence.poses.length}` });
      } else {
        console.error('No sequence data or empty poses array returned for level:', level);
        throw new Error('加载的序列数据无效'); // More user-friendly error
      }
    } catch (err) {
      console.error('Failed to load sequence:', err);
      this.setData({
        loading: false,
        error: err.message || '无法加载序列数据，请稍后重试。',
        currentSequence: null,
      });
      wx.hideLoading();
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      wx.setNavigationBarTitle({ title: '错误' });
    }
  },

  startTimer: function () {
    if (this.data.timerId) clearInterval(this.data.timerId); 

    const timerId = setInterval(() => {
      if (this.data.timeRemaining > 0) {
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
    // audioUrl should now be a fully qualified URL from cloudSequenceService (pose.audioGuide)
    if (audioUrl && this.data.soundContext) {
      console.log("Playing audio from URL:", audioUrl);
      this.data.soundContext.stop(); 
      this.data.soundContext.src = audioUrl; // This should be a full URL
      this.data.soundContext.play()
        .catch(error => console.error("Error playing audio:", error)); // Add catch for play promise
    } else {
      console.warn("No audio URL for current pose or sound context not ready. Audio URL:", audioUrl);
    }
  },

  handleBack: function () {
    if (this.data.soundContext) this.data.soundContext.stop();
    this.stopTimer();
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
      });
      // currentSequence.name.zh should be available if loadSequenceData was successful
      wx.setNavigationBarTitle({ title: `${currentSequence.name.zh} - ${nextState.currentPoseIndex_new + 1}/${currentSequence.poses.length}` });
      
      if (this.data.isPlaying) {
        const newCurrentPose = currentSequence.poses[nextState.currentPoseIndex_new];
        this.playAudioGuidance(newCurrentPose.audioGuide); // Use audioGuide which is processed by cloud-service
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
      this.playAudioGuidance(currentPose.audioGuide); // Use audioGuide
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
        suggestions: ["模拟建议：下次尝试更深度的伸展。", "模拟建议：保持呼吸平稳。"]
      };
      this.setData({
        poseScore: mockScoreResult,
        isUploading: false,
        showScoreModal: true,
        showCamera: false, 
        recordedVideo: null,
      });
    }, 2000); // Simulate upload and scoring delay
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
  },

  onUnload: function () {
    if (this.data.soundContext) {
      this.data.soundContext.destroy();
    }
    this.stopTimer(); 
  },
});
