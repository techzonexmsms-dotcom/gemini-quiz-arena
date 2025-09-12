import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Crown, Medal, Award, Home } from "lucide-react";

interface GameResultsProps {
  players: any[];
  winner: any;
  onLeaveRoom: () => void;
}

export const GameResults = ({ players, winner, onLeaveRoom }: GameResultsProps) => {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-6 h-6 text-warning" />;
      case 1:
        return <Medal className="w-6 h-6 text-muted-foreground" />;
      case 2:
        return <Award className="w-6 h-6 text-orange-500" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center font-bold text-muted-foreground">#{index + 1}</span>;
    }
  };

  const getRankTitle = (index: number) => {
    switch (index) {
      case 0:
        return "🏆 المركز الأول";
      case 1:
        return "🥈 المركز الثاني";
      case 2:
        return "🥉 المركز الثالث";
      default:
        return `المركز ${index + 1}`;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        {/* Winner Celebration */}
        <Card className="bg-gradient-primary text-white mb-8 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-transparent"></div>
          <CardHeader className="text-center relative z-10 pb-2">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <Trophy className="w-16 h-16 text-warning animate-bounce" />
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-warning rounded-full flex items-center justify-center">
                  <Crown className="w-4 h-4 text-warning-foreground" />
                </div>
              </div>
            </div>
            <CardTitle className="text-3xl md:text-4xl font-bold mb-2">
              🎉 تهانينا! 🎉
            </CardTitle>
            <p className="text-xl opacity-90">
              الفائز هو <span className="font-bold text-warning">{winner?.name}</span>
            </p>
          </CardHeader>
          <CardContent className="text-center relative z-10 pt-0">
            <Badge className="bg-warning text-warning-foreground font-bold text-lg px-6 py-2">
              {winner?.score} نقطة
            </Badge>
          </CardContent>
        </Card>

        {/* Final Rankings */}
        <Card className="bg-gradient-card mb-6">
          <CardHeader>
            <CardTitle className="text-center text-2xl">النتائج النهائية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-all duration-300 ${
                    index === 0
                      ? 'bg-gradient-success text-success-foreground shadow-success border-success/30'
                      : index === 1
                      ? 'bg-secondary/20 border-secondary/30'
                      : index === 2
                      ? 'bg-warning/20 border-warning/30'
                      : 'bg-muted/30 border-border'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {getRankIcon(index)}
                    <div>
                      <p className="font-bold text-lg">
                        {player.name}
                        {player.is_host && (
                          <Crown className="w-4 h-4 text-warning inline ml-2" />
                        )}
                      </p>
                      <p className="text-sm opacity-80">
                        {getRankTitle(index)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <Badge 
                      variant={index === 0 ? "default" : "secondary"}
                      className="text-lg font-bold px-4 py-2"
                    >
                      {player.score} نقطة
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Game Statistics */}
        <Card className="bg-gradient-card mb-6">
          <CardHeader>
            <CardTitle className="text-center">إحصائيات اللعبة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary">{players.length}</p>
                <p className="text-sm text-muted-foreground">إجمالي اللاعبين</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-secondary">{Math.max(...players.map(p => p.score))}</p>
                <p className="text-sm text-muted-foreground">أعلى نقاط</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-warning">{Math.round(players.reduce((sum, p) => sum + p.score, 0) / players.length)}</p>
                <p className="text-sm text-muted-foreground">متوسط النقاط</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="text-center space-y-4">
          <Button 
            variant="hero" 
            size="xl" 
            onClick={onLeaveRoom}
            className="w-full md:w-auto"
          >
            <Home className="w-5 h-5 ml-2" />
            العودة للقائمة الرئيسية
          </Button>
          
          <p className="text-sm text-muted-foreground">
            شكراً لكم على اللعب! 🎮
          </p>
        </div>
      </div>
    </div>
  );
};