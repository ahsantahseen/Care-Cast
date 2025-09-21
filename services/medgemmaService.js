// MedGemma LLM Service for SMS-friendly medical responses
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

class MedGemmaService {
  constructor() {
    // Use Gemini for fast, reliable responses (with mock fallback for testing)
    this.useMockMode =
      !process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY === "your_gemini_api_key_here" ||
      process.env.USE_MOCK_MODE === "true";

    if (!this.useMockMode) {
      try {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
        }); // Fast, free model
      } catch (error) {
        console.log("⚠️ Gemini initialization failed, using mock mode");
        this.useMockMode = true;
      }
    }
    this.modelName = "gemini-1.5-flash"; // Fast, cost-effective model
    this.maxResponseLength = 160; // SMS character limit

    // HeatCare constants from GPT v2
    this.WELCOME_EN =
      "Hi! I'm HeatCare. To personalize tips, reply with your name, ZIP, and age like: Alex, 11215, 67. By replying, you consent to store this info. Reply STOP to opt out. This is general information, not medical advice. Emergencies → 911.";
    this.ASK_SYMPTOMS_EN =
      "How are you feeling today? Describe any symptoms in your own words.";
    this.CHECKIN_PROMPT_EN =
      "Quick check—how are you now? Reply: 1=better / 2=same / 3=worse";
    this.EMERGENCY_EN =
      "Please seek help now. If severe (fainting, confusion, trouble breathing), call 911. While waiting: move to AC, loosen clothes, and sip water.";
  }

  /**
   * Generate SMS-friendly medical response using OpenAI with medical knowledge
   */
  async generateMedicalResponse(
    patientData,
    symptomText,
    weatherContext = {},
    nlpAnalysis = null
  ) {
    try {
      // Prepare context for MedGemma
      const medicalContext = {
        patient: {
          age: patientData.age,
          location: patientData.zipcode,
          medicalHistory: this.parseJsonField(
            patientData.preExistingConditions
          ),
          medications: this.parseJsonField(patientData.medications),
          chronicConditions: this.parseJsonField(patientData.chronicConditions),
          activityLevel: patientData.activityLevel || "moderate",
          isPregnant: patientData.isPregnant || false,
          smoker: patientData.smoker || false,
        },
        symptoms: {
          description: symptomText,
          timestamp: new Date().toISOString(),
        },
        environment: {
          temperature: weatherContext.temperature || 75,
          feelsLike: weatherContext.feelsLike || 75,
          humidity: weatherContext.humidity || 50,
          uvIndex: weatherContext.uvIndex || 5,
          heatWarning: weatherContext.heatWarning || false,
        },
        constraints: {
          responseFormat: "sms",
          maxLength: this.maxResponseLength,
          includeEmergencyWarning: true,
          language: patientData.preferredLanguage || "en",
        },
      };

      const prompt = this.buildMedGemmaPrompt(medicalContext);

      const response = await this.callGeminiAPI(prompt);

      return {
        smsMessage: response.smsMessage,
        riskLevel: response.riskLevel || "medium",
        urgency: response.urgency || "routine",
        confidence: response.confidence || 0.8,
        emergencyAlert: response.emergencyAlert || false,
        monitoringRecommendation:
          response.monitoringRecommendation || "standard",
        escalationLevel: response.escalationLevel || "none",
        nextCheckInHours: response.nextCheckInHours || 24,
        advice: response.smsMessage, // For backward compatibility
      };
    } catch (error) {
      console.error("❌ AI medical service error:", error.message);

      // No fallback - throw error to be handled upstream with guard rails
      throw new Error(`AI medical service unavailable: ${error.message}`);
    }
  }

  /**
   * Build conversational prompt for AI - direct raw input handling with medical guidance
   */
  buildMedGemmaPrompt(context) {
    return `You are HeatCare - a friendly health assistant who chats naturally over SMS. You have general medical knowledge about heat-related illnesses and safety. Your goal is to have genuine conversations while keeping people safe during extreme heat.

CRITICAL RESPONSE FORMAT:
- Respond ONLY with valid JSON - no thinking tags, no explanations, no extra text
- Do NOT use <think>, <thinking>, or any reasoning tags
- Output MUST start with { and end with }

CHAT NATURALLY:
- ALWAYS use their name (${
      context.patient.firstName || "User"
    }) in your response - it shows you care!
- Respond like a caring friend who happens to know about health and heat safety
- Use emojis occasionally (😊, 💙, 🌡️, 🚨) but don't overdo it
- Ask follow-up questions when it makes sense
- Remember this is SMS - keep it under 160 characters
- NO medical jargon, NO clinical language, NO robotic responses

PERSONAL CONTEXT:
Name: ${context.patient.firstName || "User"} (age ${
      context.patient.age
    }) in ZIP ${context.patient.location}
Weather: ${context.environment.feelsLike}°F feels like, ${
      context.environment.humidity
    }% humidity${
      context.environment.heatWarning ? " 🌡️ Heat warning active!" : ""
    }
${
  context.patient.medicalHistory?.length > 0
    ? `Health conditions: ${context.patient.medicalHistory.join(", ")}`
    : ""
}
${
  context.patient.medications?.length > 0
    ? `Medications: ${context.patient.medications.join(", ")}`
    : ""
}
${
  context.patient.activityLevel
    ? `Activity level: ${context.patient.activityLevel}`
    : ""
}
${
  context.patient.isPregnant
    ? "👶 Pregnant - extra heat precautions needed"
    : ""
}
${context.patient.smoker ? "🚬 Smoker - higher heat sensitivity" : ""}

THEY JUST SAID: "${context.symptoms.description}"

ZIPCODE/LOCATION HANDLING:
- If they mention moving, new address, updating location, or ask about weather elsewhere: Recognize this as a location update request
- If they provide just a 5-digit number and seem to be updating info: Ask if this is their new ZIP code
- For questions like "what's the weather in 10001" or "I moved to 90210": Acknowledge and suggest updating their profile

MEDICAL KNOWLEDGE - Heat-Related Illnesses:
- Heat Exhaustion: dizziness, nausea, weakness, heavy sweating, cool/moist skin
- Heat Stroke: high body temp, altered mental state, hot/dry skin, confusion
- Heat Cramps: muscle spasms from dehydration and electrolyte loss
- Dehydration: thirst, dry mouth, reduced urination, fatigue

SAFETY RULES (non-negotiable):
- Chest pain + breathing issues = IMMEDIATE 911
- Confusion/fainting/severe dizziness = URGENT care needed  
- Any "emergency" or "911" in their message = treat as emergency
- Heat exhaustion signs (dizziness, nausea, weakness, drowsiness) = URGENT cooling advice + immediate check-in

RESPOND FAST TO URGENT SYMPTOMS:
- "I am dizzy" = IMMEDIATE response: Get to cool place NOW, sit down, drink water
- "I am drowsy/sleepy/tired" = URGENT: Heat exhaustion warning, immediate cooling
- "I feel weak" = URGENT: Stop activity, get to shade/AC immediately  
- "I feel sick/nauseous" = URGENT: Cool down now, small sips of water
- "I feel faint" = EMERGENCY-level response: Sit/lie down immediately, call for help
- Don't wait - these are heat emergency symptoms that can escalate quickly

YOUR RESPONSE STYLE (USE THEIR NAME!):
✅ "Hey Muhammad! Sorry about the headache. In this 77°F weather, try some cool air and water. Feel better! 💙"
✅ "Hi Muhammad! That sounds rough. Get to some AC right now and sip water slowly."  
✅ "Muhammad, that's concerning. If breathing gets worse, call 911 immediately."

❌ "Based on your symptoms, I recommend immediate cooling interventions..."
❌ "Your condition indicates moderate heat-related illness requiring monitoring..."
❌ "Please implement the following clinical protocol..."

Respond as JSON:
{
  "smsMessage": "Natural, conversational SMS (max 160 chars)",
  "riskLevel": "low|medium|high|emergency", 
  "urgency": "routine|urgent|emergency",
  "emergencyAlert": true/false,
  "escalationLevel": "none|monitor|urgent|emergency",
  "nextCheckInHours": 1-24,
  "confidence": 0.0-1.0,
  "monitoringRecommendation": "minimal|standard|frequent|immediate"
}

EXAMPLES:

They say: "I feel dizzy and hot"
You respond: {"smsMessage": "🚨 DIZZINESS + HEAT = URGENT! Get to AC/shade RIGHT NOW. Sit down, sip water slowly. Don't ignore this!", "riskLevel": "high", "urgency": "urgent", "emergencyAlert": false, "escalationLevel": "urgent", "nextCheckInHours": 0.5, "confidence": 0.9, "monitoringRecommendation": "frequent"}

They say: "I am dizzy"  
You respond: {"smsMessage": "⚠️ DIZZINESS ALERT! Stop what you're doing. Get to cool place NOW, sit down, drink water. This can get worse fast!", "riskLevel": "high", "urgency": "urgent", "emergencyAlert": false, "escalationLevel": "urgent", "nextCheckInHours": 0.5, "confidence": 0.9, "monitoringRecommendation": "frequent"}

They say: "I am drowsy"
You respond: {"smsMessage": "🚨 DROWSINESS = HEAT EXHAUSTION WARNING! Get to AC immediately, lie down, cool your body. This is serious!", "riskLevel": "high", "urgency": "urgent", "emergencyAlert": false, "escalationLevel": "urgent", "nextCheckInHours": 0.25, "confidence": 0.95, "monitoringRecommendation": "immediate"}

They say: "I feel weak"
You respond: {"smsMessage": "⚠️ WEAKNESS = DANGER! Stop all activity NOW. Get to shade/AC, sit down, drink water. Heat exhaustion can escalate!", "riskLevel": "high", "urgency": "urgent", "emergencyAlert": false, "escalationLevel": "urgent", "nextCheckInHours": 0.5, "confidence": 0.9, "monitoringRecommendation": "frequent"}

They say: "chest hurts can't breathe"
You respond: {"smsMessage": "🚨 CALL 911 NOW! Chest pain + breathing trouble = emergency. Call immediately while I check back with you.", "riskLevel": "emergency", "urgency": "emergency", "emergencyAlert": true, "escalationLevel": "emergency", "nextCheckInHours": 1, "confidence": 0.95, "monitoringRecommendation": "immediate"}

They say: "feeling good today thanks"
You respond: {"smsMessage": "That's awesome! 😊 Gonna hit ${
      context.environment.feelsLike
    }°F today so drink lots of water. Any fun indoor plans?", "riskLevel": "low", "urgency": "routine", "emergencyAlert": false, "escalationLevel": "none", "nextCheckInHours": 24, "confidence": 0.9, "monitoringRecommendation": "minimal"}

They say: "thanks for checking on me"
You respond: {"smsMessage": "Of course! That's what I'm here for 💙 How you holding up in this heat? Staying cool I hope?", "riskLevel": "low", "urgency": "routine", "emergencyAlert": false, "escalationLevel": "none", "nextCheckInHours": 12, "confidence": 0.8, "monitoringRecommendation": "minimal"}

They say: "I moved to 90210"
You respond: {"smsMessage": "Congrats on the move! 🏠 To update your location for accurate weather alerts, text: 'update zip 90210' or just '90210'. How are you feeling in the new area?", "riskLevel": "low", "urgency": "routine", "emergencyAlert": false, "escalationLevel": "none", "nextCheckInHours": 24, "confidence": 0.9, "monitoringRecommendation": "minimal"}

They say: "what's the weather like in 10001"
You respond: {"smsMessage": "I see you're asking about 10001! Is this your new location? To get personalized alerts for that area, text 'update zip 10001'. Currently monitoring ${
      context.patient.location
    } for you.", "riskLevel": "low", "urgency": "routine", "emergencyAlert": false, "escalationLevel": "none", "nextCheckInHours": 24, "confidence": 0.8, "monitoringRecommendation": "minimal"}`;
  }

  /**
   * Call Gemini API - Fast, reliable, and free tier available
   */
  async callGeminiAPI(prompt) {
    // Use mock responses for testing if Gemini is not available
    if (this.useMockMode) {
      return this.generateMockResponse(prompt);
    }

    try {
      // Enhanced prompt for Gemini with JSON instruction
      const geminiPrompt = `You are HeatCare, a friendly health assistant. Always respond with valid JSON format only. Use the patient's name in your responses.

${prompt}

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "smsMessage": "Your personalized response here",
  "riskLevel": "low|medium|high",
  "urgency": "routine|urgent|emergency",
  "confidence": 0.8,
  "emergencyAlert": false,
  "monitoringRecommendation": "minimal|standard|frequent",
  "escalationLevel": "none|monitor|urgent|emergency",
  "nextCheckInHours": 24
}`;

      const result = await this.model.generateContent(geminiPrompt);
      const responseText = result.response.text();

      // Parse JSON response
      let parsedResponse;
      try {
        // Clean response text (remove markdown formatting if present)
        const cleanText = responseText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        parsedResponse = JSON.parse(cleanText);
      } catch (parseError) {
        console.error("❌ JSON parsing failed:", parseError.message);
        console.error("   Raw response:", responseText);
        throw new Error(`JSON parsing failed: ${parseError.message}`);
      }

      // Validate response structure
      const validatedResponse = this.validateAndFixResponse(parsedResponse);

      // Ensure smsMessage is properly formatted for SMS
      if (validatedResponse.smsMessage) {
        validatedResponse.smsMessage = this.formatForSMS(
          validatedResponse.smsMessage
        );
      }

      return validatedResponse;
    } catch (error) {
      console.error("❌ Gemini API error:", error.message);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Generate fast mock responses for testing (no API calls needed)
   */
  generateMockResponse(prompt) {
    // Extract patient name from prompt for personalization
    const nameMatch = prompt.match(/Name: (\w+)/);
    const patientName = nameMatch ? nameMatch[1] : "User";

    // Extract symptom/message from prompt
    const symptomMatch = prompt.match(/THEY JUST SAID: "([^"]+)"/);
    const symptom = symptomMatch ? symptomMatch[1].toLowerCase() : "";

    console.log(
      `🤖 [Mock Mode] Generating fast response for ${patientName}: "${symptom}"`
    );

    // Debug: log what we found
    console.log(`   Extracted name: "${patientName}", symptom: "${symptom}"`);

    // Intelligent mock responses based on symptoms
    let mockResponse;

    if (symptom.includes("headache")) {
      mockResponse = {
        smsMessage: `Hey ${patientName}! Sorry about the headache. Try some cool air, water, and rest. If it gets worse, see a doctor! 💙`,
        riskLevel: "medium",
        urgency: "routine",
        confidence: 0.9,
        emergencyAlert: false,
        monitoringRecommendation: "standard",
        escalationLevel: "none",
        nextCheckInHours: 12,
      };
    } else if (symptom.includes("dizzy") || symptom.includes("faint")) {
      mockResponse = {
        smsMessage: `${patientName}, dizziness can be serious! Sit down, drink water, get to cool air NOW. Call 911 if it worsens! 🚨`,
        riskLevel: "high",
        urgency: "urgent",
        confidence: 0.95,
        emergencyAlert: true,
        monitoringRecommendation: "frequent",
        escalationLevel: "urgent",
        nextCheckInHours: 1,
      };
    } else if (
      symptom.includes("fine") ||
      symptom.includes("better") ||
      symptom.includes("good")
    ) {
      mockResponse = {
        smsMessage: `Great to hear ${patientName}! 😊 Stay hydrated and keep cool. How's the weather treating you?`,
        riskLevel: "low",
        urgency: "routine",
        confidence: 0.8,
        emergencyAlert: false,
        monitoringRecommendation: "minimal",
        escalationLevel: "none",
        nextCheckInHours: 24,
      };
    } else {
      mockResponse = {
        smsMessage: `Hi ${patientName}! Thanks for checking in. Stay safe and hydrated! Any symptoms I should know about? 💙`,
        riskLevel: "low",
        urgency: "routine",
        confidence: 0.8,
        emergencyAlert: false,
        monitoringRecommendation: "standard",
        escalationLevel: "none",
        nextCheckInHours: 24,
      };
    }

    return mockResponse;
  }

  /**
   * Bulletproof JSON parsing with multiple strategies
   */
  parseResponseJSON(responseText) {
    if (!responseText || typeof responseText !== "string") {
      throw new Error("Empty or invalid response text");
    }

    // Clean up thinking tags and common artifacts first
    let cleanedText = responseText
      .replace(/<think>[\s\S]*?<\/think>/gi, "") // Remove <think></think> blocks
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "") // Remove <thinking></thinking> blocks
      .replace(/^.*?(?=\{)/s, "") // Remove everything before first {
      .trim();

    // Strategy 1: Direct parsing (most common case)
    try {
      const parsed = JSON.parse(cleanedText);
      return this.validateAndFixResponse(parsed);
    } catch (error) {
      // Continue to next strategy with original text
    }

    // Strategy 2: Extract JSON from markdown code blocks
    try {
      const codeBlockMatch = responseText.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i
      );
      if (codeBlockMatch) {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        return this.validateAndFixResponse(parsed);
      }
    } catch (error) {
      // Continue to next strategy
    }

    // Strategy 3: Find first complete JSON object
    try {
      const jsonMatch = responseText.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validateAndFixResponse(parsed);
      }
    } catch (error) {
      // Continue to next strategy
    }

    // Strategy 4: Extract JSON between curly braces (more aggressive)
    try {
      const startBrace = responseText.indexOf("{");
      const endBrace = responseText.lastIndexOf("}");
      if (startBrace !== -1 && endBrace !== -1 && endBrace > startBrace) {
        const jsonStr = responseText.substring(startBrace, endBrace + 1);
        const parsed = JSON.parse(jsonStr);
        return this.validateAndFixResponse(parsed);
      }
    } catch (error) {
      // Continue to next strategy
    }

    // Strategy 5: Fix common JSON issues and retry
    try {
      let fixedText = responseText
        .replace(/,\s*}/g, "}") // Remove trailing commas
        .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
        .replace(/:\s*'([^']*)'/g, ':"$1"') // Replace single quotes with double
        .trim();

      // Try to extract JSON again
      const jsonMatch = fixedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return this.validateAndFixResponse(parsed);
      }
    } catch (error) {
      // Final fallback failed
    }

    // All strategies failed
    throw new Error(
      `Could not parse JSON from response: "${responseText.substring(
        0,
        200
      )}..."`
    );
  }

  /**
   * Validate and fix the parsed response object
   */
  validateAndFixResponse(response) {
    if (!response || typeof response !== "object") {
      throw new Error("Response is not a valid object");
    }

    // Ensure required fields exist with defaults
    const validatedResponse = {
      smsMessage:
        response.smsMessage ||
        response.message ||
        "Please contact your healthcare provider if symptoms persist.",
      riskLevel: this.validateRiskLevel(response.riskLevel) || "medium",
      urgency: this.validateUrgency(response.urgency) || "routine",
      emergencyAlert: Boolean(response.emergencyAlert),
      escalationLevel:
        this.validateEscalationLevel(response.escalationLevel) || "none",
      nextCheckInHours:
        this.validateNextCheckIn(response.nextCheckInHours) || 24,
      confidence: this.validateConfidence(response.confidence) || 0.8,
      monitoringRecommendation:
        this.validateMonitoring(response.monitoringRecommendation) ||
        "standard",
    };

    // Validate smsMessage length
    if (validatedResponse.smsMessage.length > 160) {
      validatedResponse.smsMessage =
        validatedResponse.smsMessage.substring(0, 157) + "...";
    }

    return validatedResponse;
  }

  /**
   * Validation helpers
   */
  validateRiskLevel(level) {
    const validLevels = ["low", "medium", "high", "emergency"];
    return validLevels.includes(level) ? level : null;
  }

  validateUrgency(urgency) {
    const validUrgency = ["routine", "urgent", "emergency"];
    return validUrgency.includes(urgency) ? urgency : null;
  }

  validateEscalationLevel(level) {
    const validLevels = ["none", "monitor", "urgent", "emergency"];
    return validLevels.includes(level) ? level : null;
  }

  validateNextCheckIn(hours) {
    const num = parseFloat(hours);
    return num >= 0.25 && num <= 168 ? num : null; // 15 minutes to 1 week
  }

  validateConfidence(confidence) {
    const num = parseFloat(confidence);
    return num >= 0 && num <= 1 ? num : null;
  }

  validateMonitoring(monitoring) {
    const validMonitoring = ["minimal", "standard", "frequent", "immediate"];
    return validMonitoring.includes(monitoring) ? monitoring : null;
  }

  // Removed extractAdviceFromText() - no fallback text extraction needed in OpenAI-only system

  /**
   * Generate different types of messages using OpenAI
   */
  async generateWeatherAlert(patientData, weatherData, alertLevel) {
    try {
      const context = {
        patient: {
          age: patientData.age,
          location: patientData.zipcode,
          medicalHistory: this.parseJsonField(
            patientData.preExistingConditions
          ),
          medications: this.parseJsonField(patientData.medications),
          chronicConditions: this.parseJsonField(patientData.chronicConditions),
          isPregnant: patientData.isPregnant || false,
          smoker: patientData.smoker || false,
        },
        weather: {
          temperature: weatherData.temperature,
          feelsLike: weatherData.feelsLike,
          humidity: weatherData.humidity,
          city: weatherData.city,
          alertLevel: alertLevel,
        },
      };

      const prompt = `You are HeatCare, an SMS assistant for the general public during extreme heat events.

GUIDELINES:
- Use local real-time heat/forecast info to tailor advice. Keep each SMS <= 2–3 short sentences.
- Tone: supportive, plain-language, actionable, no medical jargon and no 'risk level' labels.
- Include actionable advice for heat protection
- Localize: prefer nearby cooling centers and official guidance.

PATIENT PROFILE:
- Age: ${context.patient.age}, ZIP: ${context.patient.location}
- Medical History: ${
        context.patient.medicalHistory.join(", ") || "None reported"
      }
- Current Medications: ${
        context.patient.medications.join(", ") || "None reported"
      }  
- Chronic Conditions: ${
        context.patient.chronicConditions.join(", ") || "None reported"
      }
- Pregnant: ${context.patient.isPregnant ? "Yes" : "No"}
- Smoker: ${context.patient.smoker ? "Yes" : "No"}

WEATHER ALERT SITUATION:
- Alert Level: ${alertLevel.toUpperCase()}
- Location: ${context.weather.city}
- Temperature: ${context.weather.feelsLike}°F feels like
- Humidity: ${context.weather.humidity}%

HIGH RISK FACTORS (mention if applicable):
- Age 65+ (higher heat sensitivity)
- Pregnancy (increased heat stress)
- Heart disease, diabetes, kidney disease (heat complications)
- Medications: diuretics, beta blockers (heat sensitivity)

Create a personalized SMS weather alert (max 160 chars) using plain language accessible to general public.

Respond ONLY with JSON:
{
  "smsMessage": "SMS text with weather alert and actionable advice (max 160 chars)",
  "urgency": "routine|urgent|emergency",
  "riskFactors": ["relevant", "risk", "factors", "for", "this", "patient"]
}`;

      const response = await this.callGeminiAPI(prompt);
      return {
        message:
          response.smsMessage ||
          "Weather alert: Stay hydrated and avoid excessive heat exposure.",
        urgency: response.urgency || "routine",
        riskFactors: response.riskFactors || [],
      };
    } catch (error) {
      console.error("Weather alert generation error:", error);
      // Fallback to basic alert
      return {
        message: `🌡️ ${alertLevel.toUpperCase()}: ${
          weatherData.feelsLike
        }°F feels like. Stay cool, hydrated. Limit outdoor activity.`,
        urgency: alertLevel === "emergency" ? "emergency" : "routine",
        riskFactors: [],
      };
    }
  }

  /**
   * Generate poll response message
   */
  async generatePollResponse(patientData, pollResponse, originalSymptoms) {
    try {
      const prompt = `You are HeatCare, an SMS assistant responding to a patient's health check-in follow-up.

GUIDELINES:
- Adapt guidance based on replies (better/same/worse), including symptom-specific tips
- If symptoms worsen or severe signs appear, advise calling 911 immediately
- Tone: supportive, plain-language, actionable, no medical jargon and no 'risk level' labels
- Keep each SMS <= 2–3 short sentences

PATIENT CONTEXT:
- Age: ${patientData.age}
- Medical History: ${
        this.parseJsonField(patientData.preExistingConditions).join(", ") ||
        "None reported"
      }
- Current Medications: ${
        this.parseJsonField(patientData.medications).join(", ") ||
        "None reported"
      }

SITUATION:
- Original symptoms reported: "${originalSymptoms}"
- Current poll response: Patient says they feel "${pollResponse}"
- Poll options were: much_better/slightly_better/same/worse/emergency

RESPONSE GUIDELINES BY STATUS:
- much_better: Encourage continued care, reduce monitoring
- slightly_better: Acknowledge progress, continue monitoring  
- same: Maintain current care, monitor for changes
- worse: Show concern, consider medical attention
- emergency: Immediate 911 guidance

Generate appropriate SMS response (max 160 chars) using plain language accessible to general public.

Respond ONLY with JSON:
{
  "smsMessage": "SMS response to patient's poll answer (max 160 chars, plain language)",
  "escalationLevel": "none|monitor|urgent|emergency",
  "nextAction": "continue|escalate|emergency|discharge"
}`;

      const response = await this.callGeminiAPI(prompt);
      return {
        message:
          response.smsMessage ||
          "Thank you for the update. Continue monitoring your symptoms.",
        escalationLevel: response.escalationLevel || "monitor",
        nextAction: response.nextAction || "continue",
      };
    } catch (error) {
      console.error("Poll response generation error:", error);
      // No fallback - throw error to trigger guard rails upstream
      throw new Error(`AI poll response generation failed: ${error.message}`);
    }
  }

  /**
   * Format response for SMS constraints
   */
  formatForSMS(text) {
    if (!text) return "Please seek medical attention if symptoms persist.";

    // Truncate if too long
    if (text.length > this.maxResponseLength) {
      text = text.substring(0, this.maxResponseLength - 3) + "...";
    }

    // Remove markdown and formatting
    text = text.replace(/[*_~`]/g, "");

    // Clean up spacing
    text = text.replace(/\s+/g, " ").trim();

    return text;
  }

  /**
   * Parse JSON string fields from database
   */
  parseJsonField(jsonString) {
    if (!jsonString) return [];
    try {
      return JSON.parse(jsonString);
    } catch {
      return [];
    }
  }

  /**
   * Get risk assessment from symptoms
   */
  async assessSymptomRisk(symptoms, patientData, weatherData) {
    try {
      const response = await this.generateMedicalResponse(
        patientData,
        symptoms,
        weatherData
      );
      return {
        level: response.riskLevel,
        urgency: response.urgency,
        monitoring: response.monitoringRecommendation,
        emergency: response.emergencyAlert,
      };
    } catch (error) {
      console.error("Risk assessment error:", error);
      // No fallback - throw error to trigger guard rails upstream
      throw new Error(`AI risk assessment failed: ${error.message}`);
    }
  }
}

module.exports = new MedGemmaService();
