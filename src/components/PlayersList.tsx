import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Trophy, Users } from "lucide-react";

interface PlayersListProps {
  players: any[];
  currentPlayerName: string;
}

export const PlayersList = ({ players, currentPlayerName }: PlayersListProps) => {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <Card className="bg-gradient-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          لوحة النتائج
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 ${
              player.name === currentPlayerName
                ? 'bg-primary/10 border-primary shadow-glow'
                : 'bg-muted/50 border-border'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {index === 0 && player.score > 0 && (
                  <Trophy className="w-4 h-4 text-warning" />
                )}
                {player.is_host && (
                  <Crown className="w-4 h-4 text-warning" />
                )}
                <span className="font-medium text-sm">
                  #{index + 1}
                </span>
              </div>
              
              <div>
                <p className={`font-semibold ${
                  player.name === currentPlayerName ? 'text-primary' : 'text-foreground'
                }`}>
                  {player.name}
                  {player.name === currentPlayerName && (
                    <span className="text-xs text-muted-foreground mr-2">(أنت)</span>
                  )}
                </p>
                {player.is_host && (
                  <p className="text-xs text-warning">المضيف</p>
                )}
              </div>
            </div>

            <Badge 
              variant={player.score >= 20 ? "default" : "secondary"}
              className={`font-bold ${
                player.score >= 20 ? 'bg-gradient-success text-success-foreground' : ''
              }`}
            >
              {player.score} نقطة
            </Badge>
          </div>
        ))}

        {players.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>لا يوجد لاعبين بعد</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};