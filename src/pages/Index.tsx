import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { GameRoom } from "@/components/GameRoom";
import { Trophy, Users, Brain, Zap } from "lucide-react";
import heroBackground from "@/assets/hero-background.jpg";

const Index = () => {
  const [gameState, setGameState] = useState<'menu' | 'room'>('menu');
  const [roomData, setRoomData] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const createRoom = async () => {
    if (!playerName.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسمك أولاً",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const newRoomCode = generateRoomCode();
      
      // Create room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          room_code: newRoomCode,
          max_players: maxPlayers + 1, // +1 للمضيف
          current_players: 1,
          status: 'waiting'
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add player as host
      const { error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          name: playerName.trim(),
          is_host: true
        });

      if (playerError) throw playerError;

      // Generate initial questions
      const { error: questionsError } = await supabase.functions.invoke('generate-questions', {
        body: { roomId: room.id }
      });

      if (questionsError) {
        console.warn('Failed to generate questions initially:', questionsError);
      }

      setRoomData(room);
      setGameState('room');
      
      toast({
        title: "تم إنشاء الغرفة!",
        description: `رمز الغرفة: ${newRoomCode}`,
      });

    } catch (error: any) {
      console.error('Error creating room:', error);
      toast({
        title: "خطأ",
        description: "فشل في إنشاء الغرفة. حاول مرة أخرى",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسمك ورمز الغرفة",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Find room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode.toUpperCase().trim())
        .eq('status', 'waiting')
        .single();

      if (roomError || !room) {
        toast({
          title: "خطأ",
          description: "الغرفة غير موجودة أو مكتملة",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Check if room is full
      if (room.current_players >= room.max_players) {
        toast({
          title: "خطأ",
          description: "الغرفة مكتملة العدد",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Check if name already exists
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('name')
        .eq('room_id', room.id)
        .eq('name', playerName.trim())
        .single();

      if (existingPlayer) {
        toast({
          title: "خطأ",
          description: "هذا الاسم موجود بالفعل في الغرفة",
          variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Add player
      const { error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          name: playerName.trim(),
          is_host: false
        });

      if (playerError) throw playerError;

      // Update room player count
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ current_players: room.current_players + 1 })
        .eq('id', room.id);

      if (updateError) throw updateError;

      setRoomData(room);
      setGameState('room');
      
      toast({
        title: "تم الانضمام للغرفة!",
        description: `مرحباً ${playerName}`,
      });

    } catch (error: any) {
      console.error('Error joining room:', error);
      toast({
        title: "خطأ",
        description: "فشل في الانضمام للغرفة",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  if (gameState === 'room' && roomData) {
    return <GameRoom roomData={roomData} playerName={playerName} onLeaveRoom={() => setGameState('menu')} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="relative overflow-hidden py-16 px-4 bg-gradient-primary">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${heroBackground})` }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/50"></div>
        <div className="relative container mx-auto text-center text-white">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Brain className="w-16 h-16 text-white animate-pulse drop-shadow-lg" />
            <h1 className="text-5xl md:text-7xl font-bold drop-shadow-lg">
              ARENA BATTLE QUIZ
            </h1>
          </div>
          <p className="text-xl md:text-2xl opacity-90 drop-shadow-md max-w-2xl mx-auto">
            ساحة المعركة الذكية للمعلومات العامة
          </p>
          <p className="text-lg opacity-75 mt-2 drop-shadow-md">
            أسئلة ذكية • تحدي مثير • مكافآت فورية
          </p>
        </div>
      </header>

      {/* Features */}
      <section className="py-12 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="text-center p-6">
              <Users className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">حتى 15 لاعب</h3>
              <p className="text-muted-foreground">العب مع الأصدقاء في غرف مخصصة</p>
            </div>
            <div className="text-center p-6">
              <Zap className="w-12 h-12 text-secondary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">15 ثانية للإجابة</h3>
              <p className="text-muted-foreground">تحدي الوقت يزيد الإثارة</p>
            </div>
            <div className="text-center p-6">
              <Trophy className="w-12 h-12 text-warning mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">نظام النقاط</h3>
              <p className="text-muted-foreground">أول من يصل لـ20 نقطة يفوز</p>
            </div>
          </div>

          {/* Game Actions */}
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
            {/* Create Room */}
            <Card className="bg-gradient-card border-border">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl text-card-foreground">إنشاء غرفة جديدة</CardTitle>
                <CardDescription>كن المضيف وابدأ اللعبة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="host-name">اسمك</Label>
                  <Input
                    id="host-name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="أدخل اسمك"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="max-players">عدد اللاعبين الإضافيين (1-14)</Label>
                  <Input
                    id="max-players"
                    type="number"
                    min={1}
                    max={14}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(parseInt(e.target.value) || 2)}
                    className="mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    إجمالي اللاعبين: {maxPlayers + 1}
                  </p>
                </div>
                <Button 
                  variant="hero" 
                  size="xl" 
                  className="w-full" 
                  onClick={createRoom}
                  disabled={loading}
                >
                  إنشاء الغرفة
                </Button>
              </CardContent>
            </Card>

            {/* Join Room */}
            <Card className="bg-gradient-card border-border">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl text-card-foreground">انضمام لغرفة</CardTitle>
                <CardDescription>ادخل رمز الغرفة للانضمام</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="player-name">اسمك</Label>
                  <Input
                    id="player-name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="أدخل اسمك"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="room-code">رمز الغرفة</Label>
                  <Input
                    id="room-code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="مثال: ABC123"
                    className="mt-2 font-mono"
                    maxLength={6}
                  />
                </div>
                <Button 
                  variant="secondary" 
                  size="xl" 
                  className="w-full" 
                  onClick={joinRoom}
                  disabled={loading}
                >
                  انضمام للغرفة
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-muted-foreground">
        <p>مدعوم بـ Gemini AI • صُنع بـ ❤️</p>
      </footer>
    </div>
  );
};

export default Index;