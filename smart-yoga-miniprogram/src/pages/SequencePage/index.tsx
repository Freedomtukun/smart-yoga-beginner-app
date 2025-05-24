import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Button } from '@tarojs/components';
import Taro, { useLoad, useUnload, useRouter } from '@tarojs/taro';
import { useSequenceStore } from '../../store/sequenceStore';
import { loadPoseSequence } from '../../services/yogaApi';
import styles from './index.module.scss';
import { COS_BASE_URL } from '../../config/constants';

const POSE_IMAGE_BASE_URL = `${COS_BASE_URL}/images/poses/`;
// Audio base URL for pose guidance is embedded in the pose data itself (audioGuide field)

export default function SequencePage() {
  const router = useRouter();
  const {
    currentSequence,
    currentPoseIndex,
    isPlaying,
    timeRemaining,
    setSequence,
    nextPose,
    togglePlayPause,
    setTimeRemaining,
    resetSequence,
  } = useSequenceStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const poseAudioContextRef = useRef<Taro.InnerAudioContext | null>(null);

  const currentPose = currentSequence?.poses[currentPoseIndex];
  const totalPoses = currentSequence?.poses.length || 0;

  // Initial data loading and audio context setup
  useLoad(async () => {
    const level = router.params.level || 'beginner';
    setLoading(true);
    setError(null);

    try {
      const sequenceData = await loadPoseSequence(level);
      setSequence(sequenceData);
    } catch (e: any) {
      console.error('Failed to load sequence:', e);
      setError(e.message || '加载序列失败，请稍后重试。');
    } finally {
      setLoading(false);
    }

    // Initialize pose audio context
    poseAudioContextRef.current = Taro.createInnerAudioContext();
    poseAudioContextRef.current.onEnded(() => {
      // Optional: Handle audio ending, e.g., auto-play timer if not already playing
    });
    poseAudioContextRef.current.onError((res) => {
      console.error('Pose guidance audio error:', res); // Log the full error object
      Taro.showToast({ title: '当前音频加载失败', icon: 'none' }); // Specific toast for pose guidance
    });
  });

  // Timer logic
  useEffect(() => {
    if (isPlaying && timeRemaining > 0 && currentPose) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(timeRemaining - 1);
      }, 1000);
    } else if (timeRemaining === 0 && isPlaying && currentPose) {
      if (currentPoseIndex < totalPoses - 1) {
        nextPose(); // Automatically advance to next pose
      } else {
        togglePlayPause(); // Stop playing if it's the last pose
        Taro.showToast({ title: '序列完成!', icon: 'success' });
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, timeRemaining, currentPose, currentPoseIndex, totalPoses, setTimeRemaining, nextPose, togglePlayPause]);

  // Effect for playing pose guidance audio when pose changes or play is toggled
  useEffect(() => {
    if (currentPose?.audioGuide && isPlaying && poseAudioContextRef.current) {
      const audioCtx = poseAudioContextRef.current;
      audioCtx.stop(); // Stop previous audio if any
      audioCtx.src = currentPose.audioGuide;
      audioCtx.play()
        .catch(err => console.error("Error playing pose audio:", err));
    } else if (!isPlaying && poseAudioContextRef.current?.src) {
      // If paused and audio was playing (src is set), pause it.
      // Note: play() above handles the isPlaying case. This is for explicit pause.
      poseAudioContextRef.current.pause();
    }
  }, [currentPose?.audioGuide, currentPoseIndex, isPlaying]);


  // Cleanup on page unload
  useUnload(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (poseAudioContextRef.current) {
      poseAudioContextRef.current.stop();
      poseAudioContextRef.current.destroy();
      poseAudioContextRef.current = null;
    }
    // Optionally reset sequence if leaving mid-way, or preserve state
    // resetSequence(); // Uncomment if sequence should always reset on leave
  });

  const handleBack = () => {
    Taro.navigateBack();
  };

  const handlePlayPauseToggle = () => {
    if (!currentSequence || !currentPose) return;
    togglePlayPause();
  };

  const handleNextAction = () => {
    if (!currentSequence || !currentPose) return;
    if (currentPoseIndex < totalPoses - 1) {
      nextPose();
    } else {
      // Last pose completed
      Taro.reLaunch({ url: '/pages/HomePage/index' });
    }
  };
  
  const playCurrentPoseGuidance = () => {
    if (currentPose?.audioGuide && poseAudioContextRef.current) {
      const audioCtx = poseAudioContextRef.current;
      audioCtx.stop();
      audioCtx.src = currentPose.audioGuide;
      audioCtx.play()
        .catch(err => {
          console.error("Error playing pose guidance manually:", err);
          Taro.showToast({ title: '音频播放失败', icon: 'none' });
        });
    } else {
      Taro.showToast({ title: '当前体式无音频指导', icon: 'none' });
    }
  };

  if (loading) {
    return <View className={styles.centeredMessage}><Text>加载中...</Text></View>;
  }
  if (error) {
    return <View className={styles.centeredMessage}><Text>错误: {error}</Text></View>;
  }
  if (!currentSequence || !currentPose) {
    return <View className={styles.centeredMessage}><Text>未找到序列数据。</Text></View>;
  }

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View onTap={handleBack} className={styles.backButton}>
          <Text className={styles.backButtonText}>‹</Text>
        </View>
        <Text className={styles.headerTitle}>{currentSequence.name.zh}</Text>
        <Text className={styles.progressText}>
          {currentPoseIndex + 1} / {totalPoses}
        </Text>
      </View>

      <View className={styles.content}>
        <View className={styles.poseImageContainer}>
          <Image
            src={`${POSE_IMAGE_BASE_URL}${currentPose.id}.jpg`}
            className={styles.poseImage}
            mode="aspectFit" // Or aspectFill, depending on desired crop
            onError={(e) => {
              console.error(`Failed to load pose image: ${POSE_IMAGE_BASE_URL}${currentPose.id}.jpg`, e.detail.errMsg);
            }}
          />
        </View>

        <View className={styles.poseInfo}>
          <Text className={styles.poseName}>{currentPose.instructions.zh.split('。')[0]}</Text> {/* Simplified name */}
          <Text className={styles.instructions}>{currentPose.instructions.zh}</Text>
          {currentPose.transitionHint?.zh && (
            <Text className={styles.transitionHint}>下一步: {currentPose.transitionHint.zh}</Text>
          )}
          <View className={styles.statsContainer}>
            <Text className={styles.timerText}>计时: {timeRemaining}s</Text>
            {currentPose.breathCount && (
              <Text className={styles.breathText}>呼吸: {currentPose.breathCount}次</Text>
            )}
          </View>
        </View>
        
        {/* TODO: Future - Implement pose scoring feature */}
        {/* <View className={styles.cameraPlaceholder}>
          <Text>Pose Scoring Camera Area (Future)</Text>
        </View> */}

        <View className={styles.controls}>
          <Button className={styles.controlButton} onTap={playCurrentPoseGuidance}>
            播放指导
          </Button>
          <Button
            className={`${styles.controlButton} ${isPlaying ? styles.pauseButton : styles.playButton}`}
            onTap={handlePlayPauseToggle}
          >
            {isPlaying ? '暂停' : '开始'}
          </Button>
          <Button className={styles.controlButton} onTap={handleNextAction}>
            {currentPoseIndex < totalPoses - 1 ? '下一个' : '完成'}
          </Button>
        </View>
      </View>
    </View>
  );
}
