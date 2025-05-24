import { Sequence } from '@/stores/sequence-store';

// Mock cloud function response
interface CloudFunctionResponse {
  code: number;
  url: string;
  message?: string;
}

// Pose scoring response interface
interface PoseScoreResponse {
  code: number;
  score: number;
  feedback: string;
  suggestions: string[];
  message?: string;
}

// Simulate WeChat cloud function call for loading sequences
const mockCloudFunction = async (level: string): Promise<CloudFunctionResponse> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock signed URL response
  return {
    code: 0,
    url: `https://yogasmart-static-1351554677.cos.ap-shanghai.myqcloud.com/static/pose-sequences/${level}.json?sign=mock_signature_${Date.now()}`
  };
};

// Simulate WeChat cloud function call for pose scoring
const mockPoseScoring = async (videoUri: string, poseId: string): Promise<PoseScoreResponse> => {
  // Simulate network delay for video upload and analysis
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Mock scoring response based on pose
  const mockScores = {
    mountain_pose: {
      score: 85,
      feedback: "您的山式做得很好！身体保持了良好的直立姿态。",
      suggestions: ["尝试将肩膀稍微向后拉", "保持呼吸更加深长"]
    },
    forward_fold: {
      score: 78,
      feedback: "前屈动作基本正确，但还有改进空间。",
      suggestions: ["膝盖可以稍微弯曲以保护下背部", "让重力自然帮助您加深前屈"]
    },
    downward_dog: {
      score: 82,
      feedback: "下犬式的整体形态不错，手臂和腿部力量运用得当。",
      suggestions: ["尝试将脚跟更多地压向地面", "保持脊柱的延展"]
    },
    child_pose: {
      score: 90,
      feedback: "婴儿式做得非常好！这是一个很好的休息姿势。",
      suggestions: ["如果感觉膝盖不适，可以在下面放个垫子"]
    }
  };

  const scoreData = mockScores[poseId as keyof typeof mockScores] || {
    score: 75,
    feedback: "动作基本正确，继续练习会更好！",
    suggestions: ["注意保持呼吸平稳", "专注于动作的质量而非速度"]
  };

  return {
    code: 0,
    ...scoreData
  };
};

// Load pose sequence data
export const loadPoseSequence = async (level: string): Promise<Sequence> => {
  try {
    // Step 1: Call cloud function to get signed URL
    const cloudResponse = await mockCloudFunction(level);
    
    if (cloudResponse.code !== 0) {
      throw new Error(cloudResponse.message || 'Failed to get sequence URL');
    }
    
    // Step 2: Fetch sequence data from the signed URL
    // Since we can't actually fetch from COS, we'll return mock data
    const mockSequenceData = getMockSequenceData(level);
    
    return mockSequenceData;
  } catch (error) {
    console.error('Error loading pose sequence:', error);
    throw error;
  }
};

// Score pose video
export const scorePoseVideo = async (videoUri: string, poseId: string): Promise<{score: number, feedback: string, suggestions: string[]}> => {
  try {
    // In a real implementation, this would:
    // 1. Upload the video to cloud storage
    // 2. Call the cloud function for AI analysis
    // 3. Return the scoring results
    
    // For now, we'll simulate the cloud function call
    const response = await mockPoseScoring(videoUri, poseId);
    
    if (response.code !== 0) {
      throw new Error(response.message || 'Failed to score pose');
    }
    
    return {
      score: response.score,
      feedback: response.feedback,
      suggestions: response.suggestions
    };
  } catch (error) {
    console.error('Error scoring pose video:', error);
    throw error;
  }
};

// Mock sequence data based on the provided example
const getMockSequenceData = (level: string): Sequence => {
  const baseSequence = {
    beginner: {
      id: "beginner_flexibility",
      name: {
        en: "Beginner Flexibility Sequence",
        zh: "初学者柔韧性序列"
      },
      difficulty: 1,
      duration: 600,
      description: {
        en: "A gentle sequence designed for yoga beginners to improve overall flexibility and body awareness.",
        zh: "这个温和的序列专为瑜伽初学者设计，旨在提高整体柔韧性和身体意识。"
      }
    },
    intermediate: {
      id: "intermediate_strength",
      name: {
        en: "Intermediate Strength Sequence",
        zh: "中级力量序列"
      },
      difficulty: 2,
      duration: 900,
      description: {
        en: "A balanced sequence that builds strength while maintaining flexibility.",
        zh: "这个平衡的序列在保持柔韧性的同时增强力量。"
      }
    },
    advanced: {
      id: "advanced_flow",
      name: {
        en: "Advanced Flow Sequence",
        zh: "高级流动序列"
      },
      difficulty: 3,
      duration: 1200,
      description: {
        en: "A challenging sequence for experienced practitioners.",
        zh: "这个具有挑战性的序列适合有经验的练习者。"
      }
    }
  };

  const mockPoses = [
    {
      id: "mountain_pose",
      duration: 60,
      breathCount: 5,
      audioGuide: "pose_1_mountain_tadasa.mp3",
      instructions: {
        en: "Stand with your feet together, weight evenly distributed. Feel rooted to the ground.",
        zh: "双脚并拢，均匀受力。感受与地面的连接。"
      },
      transitionHint: {
        en: "Begin in a stable standing position to center yourself and prepare for practice.",
        zh: "从稳定的站姿开始，让自己回到中心，为练习做准备。"
      }
    },
    {
      id: "forward_fold",
      duration: 90,
      breathCount: 7,
      audioGuide: "pose_2_forward_fold.mp3",
      instructions: {
        en: "Slowly fold forward from your hips, letting your arms hang naturally.",
        zh: "从髋部慢慢向前折叠，让手臂自然下垂。"
      },
      transitionHint: {
        en: "Keep a slight bend in your knees to protect your lower back.",
        zh: "保持膝盖微弯以保护下背部。"
      }
    },
    {
      id: "downward_dog",
      duration: 120,
      breathCount: 8,
      audioGuide: "pose_3_downward_dog.mp3",
      instructions: {
        en: "Form an inverted V-shape, pressing your hands into the ground and lifting your hips up.",
        zh: "形成倒V形，双手压地，臀部向上抬起。"
      },
      transitionHint: {
        en: "Pedal your feet to warm up your calves and hamstrings.",
        zh: "踩踏双脚来热身小腿和腿筋。"
      }
    },
    {
      id: "child_pose",
      duration: 90,
      breathCount: 6,
      audioGuide: "pose_4_child_pose.mp3",
      instructions: {
        en: "Kneel and sit back on your heels, extending your arms forward and resting your forehead on the ground.",
        zh: "跪下坐在脚跟上，向前伸展手臂，前额贴地。"
      },
      transitionHint: {
        en: "This is a resting pose. Focus on deep, calming breaths.",
        zh: "这是一个休息体式。专注于深长平静的呼吸。"
      }
    }
  ];

  const selectedBase = baseSequence[level as keyof typeof baseSequence] || baseSequence.beginner;

  return {
    ...selectedBase,
    poses: mockPoses,
    audioGuide: {
      introduction: `audio/yoga-sessions/${level}/intro.mp3`,
      backgroundMusic: "audio/background/gentle.mp3"
    }
  };
};