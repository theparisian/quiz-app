interface WaitingLabelProps {
  children: string;
  className?: string;
}

export default function WaitingLabel({ children, className = 'text-gray-400' }: WaitingLabelProps) {
  return (
    <p className={className}>
      {children}
      <span className="inline-flex w-[1.25rem]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="animate-waiting-dot" style={{ animationDelay: `${i * 0.2}s` }}>
            .
          </span>
        ))}
      </span>
    </p>
  );
}
