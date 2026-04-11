import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ChatMessage } from "@/hooks/useSentinelChat";

interface SentinelChatProps {
  messages: ChatMessage[];
  connected: boolean;
  reconnecting: boolean;
  onSend: (content: string) => void;
  onApproval: (approvalId: string, decision: "approve" | "reject") => void;
}

function messageColor(type: string): string {
  switch (type) {
    case "user_message":
      return "text-zinc-100";
    case "agent_message":
      return "text-emerald-400";
    case "agent_log":
      return "text-zinc-500";
    case "approval_request":
      return "text-yellow-400";
    case "approval_response":
      return "text-blue-400";
    default:
      return "text-zinc-400";
  }
}

function messagePrefix(type: string): string {
  switch (type) {
    case "user_message":
      return "You";
    case "agent_message":
      return "Sentinel";
    case "agent_log":
      return "Log";
    case "approval_request":
      return "Approval";
    case "approval_response":
      return "Decision";
    default:
      return "";
  }
}

export default function SentinelChat({
  messages,
  connected,
  reconnecting,
  onSend,
  onApproval,
}: SentinelChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-900/50 flex flex-col"
      style={{ height: "400px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <MessageSquare className="h-4 w-4" />
          Chat
        </div>
        <div className="flex items-center gap-1">
          {connected ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
              <Wifi className="h-3 w-3 mr-1" /> Live
            </Badge>
          ) : reconnecting ? (
            <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">
              <WifiOff className="h-3 w-3 mr-1" /> Reconnecting...
            </Badge>
          ) : (
            <Badge className="bg-zinc-700/50 text-zinc-500 text-xs">
              <WifiOff className="h-3 w-3 mr-1" /> Offline
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-1"
      >
        {messages.length === 0 && (
          <p className="text-center text-zinc-600 text-sm py-8">
            No messages yet
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            {msg.type === "approval_request" ? (
              <div className="my-2 p-3 rounded border border-yellow-500/30 bg-yellow-500/5">
                <div className="text-yellow-400 text-xs font-medium mb-1">
                  Approval Required
                </div>
                <p className="text-zinc-300 text-sm mb-2">{msg.content}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 bg-emerald-600 hover:bg-emerald-500 text-xs"
                    onClick={() => {
                      const id = msg.metadata?.approval_id as string;
                      if (id) onApproval(id, "approve");
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => {
                      const id = msg.metadata?.approval_id as string;
                      if (id) onApproval(id, "reject");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <span
                  className={`font-mono text-xs ${messageColor(msg.type)} opacity-70`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className={`font-medium text-xs ${messageColor(msg.type)}`}
                >
                  {messagePrefix(msg.type)}:
                </span>
                <span className={messageColor(msg.type)}>{msg.content}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 px-4 py-2 border-t border-zinc-800"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? "Message Sentinel..." : "Disconnected"}
          disabled={!connected}
          className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          maxLength={4000}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!connected || !input.trim()}
          className="bg-zinc-700 hover:bg-zinc-600"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
