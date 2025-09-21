// Advanced monitoring service with AI-suggested symptom tracking
const { getPrismaClient, getWhatsAppConfig } = require("./index");
const { whatsappQueue, healthCronQueue } = require("../queue");

/**
 * Monitoring Types
 */
const MONITORING_TYPES = {
  DAILY: "daily_health_check",
  AI_SYMPTOM: "ai_symptom_monitoring",
};

/**
 * AI Monitoring Suggestions based on symptom analysis
 */
const AI_MONITORING_PATTERNS = {
  // Immediate monitoring (every 30 minutes for 4 hours)
  CRITICAL: {
    intervals: [30, 60, 120, 240], // minutes
    duration: 4 * 60, // 4 hours
    description: "Critical symptoms detected - intensive monitoring",
    triggers: [
      "severe_heat_exhaustion",
      "heat_stroke_signs",
      "dehydration_severe",
    ],
  },

  // Frequent monitoring (every 2 hours for 12 hours)
  HIGH: {
    intervals: [120, 240, 480, 720], // 2, 4, 8, 12 hours
    duration: 12 * 60, // 12 hours
    description: "Concerning symptoms - frequent monitoring",
    triggers: [
      "moderate_heat_stress",
      "persistent_symptoms",
      "vulnerable_population",
    ],
  },

  // Standard monitoring (every 6 hours for 24 hours)
  MODERATE: {
    intervals: [360, 720, 1080, 1440], // 6, 12, 18, 24 hours
    duration: 24 * 60, // 24 hours
    description: "Mild symptoms - standard monitoring",
    triggers: ["mild_heat_symptoms", "prevention_mode", "at_risk_conditions"],
  },
};

/**
 * Daily Health Check Configuration
 */
const DAILY_CHECK_CONFIG = {
  // Send daily check at 9 AM every day
  cronTime: "0 9 * * *", // 9:00 AM daily
  message: (patientName) =>
    `Good morning ${patientName}! 🌅\n\n` +
    `Daily Health Check:\n` +
    `How are you feeling today? Please reply:\n\n` +
    `1️⃣ Excellent - feeling great\n` +
    `2️⃣ Good - normal energy\n` +
    `3️⃣ Fair - a bit tired\n` +
    `4️⃣ Poor - not feeling well\n` +
    `5️⃣ Urgent - need medical attention\n\n` +
    `🌡️ Today's weather alerts and health tips will follow!`,
};

/**
 * AI Symptom Analysis Engine
 * This analyzes patient symptoms and suggests monitoring intensity
 */
class AISymptomAnalyzer {
  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Analyze symptoms and suggest monitoring pattern
   * @param {string} symptomsText - Patient's symptom description
   * @param {Object} patientData - Patient information (age, conditions, etc.)
   * @param {number} currentTemperature - Current weather temperature
   * @returns {Object} - Analysis result with monitoring suggestion
   */
  async analyzeSymptoms(symptomsText, patientData, currentTemperature = null) {
    const analysis = {
      symptomsDetected: [],
      riskLevel: "LOW",
      suggestedMonitoring: AI_MONITORING_PATTERNS.MODERATE,
      reasoning: [],
      immediateActions: [],
      confidence: 0,
    };

    // Symptom detection patterns
    const symptomPatterns = {
      critical: {
        patterns: [
          /confusion|disoriented|can't think|mental fog/i,
          /trouble breathing|short of breath|gasping/i,
          /faint|fainting|passed out|lost consciousness/i,
          /severe headache|pounding head|splitting headache/i,
          /high fever|burning up|temperature (over|above) 103/i,
          /stopped sweating|no sweat|dry skin/i,
        ],
        weight: 0.8,
      },
      high: {
        patterns: [
          /dizzy|dizziness|lightheaded|vertigo/i,
          /nausea|nauseous|vomiting|throwing up/i,
          /weak|weakness|exhausted|drained/i,
          /severe headache|migraine|head pain/i,
          /profuse sweating|drenched|soaked/i,
          /muscle cramps|cramping|spasm/i,
        ],
        weight: 0.6,
      },
      moderate: {
        patterns: [
          /tired|fatigue|sluggish|low energy/i,
          /mild headache|slight headache/i,
          /thirsty|dehydrated|dry mouth/i,
          /warm|hot|overheating/i,
          /sweating|sweaty/i,
        ],
        weight: 0.3,
      },
    };

    // Analyze symptom text
    let totalWeight = 0;
    let detectedSymptoms = [];

    Object.entries(symptomPatterns).forEach(
      ([severity, { patterns, weight }]) => {
        patterns.forEach((pattern) => {
          if (pattern.test(symptomsText)) {
            detectedSymptoms.push({
              severity,
              pattern: pattern.source,
              weight,
            });
            totalWeight += weight;
          }
        });
      }
    );

    analysis.symptomsDetected = detectedSymptoms;

    // Risk factor analysis
    let riskMultiplier = 1;

    // Age risk factor
    if (patientData.age >= 65) {
      riskMultiplier += 0.3;
      analysis.reasoning.push("Senior citizen - increased heat vulnerability");
    }

    // Temperature risk factor
    if (currentTemperature && currentTemperature >= 100) {
      riskMultiplier += 0.4;
      analysis.reasoning.push(`Extreme heat warning - ${currentTemperature}°F`);
    } else if (currentTemperature && currentTemperature >= 95) {
      riskMultiplier += 0.2;
      analysis.reasoning.push(`High temperature - ${currentTemperature}°F`);
    }

    // Pre-existing conditions (if available)
    if (patientData.conditions) {
      const riskConditions = [
        "diabetes",
        "heart disease",
        "kidney disease",
        "copd",
      ];
      const hasRiskConditions = riskConditions.some((condition) =>
        patientData.conditions.toLowerCase().includes(condition)
      );
      if (hasRiskConditions) {
        riskMultiplier += 0.2;
        analysis.reasoning.push(
          "Pre-existing medical conditions increase risk"
        );
      }
    }

    // Calculate final risk score
    const finalRiskScore = totalWeight * riskMultiplier;
    analysis.confidence = Math.min(0.95, finalRiskScore);

    // Determine monitoring level
    if (finalRiskScore >= 0.7) {
      analysis.riskLevel = "CRITICAL";
      analysis.suggestedMonitoring = AI_MONITORING_PATTERNS.CRITICAL;
      analysis.immediateActions = [
        "Move to air conditioning immediately",
        "Apply cool water to skin",
        "Call 911 if symptoms worsen",
        "Have someone stay with patient",
      ];
    } else if (finalRiskScore >= 0.4) {
      analysis.riskLevel = "HIGH";
      analysis.suggestedMonitoring = AI_MONITORING_PATTERNS.HIGH;
      analysis.immediateActions = [
        "Rest in cool, shaded area",
        "Drink water slowly",
        "Monitor symptoms closely",
        "Contact healthcare provider if worsening",
      ];
    } else {
      analysis.riskLevel = "MODERATE";
      analysis.suggestedMonitoring = AI_MONITORING_PATTERNS.MODERATE;
      analysis.immediateActions = [
        "Stay hydrated",
        "Avoid outdoor activities during peak heat",
        "Rest as needed",
      ];
    }

    return analysis;
  }

  /**
   * Generate AI-powered personalized response
   * @param {Object} analysis - Result from analyzeSymptoms
   * @param {Object} patientData - Patient information
   * @returns {string} - Personalized response message
   */
  generatePersonalizedResponse(analysis, patientData) {
    const { riskLevel, suggestedMonitoring, reasoning, immediateActions } =
      analysis;
    const patientName = patientData.firstName || patientData.name || "there";

    let message = `Hi ${patientName}! 🏥\n\n`;

    // Risk-based opening
    switch (riskLevel) {
      case "CRITICAL":
        message += "🚨 *CRITICAL HEALTH ALERT*\n";
        message += "AI analysis indicates severe heat-related symptoms.\n\n";
        break;
      case "HIGH":
        message += "⚠️ *HIGH RISK DETECTED*\n";
        message += "AI analysis shows concerning heat stress symptoms.\n\n";
        break;
      case "MODERATE":
        message += "💡 *HEALTH GUIDANCE*\n";
        message += "AI analysis of your symptoms suggests preventive care.\n\n";
        break;
    }

    // Add reasoning
    if (reasoning.length > 0) {
      message += "*Risk Factors Identified:*\n";
      reasoning.forEach((reason) => {
        message += `• ${reason}\n`;
      });
      message += "\n";
    }

    // Immediate actions
    message += "*Recommended Actions:*\n";
    immediateActions.forEach((action) => {
      message += `• ${action}\n`;
    });
    message += "\n";

    // Monitoring plan
    message += `*AI Monitoring Plan:*\n`;
    message += `📊 Level: ${riskLevel}\n`;
    message += `⏰ Check-ins: ${suggestedMonitoring.description}\n`;
    message += `🔄 I'll monitor you for the next ${Math.round(
      suggestedMonitoring.duration / 60
    )} hours\n\n`;

    // Call to action
    if (riskLevel === "CRITICAL") {
      message += "🚨 *IMPORTANT*: If symptoms worsen, call 911 immediately!";
    } else {
      message += "💬 Reply anytime if you feel worse or have questions.";
    }

    return message;
  }
}

/**
 * Monitoring Schedule Manager
 */
class MonitoringScheduler {
  constructor() {
    this.prisma = getPrismaClient();
    this.aiAnalyzer = new AISymptomAnalyzer();
  }

  /**
   * Schedule daily health checks for a patient
   * @param {string} phoneNumber - Patient's phone number
   * @param {Object} patientData - Patient information
   */
  async scheduleDailyHealthCheck(phoneNumber, patientData) {
    const jobId = `daily-health-${phoneNumber}`;

    // Schedule daily check at 9 AM
    await healthCronQueue.add(
      MONITORING_TYPES.DAILY,
      {
        phoneNumber,
        patientData,
        checkType: "daily",
      },
      {
        repeat: { pattern: "0 9 * * *" }, // 9 AM daily
        jobId,
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );

    console.log(
      `[Monitoring] Daily health checks scheduled for ${
        patientData.firstName || phoneNumber
      }`
    );
  }

  /**
   * Schedule AI-suggested symptom monitoring
   * @param {string} phoneNumber - Patient's phone number
   * @param {Object} patientData - Patient information
   * @param {Object} analysis - AI analysis result
   */
  async scheduleAISymptomMonitoring(phoneNumber, patientData, analysis) {
    const { suggestedMonitoring, riskLevel } = analysis;
    const baseJobId = `ai-symptom-${phoneNumber}-${Date.now()}`;

    // Cancel any existing AI monitoring for this patient
    await this.cancelAIMonitoring(phoneNumber);

    // Schedule monitoring based on AI suggestion
    for (let i = 0; i < suggestedMonitoring.intervals.length; i++) {
      const delayMinutes = suggestedMonitoring.intervals[i];
      const jobId = `${baseJobId}-${i + 1}`;

      await healthCronQueue.add(
        MONITORING_TYPES.AI_SYMPTOM,
        {
          phoneNumber,
          patientData,
          checkType: "ai_symptom",
          riskLevel,
          checkNumber: i + 1,
          totalChecks: suggestedMonitoring.intervals.length,
          analysisSnapshot: analysis,
        },
        {
          delay: delayMinutes * 60 * 1000, // Convert to milliseconds
          jobId,
          removeOnComplete: 5,
          removeOnFail: 3,
        }
      );
    }

    console.log(
      `[AI Monitoring] ${riskLevel} risk monitoring scheduled for ${
        patientData.firstName || phoneNumber
      }`
    );
    console.log(
      `[AI Monitoring] Check intervals: ${suggestedMonitoring.intervals.join(
        ", "
      )} minutes`
    );
  }

  /**
   * Cancel AI monitoring for a patient
   * @param {string} phoneNumber - Patient's phone number
   */
  async cancelAIMonitoring(phoneNumber) {
    try {
      // Get all jobs for this phone number
      const jobs = await healthCronQueue.getJobs(
        ["delayed", "waiting"],
        0,
        100
      );

      for (const job of jobs) {
        if (
          job.data.phoneNumber === phoneNumber &&
          job.name === MONITORING_TYPES.AI_SYMPTOM
        ) {
          await job.remove();
          console.log(
            `[AI Monitoring] Cancelled job ${job.id} for ${phoneNumber}`
          );
        }
      }
    } catch (error) {
      console.error(
        `[AI Monitoring] Error cancelling jobs for ${phoneNumber}:`,
        error
      );
    }
  }

  /**
   * Process symptom report and trigger AI analysis
   * @param {string} phoneNumber - Patient's phone number
   * @param {string} symptomsText - Patient's symptom description
   * @param {Object} patientData - Patient information
   * @param {number} currentTemperature - Current weather temperature
   */
  async processSymptomReport(
    phoneNumber,
    symptomsText,
    patientData,
    currentTemperature = null
  ) {
    console.log(
      `[AI Analysis] Processing symptoms for ${
        patientData.firstName || phoneNumber
      }`
    );

    // Run AI analysis
    const analysis = await this.aiAnalyzer.analyzeSymptoms(
      symptomsText,
      patientData,
      currentTemperature
    );

    // Generate personalized response
    const responseMessage = this.aiAnalyzer.generatePersonalizedResponse(
      analysis,
      patientData
    );

    // Send immediate response
    await whatsappQueue.add("send-whatsapp", {
      to: phoneNumber,
      message: responseMessage,
    });

    // Schedule AI-suggested monitoring if needed
    if (analysis.riskLevel !== "LOW") {
      await this.scheduleAISymptomMonitoring(
        phoneNumber,
        patientData,
        analysis
      );
    }

    // Log the analysis
    await this.logAnalysis(phoneNumber, symptomsText, analysis);

    return analysis;
  }

  /**
   * Log AI analysis to database
   * @param {string} phoneNumber - Patient's phone number
   * @param {string} symptomsText - Original symptom text
   * @param {Object} analysis - AI analysis result
   */
  async logAnalysis(phoneNumber, symptomsText, analysis) {
    try {
      // You could create a dedicated analysis table, or store in messages
      await this.prisma.message.create({
        data: {
          from: `whatsapp:${phoneNumber}`,
          to: "system",
          body: `AI Analysis: ${
            analysis.riskLevel
          } risk - ${analysis.confidence.toFixed(2)} confidence`,
          direction: "system",
          messageType: "ai_analysis",
          errorMessage: JSON.stringify({
            originalSymptoms: symptomsText,
            analysis: analysis,
          }),
        },
      });
    } catch (error) {
      console.error("[AI Analysis] Error logging analysis:", error);
    }
  }
}

module.exports = {
  MONITORING_TYPES,
  AI_MONITORING_PATTERNS,
  DAILY_CHECK_CONFIG,
  AISymptomAnalyzer,
  MonitoringScheduler,
};
