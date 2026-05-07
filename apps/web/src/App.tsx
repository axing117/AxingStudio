import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { LiveWorkshop } from './LiveWorkshop';
import {
  AgentStatus,
  AgentType,
  ArtifactType,
  TaskStatus,
  TaskType,
} from '@axing/shared';
import type {
  Agent,
  Artifact,
  CreateTaskRequest,
  CreateWorkflowRequest,
  Task,
  TaskEvent,
  TaskStatus as TaskStatusValue,
  TaskType as TaskTypeValue,
} from '@axing/shared';
import { ApiClientError, api } from './api';
import type { SystemStatus, VaultFile, WorktreeInfo } from './api';

type StatusFilter = TaskStatusValue | 'all';
type RoomStatus = 'online' | 'warning' | 'error';
type RoomTone = 'command' | 'oracle' | 'forge' | 'hermes' | 'sentinel' | 'vault';
type MetricTone = 'cyan' | 'violet' | 'red' | 'aqua' | 'indigo';
type MonitorTone = 'teal' | 'purple' | 'orange' | 'violet' | 'emerald' | 'gold' | 'red' | 'yellow';
type SseStatus = 'connecting' | 'live' | 'fallback';
type CharacterAction = 'idle' | 'thinking' | 'typing' | 'editing' | 'checking';
type EffectKind = 'room-glow' | 'screen-flicker' | 'data-flow' | 'alarm-flash';

interface CharacterConfig {
  id: string;
  name: string;
  src: string;
  x: string;
  y: string;
  width: string;
  action: CharacterAction;
}

interface EffectZone {
  id: string;
  tone: RoomTone;
  kind: EffectKind;
  left: string;
  top: string;
  width: string;
  height: string;
}

type MonitorTaskRowData = {
  name: string;
  agent: string;
  percent: number;
  tone: MonitorTone;
  status?: TaskStatusValue;
  dependsOnCount?: number;
  taskId?: string;
};

type AgentRoomStatusRowData = {
  name: string;
  status: string;
  load: number;
  tone: MonitorTone;
};

type WorkloadSummaryRowData = {
  name: string;
  active: number;
  tone: MonitorTone;
};

type DashboardEventRowData = {
  time: string;
  source: string;
  message: string;
  tone: MonitorTone;
};

type ErrorLogRowData = {
  scope: string;
  message: string;
  detail: string;
};

type DeployStepData = {
  name: string;
  duration: string;
};

type MetricCardData = {
  title: string;
  value: string;
  delta: string;
  trend: 'up' | 'down';
  tone: MetricTone;
  icon: string;
  points: number[];
};

type RoomCardData = {
  title: string;
  subtitle: string;
  value: number | string;
  tone: RoomTone;
  status: RoomStatus;
  description: string;
  operator: string;
  selected?: boolean;
};

type DashboardData = {
  health: string;
  tasks: Task[];
  agents: Agent[];
  events: TaskEvent[];
  artifacts: Artifact[];
  lastUpdatedAt?: string;
};

const emptyData: DashboardData = {
  health: 'checking',
  tasks: [],
  agents: [],
  events: [],
  artifacts: [],
};

const statusLabels: Record<TaskStatusValue, string> = {
  [TaskStatus.Blocked]: '已阻塞',
  [TaskStatus.Queued]: '排队',
  [TaskStatus.Running]: '运行中',
  [TaskStatus.Completed]: '已完成',
  [TaskStatus.Failed]: '失败',
  [TaskStatus.Retrying]: '重试中',
};

const typeLabels: Record<TaskTypeValue, string> = {
  [TaskType.Oracle]: '策略室',
  [TaskType.Forge]: '工程室',
  [TaskType.Hermes]: '媒体室',
};

const typeAgentNames: Record<TaskTypeValue, string> = {
  [TaskType.Oracle]: '策略节点',
  [TaskType.Forge]: '工程节点',
  [TaskType.Hermes]: '媒体节点',
};

const agentTypeLabels: Record<Agent['type'], string> = {
  [AgentType.Oracle]: '策略节点',
  [AgentType.Forge]: '工程节点',
  [AgentType.Hermes]: '媒体节点',
  [AgentType.Sentinel]: '质检节点',
};

const agentDisplayNames: Record<Agent['type'], string> = {
  [AgentType.Oracle]: '策略模拟节点',
  [AgentType.Forge]: '工程模拟节点',
  [AgentType.Hermes]: '媒体模拟节点',
  [AgentType.Sentinel]: '质检模拟节点',
};

const agentStatusLabels: Record<Agent['status'], string> = {
  [AgentStatus.Online]: '在线',
  [AgentStatus.Offline]: '离线',
  [AgentStatus.Busy]: '忙碌',
};

const eventLabels: Record<string, string> = {
  'task.created': '任务已创建',
  'task.claimed': '任务已领取',
  'task.heartbeat': '任务心跳',
  'task.completed': '任务已完成',
  'task.failed': '任务失败',
  'task.retrying': '任务重试中',
  'task.blocked': '任务已阻塞',
  'task.unblocked': '依赖已满足',
  'agent.registered': '节点已注册',
  'agent.online': '节点在线',
  'agent.offline': '节点离线',
  'artifact.created': '产物已入库',
};

const artifactLabels: Record<Artifact['type'], string> = {
  [ArtifactType.Text]: '文本',
  [ArtifactType.Image]: '图片',
  [ArtifactType.Video]: '视频',
  [ArtifactType.Code]: '代码',
  [ArtifactType.Log]: '日志',
};

const taskTypes = [TaskType.Oracle, TaskType.Forge, TaskType.Hermes] as const;
const taskStatusOrder = [
  TaskStatus.Blocked,
  TaskStatus.Queued,
  TaskStatus.Running,
  TaskStatus.Completed,
  TaskStatus.Retrying,
  TaskStatus.Failed,
] as const;

const monitorQueueTemplate: Omit<MonitorTaskRowData, 'taskId'>[] = [
  { name: '视频渲染-1080p', agent: '媒体室', percent: 75, tone: 'violet' },
  { name: '数据同步-流水线', agent: '策略室', percent: 42, tone: 'purple' },
  { name: '模型训练-v2', agent: '工程室', percent: 68, tone: 'orange' },
  { name: 'QA回归测试套件', agent: '质量室', percent: 21, tone: 'emerald' },
  { name: '制品备份', agent: '存储室', percent: 89, tone: 'gold' },
];

const agentRoomStatusRows: AgentRoomStatusRowData[] = [
  { name: '指挥中心', status: '在线', load: 12, tone: 'teal' },
  { name: '策略室', status: '在线', load: 23, tone: 'purple' },
  { name: '工程室', status: '在线', load: 67, tone: 'orange' },
  { name: '媒体室', status: '在线', load: 45, tone: 'violet' },
  { name: '质量室', status: '在线', load: 31, tone: 'emerald' },
  { name: '存储室', status: '在线', load: 18, tone: 'gold' },
];

const workloadSummaryRows: WorkloadSummaryRowData[] = [
  { name: '视频渲染', active: 3, tone: 'violet' },
  { name: '模型训练', active: 2, tone: 'orange' },
  { name: '测试执行', active: 5, tone: 'emerald' },
  { name: '制品上传', active: 7, tone: 'gold' },
];

const fallbackEventRows: DashboardEventRowData[] = [
  { time: '10:42:29', source: '工程室', message: '构建 #4821 已完成，耗时 2分14秒', tone: 'orange' },
  { time: '10:42:26', source: '媒体室', message: '开始渲染视频 1080p', tone: 'violet' },
  { time: '10:42:24', source: '质量室', message: '自动 QA 回归测试套件已启动', tone: 'emerald' },
  { time: '10:42:21', source: '策略室', message: '策略拆解分析报告已生成', tone: 'purple' },
  { time: '10:42:18', source: '存储室', message: '制品备份上传完成', tone: 'gold' },
];

const errorLogRows: ErrorLogRowData[] = [
  { scope: '模型训练', message: '内存不足', detail: 'CUDA out of memory' },
  { scope: '数据同步', message: '连接超时', detail: 'DB connection timed out' },
  { scope: '视频渲染', message: 'FFmpeg错误', detail: '编码器未找到' },
  { scope: '制品备份', message: '权限拒绝', detail: '制品仓库拒绝访问' },
  { scope: '测试执行', message: '断言失败', detail: '流程回归测试失败' },
];

const deploySteps: DeployStepData[] = [
  { name: '检出', duration: '18秒' },
  { name: '安装', duration: '42秒' },
  { name: '测试', duration: '19分02秒' },
  { name: '构建', duration: '19分12秒' },
  { name: '部署', duration: '21秒' },
];

const metricCards: MetricCardData[] = [
  { title: '在线智能体', value: '24', delta: '+12.5%', trend: 'up', tone: 'cyan', icon: '智', points: [15, 17, 16, 20, 19, 24, 22, 25, 23, 27, 24, 28] },
  { title: '运行中任务', value: '58', delta: '+8.1%', trend: 'up', tone: 'violet', icon: '▶', points: [28, 26, 29, 30, 35, 33, 38, 36, 42, 40, 45, 43] },
  { title: '失败任务', value: '2', delta: '+33.3%', trend: 'up', tone: 'red', icon: '!', points: [8, 7, 9, 8, 10, 11, 9, 12, 11, 14, 13, 16] },
  { title: '今日成本', value: '¥142.38', delta: '-4.3%', trend: 'down', tone: 'aqua', icon: '¥', points: [44, 43, 41, 42, 39, 38, 36, 35, 34, 32, 33, 31] },
  { title: '队列深度', value: '17', delta: '+5', trend: 'up', tone: 'indigo', icon: '列', points: [10, 12, 11, 14, 13, 17, 16, 18, 17, 20, 19, 22] },
];

const DEBUG_ANCHORS = false;

const characters: CharacterConfig[] = [
  { id: 'command', name: '运维指挥官', src: '/assets/sprites/commander.png', x: '17.5%', y: '44.5%', width: '3.2%', action: 'idle' },
  { id: 'strategy', name: '策略分析师', src: '/assets/sprites/strategist.png', x: '48.5%', y: '43.5%', width: '3.2%', action: 'thinking' },
  { id: 'engineering', name: '工程师', src: '/assets/sprites/engineer.png', x: '78.5%', y: '44.5%', width: '3.2%', action: 'typing' },
  { id: 'media', name: '媒体剪辑师', src: '/assets/sprites/media.png', x: '17.5%', y: '85.5%', width: '3.2%', action: 'editing' },
  { id: 'quality', name: '质检员', src: '/assets/sprites/qa.png', x: '48.5%', y: '85.5%', width: '3.2%', action: 'checking' },
  { id: 'storage', name: '存储管理员', src: '/assets/sprites/storage.png', x: '78.5%', y: '85.5%', width: '3.2%', action: 'idle' },
];

const effectZones: EffectZone[] = [
  { id: 'command-glow', tone: 'command', kind: 'room-glow', left: '3.5%', top: '3.5%', width: '29%', height: '38%' },
  { id: 'strategy-glow', tone: 'oracle', kind: 'room-glow', left: '35%', top: '3.5%', width: '29%', height: '38%' },
  { id: 'engineering-glow', tone: 'forge', kind: 'room-glow', left: '67.5%', top: '3.5%', width: '29%', height: '38%' },
  { id: 'media-glow', tone: 'hermes', kind: 'room-glow', left: '3.5%', top: '54%', width: '29%', height: '38%' },
  { id: 'quality-glow', tone: 'sentinel', kind: 'room-glow', left: '35%', top: '54%', width: '29%', height: '38%' },
  { id: 'storage-glow', tone: 'vault', kind: 'room-glow', left: '67.5%', top: '54%', width: '29%', height: '38%' },
  { id: 'command-screen', tone: 'command', kind: 'screen-flicker', left: '15%', top: '19%', width: '12%', height: '5%' },
  { id: 'strategy-flow', tone: 'oracle', kind: 'data-flow', left: '44%', top: '26%', width: '15%', height: '2%' },
  { id: 'engineering-screen', tone: 'forge', kind: 'screen-flicker', left: '77%', top: '17%', width: '13%', height: '5%' },
  { id: 'media-screen', tone: 'hermes', kind: 'screen-flicker', left: '9%', top: '66%', width: '18%', height: '8%' },
  { id: 'quality-alarm', tone: 'sentinel', kind: 'alarm-flash', left: '40%', top: '64%', width: '6%', height: '6%' },
  { id: 'storage-flow', tone: 'vault', kind: 'data-flow', left: '73%', top: '63%', width: '18%', height: '2%' },
];

export function App() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedMonitorTaskName, setSelectedMonitorTaskName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creatingType, setCreatingType] = useState<TaskTypeValue | ''>('');
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [creatingWorktree, setCreatingWorktree] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  const [dependencyDraft, setDependencyDraft] = useState<string>('');
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [expandedWorktreeTaskId, setExpandedWorktreeTaskId] = useState<string>('');
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);
  const [selectedVaultFile, setSelectedVaultFile] = useState<string>('');
  const [vaultPreview, setVaultPreview] = useState<string>('');
  const [selectedRoomTone, setSelectedRoomTone] = useState<RoomTone>('command');
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({ cpu: 0, memory: 0, uptime: 0, onlineAgents: 0, totalAgents: 0, queuedTasks: 0, runningTasks: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function pollSystem() {
      try {
        const status = await api.systemStatus();
        if (active) setSystemStatus(status);
      } catch { /* silently ignore — sidebar shows last known or defaults */ }
    }
    pollSystem();
    const timer = window.setInterval(pollSystem, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    setSelectedVaultFile('');
    setVaultPreview('');
  }, [selectedTaskId]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [health, tasks, agents, events, artifacts, worktreeList, vaultList] = await Promise.all([
          api.health(),
          api.tasks(statusFilter === 'all' ? undefined : statusFilter),
          api.agents(),
          api.events(200),
          api.artifacts(selectedTaskId || undefined),
          api.worktrees(),
          selectedTaskId ? api.vaultFiles(selectedTaskId).catch(() => []) : Promise.resolve([]),
        ]);

        if (!active) return;
        setData({
          health: health.status,
          tasks,
          agents,
          events,
          artifacts,
          lastUpdatedAt: new Date().toISOString(),
        });
        setWorktrees(worktreeList);
        setVaultFiles(vaultList);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(formatError(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [statusFilter, selectedTaskId, refreshTick]);

  useEffect(() => {
    setSseStatus('connecting');
    const es = new EventSource('/api/events/stream');

    es.onopen = () => setSseStatus('live');
    es.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as TaskEvent;
        setData((current) => ({
          ...current,
          events: [event, ...current.events.filter((item) => item.id !== event.id)].slice(0, 200),
          lastUpdatedAt: new Date().toISOString(),
        }));
        setRefreshTick((value) => value + 1);
      } catch {
        setSseStatus('fallback');
      }
    };
    es.onerror = () => {
      setSseStatus('fallback');
      es.close();
    };

    return () => es.close();
  }, []);

  async function createDemoTask(type: TaskTypeValue) {
    const request: CreateTaskRequest = {
      type,
      title: demoTitle(type),
      input: {
        brief: demoBrief(type),
        source: 'showcase',
      },
      maxRetries: 3,
      dependsOn: dependencyDraft ? [dependencyDraft] : undefined,
    };

    setCreatingType(type);
    try {
      await api.createTask(request);
      setStatusFilter('all');
      setRefreshTick((value) => value + 1);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setCreatingType('');
    }
  }

  async function createDemoWorkflow() {
    const request: CreateWorkflowRequest = {
      tasks: [
        {
          type: TaskType.Oracle,
          title: 'V2 工作流：策略拆解',
          input: { brief: '拆解阿星工坊 V2 演示链路', source: 'workflow-demo' },
          maxRetries: 3,
        },
        {
          type: TaskType.Forge,
          title: 'V2 工作流：工程执行',
          input: { brief: '基于策略拆解生成工程产物', source: 'workflow-demo' },
          dependsOnIndexes: [0],
          maxRetries: 3,
        },
        {
          type: TaskType.Hermes,
          title: 'V2 工作流：媒体包装',
          input: { brief: '把工程产物包装成媒体预览', source: 'workflow-demo' },
          dependsOnIndexes: [1],
          maxRetries: 3,
        },
      ],
    };

    setCreatingWorkflow(true);
    try {
      const workflow = await api.createWorkflow(request);
      setStatusFilter('all');
      setSelectedTaskId(workflow.workflowId);
      setSelectedMonitorTaskName('V2 依赖工作流');
      setRefreshTick((value) => value + 1);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setCreatingWorkflow(false);
    }
  }

  async function createSelectedWorktree() {
    if (!selectedTaskId) return;
    setCreatingWorktree(true);
    try {
      const worktree = await api.createWorktree(selectedTaskId);
      setWorktrees((items) => [worktree, ...items.filter((item) => item.taskId !== worktree.taskId)]);
      setExpandedWorktreeTaskId(worktree.taskId);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setCreatingWorktree(false);
    }
  }

  async function removeSelectedWorktree() {
    if (!selectedTaskId) return;
    try {
      await api.removeWorktree(selectedTaskId);
      setWorktrees((items) => items.filter((item) => item.taskId !== selectedTaskId));
      setExpandedWorktreeTaskId('');
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function previewVaultFile(file: VaultFile) {
    if (!selectedTaskId) return;
    setSelectedVaultFile(file.name);
    if (isPreviewableFile(file.name)) {
      try {
        const content = await api.vaultPreview(selectedTaskId, file.name);
        setVaultPreview(content);
      } catch (err) {
        setVaultPreview(formatError(err));
      }
    } else {
      setVaultPreview('');
    }
  }

  const allTasks = data.tasks;
  const runningTasks = allTasks.filter((task) => task.status === TaskStatus.Running);
  const failedTasks = allTasks.filter((task) => task.status === TaskStatus.Failed);
  const onlineAgents = data.agents.filter((agent) => agent.status !== AgentStatus.Offline);
  const selectedTask = allTasks.find((task) => task.id === selectedTaskId);
  const visibleEvents = readableEvents(data.events);
  const monitorQueueRows = buildMonitorQueueRows(allTasks);
  const dashboardEventRows = buildDashboardEventRows(visibleEvents, allTasks);
  const selectedQueueTaskName = selectedTask ? displayTaskTitle(selectedTask) : selectedMonitorTaskName;
  const selectedWorktree = selectedTaskId ? worktrees.find((item) => item.taskId === selectedTaskId) : undefined;
  const dagTasks = useMemo(() => buildDagTasks(allTasks), [allTasks]);
  const sseDetail = sseStatus === 'live' ? 'SSE 实时' : sseStatus === 'connecting' ? '连接中' : '手动刷新';
  const rooms: RoomCardData[] = [
    {
      title: '指挥中心',
      subtitle: '任务锁与状态机',
      value: `${runningTasks.length}/${allTasks.length}`,
      tone: 'command',
      status: data.health === 'alive' ? 'online' : 'warning',
      description: '统一调度任务流、心跳租约和全局运行状态',
      operator: '运维指挥官',
      selected: !selectedTask,
    },
    {
      title: '策略室',
      subtitle: '需求拆解',
      value: countByTaskType(allTasks, TaskType.Oracle),
      tone: 'oracle',
      status: onlineAgents.some((agent) => agent.type === AgentType.Oracle) ? 'online' : 'warning',
      description: '把业务目标拆成可执行计划与依赖顺序',
      operator: '策略分析师',
    },
    {
      title: '工程室',
      subtitle: '代码执行',
      value: countByTaskType(allTasks, TaskType.Forge),
      tone: 'forge',
      status: onlineAgents.some((agent) => agent.type === AgentType.Forge) ? 'online' : 'warning',
      description: '执行构建、脚本生成和工程产物编排',
      operator: '工程师',
    },
    {
      title: '媒体室',
      subtitle: '视频与素材',
      value: countByTaskType(allTasks, TaskType.Hermes),
      tone: 'hermes',
      status: onlineAgents.some((agent) => agent.type === AgentType.Hermes) ? 'online' : 'warning',
      description: '处理视频渲染、素材整理和预览产物',
      operator: '媒体剪辑师',
    },
    {
      title: '质量室',
      subtitle: '错误与审核',
      value: failedTasks.length,
      tone: 'sentinel',
      status: failedTasks.length > 0 ? 'error' : 'online',
      description: '监控失败任务、回归测试和风险告警',
      operator: '质检员',
    },
    {
      title: '存储室',
      subtitle: '产物归档',
      value: data.artifacts.length,
      tone: 'vault',
      status: data.artifacts.length > 0 ? 'online' : 'warning',
      description: '保存制品、日志、版本记录和交付文件',
      operator: '存储管理员',
    },
  ];

  const hotspotPositions: {
    tone: RoomTone;
    title: string;
    left: string;
    top: string;
  }[] = [
    { tone: 'command',   title: '指挥中心', left: '16%', top: '20%' },
    { tone: 'oracle',    title: '策略室',   left: '45%', top: '20%' },
    { tone: 'forge',     title: '工程室',   left: '74%', top: '20%' },
    { tone: 'hermes',    title: '媒体室',   left: '16%', top: '62%' },
    { tone: 'sentinel',  title: '质量室',   left: '45%', top: '62%' },
    { tone: 'vault',     title: '存储室',   left: '74%', top: '62%' },
  ];

  const selectedRoom = rooms.find((r) => r.tone === selectedRoomTone);

  return (
    <DashboardPage>
      <DashboardLayout sidebar={<Sidebar systemStatus={systemStatus} />}>
        <header className="hero-bar" id="overview">
          <div>
            <h2>阿星工坊</h2>
            <p>第一版展示包装中心</p>
          </div>
          <div className="hero-tools">
            <span className="region-dot">区域：华东-1</span>
            <span className="clock-chip">当前时间：{formatTime(currentTime.toISOString())}</span>
            <HeartbeatIcon />
            <span className={`sse-chip ${sseStatus}`}>事件：{sseDetail}</span>
            <span className="selected-task-chip">当前任务：{selectedQueueTaskName || '未选择'}</span>
            <button type="button" onClick={() => setRefreshTick((value) => value + 1)}>刷新</button>
          </div>
        </header>

        {error ? (
          <div className="alert-bar" role="status">
            <strong>连接提示</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <TopStatsBar metrics={metricCards} />

        <section className="dashboard-grid">
          <BaseOverview
            dagOverlay={(
              <DagOverlay
                tasks={dagTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={(task) => {
                  setSelectedTaskId(task.id);
                  setSelectedMonitorTaskName(displayTaskTitle(task));
                }}
              />
            )}
            rooms={rooms}
            selectedRoomTone={selectedRoomTone}
            onSelectRoom={setSelectedRoomTone}
            hotspotPositions={hotspotPositions}
            latestEvent={data.events[0] ?? null}
            tasks={data.tasks}
          />

          <RightPanel
            allTasks={allTasks}
            creatingType={creatingType}
            creatingWorkflow={creatingWorkflow}
            dependencyDraft={dependencyDraft}
            monitorQueueRows={monitorQueueRows}
            selectedMonitorTaskName={selectedMonitorTaskName}
            selectedTaskId={selectedTaskId}
            onCreateDemoTask={createDemoTask}
            onCreateDemoWorkflow={createDemoWorkflow}
            onDependencyDraftChange={setDependencyDraft}
            onSelectMonitorTask={(task) => {
              setSelectedMonitorTaskName(task.name);
              if (task.taskId) setSelectedTaskId(task.taskId);
            }}
          />
        </section>

        <BottomPanelGrid
          creatingWorktree={creatingWorktree}
          dashboardEventRows={dashboardEventRows}
          expandedWorktreeTaskId={expandedWorktreeTaskId}
          selectedTask={selectedTask}
          selectedTaskId={selectedTaskId}
          selectedVaultFile={selectedVaultFile}
          selectedWorktree={selectedWorktree}
          vaultFiles={vaultFiles}
          vaultPreview={vaultPreview}
          onCreateSelectedWorktree={createSelectedWorktree}
          onPreviewVaultFile={previewVaultFile}
          onRemoveSelectedWorktree={removeSelectedWorktree}
          onToggleWorktree={() => setExpandedWorktreeTaskId(expandedWorktreeTaskId === selectedTaskId ? '' : selectedTaskId)}
        />
      </DashboardLayout>
    </DashboardPage>
  );
}

function DashboardPage({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function DashboardLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <main className="ops-shell">
      {sidebar}
      <section className="main-stage">{children}</section>
    </main>
  );
}

function Sidebar({ systemStatus }: { systemStatus: SystemStatus }) {
  const statusText = systemStatus.runningTasks > 0
    ? `${systemStatus.runningTasks} 个任务运行中`
    : '所有系统运行正常';

  return (
    <aside className="left-nav" aria-label="阿星工坊导航">
      <div className="brand-block">
        <div className="brand-cube">阿</div>
        <div>
          <h1>阿星工坊</h1>
          <p>多智能体工作流指挥中心</p>
        </div>
      </div>

      <nav className="nav-list">
        <a className="is-active" href="#overview">总览</a>
        <a href="#agents">智能体</a>
        <a href="#tasks">任务</a>
        <a href="#pipeline">流水线</a>
        <a href="#errors">错误</a>
        <a href="#artifacts">制品库</a>
        <a href="#nodes">节点</a>
        <a href="#settings">设置</a>
      </nav>

      <div className="system-card">
        <span className="pulse is-live" />
        <strong>系统状态</strong>
        <p>{statusText}</p>
        <Meter label="CPU" value={systemStatus.cpu} />
        <Meter label="内存" value={systemStatus.memory} />
        <Meter label="在线" value={systemStatus.totalAgents > 0 ? Math.round((systemStatus.onlineAgents / systemStatus.totalAgents) * 100) : 0} />
        <span style={{ fontSize: 11, color: '#9ef7f0', paddingLeft: 6 }}>{systemStatus.onlineAgents}/{systemStatus.totalAgents} 智能体</span>
      </div>

      <div className="operator-card">
        <div className="avatar">工</div>
        <div>
          <strong>运维指挥官</strong>
          <p>admin@axing.workshop</p>
          <span className="operator-status"><i />在线</span>
        </div>
      </div>
    </aside>
  );
}

function TopStatsBar({ metrics }: { metrics: MetricCardData[] }) {
  return (
    <section className="kpi-grid" aria-label="运行指标">
      {metrics.map((metric) => (
        <MetricCard key={metric.title} metric={metric} />
      ))}
    </section>
  );
}

function BaseOverview({
  rooms,
  dagOverlay,
  selectedRoomTone,
  onSelectRoom,
  hotspotPositions,
  latestEvent,
  tasks,
}: {
  rooms: RoomCardData[];
  dagOverlay: ReactNode;
  selectedRoomTone: RoomTone;
  onSelectRoom: (tone: RoomTone) => void;
  hotspotPositions: { tone: RoomTone; title: string; left: string; top: string }[];
  latestEvent: TaskEvent | null;
  tasks: Task[];
}) {
  return (
    <section className="command-map" aria-label="六房间监控地图">
      <BaseMap
        rooms={rooms}
        selectedRoomTone={selectedRoomTone}
        onSelectRoom={onSelectRoom}
        hotspotPositions={hotspotPositions}
        latestEvent={latestEvent}
        tasks={tasks}
      />
      {dagOverlay}
    </section>
  );
}

function AnimatedCharacter({ character }: { character: CharacterConfig }) {
  const [error, setError] = useState(false);

  if (error) return null;

  const anchorStyle = {
    left: character.x,
    top: character.y,
    '--character-width': character.width,
  } as CSSProperties;

  return (
    <div className={`character-anchor ${DEBUG_ANCHORS ? 'debug-anchors' : ''}`} style={anchorStyle}>
      <div className={`character-shadow shadow-${character.action}`} />
      <img
        alt={character.name}
        className={`animated-character character-${character.action}`}
        src={character.src}
        onError={() => {
          console.warn(`Character "${character.name}" failed to load: ${character.src}`);
          setError(true);
        }}
      />
      {DEBUG_ANCHORS ? (
        <>
          <span className="character-debug-point" />
          <span className="character-debug-label">{character.id}</span>
        </>
      ) : null}
    </div>
  );
}

function CharacterLayer() {
  return (
    <div className="character-layer">
      {characters.map((character) => (
        <AnimatedCharacter character={character} key={character.id} />
      ))}
    </div>
  );
}

function EffectsLayer() {
  return (
    <div className={`effects-layer ${DEBUG_ANCHORS ? 'debug-anchors' : ''}`} aria-hidden="true">
      {effectZones.map((effect) => (
        <span
          className={`effect-zone ${effect.tone} effect-${effect.kind}`}
          key={effect.id}
          style={{
            left: effect.left,
            top: effect.top,
            width: effect.width,
            height: effect.height,
          }}
        />
      ))}
    </div>
  );
}

function HotspotLayer({
  rooms,
  selectedRoomTone,
  onSelectRoom,
  hotspotPositions,
}: {
  rooms: RoomCardData[];
  selectedRoomTone: RoomTone;
  onSelectRoom: (tone: RoomTone) => void;
  hotspotPositions: { tone: RoomTone; title: string; left: string; top: string }[];
}) {
  return (
    <div className="hotspot-layer">
      {hotspotPositions.map((spot) => {
        const room = rooms.find((r) => r.tone === spot.tone);
        if (!room) return null;
        return (
          <RoomHotspot
            key={spot.tone}
            isSelected={spot.tone === selectedRoomTone}
            left={spot.left}
            room={room}
            top={spot.top}
            onClick={() => onSelectRoom(spot.tone)}
          />
        );
      })}
    </div>
  );
}

function BaseMap({
  rooms,
  selectedRoomTone,
  onSelectRoom: _onSelectRoom,
  hotspotPositions: _hotspotPositions,
  latestEvent,
  tasks,
}: {
  rooms: RoomCardData[];
  selectedRoomTone: RoomTone;
  onSelectRoom: (tone: RoomTone) => void;
  hotspotPositions: { tone: RoomTone; title: string; left: string; top: string }[];
  latestEvent: TaskEvent | null;
  tasks: Task[];
}) {
  const selected = rooms.find((r) => r.tone === selectedRoomTone);

  return (
    <div className="base-map-container">
      <div className="base-map-frame">
        <div className="remotion-map-layer">
          <LiveWorkshop latestEvent={latestEvent} tasks={tasks} />
        </div>
      </div>
      {selected ? (
        <div className={`base-selected-bar ${selected.tone}`}>
          <span className="selected-bar-dot" />
          <span className="selected-bar-name">{selected.title}</span>
          <span className="selected-bar-sub">{selected.subtitle}</span>
          <span className="selected-bar-status">
            {selected.status === 'online' ? '运行正常' : selected.status === 'warning' ? '需要注意' : '异常'}
          </span>
          <strong className="selected-bar-value">{selected.value}</strong>
        </div>
      ) : null}
    </div>
  );
}

function RoomHotspot({
  room,
  top,
  left,
  isSelected,
  onClick,
}: {
  room: RoomCardData;
  top: string;
  left: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`room-hotspot ${room.tone} ${isSelected ? 'is-active' : ''}`}
      style={{ top, left }}
      type="button"
      onClick={onClick}
      aria-label={`${room.title}：${room.operator}`}
    >
      <span className="hotspot-dot" />
      <span className="hotspot-label">{room.title}</span>
      <span className="hotspot-value">{room.value}</span>
      <span className="hotspot-bar">
        <span className="hotspot-bar-fill" />
      </span>
    </button>
  );
}

function RightPanel({
  allTasks,
  creatingType,
  creatingWorkflow,
  dependencyDraft,
  monitorQueueRows,
  selectedMonitorTaskName,
  selectedTaskId,
  onCreateDemoTask,
  onCreateDemoWorkflow,
  onDependencyDraftChange,
  onSelectMonitorTask,
}: {
  allTasks: Task[];
  creatingType: TaskTypeValue | '';
  creatingWorkflow: boolean;
  dependencyDraft: string;
  monitorQueueRows: MonitorTaskRowData[];
  selectedMonitorTaskName: string;
  selectedTaskId: string;
  onCreateDemoTask: (type: TaskTypeValue) => void;
  onCreateDemoWorkflow: () => void;
  onDependencyDraftChange: (value: string) => void;
  onSelectMonitorTask: (task: MonitorTaskRowData) => void;
}) {
  return (
    <aside className="right-stack">
      <PanelTitle title="任务队列" detail="17 个排队中" />
      <div className="queue-list monitor-queue" id="tasks">
        {monitorQueueRows.map((task) => (
          <MonitorTaskRow
            key={task.name}
            selected={(task.taskId ? task.taskId === selectedTaskId : false) || task.name === selectedMonitorTaskName}
            task={task}
            onSelect={() => onSelectMonitorTask(task)}
          />
        ))}
      </div>

      <PanelTitle title="智能体状态" detail="24 在线" />
      <div className="agent-list monitor-agent-list" id="agents">
        {agentRoomStatusRows.map((agent) => (
          <AgentRoomStatusRow key={agent.name} row={agent} />
        ))}
      </div>

      <PanelTitle title="活跃工作负载" detail="实时负载" />
      <div className="workload-list monitor-workload-list">
        {workloadSummaryRows.map((workload) => (
          <WorkloadSummaryRow key={workload.name} row={workload} />
        ))}
        <div className="demo-actions side-demo-actions">
          <span className="demo-actions-title">快速创建演示任务</span>
          <label className="dependency-select">
            <span>依赖任务</span>
            <select value={dependencyDraft} onChange={(event) => onDependencyDraftChange(event.target.value)}>
              <option value="">无依赖</option>
              {allTasks.slice(0, 8).map((task) => (
                <option key={task.id} value={task.id}>
                  {shortId(task.id)} · {displayTaskTitle(task)}
                </option>
              ))}
            </select>
          </label>
          {taskTypes.map((type) => (
            <button
              disabled={creatingType === type}
              key={type}
              type="button"
              onClick={() => onCreateDemoTask(type)}
            >
              {creatingType === type ? '创建中' : `新建${typeLabels[type]}任务`}
            </button>
          ))}
          <button disabled={creatingWorkflow} type="button" onClick={onCreateDemoWorkflow}>
            {creatingWorkflow ? '创建中' : '创建 V2 依赖工作流'}
          </button>
        </div>
      </div>
    </aside>
  );
}

function BottomPanelGrid({
  creatingWorktree,
  dashboardEventRows,
  expandedWorktreeTaskId,
  selectedTask,
  selectedTaskId,
  selectedVaultFile,
  selectedWorktree,
  vaultFiles,
  vaultPreview,
  onCreateSelectedWorktree,
  onPreviewVaultFile,
  onRemoveSelectedWorktree,
  onToggleWorktree,
}: {
  creatingWorktree: boolean;
  dashboardEventRows: DashboardEventRowData[];
  expandedWorktreeTaskId: string;
  selectedTask?: Task;
  selectedTaskId: string;
  selectedVaultFile: string;
  selectedWorktree?: WorktreeInfo;
  vaultFiles: VaultFile[];
  vaultPreview: string;
  onCreateSelectedWorktree: () => void;
  onPreviewVaultFile: (file: VaultFile) => void;
  onRemoveSelectedWorktree: () => void;
  onToggleWorktree: () => void;
}) {
  return (
    <section className="bottom-grid">
      <section className="panel event-panel" id="pipeline">
        <PanelTitle title="实时事件流" detail="全链路同步" />
        <div className="event-list refined-event-list">
          {dashboardEventRows.map((event) => (
            <EventStreamRow event={event} key={`${event.time}-${event.source}-${event.message}`} />
          ))}
        </div>
      </section>

      <section className="panel error-panel" id="errors">
        <PanelTitle title="错误日志（5）" detail="高优先级" />
        <div className="error-list refined-error-list">
          {errorLogRows.map((row) => (
            <ErrorLogRow key={`${row.scope}-${row.message}`} row={row} />
          ))}
        </div>
      </section>

      <section className="panel deploy-panel" id="artifacts">
        <PanelTitle title="构建与部署" detail="流水线：main" />
        <div className="deploy-card refined-deploy-card">
          <div className="deploy-headline">
            <strong>构建 #4821</strong>
            <span className="deploy-status success">成功</span>
          </div>
          <div className="deploy-meta">
            <span>提交 <b>a1b2c3d</b></span>
            <span>分支 <b>main</b></span>
            <span>触发者 <b>运维指挥官</b></span>
          </div>
          <div className="deploy-steps refined-deploy-steps">
            {deploySteps.map((step) => (
              <DeployStep key={step.name} step={step} />
            ))}
          </div>
        </div>
        <div className="v2-resource-grid">
          <WorktreePanel
            creating={creatingWorktree}
            expanded={expandedWorktreeTaskId === selectedTaskId}
            selectedTask={selectedTask}
            worktree={selectedWorktree}
            onCreate={onCreateSelectedWorktree}
            onRemove={onRemoveSelectedWorktree}
            onToggle={onToggleWorktree}
          />
          <VaultPanel
            files={vaultFiles}
            preview={vaultPreview}
            selectedFile={selectedVaultFile}
            selectedTask={selectedTask}
            onPreview={onPreviewVaultFile}
          />
        </div>
      </section>
    </section>
  );
}

function MetricCard({ metric }: { metric: MetricCardData }) {
  return (
    <article className={`metric-card ${metric.tone}`}>
      <div className="metric-card-top">
        <span className="metric-icon" aria-hidden="true">{metric.icon}</span>
        <div className="metric-copy">
          <span>{metric.title}</span>
          <strong>{metric.value}</strong>
        </div>
      </div>
      <small className={`metric-delta ${metric.trend}`}>{metric.delta}</small>
      <div className="sparkline">
        <Sparkline values={metric.points} label={`${metric.title}趋势`} />
      </div>
    </article>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 120;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg aria-label={label} className="sparkline-svg" role="img" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polygon className="sparkline-area" points={`0,${height} ${points} ${width},${height}`} />
      <polyline className="sparkline-line" points={points} />
    </svg>
  );
}

function HeartbeatIcon() {
  return (
    <span className="heartbeat-badge" aria-label="心跳状态" role="img">
      <svg viewBox="0 0 42 18" aria-hidden="true">
        <polyline points="1,9 7,9 10,4 15,15 20,6 24,9 30,9 33,3 37,15 41,9" />
      </svg>
    </span>
  );
}

function MonitorTaskRow({
  task,
  selected,
  onSelect,
}: {
  task: MonitorTaskRowData;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`monitor-task ${task.tone} ${task.status === TaskStatus.Blocked ? 'is-blocked' : ''} ${selected ? 'is-selected' : ''}`}
      type="button"
      onClick={onSelect}
    >
      <span className="monitor-task-copy">
        <strong>{task.name}</strong>
        <small>
          {task.status === TaskStatus.Blocked ? '锁定 · ' : ''}
          {task.agent}
          {task.dependsOnCount ? ` · 依赖 ${task.dependsOnCount}` : ''}
        </small>
      </span>
      <em>{task.status ? statusLabels[task.status] : `${task.percent}%`}</em>
      <Progress value={task.percent} />
    </button>
  );
}

function AgentRoomStatusRow({ row }: { row: AgentRoomStatusRowData }) {
  return (
    <div className={`monitor-agent-row ${row.tone}`}>
      <span className="monitor-dot" />
      <strong>{row.name}</strong>
      <em>{row.status}</em>
      <b>{row.load}%</b>
    </div>
  );
}

function WorkloadSummaryRow({ row }: { row: WorkloadSummaryRowData }) {
  return (
    <div className={`monitor-workload-row ${row.tone}`}>
      <span className="workload-icon" />
      <strong>{row.name}</strong>
      <em>{row.active} 活跃</em>
    </div>
  );
}

function EventStreamRow({ event }: { event: DashboardEventRowData }) {
  return (
    <div className={`event-row refined-event-row ${event.tone}`}>
      <span className="event-icon" />
      <time>{event.time}</time>
      <strong>{event.source}</strong>
      <span>{event.message}</span>
    </div>
  );
}

function ErrorLogRow({ row }: { row: ErrorLogRowData }) {
  return (
    <div className="error-row refined-error-row">
      <strong>[{row.scope}] {row.message}</strong>
      <span>{row.detail}</span>
    </div>
  );
}

function DeployStep({ step }: { step: DeployStepData }) {
  return (
    <span className="deploy-step">
      <i>✓</i>
      <strong>{step.name}</strong>
      <em>{step.duration}</em>
    </span>
  );
}

function DagOverlay({
  tasks,
  selectedTaskId,
  onSelectTask,
}: {
  tasks: Task[];
  selectedTaskId: string;
  onSelectTask: (task: Task) => void;
}) {
  return (
    <aside className="dag-overlay" aria-label="DAG 调度图">
      <PanelTitle title="DAG 调度图" detail={`${tasks.length} 个节点`} />
      <div className="dag-node-list">
        {tasks.length ? tasks.map((task, index) => (
          <button
            className={`dag-node ${task.status} ${task.id === selectedTaskId ? 'is-selected' : ''}`}
            key={task.id}
            type="button"
            onClick={() => onSelectTask(task)}
          >
            <span className="dag-step">{index + 1}</span>
            <span>
              <strong>{displayTaskTitle(task)}</strong>
              <small>
                {task.dependsOn?.length ? `依赖 ${task.dependsOn.map(shortId).join('、')}` : '入口任务'}
              </small>
            </span>
            <em>{task.status === TaskStatus.Blocked ? '锁定' : statusLabels[task.status]}</em>
          </button>
        )) : (
          <p className="dag-empty">暂无依赖，创建 V2 工作流后显示链路</p>
        )}
      </div>
    </aside>
  );
}

function WorktreePanel({
  creating,
  expanded,
  selectedTask,
  worktree,
  onCreate,
  onRemove,
  onToggle,
}: {
  creating: boolean;
  expanded: boolean;
  selectedTask?: Task;
  worktree?: WorktreeInfo;
  onCreate: () => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  return (
    <section className="resource-card worktree-card">
      <div className="resource-head">
        <strong>Worktree 状态</strong>
        <span>{worktree ? `${worktree.files.length} 文件` : '未创建'}</span>
      </div>
      <p>{selectedTask ? displayTaskTitle(selectedTask) : '请选择工程任务或 DAG 节点'}</p>
      {worktree ? (
        <>
          <div className="resource-meta">
            <span>分支 <b>{worktree.branch}</b></span>
            <span>任务 <b>{shortId(worktree.taskId)}</b></span>
          </div>
          <div className="resource-actions">
            <button type="button" onClick={onToggle}>{expanded ? '收起文件' : '展开文件'}</button>
            <button type="button" onClick={onRemove}>清理</button>
          </div>
          {expanded ? (
            <div className="mini-file-list">
              {worktree.files.length ? worktree.files.map((file) => (
                <span key={file.name}>{file.name}<em>{formatBytes(file.size)}</em></span>
              )) : <em>工作区暂无文件</em>}
            </div>
          ) : null}
        </>
      ) : (
        <button className="resource-primary" disabled={!selectedTask || creating} type="button" onClick={onCreate}>
          {creating ? '创建中' : '创建隔离工作区'}
        </button>
      )}
    </section>
  );
}

function VaultPanel({
  files,
  preview,
  selectedFile,
  selectedTask,
  onPreview,
}: {
  files: VaultFile[];
  preview: string;
  selectedFile: string;
  selectedTask?: Task;
  onPreview: (file: VaultFile) => void;
}) {
  const currentFile = files.find((file) => file.name === selectedFile);
  return (
    <section className="resource-card vault-card">
      <div className="resource-head">
        <strong>Vault 文件</strong>
        <span>{files.length} 个产出</span>
      </div>
      <p>{selectedTask ? `任务 ${shortId(selectedTask.id)} 的产物` : '请选择任务查看产物'}</p>
      <div className="vault-file-list">
        {files.length ? files.map((file) => (
          <button
            className={file.name === selectedFile ? 'is-selected' : ''}
            key={file.name}
            type="button"
            onClick={() => onPreview(file)}
          >
            <span>{file.name}</span>
            <em>{formatBytes(file.size)}</em>
          </button>
        )) : <em>暂无产出文件</em>}
      </div>
      <div className="vault-preview">
        {currentFile?.name.endsWith('.mp4') ? (
          <span className="video-placeholder">视频播放器占位 · {currentFile.name}</span>
        ) : preview ? (
          <pre>{preview.slice(0, 420)}</pre>
        ) : (
          <span>选择 .md / .ts / .json 文件可内联预览</span>
        )}
      </div>
    </section>
  );
}

function RoomCard({ room }: { room: RoomCardData }) {
  const devices = roomDevices(room.tone);

  return (
    <article
      className={`room-card ${room.tone} ${room.selected ? 'is-selected' : ''}`}
      aria-label={`${room.title}：${room.operator}`}
    >
      {/* 屋顶 */}
      <div className="room-roof" aria-hidden="true">
        <span className="roof-top" />
        <span className="roof-front" />
        <span className="roof-light" />
      </div>

      {/* 房间彩色外墙 */}
      <div className="room-colored-wall" aria-hidden="true">
        <span className="wall-stripe top" />
        <span className="wall-stripe mid" />
        <span className="wall-stripe bot" />
      </div>

      {/* 第一层：房间内壁框 */}
      <div className="room-wall-frame" aria-hidden="true">
        <span className="wall-corner tl" />
        <span className="wall-corner tr" />
        <span className="wall-corner bl" />
        <span className="wall-corner br" />
      </div>

      {/* 第二层：后墙设备区 */}
      <div className="room-back-wall" aria-hidden="true">
        <div className="wall-texture" />
        {devices.map((device) => (
          <span className={`room-device ${device}`} key={device} />
        ))}
        <span className="wall-vent" />
      </div>

      {/* 第三层：工作台区域 */}
      <div className="room-work-area" aria-hidden="true">
        <RoomWorkstation tone={room.tone} />
      </div>

      {/* 第四层：人物区域 + 地面 */}
      <div className="room-floor-area" aria-hidden="true">
        <span className="floor-grid" />
        <PixelOperator role={room.operator} tone={room.tone} />
        <span className="floor-glow" aria-hidden="true" />
      </div>

      {/* 像素招牌 */}
      <div className="room-signboard" aria-hidden="true">
        <span className="signboard-post" />
        <span className="signboard-plate">
          <span className="signboard-text">{room.title}</span>
        </span>
      </div>

      {/* 信息叠加层 */}
      <RoomHeader status={room.status} title={room.title} value={room.value} />
      <p className="room-subtitle">{room.subtitle}</p>
      <span className="room-hover-note">{room.description}</span>
    </article>
  );
}

function RoomHeader({ status, title, value }: { status: RoomStatus; title: string; value: number | string }) {
  return (
    <header className="room-header">
      <span className={`status-light ${status}`} aria-label={`状态：${statusLabel(status)}`} />
      <div className="room-sign">
        <span className="room-sign-icon" aria-hidden="true" />
        <span className="room-sign-title">{title}</span>
        <strong>{value}</strong>
      </div>
    </header>
  );
}

function RoomWorkstation({ tone }: { tone: RoomTone }) {
  return (
    <span className={`room-desk ${tone}`} aria-hidden="true">
      <span className="desk-body" />
      <span className="desk-screen" />
      <span className="desk-screen second" />
      <span className="desk-panel" />
      <span className="desk-edge" />
    </span>
  );
}

function PixelOperator({ role, tone }: { role: string; tone: RoomTone }) {
  const toolClass = `tool-${tone}`;
  const hatClass = `hat-${tone}`;
  return (
    <span className={`pixel-operator ${tone}`} aria-label={role} role="img" title={role}>
      <span className={`pixel-hat ${hatClass}`} />
      <span className="pixel-head">
        <span className="pixel-eye left" />
        <span className="pixel-eye right" />
        <span className="pixel-mouth" />
      </span>
      <span className="pixel-body">
        <span className="pixel-collar" />
        <span className="pixel-badge" />
      </span>
      <span className="pixel-arm left" />
      <span className="pixel-arm right" />
      <span className="pixel-leg left" />
      <span className="pixel-leg right" />
      <span className={`pixel-tool ${toolClass}`} />
    </span>
  );
}

function roomDevices(tone: RoomTone): string[] {
  if (tone === 'command') return ['cmd-main-screen', 'cmd-map-panel', 'cmd-console', 'cmd-holo'];
  if (tone === 'oracle') return ['orc-book-shelf', 'orc-board', 'orc-orb', 'orc-scroll'];
  if (tone === 'forge') return ['for-code-panel', 'for-bench', 'for-rack', 'for-lamp'];
  if (tone === 'hermes') return ['her-video-wall', 'her-timeline', 'her-console', 'her-speaker'];
  if (tone === 'sentinel') return ['sen-shield', 'sen-monitor', 'sen-alarm', 'sen-scanner'];
  return ['vau-rack', 'vau-lock', 'vau-terminal', 'vau-crate'];
}

function statusLabel(status: RoomStatus): string {
  const labels: Record<RoomStatus, string> = {
    online: '在线',
    warning: '警告',
    error: '错误',
  };
  return labels[status];
}

function PanelTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="panel-title">
      <h3>{title}</h3>
      <span>{detail}</span>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <span className="progress-track" aria-label={`进度 ${value}%`}>
      <span style={{ width: `${value}%` }} />
    </span>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter-row">
      <span>{label}</span>
      <b>
        <i style={{ width: `${value}%` }} />
      </b>
      <em>{value}%</em>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function readableEvents(events: TaskEvent[]): TaskEvent[] {
  const filtered = events.filter((event) => event.type !== 'task.heartbeat' && event.type !== 'agent.online');
  return filtered.slice(0, 12);
}

function buildMonitorQueueRows(tasks: Task[]): MonitorTaskRowData[] {
  if (tasks.length) {
    return tasks.slice(0, 5).map((task) => ({
      name: displayTaskTitle(task),
      agent: sourceForTaskType(task.type),
      percent: taskProgress(task),
      tone: toneForTaskType(task.type),
      status: task.status,
      dependsOnCount: task.dependsOn?.length,
      taskId: task.id,
    }));
  }

  return monitorQueueTemplate.map((row, index) => ({
    ...row,
    taskId: tasks[index]?.id,
  }));
}

function buildDagTasks(tasks: Task[]): Task[] {
  const withDependencies = tasks.filter((task) => task.dependsOn?.length || task.status === TaskStatus.Blocked);
  if (withDependencies.length) return withDependencies.slice(0, 5);
  return tasks.slice(0, 5);
}

function buildDashboardEventRows(events: TaskEvent[], tasks: Task[]): DashboardEventRowData[] {
  const rows = events.slice(0, 5).map((event, index) => {
    const task = event.taskId ? tasks.find((item) => item.id === event.taskId) : undefined;
    const tone = task ? toneForTaskType(task.type) : fallbackEventRows[index % fallbackEventRows.length].tone;
    const source = task ? sourceForTaskType(task.type) : event.agentId ? '指挥中心' : '系统';
    const message = eventLabels[event.type] ?? '系统事件';

    return {
      time: formatTime(event.timestamp),
      source,
      message: event.taskId ? `${message} · 任务 ${shortId(event.taskId)}` : message,
      tone,
    };
  });

  return rows.length > 0 ? rows : fallbackEventRows;
}

function sourceForTaskType(type: TaskTypeValue): string {
  const labels: Record<TaskTypeValue, string> = {
    [TaskType.Oracle]: '策略室',
    [TaskType.Forge]: '工程室',
    [TaskType.Hermes]: '媒体室',
  };
  return labels[type];
}

function toneForTaskType(type: TaskTypeValue): MonitorTone {
  const tones: Record<TaskTypeValue, MonitorTone> = {
    [TaskType.Oracle]: 'purple',
    [TaskType.Forge]: 'orange',
    [TaskType.Hermes]: 'violet',
  };
  return tones[type];
}

function countByTaskType(tasks: Task[], type: TaskTypeValue): number {
  return tasks.filter((task) => task.type === type).length;
}

function taskProgress(task: Task): number {
  if (task.status === TaskStatus.Completed) return 100;
  if (task.status === TaskStatus.Running) return 72;
  if (task.status === TaskStatus.Retrying) return 46;
  if (task.status === TaskStatus.Failed) return 18;
  if (task.status === TaskStatus.Blocked) return 8;
  return 25;
}

function demoTitle(type: TaskTypeValue): string {
  const labels: Record<TaskTypeValue, string> = {
    [TaskType.Oracle]: '演示策略拆解',
    [TaskType.Forge]: '演示工程模块',
    [TaskType.Hermes]: '演示媒体产物',
  };
  return labels[type];
}

function demoBrief(type: TaskTypeValue): string {
  const labels: Record<TaskTypeValue, string> = {
    [TaskType.Oracle]: '生成阿星工坊作品集演示的需求拆解',
    [TaskType.Forge]: '生成一个可展示的工程模块产物',
    [TaskType.Hermes]: '生成一个媒体室预览占位产物',
  };
  return labels[type];
}

function localizeVisibleName(value: string): string {
  return value
    .replace(/TriForge Studio/gi, '阿星工坊')
    .replace(/Multi-Agent Workflow Command Center/gi, '多智能体工作流指挥中心')
    .replace(/Command Center/gi, '指挥中心')
    .replace(/\bOracle\b/g, '策略室')
    .replace(/\bForge\b/g, '工程室')
    .replace(/\bHermes\b/g, '媒体室')
    .replace(/\bSentinel\b/g, '质量室')
    .replace(/\bVault\b/g, '存储室')
    .replace(/\bOverview\b/g, '总览')
    .replace(/\bAgents\b/g, '智能体')
    .replace(/\bTasks\b/g, '任务')
    .replace(/\bPipelines\b/g, '流水线')
    .replace(/\bErrors\b/g, '错误')
    .replace(/\bArtifacts\b/g, '制品库')
    .replace(/\bNodes\b/g, '节点')
    .replace(/\bSettings\b/g, '设置')
    .replace(/Live Event Stream/gi, '实时事件流')
    .replace(/Build & Deploy/gi, '构建与部署')
    .replace(/Task Queue/gi, '任务队列')
    .replace(/Agent Status/gi, '智能体状态')
    .replace(/Active Workloads/gi, '活跃工作负载');
}

function displayTaskTitle(task: Task): string {
  if (task.title.includes('Codex smoke Hermes preview')) return '媒体室端到端验证任务';
  if (task.title.includes('generate script')) return '生成脚本任务';
  if (task.title.includes('build module')) return '生成模块任务';
  return localizeVisibleName(task.title);
}

function displayAgentName(agent: Agent): string {
  if (agent.name.includes('Mock') || /Oracle|Forge|Hermes|Sentinel|Vault|TriForge|Command Center/i.test(agent.name)) {
    return agentDisplayNames[agent.type];
  }
  return localizeVisibleName(agent.name);
}

function formatClock(value?: string): string {
  return value ? formatTime(value) : '等待同步';
}

function formatTime(value?: string): string {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function isPreviewableFile(filename: string): boolean {
  return /\.(md|txt|ts|tsx|js|json|log)$/i.test(filename);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatError(err: unknown): string {
  if (err instanceof Error && /Unexpected end of JSON input/i.test(err.message)) {
    return '后端响应为空，请确认指挥中心 API 已启动';
  }
  if (err instanceof ApiClientError) return `接口请求失败：${err.message}`;
  if (err instanceof Error) return err.message;
  return '无法连接指挥中心';
}
