import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, Button } from '@tarojs/components';
import Taro, { useLoad, useUnload, useRouter } from '@tarojs/taro';
import { useSequenceStore } from '../../store/sequenceStore';
import { loadPoseSequence } from '../../services/yogaApi';
import styles from './index.module.scss';
import { POSE_IMAGE_BASE_URL } from '../../config/resources';
import * as i18n from '../../config/i18n';

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
      const errorMessage = e.message || i18n.TOAST_LOAD_SEQUENCE_FAILED_DEFAULT;
      setError(errorMessage);
      Taro.showToast({ title: errorMessage, icon: 'none' });
    } finally {
      setLoading(false);
    }

    // Initialize pose audio context
    poseAudioContextRef.current = Taro.createInnerAudioContext();
    poseAudioContextRef.current.onEnded(() => {
      // Optional: Handle audio ending, e.g., auto-play timer if not already playing
    });
    poseAudioContextRef.current.onError((_res) => {
      // Pose guidance audio error, toast is shown
      Taro.showToast({ title: i18n.TOAST_POSE_AUDIO_LOAD_FAILED, icon: 'none' }); // Specific toast for pose guidance
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
        Taro.showToast({ title: i18n.TOAST_SEQUENCE_COMPLETE, icon: 'success' });
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
        .catch(_err => {
          Taro.showToast({ title: i18n.TOAST_AUDIO_PLAY_FAILED, icon: 'none' });
        });
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
        .catch(_err => {
          // Error playing pose guidance manually, toast is shown
          Taro.showToast({ title: i18n.TOAST_AUDIO_PLAY_FAILED, icon: 'none' });
        });
    } else {
      Taro.showToast({ title: i18n.TOAST_NO_POSE_GUIDANCE_AUDIO, icon: 'none' });
    }
  };

  if (loading) {
    return <View className={styles.centeredMessage}><Text>{i18n.COMMON_LOADING}</Text></View>;
  }
  if (error) {
    return <View className={styles.centeredMessage}><Text>{i18n.COMMON_ERROR_PREFIX}{error}</Text></View>;
  }
  if (!currentSequence || !currentPose) {
    return <View className={styles.centeredMessage}><Text>{i18n.SEQUENCE_NO_DATA_FOUND}</Text></View>;
  }

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View onTap={handleBack} className={styles.backButton}>
          <Text className={styles.backButtonText}>{i18n.COMMON_BACK_BUTTON}</Text>
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
            onError={(_e) => {
              Taro.showToast({ title: i18n.TOAST_IMAGE_LOAD_FAILED, icon: 'none' });
            }}
          />
        </View>

        <View className={styles.poseInfo}>
          <Text className={styles.poseName}>{currentPose.instructions.zh.split('。')[0]}</Text> {/* Simplified name */}
          <Text className={styles.instructions}>{currentPose.instructions.zh}</Text>
          {currentPose.transitionHint?.zh && (
            <Text className={styles.transitionHint}>{i18n.SEQUENCE_NEXT_STEP_PREFIX}{currentPose.transitionHint.zh}</Text>
          )}
          <View className={styles.statsContainer}>
            <Text className={styles.timerText}>{i18n.SEQUENCE_TIMER_PREFIX}{timeRemaining}s</Text>
            {currentPose.breathCount && (
              <Text className={styles.breathText}>{i18n.SEQUENCE_BREATH_COUNT_PREFIX}{currentPose.breathCount}次</Text>
            )}
          </View>
        </View>
        
        {/* TODO: Future - Implement pose scoring feature */}

        <View className={styles.controls}>
          <Button className={styles.controlButton} onTap={playCurrentPoseGuidance}>
            {i18n.SEQUENCE_PLAY_GUIDANCE_BUTTON}
          </Button>
          <Button
            className={`${styles.controlButton} ${isPlaying ? styles.pauseButton : styles.playButton}`}
            onTap={handlePlayPauseToggle}
          >
            {isPlaying ? i18n.COMMON_PAUSE_BUTTON : i18n.COMMON_START_BUTTON}
          </Button>
          <Button className={styles.controlButton} onTap={handleNextAction}>
            {currentPoseIndex < totalPoses - 1 ? i18n.SEQUENCE_NEXT_BUTTON : i18n.SEQUENCE_COMPLETE_BUTTON}
          </Button>
        </View>
      </View>
    </View>
  );
}
