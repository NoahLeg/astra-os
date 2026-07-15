import { AgentDetailPage } from "@/components/agents/agents-page";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AgentDetailPage id={id} />; }
