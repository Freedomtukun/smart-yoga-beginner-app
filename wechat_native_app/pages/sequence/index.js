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
  },

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
