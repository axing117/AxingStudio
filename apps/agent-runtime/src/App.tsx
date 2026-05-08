import { useState, useEffect, useRef } from 'react';

type Status = 'disconnected' | 'scanning' | 'registered' | 'working' | 'error';

const STATUS_INFO: Record<Status, { label: string; color: string; desc: string }> = {
  disconnected: { label: '未连接', color: '#6b7280', desc: '未连接到指挥中心' },
  scanning: { label: '扫描中', color: '#eab308', desc: '正在扫描本机 Agent...' },
  registered: { label: '已注册', color: '#22c55e', desc: '节点已注册，等待任务' },
  working: { label: '执行中', color: '#3b82f6', desc: '正在执行任务...' },
  error: { label: '错误', color: '#ef4444', desc: '发生错误，请检查日志' },
};

interface Agent {
  name: string;
  type: string;
  capabilities: string[];
  location: string;
}

declare global {
  interface Window {
    agentRuntime: {
      getStatus: () => Promise<Status>;
      getLogs: () => Promise<string[]>;
      getAgents: () => Promise<Agent[]>;
      getApiUrl: () => Promise<string>;
      setApiUrl: (url: string) => Promise<void>;
      rescan: () => Promise<void>;
      onStatusChange: (cb: (status: Status) => void) => void;
      onLog: (cb: (entry: string) => void) => void;
      onShowLogs: (cb: (logs: string[]) => void) => void;
      onShowSettings: (cb: () => void) => void;
    };
  }
}

export default function App() {
  const [status, setStatus] = useState<Status>('disconnected');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [apiUrl, setApiUrl] = useState('http://localhost:3001');
  const [view, setView] = useState<'status' | 'logs' | 'settings'>('status');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.agentRuntime.getStatus().then(setStatus);
    window.agentRuntime.getAgents().then(setAgents);
    window.agentRuntime.getLogs().then(setLogs);
    window.agentRuntime.getApiUrl().then(setApiUrl);

    window.agentRuntime.onStatusChange(setStatus);
    window.agentRuntime.onLog((entry) => {
      setLogs(prev => [...prev.slice(-200), entry]);
    });
    window.agentRuntime.onShowLogs(() => setView('logs'));
    window.agentRuntime.onShowSettings(() => setView('settings'));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const info = STATUS_INFO[status];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: info.color }} />
          <div>
            <h1 style={styles.title}>阿星工坊 Agent</h1>
            <p style={{ ...styles.subtitle, color: info.color }}>{info.label} — {info.desc}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['status', 'logs', 'settings'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              ...styles.tab,
              ...(view === v ? styles.tabActive : {}),
            }}
          >
            {{ status: '状态', logs: '日志', settings: '设置' }[v]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {view === 'status' && (
          <div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>节点信息</h3>
              <div style={styles.row}>
                <span style={styles.label}>状态</span>
                <span style={{ color: info.color, fontWeight: 600 }}>{info.label}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>指挥中心</span>
                <span style={styles.value}>{apiUrl}</span>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>检测到的 Agent ({agents.length})</h3>
              {agents.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: 13 }}>未检测到 Agent，请安装 Claude Code 或 Codex</p>
              ) : (
                agents.map((a, i) => (
                  <div key={i} style={{ ...styles.row, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: 600 }}>{a.name}</span>
                      <span style={{ color: '#64748b', fontSize: 12 }}>{a.type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {a.capabilities.map(c => (
                        <span key={c} style={styles.badge}>{c}</span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => window.agentRuntime.rescan()}
              style={styles.primaryBtn}
            >
              重新扫描
            </button>
          </div>
        )}

        {view === 'logs' && (
          <div style={styles.logContainer}>
            {logs.map((entry, i) => (
              <div key={i} style={styles.logLine}>{entry}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {view === 'settings' && (
          <div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>指挥中心地址</h3>
              <input
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                onBlur={() => window.agentRuntime.setApiUrl(apiUrl)}
                style={styles.input}
                placeholder="http://localhost:3001"
              />
              <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
                修改后自动保存，重启生效
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={{ color: '#475569', fontSize: 11 }}>阿星工坊 · 多智能体工作流</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0', height: '100vh', display: 'flex', flexDirection: 'column' },
  header: { padding: '16px 20px', borderBottom: '1px solid #1e293b' },
  title: { margin: 0, fontSize: 16, fontWeight: 700 },
  subtitle: { margin: '2px 0 0', fontSize: 12 },
  tabs: { display: 'flex', gap: 0, borderBottom: '1px solid #1e293b' },
  tab: { flex: 1, padding: '8px 0', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  tabActive: { color: '#a78bfa', borderBottomColor: '#a78bfa' },
  content: { flex: 1, overflow: 'auto', padding: 16 },
  card: { background: '#1e293b', borderRadius: 8, padding: 14, marginBottom: 12 },
  cardTitle: { margin: '0 0 10px', fontSize: 13, color: '#94a3b8', fontWeight: 500 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' },
  label: { color: '#94a3b8', fontSize: 13 },
  value: { color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace' },
  badge: { background: '#334155', color: '#a78bfa', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' },
  primaryBtn: { width: '100%', padding: '10px 0', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  input: { width: '100%', padding: '8px 12px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' },
  logContainer: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, color: '#94a3b8' },
  logLine: { padding: '1px 0', borderBottom: '1px solid #1e293b' },
  footer: { padding: '8px 16px', borderTop: '1px solid #1e293b', textAlign: 'center' },
};
