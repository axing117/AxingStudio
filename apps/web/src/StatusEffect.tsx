/**
 * StatusEffect — 状态特效组件
 * 根据状态显示感叹号、星星、思考泡泡等
 */

type CharStatus = 'idle' | 'working' | 'success' | 'error';

interface StatusEffectProps {
  status: CharStatus;
  taskTitle?: string;
}

export function StatusEffect({ status, taskTitle }: StatusEffectProps) {
  switch (status) {
    case 'error':
      return (
        <div className="status-effect status-error">
          <div className="effect-icon">❗</div>
          <div className="effect-shake">!</div>
        </div>
      );

    case 'success':
      return (
        <div className="status-effect status-success">
          <div className="effect-stars">
            <span className="star star-1">✨</span>
            <span className="star star-2">⭐</span>
            <span className="star star-3">✨</span>
          </div>
        </div>
      );

    case 'working':
      return (
        <div className="status-effect status-working">
          <div className="effect-thinking">
            <span className="dot dot-1">●</span>
            <span className="dot dot-2">●</span>
            <span className="dot dot-3">●</span>
          </div>
          {taskTitle && (
            <div className="effect-task-hint">
              {taskTitle.length > 8 ? taskTitle.slice(0, 8) + '...' : taskTitle}
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}
