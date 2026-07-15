import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";

export function DynamicIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name] ?? Icons.Circle;
  return <Icon {...props} />;
}
