interface QuestionProgressBarProps {
  current: number;
  total: number;
  className?: string;
}

export default function QuestionProgressBar({
  current,
  total,
  className = '',
}: QuestionProgressBarProps) {
  if (total <= 0) return null;

  return (
    <div
      className={`flex gap-1 ${className}`}
      role="progressbar"
      aria-valuenow={current}
      aria-valuemax={total}
    >
      {Array.from({ length: total }, (_, i) => {
        const segment = i + 1;
        const isActive = segment <= current;
        return (
          <div
            key={segment}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              isActive ? 'bg-brand-500' : 'bg-white/15'
            }`}
          />
        );
      })}
    </div>
  );
}
