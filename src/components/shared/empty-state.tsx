import { DynamicIcon } from "@/components/shared/dynamic-icon";

export function EmptyState({ title, description, icon = "Inbox" }: { title: string; description: string; icon?: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center"><span className="mb-4 rounded-xl bg-muted p-3"><DynamicIcon name={icon} className="size-5 text-muted-foreground" /></span><h3 className="font-medium">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p></div>;
}
