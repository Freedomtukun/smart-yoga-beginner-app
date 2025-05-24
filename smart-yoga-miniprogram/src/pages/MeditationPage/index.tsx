import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useLoad, useUnload } from '@tarojs/taro';
import styles from './index.module.scss';
import { COS_BASE_URL } from '../../config/constants';

const MEDITATION_AUDIO_URL = `${COS_BASE_URL}/static/audio/meditation_gentle.mp3`;
const MEDITATION_IMAGE_URL = `${COS_BASE_URL}/images/poses/meditation_lotus.jpg`;

export default function MeditationPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<Taro.InnerAudioContext | null>(null);

  useLoad(() => {
    console.log('Page MeditationPage loaded.');
    // Initialize audio context
    const innerAudioContext = Taro.createInnerAudioContext();
    innerAudioContext.src = MEDITATION_AUDIO_URL;
    innerAudioContext.loop = true;
    innerAudioContext.autoplay = false; // Don't play immediately

    innerAudioContext.onPlay(() => {
      console.log('Audio playing');
      setIsPlaying(true);
    });
    innerAudioContext.onPause(() => {
      console.log('Audio paused');
      setIsPlaying(false);
    });
    innerAudioContext.onStop(() => {
      console.log('Audio stopped');
      setIsPlaying(false);
    });
    innerAudioContext.onError((res) => {
      console.error('Meditation audio error:', res); // Log the full error object
      setIsPlaying(false);
      Taro.showToast({ title: '冥想音频加载失败', icon: 'none' });
    });
    
    audioContextRef.current = innerAudioContext;
  });

  useUnload(() => {
    if (audioContextRef.current) {
      console.log('Unloading page, stopping and destroying audio.');
      audioContextRef.current.stop();
      audioContextRef.current.destroy();
      audioContextRef.current = null;
    }
    setIsPlaying(false); // Reset state on unload
  });

  const handleBack = () => {
    // Cleanup is handled by useUnload
    Taro.navigateBack();
  };

  const toggleMeditation = () => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      console.error('Audio context not initialized');
      Taro.showToast({ title: '音频组件未准备好', icon: 'none' });
      return;
    }

    if (isPlaying) {
      audioContext.pause();
    } else {
      audioContext.play();
    }
    // The isPlaying state will be updated by the onPlay/onPause event handlers
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View onTap={handleBack} className={styles.backButton}>
          <Text className={styles.backButtonText}>‹</Text>
        </View>
        <Text className={styles.headerTitle}>冥想</Text>
        <View className={styles.placeholder} />
      </View>

      <View className={styles.content}>
        <View className={styles.meditationImageContainer}>
          <Image
            src={MEDITATION_IMAGE_URL}
            className={styles.meditationImage}
            mode="aspectFill"
            onError={(e) => {
              console.error(`Failed to load meditation image: ${MEDITATION_IMAGE_URL}`, e.detail.errMsg);
            }}
          />
        </View>

        <View className={styles.meditationInfo}>
          <Text className={styles.title}>正念冥想</Text>
          <Text className={styles.description}>
            找一个安静舒适的地方，闭上眼睛，专注于呼吸。让思绪自然流淌，不要强迫或判断。当注意力分散时，轻柔地将其带回到呼吸上。
          </Text>
          
          <View className={styles.instructions}>
            <Text className={styles.instructionTitle}>冥想指导：</Text>
            <Text className={styles.instructionText}>• 保持舒适的坐姿</Text>
            <Text className={styles.instructionText}>• 轻闭双眼</Text>
            <Text className={styles.instructionText}>• 专注于自然呼吸</Text>
            <Text className={styles.instructionText}>• 观察思绪但不评判</Text>
          </View>
        </View>

        <View className={styles.controls}>
          <View
            className={`${styles.meditationButton} ${isPlaying ? styles.meditationButtonActive : ''}`}
            onTap={toggleMeditation}
          >
            <Text className={styles.meditationButtonText}>
              {isPlaying ? '暂停冥想' : '开始冥想'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
