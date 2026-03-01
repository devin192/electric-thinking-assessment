export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-heading font-bold tracking-tight ${className}`}>
      <span className="text-et-pink">ELECTRIC</span>{" "}
      <span className="text-foreground">THINKING</span>
    </span>
  );
}
