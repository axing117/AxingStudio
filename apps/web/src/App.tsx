import { useEffect, useState } from 'react';
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
  Task,
  TaskEvent,
  TaskStatus as TaskStatusValue,
  TaskType as TaskTypeValue,
} from '@axing/shared';
import { ApiClientError, api } from './api';

type StatusFilter = TaskStatusValue | 'all';
type RoomStatus = 'online' | 'warning' | 'error';
type MetricTone = 'cyan' | 'violet' | 'red' | 'aqua' | 'indigo';
type MonitorTone = 'teal' | 'purple' | 'orange' | 'violet' | 'emerald' | 'gold' | 'red' | 'yellow';

type MonitorTaskRowData = {
  name: string;
  agent: string;
  percent: number;
  tone: MonitorTone;
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
  TaskStatus.Queued,
  TaskStatus.Running,
  TaskStatus.Completed,
  TaskStatus.Retrying,
  TaskStatus.Failed,
] as const;

const monitorQueueTemplate: Omit<MonitorTaskRowData, 'taskId'>[] = [
  { name: '视频渲染-1080p', agent: 'Hermes', percent: 75, tone: 'violet' },
  { name: '数据同步-流水线', agent: 'Oracle', percent: 42, tone: 'purple' },
  { name: '模型训练-v2', agent: 'Forge', percent: 68, tone: 'orange' },
  { name: 'QA回归测试套件', agent: 'Sentinel', percent: 21, tone: 'emerald' },
  { name: '制品备份', agent: 'Vault', percent: 89, tone: 'gold' },
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
  { scope: '制品备份', message: '权限拒绝', detail: 'artifact store denied' },
  { scope: '测试执行', message: '断言失败', detail: 'checkout flow regression' },
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

export function App() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creatingType, setCreatingType] = useState<TaskTypeValue | ''>('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [health, tasks, agents, events, artifacts] = await Promise.all([
          api.health(),
          api.tasks(statusFilter === 'all' ? undefined : statusFilter),
          api.agents(),
          api.events(200),
          api.artifacts(selectedTaskId || undefined),
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
        setError('');
      } catch (err) {
        if (!active) return;
        setError(formatError(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [statusFilter, selectedTaskId, refreshTick]);

  async function createDemoTask(type: TaskTypeValue) {
    const request: CreateTaskRequest = {
      type,
      title: demoTitle(type),
      input: {
        brief: demoBrief(type),
        source: 'showcase',
      },
      maxRetries: 3,
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

  const allTasks = data.tasks;
  const runningTasks = allTasks.filter((task) => task.status === TaskStatus.Running);
  const failedTasks = allTasks.filter((task) => task.status === TaskStatus.Failed);
  const onlineAgents = data.agents.filter((agent) => agent.status !== AgentStatus.Offline);
  const selectedTask = allTasks.find((task) => task.id === selectedTaskId);
  const visibleEvents = readableEvents(data.events);
  const monitorQueueRows = buildMonitorQueueRows(allTasks);
  const dashboardEventRows = buildDashboardEventRows(visibleEvents, allTasks);

  return (
    <main className="ops-shell">
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
          <span className={`pulse ${data.health === 'alive' ? 'is-live' : ''}`} />
          <strong>系统状态</strong>
          <p>{data.health === 'alive' ? '所有系统运行正常' : '正在连接指挥中心'}</p>
          <Meter label="处理器" value={32} />
          <Meter label="图形" value={67} />
          <Meter label="内存" value={48} />
        </div>

        <div className="operator-card">
          <div className="avatar">工</div>
          <div>
            <strong>运维指挥官</strong>
            <p>演示工作台在线</p>
          </div>
        </div>
      </aside>

      <section className="main-stage">
        <header className="hero-bar" id="overview">
          <div>
            <h2>阿星工坊</h2>
            <p>第一版展示包装中心</p>
          </div>
          <div className="hero-tools">
            <span className="region-dot">区域：华东一</span>
            <span>{formatClock(data.lastUpdatedAt)}</span>
            <button type="button" onClick={() => setRefreshTick((value) => value + 1)}>刷新</button>
          </div>
        </header>

        {error ? (
          <div className="alert-bar" role="status">
            <strong>连接提示</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <section className="kpi-grid" aria-label="运行指标">
          {metricCards.map((metric) => (
            <MetricCard key={metric.title} metric={metric} />
          ))}
        </section>

        <section className="dashboard-grid">
          <section className="command-map" aria-label="六房间监控地图">
            <div className="map-floor">
              <RoomCard
                title="指挥中心"
                subtitle="任务锁与状态机"
                value={`${runningTasks.length}/${allTasks.length}`}
                tone="command"
                status={data.health === 'alive' ? 'online' : 'warning'}
                selected={!selectedTask}
              />
              <RoomCard
                title="策略室"
                subtitle="需求拆解"
                value={countByTaskType(allTasks, TaskType.Oracle)}
                tone="oracle"
                status={onlineAgents.some((agent) => agent.type === AgentType.Oracle) ? 'online' : 'warning'}
              />
              <RoomCard
                title="工程室"
                subtitle="代码执行"
                value={countByTaskType(allTasks, TaskType.Forge)}
                tone="forge"
                status={onlineAgents.some((agent) => agent.type === AgentType.Forge) ? 'online' : 'warning'}
              />
              <RoomCard
                title="媒体室"
                subtitle="视频与素材"
                value={countByTaskType(allTasks, TaskType.Hermes)}
                tone="hermes"
                status={onlineAgents.some((agent) => agent.type === AgentType.Hermes) ? 'online' : 'warning'}
              />
              <RoomCard
                title="质量室"
                subtitle="错误与审核"
                value={failedTasks.length}
                tone="sentinel"
                status={failedTasks.length > 0 ? 'error' : 'online'}
              />
              <RoomCard
                title="存储室"
                subtitle="产物归档"
                value={data.artifacts.length}
                tone="vault"
                status={data.artifacts.length > 0 ? 'online' : 'warning'}
              />
            </div>
          </section>

          <aside className="right-stack">
            <PanelTitle title="任务队列" detail="17 个排队中" />
            <div className="queue-list monitor-queue" id="tasks">
              {monitorQueueRows.map((task) => (
                <MonitorTaskRow
                  key={task.name}
                  selected={task.taskId === selectedTaskId}
                  task={task}
                  onSelect={() => {
                    if (task.taskId) setSelectedTaskId(task.taskId);
                  }}
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
                {taskTypes.map((type) => (
                  <button
                    disabled={creatingType === type}
                    key={type}
                    type="button"
                    onClick={() => createDemoTask(type)}
                  >
                    {creatingType === type ? '创建中' : `新建${typeLabels[type]}任务`}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>

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
          </section>
        </section>
      </section>
    </main>
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
      className={`monitor-task ${task.tone} ${selected ? 'is-selected' : ''}`}
      type="button"
      onClick={onSelect}
    >
      <span className="monitor-task-copy">
        <strong>{task.name}</strong>
        <small>{task.agent}</small>
      </span>
      <em>{task.percent}%</em>
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

function RoomCard(props: {
  title: string;
  subtitle: string;
  value: number | string;
  tone: string;
  status: RoomStatus;
  selected?: boolean;
}) {
  const devices = roomDevices(props.tone);

  return (
    <article className={`room-card ${props.tone} ${props.selected ? 'is-selected' : ''}`}>
      <span className={`status-light ${props.status}`} aria-label={`状态：${statusLabel(props.status)}`} />
      <div className="room-sign">
        <span>{props.title}</span>
        <strong>{props.value}</strong>
      </div>
      <div className="room-scene" aria-hidden="true">
        <div className="back-wall">
          {devices.map((device) => (
            <span className={`device ${device}`} key={device} />
          ))}
        </div>
        <span className={`pixel-avatar ${props.tone}`} />
        <span className="room-desk" />
        <span className="floor-glow" />
      </div>
      <p>{props.subtitle}</p>
    </article>
  );
}

function roomDevices(tone: string): string[] {
  if (tone === 'command') return ['big-screen', 'map-screen', 'control-console', 'holo-table'];
  if (tone === 'oracle') return ['book-shelf', 'strategy-board', 'crystal-orb', 'paper-table'];
  if (tone === 'forge') return ['code-screen', 'tool-bench', 'server-rack', 'warning-lamp'];
  if (tone === 'hermes') return ['video-screen', 'play-button', 'editing-desk', 'media-shelf'];
  if (tone === 'sentinel') return ['shield-icon', 'test-screen', 'alarm-sign', 'check-table'];
  return ['storage-shelf', 'lock-icon', 'server-cabinet', 'artifact-box'];
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
  return monitorQueueTemplate.map((row, index) => ({
    ...row,
    taskId: tasks[index]?.id,
  }));
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

function displayTaskTitle(task: Task): string {
  if (task.title.includes('Codex smoke Hermes preview')) return '媒体室端到端验证任务';
  if (task.title.includes('generate script')) return '生成脚本任务';
  if (task.title.includes('build module')) return '生成模块任务';
  return task.title;
}

function displayAgentName(agent: Agent): string {
  if (agent.name.includes('Mock') || /Oracle|Forge|Hermes|Sentinel/i.test(agent.name)) {
    return agentDisplayNames[agent.type];
  }
  return agent.name;
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

function formatError(err: unknown): string {
  if (err instanceof ApiClientError) return `接口请求失败：${err.message}`;
  if (err instanceof Error) return err.message;
  return '无法连接指挥中心';
}
