import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Audio } from 'expo-av';
import { ArrowLeft, Play, Pause } from 'lucide-react-native';

export default function MeditationScreen() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const handleBack = () => {
    if (sound) {
      sound.unloadAsync();
    }
    router.back();
  };

  const toggleMeditation = async () => {
    try {
      if (isPlaying) {
        if (sound) {
          await sound.pauseAsync();
        }
        setIsPlaying(false);
      } else {
        if (sound) {
          await sound.playAsync();
        } else {
          const meditationAudioUrl = 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/meditation_gentle.mp3';
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: meditationAudioUrl },
            { shouldPlay: true, isLooping: true }
          );
          setSound(newSound);
        }
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Failed to play meditation audio:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color="#2D3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>冥想</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.meditationImageContainer}>
          <Image
            source={{
              uri: 'https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/meditation_lotus.jpg'
            }}
            style={styles.meditationImage}
            resizeMode="cover"
          />
        </View>

        <View style={styles.meditationInfo}>
          <Text style={styles.title}>正念冥想</Text>
          <Text style={styles.description}>
            找一个安静舒适的地方，闭上眼睛，专注于呼吸。让思绪自然流淌，不要强迫或判断。当注意力分散时，轻柔地将其带回到呼吸上。
          </Text>
          
          <View style={styles.instructions}>
            <Text style={styles.instructionTitle}>冥想指导：</Text>
            <Text style={styles.instructionText}>• 保持舒适的坐姿</Text>
            <Text style={styles.instructionText}>• 轻闭双眼</Text>
            <Text style={styles.instructionText}>• 专注于自然呼吸</Text>
            <Text style={styles.instructionText}>• 观察思绪但不评判</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity 
            style={[styles.meditationButton, isPlaying && styles.meditationButtonActive]}
            onPress={toggleMeditation}
          >
            {isPlaying ? (
              <Pause size={32} color="#FFF" />
            ) : (
              <Play size={32} color="#FFF" />
            )}
            <Text style={styles.meditationButtonText}>
              {isPlaying ? '暂停冥想' : '开始冥想'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  meditationImageContainer: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 32,
    backgroundColor: '#F7FAFC',
  },
  meditationImage: {
    width: '100%',
    height: '100%',
  },
  meditationInfo: {
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4A5568',
    marginBottom: 24,
    textAlign: 'center',
  },
  instructions: {
    backgroundColor: '#F7FAFC',
    padding: 20,
    borderRadius: 12,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 8,
    lineHeight: 20,
  },
  controls: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  meditationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 50,
    gap: 12,
    minWidth: 200,
  },
  meditationButtonActive: {
    backgroundColor: '#7C3AED',
  },
  meditationButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
});