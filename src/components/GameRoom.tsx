import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trophy, Timer, Crown, ArrowLeft } from "lucide-react";
import { PlayersList } from "./PlayersList";
import { QuestionCard } from "./QuestionCard";
import { GameResults } from "./GameResults";

interface GameRoomProps {
  roomData: any;
  playerName: string;
  onLeaveRoom: () => void;
}

export const GameRoom = ({ roomData, playerName, onLeaveRoom }: GameRoomProps) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [gameStatus, setGameStatus] = useState(roomData.status);
  const [timeLeft, setTimeLeft] = useState(15);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string>('');
  const [questionStartTime, setQuestionStartTime] = useState<string | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPlayersAndStatus();
    setupRealtimeSubscriptions();
    
    return () => {
      // Cleanup subscriptions
    };
  }, []);

  const loadPlayersAndStatus = async () => {
    try {
      const [
        { data: playersData, error: playersError },
        { data: roomRow, error: roomError }
      ] = await Promise.all([
        supabase
          .from('players')
          .select('*')
          .eq('room_id', roomData.id)
          .order('score', { ascending: false }),
        supabase
          .from('rooms')
          .select('status, question_start_time, current_question_id')
          .eq('id', roomData.id)
          .maybeSingle(),
      ]);

      if (playersError) throw playersError;
      if (roomError) console.warn('Room fetch warning:', roomError);

      setPlayers(playersData || []);
      
      // Find current player with better matching and room host fallback
      const currentPlayer = playersData?.find(p => p.name.trim() === playerName.trim());
      const hostByRoomId = (roomData.host_id && playersData)
        ? playersData.find(p => p.id === roomData.host_id)
        : null;
      console.log('Finding player:', { playerName, playersData, currentPlayer, hostByRoomId });
      
      if (currentPlayer) {
        const isPlayerHost = currentPlayer.is_host || (!!hostByRoomId && hostByRoomId.id === currentPlayer.id);
        console.log('Setting host status:', { is_host: currentPlayer.is_host, isPlayerHost });
        setIsHost(isPlayerHost);
        setCurrentPlayerId(currentPlayer.id);
      } else if (hostByRoomId && hostByRoomId.name?.trim() === playerName.trim()) {
        // Fallback: if player name matches host record name
        setIsHost(true);
        setCurrentPlayerId(hostByRoomId.id);
      } else {
        console.warn('Current player not found!', { playerName, availablePlayers: playersData?.map(p => p.name) });
      }

      // Update room state
      if (roomRow) {
        setGameStatus(roomRow.status);
        setQuestionStartTime(roomRow.question_start_time);
        setCurrentQuestionId(roomRow.current_question_id ?? null);
      }

      // Check for winner
      const topScorer = playersData?.find(p => p.score >= 20);
      if (topScorer) {
        setWinner(topScorer);
        setGameStatus('finished');
      }

      // Load current question if game is playing
      const statusToCheck = roomRow?.status ?? gameStatus;
      if (statusToCheck === 'playing') {
        await loadCurrentQuestion();
      }

    } catch (error) {
      console.error('Error loading room/players:', error);
    }
  };

  const loadCurrentQuestion = async () => {
    try {
      let questionData: any = null;

      if (currentQuestionId) {
        const { data, error } = await supabase
          .from('room_questions')
          .select('*')
          .eq('id', currentQuestionId)
          .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        questionData = data;
      } else {
        const { data, error } = await supabase
          .from('room_questions')
          .select('*')
          .eq('room_id', roomData.id)
          .eq('is_active', true)
          .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        questionData = data;
      }

      if (questionData) {
        setCurrentQuestion(questionData);
        
        // Check if player already answered this question
        const effectivePlayerId = currentPlayerId || players.find(p => p.name.trim() === playerName.trim())?.id;
        if (effectivePlayerId) {
          const { data: answerData } = await supabase
            .from('player_answers')
            .select('*')
            .eq('player_id', effectivePlayerId)
            .eq('question_id', questionData.id)
            .maybeSingle();

          setHasAnswered(!!answerData);
        } else {
          setHasAnswered(false);
        }
      }
    } catch (error) {
      console.error('Error loading question:', error);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to players changes
    const playersChannel = supabase
      .channel('players-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomData.id}`
        },
        () => loadPlayersAndStatus()
      )
      .subscribe();

    // Subscribe to room changes
    const roomChannel = supabase
      .channel('room-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomData.id}`
        },
        (payload) => {
          const newRoom = payload.new as any;
          setGameStatus(newRoom.status);
          setQuestionStartTime(newRoom.question_start_time);

          setCurrentQuestionId((prev) => {
            if ((newRoom.current_question_id ?? null) !== prev) {
              setHasAnswered(false);
              setTimeLeft(15);
            }
            return newRoom.current_question_id ?? null;
          });

          if (newRoom.status === 'playing') {
            loadCurrentQuestion();
          }
        }
      )
      .subscribe();

    // Subscribe to questions changes
    const questionsChannel = supabase
      .channel('questions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_questions',
          filter: `room_id=eq.${roomData.id}`
        },
        () => loadCurrentQuestion()
      )
      .subscribe();
  };

  const startGame = async () => {
    if (!isHost) return;

    try {
      // Update room status to playing
      const { error } = await supabase
        .from('rooms')
        .update({ status: 'playing' })
        .eq('id', roomData.id);

      if (error) throw error;

      // Activate first question
      await activateNextQuestion();

      toast({
        title: "بدأت اللعبة!",
        description: "حظاً موفقاً لجميع اللاعبين",
      });

    } catch (error) {
      console.error('Error starting game:', error);
      toast({
        title: "خطأ",
        description: "فشل في بدء اللعبة",
        variant: "destructive"
      });
    }
  };

  const activateNextQuestion = async () => {
    if (isAdvancing) return; // Prevent multiple simultaneous calls
    try {
      setIsAdvancing(true);

      // Deactivate only the currently active question to minimize churn
      await supabase
        .from('room_questions')
        .update({ is_active: false })
        .eq('room_id', roomData.id)
        .eq('is_active', true);

      // Get the current question created_at to sequence by time
      const { data: roomRowLatest } = await supabase
        .from('rooms')
        .select('current_question_id')
        .eq('id', roomData.id)
        .maybeSingle();

      let currentCreatedAt: string | null = null;
      if (roomRowLatest?.current_question_id) {
        const { data: currentQ } = await supabase
          .from('room_questions')
          .select('created_at')
          .eq('id', roomRowLatest.current_question_id)
          .maybeSingle();
        currentCreatedAt = currentQ?.created_at ?? null;
      }

      // Try to find the next unshown question
      let { data: nextQuestion, error: nextErr } = await supabase
        .from('room_questions')
        .select('*')
        .eq('room_id', roomData.id)
        .is('shown_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextErr) {
        console.error('Error fetching next question by created_at:', nextErr);
      }

      if (!nextQuestion) {
        // No more unshown questions, generate new ones
        await supabase.functions.invoke('generate-questions', {
          body: { roomId: roomData.id }
        });

        // Wait a bit for generation to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const { data: newQuestion, error: newError } = await supabase
          .from('room_questions')
          .select('*')
          .eq('room_id', roomData.id)
          .is('shown_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (newError || !newQuestion) {
          console.error('Failed to get new question after generation', newError);
          setIsAdvancing(false);
          return;
        }

        nextQuestion = newQuestion;
      }

      // Mark question as shown and activate it
      const nowTime = new Date().toISOString();
      await supabase
        .from('room_questions')
        .update({ 
          is_active: true,
          shown_at: nowTime
        })
        .eq('id', nextQuestion.id);

      // Update room with question info and start time
      await supabase
        .from('rooms')
        .update({
          current_question_id: nextQuestion.id,
          question_start_time: nowTime,
        })
        .eq('id', roomData.id);

      // Reset local state for new question
      setTimeLeft(15);
      setHasAnswered(false);
    } catch (error) {
      console.error('Error activating next question:', error);
    } finally {
      setIsAdvancing(false);
    }
  };

  const submitAnswer = async (selectedAnswer: number) => {
    if (!currentQuestion || hasAnswered || !currentPlayerId) return;

    try {
      const isCorrect = selectedAnswer === currentQuestion.correct_answer;
      let pointsEarned = 0;

      if (isCorrect) {
        pointsEarned = 2;
      } else {
        pointsEarned = -1;
      }

      // Mark answered immediately to avoid timeout race
      setHasAnswered(true);

      // Submit answer
      const { error: answerError } = await supabase
        .from('player_answers')
        .upsert({
          room_id: roomData.id,
          player_id: currentPlayerId,
          question_id: currentQuestion.id,
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
          answered_at: new Date().toISOString(),
          points_earned: pointsEarned
        }, { onConflict: 'player_id,question_id', ignoreDuplicates: true });

      if (answerError) throw answerError;

      // Update player score
      const currentPlayer = players.find(p => p.id === currentPlayerId);
      const newScore = Math.max(0, currentPlayer.score + pointsEarned);

      const { error: scoreError } = await supabase
        .from('players')
        .update({ 
          score: newScore,
          last_answer_time: new Date().toISOString()
        })
        .eq('id', currentPlayerId);

      if (scoreError) throw scoreError;


      toast({
        title: isCorrect ? "إجابة صحيحة! 🎉" : "إجابة خاطئة",
        description: `${pointsEarned > 0 ? '+' : ''}${pointsEarned} نقطة`,
        variant: isCorrect ? "default" : "destructive"
      });

      // Check for winner
      if (newScore >= 20) {
        await supabase
          .from('rooms')
          .update({ status: 'finished' })
          .eq('id', roomData.id);
      }

    } catch (error) {
      console.error('Error submitting answer:', error);
      toast({
        title: "خطأ",
        description: "فشل في إرسال الإجابة",
        variant: "destructive"
      });
    }
  };

  // Timer effect - synchronized with database question_start_time
  useEffect(() => {
    if (gameStatus === 'playing' && currentQuestion && questionStartTime) {
      const timer = setInterval(() => {
        const now = new Date().getTime();
        const startTime = new Date(questionStartTime).getTime();
        const elapsed = Math.floor((now - startTime) / 1000);
        const remaining = Math.max(0, 15 - elapsed);
        
        setTimeLeft(remaining);
        
        if (remaining <= 0 && !hasAnswered) {
          handleTimeUp();
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [gameStatus, currentQuestion, questionStartTime, hasAnswered]);

  // Check if all players answered and advance to next question
  useEffect(() => {
    if (gameStatus === 'playing' && currentQuestion && !isAdvancing) {
      const checkAllAnswered = async () => {
        try {
          const { count: answersCount } = await supabase
            .from('player_answers')
            .select('player_id', { count: 'exact' })
            .eq('room_id', roomData.id)
            .eq('question_id', currentQuestion.id);

          const totalPlayers = players.length;
          
          if (totalPlayers > 0) {
            // If all players answered OR time is up, advance to next question
            const now = new Date().getTime();
            const startTime = questionStartTime ? new Date(questionStartTime).getTime() : now;
            const elapsed = Math.floor((now - startTime) / 1000);
            
            if ((answersCount && answersCount >= totalPlayers) || elapsed >= 15) {
              if (isHost && !isAdvancing) {
                setIsAdvancing(true);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds to show results
                await activateNextQuestion();
                setIsAdvancing(false);
              }
            }
          }
        } catch (error) {
          console.error('Error checking answers:', error);
        }
      };

      const interval = setInterval(checkAllAnswered, 1000);
      return () => clearInterval(interval);
    }
  }, [gameStatus, currentQuestion, players.length, questionStartTime, isHost, isAdvancing]);

  const handleTimeUp = async () => {
    if (!currentPlayerId || hasAnswered) return;

    try {
      // Check if player already answered (to prevent race conditions)
      const { data: existingAnswer } = await supabase
        .from('player_answers')
        .select('id')
        .eq('player_id', currentPlayerId)
        .eq('question_id', currentQuestion.id)
        .maybeSingle();

      if (existingAnswer) {
        setHasAnswered(true);
        return; // Player already answered, don't penalize
      }

      // Submit empty answer with penalty only if no answer exists
      const { error: answerError } = await supabase
        .from('player_answers')
        .upsert({
          room_id: roomData.id,
          player_id: currentPlayerId,
          question_id: currentQuestion.id,
          selected_answer: null,
          is_correct: false,
          answered_at: new Date().toISOString(),
          points_earned: -1
        }, { onConflict: 'player_id,question_id', ignoreDuplicates: true });

      if (answerError) throw answerError;

      // Update player score
      const currentPlayer = players.find(p => p.id === currentPlayerId);
      if (currentPlayer) {
        const newScore = Math.max(0, currentPlayer.score - 1);

        await supabase
          .from('players')
          .update({ score: newScore })
          .eq('id', currentPlayerId);
      }

      setHasAnswered(true);

      toast({
        title: "انتهى الوقت! ⏰",
        description: "خصم نقطة واحدة",
        variant: "destructive"
      });

    } catch (error) {
      console.error('Error handling timeout:', error);
    }
  };

  if (gameStatus === 'finished' || winner) {
    return <GameResults players={players} winner={winner} onLeaveRoom={onLeaveRoom} />;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="container mx-auto mb-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={onLeaveRoom} className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 ml-2" />
            العودة للقائمة
          </Button>
          <Badge variant="outline" className="font-mono text-lg px-4 py-2">
            {roomData.room_code}
          </Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gradient-card">
            <CardContent className="p-4 text-center">
              <Users className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">اللاعبين</p>
              <p className="text-xl font-bold">{players.length}/{roomData.max_players}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card">
            <CardContent className="p-4 text-center">
              <Trophy className="w-6 h-6 text-warning mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">الهدف</p>
              <p className="text-xl font-bold">20 نقطة</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card">
            <CardContent className="p-4 text-center">
              <Timer className="w-6 h-6 text-secondary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">الوقت المتبقي</p>
              <p className="text-xl font-bold">{timeLeft}s</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="container mx-auto grid lg:grid-cols-3 gap-6">
        {/* Players List */}
        <div className="lg:col-span-1">
          <PlayersList players={players} currentPlayerName={playerName} />
        </div>

        {/* Game Area */}
        <div className="lg:col-span-2">
          {gameStatus === 'waiting' && (
            <Card className="bg-gradient-card">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Crown className="w-6 h-6 text-warning" />
                  في انتظار بدء اللعبة
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">
                  يحتاج المضيف لبدء اللعبة عندما يكون جميع اللاعبين جاهزين
                </p>
                {/* Debug info */}
                <div className="text-xs text-muted-foreground">
                  Player: {playerName} | Is Host: {isHost.toString()} | Player ID: {currentPlayerId}
                </div>
                {isHost ? (
                  <Button variant="hero" size="lg" onClick={startGame}>
                    بدء اللعبة
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">انتظار المضيف لبدء اللعبة...</p>
                )}
              </CardContent>
            </Card>
          )}

          {gameStatus === 'playing' && currentQuestion && (
            <QuestionCard 
              question={currentQuestion}
              timeLeft={timeLeft}
              hasAnswered={hasAnswered}
              onSubmitAnswer={submitAnswer}
            />
          )}
        </div>
      </div>
    </div>
  );
};