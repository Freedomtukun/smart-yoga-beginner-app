import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  const handleSequencePress = (level: string) => {
    router.push(`/sequence/${level}`);
  };

  const handleMeditationPress = () => {
    router.push('/meditation');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>智能瑜伽训练</Text>
          <Text style={styles.subtitle}>开始您的瑜伽之旅</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.button}
            onPress={() => handleSequencePress('beginner')}
          >
            <LinearGradient
              colors={['#E8F5E8', '#F0F8F0']}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>初学者序列</Text>
              <Text style={styles.buttonSubtext}>适合瑜伽新手</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button}
            onPress={() => handleSequencePress('intermediate')}
          >
            <LinearGradient
              colors={['#E8F0FF', '#F0F6FF']}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>中级序列</Text>
              <Text style={styles.buttonSubtext}>提升您的练习</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button}
            onPress={() => handleSequencePress('advanced')}
          >
            <LinearGradient
              colors={['#FFF0E8', '#FFF6F0']}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>高级序列</Text>
              <Text style={styles.buttonSubtext}>挑战您的极限</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.button}
            onPress={handleMeditationPress}
          >
            <LinearGradient
              colors={['#F8E8FF', '#FCF0FF']}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>冥想</Text>
              <Text style={styles.buttonSubtext}>放松身心</Text>
            </LinearGradient>
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#718096',
  },
  buttonContainer: {
    gap: 20,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  buttonGradient: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 4,
  },
  buttonSubtext: {
    fontSize: 14,
    color: '#718096',
  },
});