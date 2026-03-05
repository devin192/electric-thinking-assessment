import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Send, X, MessageCircle } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChallengeCoachProps {
  nudgeId: number;
  challengeContent: any;
  isOpen: boolean;
  onClose: () => void;
}

export function ChallengeCoach({ nudgeId, challengeContent, isOpen, onClose }: ChallengeCoachProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing conversation when opened
  useEffect(() => {
    if (isOpen && !initialLoaded) {
      loadConversation();
    }
  }, [isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  async function loadConversation() {
    try {
      const res = await apiRequest("GET", `/api/challenge/${nudgeId}/coach`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      }
      setInitialLoaded(true);
    } catch {
      setInitialLoaded(true);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await apiRequest("POST", `/api/challenge/${nudgeId}/coach`, { message: text });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try sending your message again." }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="mt-4 border border-border rounded-xl overflow-hidden bg-background" data-testid="challenge-coach">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-et-pink" />
          <span className="text-sm font-medium">AI Coach</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} data-testid="coach-close">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="max-h-[300px] overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Need help with this challenge? Describe what you're trying and where you're stuck.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-et-pink text-white"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for help..."
          disabled={loading}
          className="rounded-xl text-sm"
          data-testid="coach-input"
        />
        <Button
          size="icon"
          className="rounded-xl shrink-0"
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          data-testid="coach-send"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
