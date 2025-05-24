import { create } from 'zustand';

export interface Pose {
  id: string;
  duration: number;
  breathCount?: number;
  audioGuide?: string;
  instructions: {
    en: string;
    zh: string;
  };
  transitionHint?: {
    en: string;
    zh: string;
  };
}

export interface Sequence {
  id: string;
  name: {
    en: string;
    zh: string;
  };
  difficulty: number;
  duration: number;
  description: {
    en: string;
    zh: string;
  };
  poses: Pose[];
  audioGuide: {
    introduction: string;
    backgroundMusic: string;
  };
}

interface SequenceState {
  currentSequence: Sequence | null;
  currentPoseIndex: number;
  isPlaying: boolean;
  timeRemaining: number;
  setSequence: (sequence: Sequence) => void;
  nextPose: () => void;
  previousPose: () => void;
  togglePlayPause: () => void;
  setTimeRemaining: (time: number) => void;
  resetSequence: () => void;
}

export const useSequenceStore = create<SequenceState>((set, get) => ({
  currentSequence: null,
  currentPoseIndex: 0,
  isPlaying: false,
  timeRemaining: 0,
  
  setSequence: (sequence) => {
    set({
      currentSequence: sequence,
      currentPoseIndex: 0,
      isPlaying: false,
      timeRemaining: sequence.poses[0]?.duration || 0,
    });
  },
  
  nextPose: () => {
    const { currentSequence, currentPoseIndex } = get();
    if (currentSequence && currentPoseIndex < currentSequence.poses.length - 1) {
      const nextIndex = currentPoseIndex + 1;
      set({
        currentPoseIndex: nextIndex,
        timeRemaining: currentSequence.poses[nextIndex].duration,
        isPlaying: true, // Typically, playing should resume for the next pose
      });
    }
  },
  
  previousPose: () => {
    const { currentSequence, currentPoseIndex } = get();
    if (currentSequence && currentPoseIndex > 0) {
      const prevIndex = currentPoseIndex - 1;
      set({
        currentPoseIndex: prevIndex,
        timeRemaining: currentSequence.poses[prevIndex].duration,
        isPlaying: false, // Typically, going to a previous pose might pause
      });
    }
  },
  
  togglePlayPause: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },
  
  setTimeRemaining: (time) => {
    set({ timeRemaining: time });
  },
  
  resetSequence: () => {
    set({
      currentSequence: null,
      currentPoseIndex: 0,
      isPlaying: false,
      timeRemaining: 0,
    });
  },
}));
