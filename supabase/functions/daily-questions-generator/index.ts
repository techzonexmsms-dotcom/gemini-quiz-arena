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
    console.log('Starting daily question generation...');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    // تنظيف الأسئلة القديمة (أكثر من 45 يوماً)
    try {
      await supabaseClient.rpc('cleanup_old_global_usage');
      console.log('Cleaned up old questions');
    } catch (cleanupError) {
      console.warn('Could not cleanup old questions:', cleanupError);
    }

    // Get all globally used questions
    const { data: usedQuestions } = await supabaseClient
      .from('global_question_usage')
      .select('question_text, question_hash');

    const usedQuestionHashes = new Set(usedQuestions?.map(q => q.question_hash) || []);
    console.log('Found globally used questions:', usedQuestionHashes.size);

    let totalGeneratedQuestions = 0;
    let allQuestions: any[] = [];
    const targetQuestions = 1000;
    const questionsPerBatch = 20;
    const maxBatches = Math.ceil(targetQuestions / questionsPerBatch);

    // قائمة المواضيع المتنوعة
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
      'اللغة العربية وقواعدها',
      'الديانات والفلسفة',
      'التراث الشعبي العربي',
      'الموسيقى والغناء العربي',
      'الطبخ والمأكولات العربية',
      'العمارة الإسلامية والعربية',
      'الشعر العربي عبر العصور',
      'الاختراعات والاكتشافات العلمية',
      'البيئة والتغير المناخي'
    ];

    // محادثة واحدة مع Gemini
    const conversationHistory: any[] = [
      {
        role: 'user',
        parts: [{
          text: `أنت خبير في توليد أسئلة الاختيار من متعدد الفريدة والمتنوعة. سوف أطلب منك توليد أسئلة متعددة في دفعات مختلفة. يجب أن تكون جميع الأسئلة فريدة ومتنوعة تماماً.

متطلبات الفرادة:
- كل سؤال يجب أن يكون فريد تماماً ولم يُسأل من قبل
- استخدم تفاصيل محددة وأرقام وتواريخ وأسماء علم
- تجنب الأسئلة العامة أو المشهورة
- اختر زوايا غير تقليدية للمواضيع
- استخدم معلومات محددة وليس معلومات عامة

صيغة الإخراج JSON:
{
  "questions": [
    {
      "question": "سؤال فريد جداً مع تفاصيل محددة؟",
      "options": ["خيار مع تفاصيل", "خيار آخر محدد", "خيار ثالث", "خيار رابع"],
      "correct_answer": 0,
      "category": "الفئة"
    }
  ]
}

هل أنت مستعد لبدء توليد الأسئلة؟`
        }]
      }
    ];

    for (let batch = 0; batch < maxBatches && totalGeneratedQuestions < targetQuestions; batch++) {
      const remainingQuestions = targetQuestions - totalGeneratedQuestions;
      const questionsInThisBatch = Math.min(questionsPerBatch, remainingQuestions);
      
      console.log(`Batch ${batch + 1}/${maxBatches} - Generating ${questionsInThisBatch} questions...`);
      
      const selectedTopic = topics[batch % topics.length];
      const currentTime = new Date().toISOString();

      const prompt = `الآن قم بتوليد ${questionsInThisBatch} أسئلة عربية فريدة ومتنوعة في موضوع: ${selectedTopic}

التوقيت الحالي: ${currentTime}
الدفعة: ${batch + 1}

تأكد من:
- استخدام معلومات دقيقة ومحددة
- تنويع مستويات الصعوبة
- تجنب الأسئلة المكررة أو المشابهة مع الدفعات السابقة
- استخدام أرقام وتواريخ وأسماء محددة

أعطني الأسئلة بصيغة JSON فقط.`;

      // إضافة الطلب للمحادثة
      conversationHistory.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: conversationHistory,
            generationConfig: {
              temperature: 0.9,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 4000,
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Batch ${batch + 1} failed:`, errorText);
          if (response.status === 503) {
            console.log('Gemini overloaded, waiting before retry...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            batch--; // إعادة المحاولة
            continue;
          }
          throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const generatedText = data.candidates[0].content.parts[0].text;

        // إضافة رد Gemini للمحادثة
        conversationHistory.push({
          role: 'model',
          parts: [{ text: generatedText }]
        });

        // استخراج JSON من الرد
        const jsonMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/) || 
                          generatedText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : generatedText;
        
        let questionsData;
        try {
          questionsData = JSON.parse(jsonText);
        } catch (parseError) {
          console.error(`JSON parsing error in batch ${batch + 1}:`, parseError);
          console.log('Raw response:', generatedText);
          continue;
        }

        if (!questionsData?.questions) {
          console.warn(`No questions found in batch ${batch + 1}`);
          continue;
        }

        // فلترة الأسئلة الفريدة
        const uniqueQuestions = [];
        for (const q of questionsData.questions) {
          const questionHash = await generateQuestionHash(q.question);
          
          if (!usedQuestionHashes.has(questionHash)) {
            uniqueQuestions.push({
              ...q,
              hash: questionHash
            });
            usedQuestionHashes.add(questionHash);
          }
        }

        allQuestions.push(...uniqueQuestions);
        totalGeneratedQuestions += uniqueQuestions.length;
        
        console.log(`Batch ${batch + 1} completed: ${uniqueQuestions.length} unique questions (Total: ${totalGeneratedQuestions})`);

        // انتظار قصير بين الدفعات لتجنب rate limiting
        if (batch < maxBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`Error in batch ${batch + 1}:`, error);
        // المتابعة للدفعة التالية في حالة فشل دفعة واحدة
        continue;
      }
    }

    if (allQuestions.length === 0) {
      throw new Error('Could not generate any questions');
    }

    // حفظ الأسئلة في جدول الأسئلة العام
    const questionsToInsert = allQuestions.map((q: any) => ({
      question_text: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      category: q.category || 'عام'
    }));

    // تقسيم الإدراج إلى دفعات صغيرة لتجنب مشاكل الأداء
    const insertBatchSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < questionsToInsert.length; i += insertBatchSize) {
      const batch = questionsToInsert.slice(i, i + insertBatchSize);
      
      const { error: insertError } = await supabaseClient
        .from('questions')
        .insert(batch);

      if (insertError) {
        console.error('Error inserting questions batch:', insertError);
        // المتابعة مع الدفعات الأخرى حتى لو فشلت دفعة واحدة
      } else {
        insertedCount += batch.length;
      }
    }

    // تسجيل استخدام الأسئلة في الجدول العالمي
    const globalUsageData = allQuestions.map((q: any) => ({
      question_text: q.question,
      question_hash: q.hash,
      last_used_at: new Date().toISOString(),
      usage_count: 1
    }));

    // إدراج بيانات الاستخدام العالمي بدفعات
    for (let i = 0; i < globalUsageData.length; i += insertBatchSize) {
      const batch = globalUsageData.slice(i, i + insertBatchSize);
      
      const { error: usageError } = await supabaseClient
        .from('global_question_usage')
        .insert(batch);

      if (usageError) {
        console.error('Error inserting global usage batch:', usageError);
      }
    }

    console.log(`Daily generation completed: ${insertedCount} questions stored successfully`);

    return new Response(
      JSON.stringify({ 
        message: 'Daily questions generated successfully',
        totalGenerated: totalGeneratedQuestions,
        totalStored: insertedCount,
        batches: maxBatches,
        questionsPerBatch: questionsPerBatch,
        uniqueQuestions: allQuestions.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in daily-questions-generator function:', error);
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
    .replace(/[؟\?\!\.\,\:\;]/g, '')
    .replace(/\s+/g, ' ');
    
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}