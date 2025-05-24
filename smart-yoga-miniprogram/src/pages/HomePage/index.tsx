import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import styles from './index.module.scss';

export default function HomePage() {
  useLoad(() => {
    console.log('Page HomePage loaded.');
  });

  const handleSequencePress = (level: string) => {
    Taro.navigateTo({
      url: `/pages/SequencePage/index?level=${level}`,
    });
  };

  const handleMeditationPress = () => {
    Taro.navigateTo({
      url: '/pages/MeditationPage/index',
    });
  };

  return (
    <View className={styles.container}>
      <View className={styles.content}>
        <View className={styles.header}>
          <Text className={styles.title}>智能瑜伽训练</Text>
          <Text className={styles.subtitle}>开始您的瑜伽之旅</Text>
        </View>

        <View className={styles.buttonContainer}>
          <View
            className={`${styles.button} ${styles.beginnerButton}`}
            onTap={() => handleSequencePress('beginner')}
          >
            <Text className={styles.buttonText}>初学者序列</Text>
            <Text className={styles.buttonSubtext}>适合瑜伽新手</Text>
          </View>

          <View
            className={`${styles.button} ${styles.intermediateButton}`}
            onTap={() => handleSequencePress('intermediate')}
          >
            <Text className={styles.buttonText}>中级序列</Text>
            <Text className={styles.buttonSubtext}>提升您的练习</Text>
          </View>

          <View
            className={`${styles.button} ${styles.advancedButton}`}
            onTap={() => handleSequencePress('advanced')}
          >
            <Text className={styles.buttonText}>高级序列</Text>
            <Text className={styles.buttonSubtext}>挑战您的极限</Text>
          </View>

          <View
            className={`${styles.button} ${styles.meditationButton}`}
            onTap={handleMeditationPress}
          >
            <Text className={styles.buttonText}>冥想</Text>
            <Text className={styles.buttonSubtext}>放松身心</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
