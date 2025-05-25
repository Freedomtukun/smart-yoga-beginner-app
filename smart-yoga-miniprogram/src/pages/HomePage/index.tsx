import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import styles from './index.module.scss';
import * as i18n from '../../config/i18n';

export default function HomePage() {
  useLoad(() => {
    // Page loaded
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
          <Text className={styles.title}>{i18n.HOME_TITLE}</Text>
          <Text className={styles.subtitle}>{i18n.HOME_SUBTITLE}</Text>
        </View>

        <View className={styles.buttonContainer}>
          <View
            className={`${styles.button} ${styles.beginnerButton}`}
            onTap={() => handleSequencePress('beginner')}
          >
            <Text className={styles.buttonText}>{i18n.HOME_BEGINNER_SEQUENCE_TITLE}</Text>
            <Text className={styles.buttonSubtext}>{i18n.HOME_BEGINNER_SEQUENCE_SUBTITLE}</Text>
          </View>

          <View
            className={`${styles.button} ${styles.intermediateButton}`}
            onTap={() => handleSequencePress('intermediate')}
          >
            <Text className={styles.buttonText}>{i18n.HOME_INTERMEDIATE_SEQUENCE_TITLE}</Text>
            <Text className={styles.buttonSubtext}>{i18n.HOME_INTERMEDIATE_SEQUENCE_SUBTITLE}</Text>
          </View>

          <View
            className={`${styles.button} ${styles.advancedButton}`}
            onTap={() => handleSequencePress('advanced')}
          >
            <Text className={styles.buttonText}>{i18n.HOME_ADVANCED_SEQUENCE_TITLE}</Text>
            <Text className={styles.buttonSubtext}>{i18n.HOME_ADVANCED_SEQUENCE_SUBTITLE}</Text>
          </View>

          <View
            className={`${styles.button} ${styles.meditationButton}`}
            onTap={handleMeditationPress}
          >
            <Text className={styles.buttonText}>{i18n.HOME_MEDITATION_BUTTON_TITLE}</Text>
            <Text className={styles.buttonSubtext}>{i18n.HOME_MEDITATION_BUTTON_SUBTITLE}</Text>
          </View>
        </View>
      </View>
      <View className={styles.footerLinks}>
        <Text
          className={styles.linkText}
          onTap={() => Taro.navigateTo({ url: '/pages/PrivacyPolicyPage/index' })}
        >
          {i18n.HOME_FOOTER_PRIVACY_POLICY_LINK}
        </Text>
        <Text
          className={styles.linkText}
          onTap={() => Taro.navigateTo({ url: '/pages/UserAgreementPage/index' })}
        >
          {i18n.HOME_FOOTER_USER_AGREEMENT_LINK}
        </Text>
      </View>
    </View>
  );
}
