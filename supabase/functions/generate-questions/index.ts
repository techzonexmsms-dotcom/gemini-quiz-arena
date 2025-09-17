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

    // تنظيف الأسئلة القديمة من الجدول العالمي (أكثر من 45 يوماً)
    try {
      await supabaseClient.rpc('cleanup_old_global_usage');
    } catch (cleanupError) {
      console.warn('Could not cleanup old questions:', cleanupError);
    }

    // Count existing questions in this room
    const { count: existingCount } = await supabaseClient
      .from('room_questions')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId);

    console.log('Found existing questions:', existingCount);

    // توليد مستمر - زيادة الحد الأقصى للأسئلة في الغرفة
    if (existingCount && existingCount >= 300) {
      return new Response(
        JSON.stringify({ message: 'Room already has enough questions', count: existingCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all globally used questions in the last 30 days
    const { data: usedQuestions } = await supabaseClient
      .from('global_question_usage')
      .select('question_text, question_hash')
      .gte('last_used_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const usedQuestionHashes = new Set(usedQuestions?.map(q => q.question_hash) || []);
    console.log('Found globally used questions in last 30 days:', usedQuestionHashes.size);

    let attempts = 0;
    let successfulQuestions = [];
    const maxAttempts = 8; // محاولات متعددة للحصول على أسئلة فريدة
    const questionsPerAttempt = 8; // زيادة عدد الأسئلة في كل محاولة

    while (successfulQuestions.length < 5 && attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts} - Calling Gemini API...`);
      
      const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiApiKey) {
        throw new Error('GEMINI_API_KEY is not set');
      }

      // استخدام قائمة واسعة من المواضيع لضمان التنوع
      const topics = [
        'التاريخ الإسلامي والعربي القديم والحديث',
        'الجغرافيا العربية والمعالم التاريخية',
        'العلوم الطبيعية والفيزياء والكيمياء',
        'الأدب العربي الكلاسيكي والمعاصر',
        'الرياضة العربية والعالمية',
        'التكنولوجيا والابتكارات الحديثة',
        'الطبيعة والحيوانات والبيئة',
        'الفنون والثقافة والتراث العربي',
        'الطب والصحة العامة',
        'الاقتصاد والتجارة في العالم العربي',
        'الفلك والفضاء',
        'اللغة العربية وقواعدها'
      ];

      const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
      const currentTime = new Date().toISOString();

      const prompt = `أنت خبير في توليد أسئلة الاختيار من متعدد الفريدة والمتنوعة. قم بتوليد ${questionsPerAttempt} أسئلة عربية فريدة ومتنوعة جداً في موضوع: ${selectedTopic}

      مهم جداً - متطلبات الفرادة:
      - كل سؤال يجب أن يكون فريد تماماً ولم يُسأل من قبل
      - استخدم تفاصيل محددة وأرقام وتواريخ وأسماء علم
      - تجنب الأسئلة العامة أو المشهورة
      - اختر زوايا غير تقليدية للمواضيع
      - استخدم معلومات محددة وليس معلومات عامة

      أمثلة على أسئلة فريدة:
      - "في أي عام تم افتتاح مكتبة الإسكندرية الجديدة في مصر؟"
      - "ما هو اسم أول قمر صناعي عربي أطلقته دولة الإمارات؟"
      - "كم يبلغ عمق أعمق نقطة في البحر الأحمر؟"

      التوقيت الحالي: ${currentTime}
      
      صيغة الإخراج JSON:
      {
        "questions": [
          {
            "question": "سؤال فريد جداً مع تفاصيل محددة؟",
            "options": ["خيار مع تفاصيل", "خيار آخر محدد", "خيار ثالث", "خيار رابع"],
            "correct_answer": 0,
            "category": "${selectedTopic}"
          }
        ]
      }
      
      تأكد من:
      - استخدام معلومات دقيقة ومحددة
      - تنويع مستويات الصعوبة
      - تجنب الأسئلة المكررة أو المشابهة
      - استخدام أرقام وتواريخ وأسماء محددة`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
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
            temperature: 0.9, // زيادة العشوائية للحصول على أسئلة أكثر تنوعاً
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 3000,
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);
        if (response.status === 503) {
          console.log('Gemini overloaded, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.candidates[0].content.parts[0].text;

      console.log('Gemini response received');

      // Extract JSON from the response
      const jsonMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : generatedText;
      
      let questionsData;
      try {
        questionsData = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        console.log('Raw response:', generatedText);
        continue; // محاولة التالية
      }

      if (!questionsData?.questions) {
        console.warn('No questions found in response');
        continue;
      }

      console.log('Parsed questions:', questionsData.questions.length);

      // Filter out questions that have been used globally in the last 30 days
      for (const q of questionsData.questions) {
        const questionHash = await generateQuestionHash(q.question);
        
        if (!usedQuestionHashes.has(questionHash)) {
          successfulQuestions.push({
            ...q,
            hash: questionHash
          });
          usedQuestionHashes.add(questionHash); // تجنب التكرار في نفس الدفعة
          
          if (successfulQuestions.length >= 5) break;
        }
      }

      console.log(`Attempt ${attempts}: Got ${successfulQuestions.length} unique questions so far`);

      // إذا لم نحصل على أسئلة كافية، ننتظر قليلاً قبل المحاولة التالية
      if (successfulQuestions.length < 5 && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // إذا لم نتمكن من توليد أسئلة جديدة كافية، نضيف من الأسئلة الأقدم
    if (successfulQuestions.length < 5) {
      console.log('Not enough new questions, trying older questions...');
      
      const { data: olderQuestions } = await supabaseClient
        .from('global_question_usage')
        .select('question_text, question_hash')
        .lt('last_used_at', new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString())
        .order('last_used_at', { ascending: true })
        .limit(10);

      if (olderQuestions && olderQuestions.length > 0) {
        // استخدام أسئلة قديمة مع تحديثها
        const backupPrompt = `قم بتوليد 5 أسئلة عربية جديدة تماماً ومختلفة عن الأسئلة التقليدية. استخدم مواضيع متنوعة وأرقام محددة وتواريخ دقيقة. تجنب الأسئلة الشائعة.
        
        صيغة JSON:
        {
          "questions": [
            {
              "question": "سؤال فريد مع تفاصيل محددة؟",
              "options": ["خيار محدد", "خيار آخر", "خيار ثالث", "خيار رابع"],
              "correct_answer": 0,
              "category": "الفئة"
            }
          ]
        }`;
        
        try {
          const backupResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: backupPrompt }] }],
              generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }
            })
          });

          if (backupResponse.ok) {
            const backupData = await backupResponse.json();
            const backupText = backupData.candidates[0].content.parts[0].text;
            const backupJsonMatch = backupText.match(/```json\s*([\s\S]*?)\s*```/);
            const backupJsonText = backupJsonMatch ? backupJsonMatch[1] : backupText;
            const backupQuestionsData = JSON.parse(backupJsonText);
            
            if (backupQuestionsData?.questions) {
              const neededCount = 5 - successfulQuestions.length;
              const backupQuestions = backupQuestionsData.questions.slice(0, neededCount);
              
              for (const q of backupQuestions) {
                const questionHash = await generateQuestionHash(q.question);
                successfulQuestions.push({
                  ...q,
                  hash: questionHash
                });
              }
            }
          }
        } catch (backupError) {
          console.error('Backup question generation failed:', backupError);
        }
      }
    }

    if (successfulQuestions.length === 0) {
      throw new Error('Could not generate any unique questions after multiple attempts');
    }

    // Insert questions into room_questions table
    const questionsToInsert = successfulQuestions.map((q: any, index: number) => ({
      room_id: roomId,
      question_text: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      question_order: (existingCount || 0) + index,
      category: q.category || 'عام'
    }));

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
        count: successfulQuestions.length,
        total: (existingCount || 0) + successfulQuestions.length,
        attempts: attempts,
        uniqueQuestions: successfulQuestions.length,
        globalUsedCount: usedQuestionHashes.size
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