/**
 * CharExpression — 角色表情组件
 * 根据状态显示不同的眼睛和嘴巴动画
 */

type CharStatus = 'idle' | 'working' | 'success' | 'error';

interface CharExpressionProps {
  status: CharStatus;
  /** 角色缩放比例，用于定位表情 */
  scale: number;
}

export function CharExpression({ status }: CharExpressionProps) {
  return (
    <div className="char-expression">
      <div className={`expr-eyes expr-eyes-${status}`}>
        <div className="expr-eye left" />
        <div className="expr-eye right" />
      </div>
      <div className={`expr-mouth expr-mouth-${status}`} />
      {status === 'working' && <div className="expr-sweat" />}
      {status === 'error' && <div className="expr-blush" />}
    </div>
  );
}
