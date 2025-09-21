// MedGemma-Only Analysis - Clean Implementation
// No legacy heuristic code - everything handled by AI

/**
 * Main analysis function - HeatCare AI with guard rails
 * This is the ONLY function needed for health analysis
 */
async function analyzeSymptoms(userInput, patientData, weatherData = {}) {
  // Hybrid AI approach: Gemini for fast responses + HeatCare for risk scoring
  const medgemmaService = require("../services/medgemmaService");
  const heatcareAI = require("../services/heatcareAI");

  try {
    // Get fast, personalized response from Gemini
    const geminiResponse = await medgemmaService.generateMedicalResponse(
      patientData,
      userInput,
      weatherData
    );

    // Get accurate risk assessment from your custom HeatCare AI
    const heatcareResponse = await heatcareAI.generateMedicalResponse(
      patientData,
      userInput,
      weatherData
    );

    // Combine the best of both: Gemini's message + HeatCare's risk analysis
    const aiResponse = {
      smsMessage: geminiResponse.smsMessage, // Fast, personalized from Gemini
      riskLevel: heatcareResponse.riskLevel, // Accurate from your custom model
      urgency: heatcareResponse.urgency, // Based on your risk thresholds
      confidence: Math.max(
        geminiResponse.confidence || 0.8,
        heatcareResponse.confidence || 0.8
      ),
      emergencyAlert: heatcareResponse.emergencyAlert, // Trust your safety logic
      monitoringRecommendation: heatcareResponse.monitoringRecommendation,
      escalationLevel: heatcareResponse.escalationLevel,
      nextCheckInHours: heatcareResponse.nextCheckInHours,
    };

    // Guard rail: Validate MedGemma response structure
    if (!aiResponse || !aiResponse.smsMessage) {
      throw new Error("Invalid MedGemma response structure");
    }

    // Guard rail: Emergency keyword detection for safety
    const emergencyKeywords = [
      "911",
      "emergency",
      "call doctor",
      "hospital",
      "ambulance",
    ];
    const hasEmergencyKeyword = emergencyKeywords.some((keyword) =>
      userInput.toLowerCase().includes(keyword)
    );

    // Override MedGemma if clear emergency keywords detected
    if (hasEmergencyKeyword && aiResponse.urgency !== "emergency") {
      console.log(
        "🚨 Guard rail: Emergency keyword detected, overriding MedGemma urgency"
      );
      aiResponse.urgency = "emergency";
      aiResponse.emergencyAlert = true;
      aiResponse.escalationLevel = "emergency";
    }

    // Guard rail: Urgent heat-related symptoms requiring immediate response
    const urgentHeatSymptoms = [
      "dizzy",
      "dizziness",
      "dizzy spells",
      "drowsy",
      "drowsiness",
      "sleepy",
      "weak",
      "weakness",
      "feel weak",
      "faint",
      "fainting",
      "feel faint",
      "nauseous",
      "nausea",
      "feel sick",
      "tired",
      "exhausted",
      "fatigue",
    ];

    const severeSymptoms = [
      "chest pain",
      "can't breathe",
      "trouble breathing",
      "confused",
      "confusion",
      "disoriented",
    ];

    const hasUrgentSymptom = urgentHeatSymptoms.some((symptom) =>
      userInput.toLowerCase().includes(symptom)
    );

    const hasSevereSymptom = severeSymptoms.some((symptom) =>
      userInput.toLowerCase().includes(symptom)
    );

    // Force urgency for heat-related symptoms
    if (
      hasUrgentSymptom &&
      (aiResponse.riskLevel === "low" || aiResponse.urgency === "routine")
    ) {
      console.log(
        "🚨 Guard rail: Urgent heat symptoms detected, escalating response"
      );
      aiResponse.riskLevel = "high";
      aiResponse.urgency = "urgent";
      aiResponse.escalationLevel = "urgent";
      aiResponse.nextCheckInHours = 0.5; // 30 minutes
    }

    // Force emergency for severe symptoms
    if (hasSevereSymptom && aiResponse.riskLevel !== "emergency") {
      console.log(
        "🚨 Guard rail: Severe symptoms detected, escalating to emergency level"
      );
      aiResponse.riskLevel = "emergency";
      aiResponse.urgency = "emergency";
      aiResponse.escalationLevel = "emergency";
    }

    // MedGemma determines monitoring interval based on its assessment
    const monitoringInterval = aiResponse.nextCheckInHours * 60 || 1440; // Convert to minutes, default 24h

    return {
      // All data comes from MedGemma - no legacy heuristic mixing
      smsMessage: aiResponse.smsMessage, // Primary response field
      advice: aiResponse.smsMessage, // Backward compatibility
      risk: {
        level: aiResponse.riskLevel.toLowerCase(),
        band: aiResponse.riskLevel,
        score: aiResponse.confidence,
      },
      urgency: aiResponse.urgency,
      emergencyAlert: aiResponse.emergencyAlert,
      escalationLevel: aiResponse.escalationLevel,
      monitoringInterval: monitoringInterval,
      timestamp: new Date().toISOString(),
      usedMedGemma: true,
      recommendations: {
        escalate:
          aiResponse.urgency === "urgent" || aiResponse.urgency === "emergency",
        emergency: aiResponse.emergencyAlert,
        continueMonitoring: aiResponse.monitoringRecommendation !== "minimal",
      },
    };
  } catch (error) {
    // No fallback - let the error bubble up to be handled with guard rails in the webhook
    console.error("❌ MedGemma analysis failed:", error.message);
    throw new Error(`MedGemma analysis failed: ${error.message}`);
  }
}

module.exports = {
  analyzeSymptoms, // This is the ONLY export needed
};
