import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Timer, Brain } from "lucide-react";

interface QuestionCardProps {
  question: any;
  timeLeft: number;
  hasAnswered: boolean;
  onSubmitAnswer: (answer: number) => void;
}

export const QuestionCard = ({ 
  question, 
  timeLeft, 
  hasAnswered, 
  onSubmitAnswer 
}: QuestionCardProps) => {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  
  const handleAnswerSelect = (answerIndex: number) => {
    if (hasAnswered) return;
    setSelectedAnswer(answerIndex);
    onSubmitAnswer(answerIndex);
  };

  const progressValue = (timeLeft / 15) * 100;

  return (
    <Card className="bg-gradient-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            السؤال الحالي
          </CardTitle>
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-secondary" />
            <span className={`font-bold text-lg ${
              timeLeft <= 5 ? 'text-destructive animate-pulse' : 'text-foreground'
            }`}>
              {timeLeft}s
            </span>
          </div>
        </div>
        <Progress 
          value={progressValue} 
          className={`h-2 transition-all duration-1000 ${
            timeLeft <= 5 ? 'bg-destructive/20' : 'bg-secondary/20'
          }`}
        />
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="text-center p-6 bg-muted/30 rounded-lg">
          <h2 className="text-xl md:text-2xl font-semibold leading-relaxed">
            {question.question_text}
          </h2>
        </div>

        <div className="grid gap-3">
          {question.options.map((option: string, index: number) => (
            <Button
              key={index}
              variant={
                hasAnswered
                  ? selectedAnswer === index
                    ? index === question.correct_answer
                      ? "success"
                      : "destructive"
                    : index === question.correct_answer
                    ? "success"
                    : "outline"
                  : "game"
              }
              size="lg"
              className={`text-right justify-start h-auto py-4 px-6 text-wrap ${
                hasAnswered ? 'cursor-not-allowed' : 'hover:scale-[1.02]'
              }`}
              onClick={() => handleAnswerSelect(index)}
              disabled={hasAnswered || timeLeft <= 0}
            >
              <span className="font-semibold ml-3 min-w-[24px] h-6 w-6 rounded-full bg-current/20 flex items-center justify-center text-xs">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1 text-right leading-relaxed">
                {option}
              </span>
            </Button>
          ))}
        </div>

        {hasAnswered && (
          <div className="text-center p-4 bg-primary/10 rounded-lg border border-primary/20">
            <p className="text-sm text-muted-foreground">
              تم تسجيل إجابتك. في انتظار باقي اللاعبين أو انتهاء الوقت...
            </p>
          </div>
        )}

        {timeLeft <= 0 && !hasAnswered && (
          <div className="text-center p-4 bg-destructive/10 rounded-lg border border-destructive/20">
            <p className="text-sm text-destructive-foreground">
              انتهى الوقت! سيتم خصم نقطة واحدة.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};