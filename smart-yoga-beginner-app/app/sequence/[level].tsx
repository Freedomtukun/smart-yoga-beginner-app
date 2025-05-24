import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Image, ActivityIndicator, Modal, Alert, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, Play, Pause, SkipForward, Camera, Video, X, Star } from 'lucide-react-native';
import { useSequenceStore } from '@/stores/sequence-store';
import { loadPoseSequence, scorePoseVideo } from '@/services/yoga-api';

interface PoseScore {
  score: number;
  feedback: string;
  suggestions: string[];
}

export default function SequenceScreen() {
  const { level } = useLocalSearchParams<{ level: string }>();
  const { 
    currentSequence, 
    currentPoseIndex, 
    isPlaying, 
    timeRemaining,
    setSequence,
    nextPose,
    togglePlayPause,
    setTimeRemaining
  } = useSequenceStore();
  
  const [loading, setLoading] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  
  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  
  // Scoring states
  const [isUploading, setIsUploading] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [poseScore, setPoseScore] = useState<PoseScore | null>(null);

  useEffect(() => {
    loadSequence();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [level]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(timeRemaining - 1);
      }, 1000);
    } else if (timeRemaining === 0 && currentSequence) {
      if (currentPoseIndex < currentSequence.poses.length - 1) {
        nextPose();
      }
    }
    return () => clearInterval(interval);
  }, [isPlaying, timeRemaining, currentPoseIndex, currentSequence]);

  const loadSequence = async () => {
    try {
      setLoading(true);
      const sequenceData = await loadPoseSequence(level as string);
      setSequence(sequenceData);
    } catch (error) {
      console.error('Failed to load sequence:', error);
    } finally {
      setLoading(false);
    }
  };

  const playAudio = async (audioFileName: string) => {
    try {
      if (sound) {
        await sound.unloadAsync();
      }
      
      const audioUrl = `https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/audio/${audioFileName}`;
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );
      setSound(newSound);
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handleNext = () => {
    if (currentSequence && currentPoseIndex < currentSequence.poses.length - 1) {
      nextPose();
    } else {
      // Sequence completed
      router.push('/');
    }
  };

  const handleCameraPress = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('提示', '摄像头功能在网页版中不可用');
      return;
    }

    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('权限需要', '需要摄像头权限来录制视频');
        return;
      }
    }
    
    setShowCamera(true);
  };

  const startRecording = async () => {
    if (!cameraRef.current) return;
    
    try {
      setIsRecording(true);
      const video = await cameraRef.current.recordAsync({
        maxDuration: 30, // 30 seconds max
      });
      
      if (video) {
        setRecordedVideo(video.uri);
      }
    } catch (error) {
      console.error('Failed to record video:', error);
      Alert.alert('录制失败', '无法录制视频，请重试');
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current) return;
    
    try {
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const uploadAndScore = async () => {
    if (!recordedVideo || !currentSequence) return;
    
    try {
      setIsUploading(true);
      setShowCamera(false);
      
      const currentPose = currentSequence.poses[currentPoseIndex];
      const score = await scorePoseVideo(recordedVideo, currentPose.id);
      
      setPoseScore(score);
      setShowScoreModal(true);
      setRecordedVideo(null);
    } catch (error) {
      console.error('Failed to score pose:', error);
      Alert.alert('评分失败', '无法分析您的动作，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  const closeCamera = () => {
    setShowCamera(false);
    setRecordedVideo(null);
    if (isRecording) {
      stopRecording();
    }
  };

  const closeScoreModal = () => {
    setShowScoreModal(false);
    setPoseScore(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>加载序列中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentSequence) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>无法加载序列</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSequence}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentPose = currentSequence.poses[currentPoseIndex];
  const isLastPose = currentPoseIndex === currentSequence.poses.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={24} color="#2D3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{currentSequence.name.zh}</Text>
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            {currentPoseIndex + 1}/{currentSequence.poses.length}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.poseImageContainer}>
          <Image
            source={{
              uri: `https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/images/poses/${currentPose.id}.jpg`
            }}
            style={styles.poseImage}
            resizeMode="cover"
          />
        </View>

        <View style={styles.poseInfo}>
          <Text style={styles.poseInstructions}>
            {currentPose.instructions.zh}
          </Text>
          
          {currentPose.transitionHint && (
            <Text style={styles.transitionHint}>
              {currentPose.transitionHint.zh}
            </Text>
          )}

          <View style={styles.timer}>
            <Text style={styles.timerText}>
              {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
            </Text>
            {currentPose.breathCount && (
              <Text style={styles.breathText}>
                呼吸 {currentPose.breathCount} 次
              </Text>
            )}
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => currentPose.audioGuide && playAudio(currentPose.audioGuide)}
          >
            <Play size={20} color="#4A90E2" />
            <Text style={styles.controlText}>播放指导</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.controlButton, styles.primaryButton]}
            onPress={togglePlayPause}
          >
            {isPlaying ? (
              <Pause size={20} color="#FFF" />
            ) : (
              <Play size={20} color="#FFF" />
            )}
            <Text style={[styles.controlText, styles.primaryButtonText]}>
              {isPlaying ? '暂停' : '开始'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.controlButton}
            onPress={handleNext}
          >
            <SkipForward size={20} color="#4A90E2" />
            <Text style={styles.controlText}>
              {isLastPose ? '完成' : '下一个'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cameraSection}>
          <TouchableOpacity 
            style={styles.cameraButton}
            onPress={handleCameraPress}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size={20} color="#FFF" />
            ) : (
              <Camera size={20} color="#FFF" />
            )}
            <Text style={styles.cameraButtonText}>
              {isUploading ? '分析中...' : '录制动作'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera Modal */}
      <Modal
        visible={showCamera}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.cameraContainer}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity onPress={closeCamera} style={styles.closeButton}>
              <X size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>录制您的动作</Text>
            <View style={styles.placeholder} />
          </View>

          {Platform.OS !== 'web' && (
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
            >
              <View style={styles.cameraControls}>
                {!recordedVideo ? (
                  <TouchableOpacity
                    style={[styles.recordButton, isRecording && styles.recordingButton]}
                    onPress={isRecording ? stopRecording : startRecording}
                  >
                    <Video size={32} color="#FFF" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.recordedControls}>
                    <TouchableOpacity
                      style={styles.retakeButton}
                      onPress={() => setRecordedVideo(null)}
                    >
                      <Text style={styles.retakeText}>重新录制</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.uploadButton}
                      onPress={uploadAndScore}
                    >
                      <Text style={styles.uploadText}>获取评分</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </CameraView>
          )}
        </View>
      </Modal>

      {/* Score Modal */}
      <Modal
        visible={showScoreModal}
        animationType="fade"
        transparent={true}
      >
        <View style={styles.scoreModalOverlay}>
          <View style={styles.scoreModalContent}>
            <TouchableOpacity onPress={closeScoreModal} style={styles.scoreCloseButton}>
              <X size={24} color="#2D3748" />
            </TouchableOpacity>
            
            {poseScore && (
              <>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreTitle}>动作评分</Text>
                  <View style={styles.scoreDisplay}>
                    <Star size={32} color="#FFD700" />
                    <Text style={styles.scoreValue}>{poseScore.score}/100</Text>
                  </View>
                </View>

                <View style={styles.feedbackSection}>
                  <Text style={styles.feedbackTitle}>反馈</Text>
                  <Text style={styles.feedbackText}>{poseScore.feedback}</Text>
                </View>

                {poseScore.suggestions.length > 0 && (
                  <View style={styles.suggestionsSection}>
                    <Text style={styles.suggestionsTitle}>改进建议</Text>
                    {poseScore.suggestions.map((suggestion, index) => (
                      <Text key={index} style={styles.suggestionText}>
                        • {suggestion}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#718096',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#E53E3E',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
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
    marginHorizontal: 16,
  },
  progress: {
    backgroundColor: '#F7FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  progressText: {
    fontSize: 14,
    color: '#4A5568',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  poseImageContainer: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: '#F7FAFC',
  },
  poseImage: {
    width: '100%',
    height: '100%',
  },
  poseInfo: {
    marginBottom: 32,
  },
  poseInstructions: {
    fontSize: 18,
    lineHeight: 26,
    color: '#2D3748',
    marginBottom: 12,
  },
  transitionHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#718096',
    marginBottom: 20,
  },
  timer: {
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    paddingVertical: 16,
    borderRadius: 12,
  },
  timerText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 4,
  },
  breathText: {
    fontSize: 14,
    color: '#718096',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  controlText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A90E2',
  },
  primaryButtonText: {
    color: '#FFF',
  },
  cameraSection: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    minWidth: 160,
  },
  cameraButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  // Camera Modal Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 60,
  },
  closeButton: {
    padding: 8,
  },
  cameraTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E53E3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingButton: {
    backgroundColor: '#DC2626',
  },
  recordedControls: {
    flexDirection: 'row',
    gap: 20,
  },
  retakeButton: {
    backgroundColor: '#6B7280',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retakeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Score Modal Styles
  scoreModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scoreModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  scoreCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    zIndex: 1,
  },
  scoreHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  scoreTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 16,
  },
  scoreDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3748',
  },
  feedbackSection: {
    marginBottom: 20,
  },
  feedbackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 8,
  },
  feedbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4A5568',
  },
  suggestionsSection: {
    marginBottom: 8,
  },
  suggestionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4A5568',
    marginBottom: 4,
  },
});