import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomId } = await req.json();
    console.log('Generating questions for room:', roomId);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Count existing questions in this room
    const { count: existingCount } = await supabaseClient
      .from('room_questions')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);

    console.log('Found existing questions:', existingCount);

    // إذا كان لديه أسئلة كافية، لا نحتاج لتوليد المزيد
    if (existingCount && existingCount >= 20) {
      return new Response(
        JSON.stringify({ message: 'Room already has enough questions', count: existingCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // أولاً، محاولة استخدام الأسئلة الموجودة في قاعدة البيانات
    const { data: availableQuestions } = await supabaseClient
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('Found available questions in database:', availableQuestions?.length || 0);

    let questionsToInsert = [];

    if (availableQuestions && availableQuestions.length > 0) {
      // استخدام الأسئلة المتاحة من قاعدة البيانات
      questionsToInsert = availableQuestions.slice(0, 10).map((q: any, index: number) => ({
        room_id: roomId,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        question_order: (existingCount || 0) + index,
        category: q.category || 'عام'
      }));

      console.log('Using existing questions from database:', questionsToInsert.length);
    } else {
      // إذا لم توجد أسئلة في قاعدة البيانات، محاولة توليد أسئلة جديدة
      console.log('No questions in database, trying to generate new ones...');
      
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiApiKey) {
        throw new Error('No questions in database and GEMINI_API_KEY is not set');
      }

      try {
        const basicQuestions = [
          {
            question: "ما هي عاصمة المملكة العربية السعودية؟",
            options: ["الرياض", "جدة", "الدمام", "مكة المكرمة"],
            correct_answer: 0,
            category: "جغرافيا"
          },
          {
            question: "كم عدد أركان الإسلام؟",
            options: ["4", "5", "6", "7"],
            correct_answer: 1,
            category: "ديانات"
          },
          {
            question: "من هو مؤسس شركة آبل؟",
            options: ["بيل جيتس", "ستيف جوبز", "مارك زوكربيرغ", "إيلون ماسك"],
            correct_answer: 1,
            category: "تكنولوجيا"
          },
          {
            question: "ما هو أكبر كوكب في النظام الشمسي؟",
            options: ["الأرض", "المشتري", "زحل", "نبتون"],
            correct_answer: 1,
            category: "علوم"
          },
          {
            question: "في أي عام تم تأسيس المملكة العربية السعودية؟",
            options: ["1930", "1932", "1935", "1940"],
            correct_answer: 1,
            category: "تاريخ"
          }
        ];

        questionsToInsert = basicQuestions.map((q: any, index: number) => ({
          room_id: roomId,
          question_text: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          question_order: (existingCount || 0) + index,
          category: q.category
        }));

        console.log('Using fallback basic questions:', questionsToInsert.length);
      } catch (error) {
        console.error('Error generating questions:', error);
        throw new Error('Could not generate questions and no existing questions available');
      }
    }

    // Insert questions into room_questions table
    const { error: insertError } = await supabaseClient
      .from('room_questions')
      .insert(questionsToInsert);

    if (insertError) {
      console.error('Error inserting room questions:', insertError);
      throw insertError;
    }

    console.log('Questions stored successfully');

    return new Response(
      JSON.stringify({ 
        message: 'Questions generated successfully', 
        count: questionsToInsert.length,
        total: (existingCount || 0) + questionsToInsert.length,
        source: availableQuestions?.length ? 'database' : 'fallback'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-questions function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// دالة مساعدة لحساب هاش السؤال
async function generateQuestionHash(questionText: string): Promise<string> {
  const normalized = questionText.toLowerCase().trim()
    .replace(/[؟\?\!\.\,\:\;]/g, '') // إزالة علامات الترقيم
    .replace(/\s+/g, ' '); // توحيد المسافات
    
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}