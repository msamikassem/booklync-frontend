export default function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-64 text-muted text-sm">
      {name} — coming soon
    </div>
  );
}
