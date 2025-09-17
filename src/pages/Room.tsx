import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { GameRoom } from "@/components/GameRoom";

interface StoredPlayer {
  playerId: string;
  name: string;
}

const storageKeyForRoom = (roomId: string) => `arena:room:${roomId}`;

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);
  const [storedPlayer, setStoredPlayer] = useState<StoredPlayer | null>(null);
  const [joinName, setJoinName] = useState("");
  const [ready, setReady] = useState(false);

  const canonicalUrl = useMemo(() => `${window.location.origin}/room/${code}`, [code]);

  useEffect(() => {
    // SEO basics for this page
    document.title = `غرفة ${code} | Arena Battle Quiz`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = `انضم إلى غرفة الكويز ${code} واستكمل لعبتك.`;
      document.head.appendChild(m);
    } else {
      metaDesc.setAttribute("content", `انضم إلى غرفة الكويز ${code} واستكمل لعبتك.`);
    }
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = canonicalUrl;
  }, [code, canonicalUrl]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // 1) Load room by code
        const { data: roomRow, error: roomErr } = await supabase
          .from("rooms")
          .select("*")
          .eq("room_code", (code ?? "").toUpperCase())
          .maybeSingle();

        if (roomErr || !roomRow) {
          toast({
            title: "الغرفة غير موجودة",
            description: "تأكد من رمز الغرفة الصحيح",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        setRoom(roomRow);

        // 2) Check local storage for prior player
        const storedRaw = localStorage.getItem(storageKeyForRoom(roomRow.id));
        if (storedRaw) {
          const parsed: StoredPlayer = JSON.parse(storedRaw);
          // Validate player exists
          const { data: playerRow } = await supabase
            .from("players")
            .select("id, name")
            .eq("id", parsed.playerId)
            .eq("room_id", roomRow.id)
            .maybeSingle();

          if (playerRow) {
            setStoredPlayer({ playerId: playerRow.id, name: playerRow.name });
            setReady(true);
            return;
          } else {
            // Clear invalid storage
            localStorage.removeItem(storageKeyForRoom(roomRow.id));
          }
        }

        // 3) No stored player; show join UI
        setReady(false);
      } catch (e) {
        console.error(e);
        toast({ title: "خطأ", description: "حدث خطأ أثناء تحميل الغرفة", variant: "destructive" });
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [code, navigate, toast]);

  const handleJoin = async () => {
    if (!room) return;
    if (!joinName.trim()) {
      toast({ title: "مطلوب الاسم", description: "يرجى إدخال اسمك", variant: "destructive" });
      return;
    }

    // Disallow new joins if game already started
    if (room.status !== "waiting") {
      toast({ title: "لا يمكن الانضمام الآن", description: "اللعبة بدأت بالفعل", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      // Ensure name not duplicate
      const { data: existing } = await supabase
        .from("players")
        .select("id")
        .eq("room_id", room.id)
        .eq("name", joinName.trim())
        .maybeSingle();

      if (existing) {
        toast({ title: "الاسم موجود", description: "اختر اسماً آخر", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { data: inserted, error: insErr } = await supabase
        .from("players")
        .insert({ room_id: room.id, name: joinName.trim(), is_host: false })
        .select("id, name")
        .single();

      if (insErr) throw insErr;

      await supabase
        .from("rooms")
        .update({ current_players: (room.current_players ?? 0) + 1 })
        .eq("id", room.id);

      localStorage.setItem(
        storageKeyForRoom(room.id),
        JSON.stringify({ playerId: inserted.id, name: inserted.name })
      );

      setStoredPlayer({ playerId: inserted.id, name: inserted.name });
      setReady(true);
    } catch (e) {
      console.error("join error", e);
      toast({ title: "فشل الانضمام", description: "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = () => {
    if (room) {
      localStorage.removeItem(storageKeyForRoom(room.id));
    }
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>جاري التحميل...</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">يرجى الانتظار</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!room) return null;

  if (ready && storedPlayer) {
    return (
      <GameRoom roomData={room} playerName={storedPlayer.name} playerId={storedPlayer.playerId} onLeaveRoom={handleLeave} />
    );
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <Card className="w-full max-w-md bg-gradient-card">
        <CardHeader>
          <CardTitle>الانضمام إلى الغرفة {code}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="اسمك"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
          />
          <Button className="w-full" onClick={handleJoin} disabled={loading}>
            انضمام
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => navigate("/")}>عودة</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Room;
