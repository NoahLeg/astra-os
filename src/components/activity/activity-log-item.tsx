import { Activity } from "lucide-react";
import { ConfidenceIndicator } from "@/components/shared/indicators";
import type { ActivityEvent } from "@/types";
export function ActivityLogItem({ event }: { event: ActivityEvent }) { return <div className="flex items-center gap-3 rounded-xl border p-3"><Activity className="size-4 text-indigo-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{event.action}</p><p className="text-xs text-muted-foreground">{event.agent} · {event.timestamp}</p></div><ConfidenceIndicator value={event.confidence} compact /></div>; }
