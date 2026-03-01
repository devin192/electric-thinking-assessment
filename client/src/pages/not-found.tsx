import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { Home } from "lucide-react";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md rounded-2xl border border-border text-center">
        <CardContent className="pt-10 pb-10">
          <Wordmark className="text-xl mb-6 block" />
          <h1 className="font-heading text-6xl font-bold text-et-pink mb-4">404</h1>
          <p className="font-heading text-xl font-semibold mb-2">This page doesn't exist</p>
          <p className="text-muted-foreground mb-8">
            The page you're looking for might have been moved or doesn't exist.
          </p>
          <Button className="rounded-2xl px-8" onClick={() => navigate("/")} data-testid="button-go-home">
            <Home className="w-4 h-4 mr-2" /> Go Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
