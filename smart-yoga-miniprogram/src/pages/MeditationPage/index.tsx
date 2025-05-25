import React, { useState, useRef } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useLoad, useUnload } from '@tarojs/taro';
import styles from './index.module.scss';
import { MEDITATION_AUDIO_URL, MEDITATION_IMAGE_URL } from '../../config/resources';
import * as i18n from '../../config/i18n';

export default function MeditationPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<Taro.InnerAudioContext | null>(null);

  useLoad(() => {
    // Page MeditationPage loaded.
    // Initialize audio context
    const innerAudioContext = Taro.createInnerAudioContext();
    innerAudioContext.src = MEDITATION_AUDIO_URL;
    innerAudioContext.loop = true;
    innerAudioContext.autoplay = false; // Don't play immediately

    innerAudioContext.onPlay(() => {
      // Audio playing
      setIsPlaying(true);
    });
    innerAudioContext.onPause(() => {
      // Audio paused
      setIsPlaying(false);
    });
    innerAudioContext.onStop(() => {
      // Audio stopped
      setIsPlaying(false);
    });
    innerAudioContext.onError((_res) => {
      // Meditation audio error handled by Toast
      setIsPlaying(false);
      Taro.showToast({ title: i18n.TOAST_MEDITATION_AUDIO_LOAD_FAILED, icon: 'none' });
    });
    
    audioContextRef.current = innerAudioContext;
  });

  useUnload(() => {
    if (audioContextRef.current) {
      // Unloading page, stopping and destroying audio.
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
      // Audio context not initialized, toast is shown
      Taro.showToast({ title: i18n.TOAST_AUDIO_COMPONENT_NOT_READY, icon: 'none' });
      return;
    }

    if (isPlaying) {
      audioContext.pause();
    } else {
      audioContext.play().catch(() => {
        // Catch playback errors not handled by innerAudioContext.onError
        Taro.showToast({ title: i18n.TOAST_MEDITATION_AUDIO_LOAD_FAILED, icon: 'none' });
        setIsPlaying(false); // Ensure UI reflects that playback failed
      });
    }
    // The isPlaying state will be updated by the onPlay/onPause event handlers
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View onTap={handleBack} className={styles.backButton}>
          <Text className={styles.backButtonText}>{i18n.COMMON_BACK_BUTTON}</Text>
        </View>
        <Text className={styles.headerTitle}>{i18n.MEDITATION_HEADER_TITLE}</Text>
        <View className={styles.placeholder} />
      </View>

      <View className={styles.content}>
        <View className={styles.meditationImageContainer}>
          <Image
            src={MEDITATION_IMAGE_URL}
            className={styles.meditationImage}
            mode="aspectFill"
            onError={(_e) => {
              Taro.showToast({ title: i18n.TOAST_IMAGE_LOAD_FAILED, icon: 'none' });
            }}
          />
        </View>

        <View className={styles.meditationInfo}>
          <Text className={styles.title}>{i18n.MEDITATION_TITLE}</Text>
          <Text className={styles.description}>
            {i18n.MEDITATION_DESCRIPTION}
          </Text>
          
          <View className={styles.instructions}>
            <Text className={styles.instructionTitle}>{i18n.MEDITATION_INSTRUCTIONS_TITLE}</Text>
            <Text className={styles.instructionText}>{i18n.MEDITATION_INSTRUCTION_ITEM_1}</Text>
            <Text className={styles.instructionText}>{i18n.MEDITATION_INSTRUCTION_ITEM_2}</Text>
            <Text className={styles.instructionText}>{i18n.MEDITATION_INSTRUCTION_ITEM_3}</Text>
            <Text className={styles.instructionText}>{i18n.MEDITATION_INSTRUCTION_ITEM_4}</Text>
          </View>
        </View>

        <View className={styles.controls}>
          <View
            className={`${styles.meditationButton} ${isPlaying ? styles.meditationButtonActive : ''}`}
            onTap={toggleMeditation}
          >
            <Text className={styles.meditationButtonText}>
              {isPlaying ? i18n.MEDITATION_PAUSE_BUTTON : i18n.MEDITATION_START_BUTTON}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
