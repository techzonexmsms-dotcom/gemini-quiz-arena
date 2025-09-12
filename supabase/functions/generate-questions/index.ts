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
    
    if (!roomId) {
      throw new Error('Room ID is required');
    }

    console.log('Generating questions for room:', roomId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing questions to avoid repetition
    const { data: existingQuestions } = await supabase
      .from('questions')
      .select('question_text')
      .order('created_at', { ascending: false })
      .limit(100);

    console.log('Found existing questions:', existingQuestions?.length || 0);

    const existingTexts = existingQuestions?.map(q => q.question_text) || [];
    
    // Prepare prompt for Gemini
    let prompt = `أنت مولد أسئلة ذكي للعبة المعلومات العامة. أنشئ 5 أسئلة متنوعة ومثيرة باللغة العربية.

متطلبات الأسئلة:
- يجب أن تكون الأسئلة ممتعة ومناسبة لجميع الأعمار
- تغطي مواضيع متنوعة: العلوم، التاريخ، الجغرافيا، الرياضة، الفن، التكنولوجيا
- كل سؤال له 4 خيارات بالضبط
- إجابة واحدة صحيحة فقط
- أسئلة بمستوى صعوبة متوسط

أرجع النتيجة بصيغة JSON بالضبط كما يلي:
{
  "questions": [
    {
      "question": "نص السؤال هنا؟",
      "options": ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
      "correct_answer": 0,
      "category": "العلوم"
    }
  ]
}

حيث correct_answer هو رقم الخيار الصحيح (0 للأول، 1 للثاني، إلخ)

المواضيع المقترحة: العلوم، التاريخ الإسلامي، الجغرافيا العربية، الرياضة، الأدب العربي، التكنولوجيا الحديثة`;

    // Add existing questions to avoid repetition
    if (existingTexts.length > 0) {
      prompt += `\n\nلا تولد أي من هذه الأسئلة أو المشابهة لها:\n`;
      existingTexts.slice(0, 20).forEach((text, index) => {
        prompt += `${index + 1}. ${text}\n`;
      });
    }

    console.log('Calling Gemini API...');

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    console.log('Gemini response received');

    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!generatedText) {
      throw new Error('No content generated from Gemini');
    }

    console.log('Generated text:', generatedText);

    // Parse JSON from response
    let questionsData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questionsData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      console.log('Raw response:', generatedText);
      throw new Error('Failed to parse generated questions');
    }

    if (!questionsData?.questions || !Array.isArray(questionsData.questions)) {
      throw new Error('Invalid questions format');
    }

    console.log('Parsed questions:', questionsData.questions.length);

    // Store questions in database
    const questionsToStore = questionsData.questions.map((q: any) => ({
      question_text: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      category: q.category || 'عام'
    }));

    // Insert into questions table for history
    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionsToStore);

    if (questionsError) {
      console.error('Error storing questions:', questionsError);
    }

    // Insert into room_questions table
    const roomQuestions = questionsToStore.map((q, index) => ({
      room_id: roomId,
      question_text: q.question_text,
      options: q.options,
      correct_answer: q.correct_answer,
      question_order: index
    }));

    const { error: roomQuestionsError } = await supabase
      .from('room_questions')
      .insert(roomQuestions);

    if (roomQuestionsError) {
      console.error('Error storing room questions:', roomQuestionsError);
      throw new Error('Failed to store questions for room');
    }

    console.log('Questions stored successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        questions: questionsData.questions,
        message: 'Questions generated and stored successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Error in generate-questions function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});