export type RoomId = 'command' | 'strategy' | 'engineering' | 'media' | 'quality' | 'storage';

export type CharacterAction = 'typing' | 'hologram' | 'coding' | 'editing' | 'checking' | 'archiving';

export type WorkshopRoom = {
  id: RoomId;
  name: string;
  asset: string;
  color: string;
  glow: string;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type CharacterAnchor = {
  roomId: RoomId;
  name: string;
  sprite: string;
  x: number;
  y: number;
  scale: number;
  zIndex: number;
  action: CharacterAction;
  bubbleOffsetX?: number;
  bubbleOffsetY?: number;
  bubbleAlign?: 'left' | 'center' | 'right';
  phrases: string[];
};

export const scene = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 720,
};

export const rooms: WorkshopRoom[] = [
  {
    id: 'command',
    name: '指挥中心',
    asset: 'assets/offices/command.png',
    color: '#55f7ed',
    glow: '85, 247, 237',
    box: { x: 42, y: 38, width: 586, height: 455 },
  },
  {
    id: 'strategy',
    name: '策略室',
    asset: 'assets/offices/strategy.png',
    color: '#d56aff',
    glow: '213, 106, 255',
    box: { x: 667, y: 38, width: 586, height: 455 },
  },
  {
    id: 'engineering',
    name: '工程室',
    asset: 'assets/offices/engineering.png',
    color: '#ffac42',
    glow: '255, 172, 66',
    box: { x: 1292, y: 38, width: 586, height: 455 },
  },
  {
    id: 'media',
    name: '媒体室',
    asset: 'assets/offices/media.png',
    color: '#ff4fc9',
    glow: '255, 79, 201',
    box: { x: 42, y: 548, width: 586, height: 455 },
  },
  {
    id: 'quality',
    name: '质量室',
    asset: 'assets/offices/quality.png',
    color: '#50ff98',
    glow: '80, 255, 152',
    box: { x: 667, y: 548, width: 586, height: 455 },
  },
  {
    id: 'storage',
    name: '存储室',
    asset: 'assets/offices/storage.png',
    color: '#ffd85a',
    glow: '255, 216, 90',
    box: { x: 1292, y: 548, width: 586, height: 455 },
  },
];

export const characters: CharacterAnchor[] = [
  {
    roomId: 'command',
    name: '运维指挥官',
    sprite: 'assets/remotion-sprites/commander.png',
    x: 300,
    y: 438,
    scale: 0.082,
    zIndex: 18,
    action: 'typing',
    bubbleOffsetX: -18,
    bubbleAlign: 'center',
    phrases: ['收到新任务', '调度中...', '节点状态正常'],
  },
  {
    roomId: 'strategy',
    name: '策略分析师',
    sprite: 'assets/remotion-sprites/strategist.png',
    x: 960,
    y: 438,
    scale: 0.086,
    zIndex: 18,
    action: 'hologram',
    bubbleOffsetX: 6,
    bubbleAlign: 'center',
    phrases: ['分析完成', '策略已更新', '等待执行'],
  },
  {
    roomId: 'engineering',
    name: '工程师',
    sprite: 'assets/remotion-sprites/engineer.png',
    x: 1536,
    y: 438,
    scale: 0.084,
    zIndex: 18,
    action: 'coding',
    bubbleOffsetX: -16,
    bubbleAlign: 'center',
    phrases: ['构建通过', '正在修复', '部署准备中'],
  },
  {
    roomId: 'media',
    name: '媒体剪辑师',
    sprite: 'assets/remotion-sprites/media.png',
    x: 300,
    y: 948,
    scale: 0.084,
    zIndex: 18,
    action: 'editing',
    bubbleOffsetX: -18,
    bubbleAlign: 'center',
    phrases: ['开始渲染', '素材处理中', '视频合成中'],
  },
  {
    roomId: 'quality',
    name: '质检员',
    sprite: 'assets/remotion-sprites/qa.png',
    x: 960,
    y: 948,
    scale: 0.084,
    zIndex: 18,
    action: 'checking',
    bubbleOffsetX: 10,
    bubbleAlign: 'center',
    phrases: ['测试通过', '发现异常', '自动回归中'],
  },
  {
    roomId: 'storage',
    name: '存储管理员',
    sprite: 'assets/remotion-sprites/storage.png',
    x: 1536,
    y: 948,
    scale: 0.084,
    zIndex: 18,
    action: 'archiving',
    bubbleOffsetX: -24,
    bubbleAlign: 'center',
    phrases: ['文件已入库', 'Vault 同步中', '备份完成'],
  },
];
