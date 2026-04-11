import { Bot, Loader2, Power, PowerOff, RefreshCw, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface SentinelHeaderProps {
  status: string;
  startedAt: string | null;
  mode: "auto" | "supervised";
  toggling: boolean;
  onToggle: (action: "start" | "stop") => void;
  onRefresh: () => void;
  onModeChange: (mode: "auto" | "supervised") => void;
  onCommand: (cmd: string) => void;
}

function formatUptime(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function statusBadgeClass(status: string): string {
  const colors: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    stopped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
    starting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    restarting: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return colors[status] ?? colors["stopped"];
}

export default function SentinelHeader({
  status,
  startedAt,
  mode,
  toggling,
  onToggle,
  onRefresh,
  onModeChange,
  onCommand,
}: SentinelHeaderProps) {
  const isRunning = status === "running";

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <Bot className="h-5 w-5 text-zinc-400" />
        <span className="text-lg font-semibold text-zinc-100">
          AlgoBond Sentinel
        </span>
        <Badge className={statusBadgeClass(status)}>
          {status.toUpperCase()}
        </Badge>
        {startedAt && isRunning && (
          <span className="text-sm text-zinc-500">
            Uptime: {formatUptime(startedAt)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Mode toggle */}
        <button
          onClick={() => onModeChange(mode === "auto" ? "supervised" : "auto")}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            mode === "auto"
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
          }`}
        >
          {mode === "auto" ? "AUTO" : "SUPERVISED"}
        </button>

        {/* Command buttons */}
        {isRunning && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCommand("restart")}
              className="text-zinc-400 hover:text-zinc-200"
              title="Restart"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCommand("deploy")}
              className="text-zinc-400 hover:text-zinc-200"
              title="Deploy"
            >
              <Rocket className="h-4 w-4" />
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant={isRunning ? "destructive" : "default"}
              size="sm"
              disabled={toggling}
              className={
                !isRunning ? "bg-emerald-600 hover:bg-emerald-500" : ""
              }
            >
              {toggling ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : isRunning ? (
                <PowerOff className="h-4 w-4 mr-1" />
              ) : (
                <Power className="h-4 w-4 mr-1" />
              )}
              {isRunning ? "Stop" : "Start"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isRunning ? "Остановить Sentinel?" : "Запустить Sentinel?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isRunning
                  ? "Мониторинг и auto-fix будут отключены. Health checks прекратятся."
                  : "Sentinel начнет монито��инг логов, auto-fix ошибок и health checks."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onToggle(isRunning ? "stop" : "start")}
                className={
                  isRunning
                    ? "bg-red-600 hover:bg-red-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }
              >
                {isRunning ? "Остановить" : "Запустить"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
