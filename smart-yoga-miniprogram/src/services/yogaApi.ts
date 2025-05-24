import { Sequence, Pose } from '../store/sequenceStore';
import { COS_BASE_URL } from '../config/constants';

// Interface for pose scoring (kept as per requirements)
export interface PoseScoreResponse {
  score: number; // 0-100
  feedback: string; // General feedback
  suggestions: string[]; // Specific suggestions for improvement
  // Timestamps or keyframes for feedback could be added later
}

// --- Mock Data (Embedded) ---

const mockPoses: Pose[] = [
  {
    id: 'pose_001',
    duration: 30, // seconds
    breathCount: 5,
    audioGuide: `${COS_BASE_URL}/static/audio/poses/mountain_zh.mp3`,
    instructions: {
      en: 'Stand tall with feet together, arms by your sides. Ground yourself.',
      zh: '双脚并拢站立，手臂置于身体两侧。感受身体稳定。',
    },
    transitionHint: {
      en: 'Prepare for the next pose.',
      zh: '准备进入下一个体式。',
    },
  },
  {
    id: 'pose_002',
    duration: 45,
    breathCount: 7,
    audioGuide: `${COS_BASE_URL}/static/audio/poses/tree_zh.mp3`,
    instructions: {
      en: 'Place your right foot on your left inner thigh. Balance. Repeat on the other side.',
      zh: '将右脚置于左大腿内侧。保持平衡。换另一侧重复。',
    },
    transitionHint: {
      en: 'Gently release and prepare for forward fold.',
      zh: '轻柔地松开，准备前屈。',
    },
  },
  {
    id: 'pose_003',
    duration: 60,
    instructions: {
      en: 'Hinge at your hips, keeping your back straight. Reach towards your toes.',
      zh: '从髋部折叠，保持背部挺直。双手伸向脚趾。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/forward_fold_zh.mp3`,
    transitionHint: {
      en: 'Slowly rise up.',
      zh: '慢慢起身。',
    },
  },
  {
    id: 'pose_004',
    duration: 40,
    breathCount: 6,
    instructions: {
        en: 'Step your left foot back, bend your right knee. Arms overhead.',
        zh: '左脚向后迈一大步，弯曲右膝。双臂举过头顶。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/warrior1_zh.mp3`,
    transitionHint: {
        en: 'Transition to Warrior II.',
        zh: '转换为战士二式。',
    },
  },
  {
    id: 'pose_005',
    duration: 50,
    instructions: {
        en: 'Extend arms parallel to the floor. Gaze over your front hand.',
        zh: '双臂伸展与地板平行。注视前方的指尖。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/warrior2_zh.mp3`,
    transitionHint: {
        en: 'Prepare for Triangle Pose.',
        zh: '准备三角式。',
    },
  },
  {
    id: 'pose_006',
    duration: 45,
    breathCount: 5,
    instructions: {
        en: 'Reach your right hand towards your right foot, extend left arm up.',
        zh: '右手伸向右脚，左臂向上伸展。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/triangle_zh.mp3`,
    transitionHint: {
        en: 'Return to center, prepare for Downward Dog.',
        zh: '回到中心，准备下犬式。',
    },
  },
  {
    id: 'pose_007',
    duration: 60,
    instructions: {
        en: 'Hands and feet on the floor, hips high, forming an inverted V.',
        zh: '手脚着地，臀部抬高，身体呈倒V形。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/downward_dog_zh.mp3`,
    transitionHint: {
        en: 'Lower to your knees for Cobra Pose.',
        zh: '双膝跪地，准备眼镜蛇式。',
    },
  },
  {
    id: 'pose_008',
    duration: 30,
    breathCount: 4,
    instructions: {
        en: 'Lie on your stomach, lift your chest off the floor, using your back muscles.',
        zh: '俯卧，用背部肌肉力量抬起胸部离开地面。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/cobra_zh.mp3`,
    transitionHint: {
        en: 'Gently lower down, prepare for Child\'s Pose.',
        zh: '轻柔地放下，准备婴儿式。',
    },
  },
  {
    id: 'pose_009',
    duration: 90,
    instructions: {
        en: 'Kneel, sit back on your heels, fold forward, resting your forehead on the floor.',
        zh: '跪坐，臀部坐于脚跟，身体前屈，额头触地。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/childs_pose_zh.mp3`,
    transitionHint: {
        en: 'Prepare for final relaxation, Savasana.',
        zh: '准备最后放松，摊尸式。',
    },
  },
  {
    id: 'pose_010',
    duration: 300, // 5 minutes
    instructions: {
        en: 'Lie flat on your back, arms by your sides, palms up. Relax completely.',
        zh: '仰卧，双臂置于身体两侧，掌心向上。完全放松。',
    },
    audioGuide: `${COS_BASE_URL}/static/audio/poses/savasana_zh.mp3`,
    transitionHint: {
        en: 'The session is complete. Gently awaken your body.',
        zh: '练习结束。轻柔地唤醒身体。',
    },
  }
];

const baseSequence: Omit<Sequence, 'id' | 'name' | 'difficulty' | 'poses' | 'duration'> = {
  description: {
    en: 'A foundational yoga sequence to improve flexibility and strength.',
    zh: '一套基础瑜伽序列，提升柔韧性和力量。',
  },
  audioGuide: {
    introduction: `${COS_BASE_URL}/static/audio/sequences/intro_beginner_zh.mp3`,
    backgroundMusic: `${COS_BASE_URL}/static/audio/background/calm_ambient_music.mp3`,
  },
};

// --- Adapted Functions ---

const getMockSequenceData = (level: string): Sequence => {
  let selectedPoses: Pose[];
  let sequenceNameZh: string;
  let sequenceDescriptionZh: string;
  let difficulty: number;

  // Customize sequence based on level
  switch (level.toLowerCase()) {
    case 'beginner':
      sequenceNameZh = '初学者序列';
      sequenceDescriptionZh = '专为初学者设计的基础瑜伽流程，帮助建立稳固的根基和身体觉知。';
      difficulty = 1;
      selectedPoses = mockPoses.slice(0, 5); // Example: First 5 poses for beginners
      break;
    case 'intermediate':
      sequenceNameZh = '中级序列';
      sequenceDescriptionZh = '适合有一定经验的练习者，包含更具挑战性的体式，提升耐力和深度。';
      difficulty = 2;
      selectedPoses = mockPoses.slice(0, 8); // Example: First 8 poses
      break;
    case 'advanced':
      sequenceNameZh = '高级序列';
      sequenceDescriptionZh = '为资深瑜伽爱好者准备，探索复杂体式和流畅的串联，深化练习。';
      difficulty = 3;
      selectedPoses = mockPoses; // All poses for advanced
      break;
    default:
      sequenceNameZh = '通用序列';
      sequenceDescriptionZh = baseSequence.description.zh;
      difficulty = 1;
      selectedPoses = mockPoses.slice(0, 6); // A default set
  }

  const totalDuration = selectedPoses.reduce((sum, pose) => sum + pose.duration, 0);

  return {
    ...baseSequence,
    id: `seq_${level.toLowerCase()}_${Date.now()}`,
    name: { // Ensure 'en' field is also present, even if using 'zh' primarily
      en: `${level.charAt(0).toUpperCase() + level.slice(1)} Sequence`, 
      zh: sequenceNameZh,
    },
    description: { // Similarly for description
      en: `A ${level} level yoga sequence.`,
      zh: sequenceDescriptionZh,
    },
    difficulty,
    poses: selectedPoses.map(pose => ({ // Ensure poses use Chinese text where applicable
      ...pose,
      // Instructions and transition hints are already in dual language in mockPoses
    })),
    duration: totalDuration,
    // audioGuide is already part of baseSequence
  };
};

export const loadPoseSequence = async (level: string): Promise<Sequence> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 300)); 
  const sequenceData = getMockSequenceData(level);
  return sequenceData;
};

// Stubbed Pose Scoring Function
export const scorePoseVideo = async (videoUri: string, poseId: string): Promise<PoseScoreResponse> => {
  console.warn("Pose scoring feature is not implemented in this version. Video URI:", videoUri, "Pose ID:", poseId);
  return {
    score: 0,
    feedback: "评分功能暂未开放。", // "Scoring feature not yet available."
    suggestions: ["请期待后续版本更新。"] // "Please look forward to future updates."
  };
};
