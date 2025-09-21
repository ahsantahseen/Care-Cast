// HeatCare AI Service - JavaScript port of the Python AI system
// Based on gpt_v2_visualize.py

class HeatCareAI {
  constructor() {
    this.maxResponseLength = 160; // SMS character limit

    // Risk thresholds from Python
    this.RISK_THRESH = { LOW: 0.0, MED: 0.45, HIGH: 0.7 };

    // Use shared weather service instead of duplicate implementation
    this.weatherService = require("./weatherService");

    // Real-time weather monitoring
    this.lastWeatherUpdate = new Map(); // zipcode -> timestamp
    this.WEATHER_UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds

    // Temperature thresholds for wave detection
    this.HEAT_WAVE_THRESHOLD = 95; // °F feels like
    this.EXTREME_HEAT_THRESHOLD = 105; // °F feels like
    this.COLD_WAVE_THRESHOLD = 32; // °F actual temp
    this.EXTREME_COLD_THRESHOLD = 10; // °F actual temp

    // HeatCare constants from Python
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
   * Risk scoring algorithm from Python
   */
  riskScore(age, feelsLike, hasSymptom, severe) {
    let score = 0.1;

    if (feelsLike >= 105) score += 0.35;
    else if (feelsLike >= 100) score += 0.25;
    else if (feelsLike >= 95) score += 0.15;

    if (age !== null && age >= 65) score += 0.2;
    if (hasSymptom) score += 0.2;
    if (severe) score += 0.3;

    const band =
      score >= this.RISK_THRESH.HIGH
        ? "HIGH"
        : score >= this.RISK_THRESH.MED
        ? "MED"
        : "LOW";

    return { score: Math.round(score * 100) / 100, band };
  }

  /**
   * Heuristic symptom extractor from Python
   */
  heuristicExtractor(text, lang = "en") {
    const t = (text || "").toLowerCase().trim();
    const wordLike = (t.match(/\w+/g) || []).length;
    const has = t.length >= 12 || wordLike >= 2;

    const categories = new Set();

    // Keyword mapping from Python
    const keywords = {
      dizziness: ["dizzy", "lightheaded", "light-headed", "vertigo"],
      headache: ["headache", "migraine"],
      nausea: ["nausea", "nauseous", "vomit", "throwing up"],
      cramps: ["cramp", "muscle spasm", "spasm"],
      weakness: ["weak", "fatigued", "exhausted", "tired"],
      confusion: ["confused", "disoriented", "can't think"],
      breathing: ["trouble breathing", "short of breath", "can't breathe"],
      fainting: ["faint", "passed out", "feel faint"],
      fever: ["fever", "hot to touch"],
    };

    for (const [category, words] of Object.entries(keywords)) {
      if (words.some((word) => t.includes(word))) {
        categories.add(category);
      }
    }

    const severe = ["confusion", "breathing", "fainting"].some((cat) =>
      categories.has(cat)
    );

    return {
      has_symptom: has || categories.size > 0,
      severe,
      categories: Array.from(categories).sort(),
    };
  }

  /**
   * Compose symptom advice from Python
   */
  composeSymptomAdvice(feelsLike, band, categories) {
    const tips = [];
    const base = `Feels-like ${feelsLike}°F. `;
    const core = "Sip water or oral rehydration, rest in AC or a cool place.";

    // Per-symptom snippets from Python
    const perSymptom = {
      dizziness: "Lie down or sit, cool your body (cool cloths/tepid shower).",
      headache: "Dim lights and cool down; small sips if nausea.",
      nausea: "Small, frequent sips; avoid caffeine/alcohol.",
      cramps: "Gently stretch and take electrolytes if available.",
      weakness: "Sit or lie down; avoid exertion and heat exposure.",
      fever: "Cool cloths/tepid shower; avoid ice baths.",
    };

    const severeAlert =
      "If confusion, fainting, or trouble breathing, call 911.";

    const chosen = categories
      .filter((c) => perSymptom[c])
      .slice(0, 2)
      .map((c) => perSymptom[c]);

    let sentence = [core, ...chosen].join(" ").trim();

    if (band === "HIGH") {
      sentence +=
        " If you feel worse or can't keep fluids down, seek urgent care.";
    }

    const hasSevere = ["confusion", "breathing", "fainting"].some((cat) =>
      categories.includes(cat)
    );
    const result = base + sentence + (hasSevere ? " " + severeAlert : "");

    return result.trim();
  }

  /**
   * Concise advice from Python
   */
  conciseAdvice(feelsLike, band) {
    let msg = `Feels-like ${feelsLike}°F near you. Sip water often, stay in AC or a cooling center. Rest indoors and avoid outdoor activity.`;

    if (band === "HIGH") {
      msg = msg.replace(
        ". Rest indoors",
        ". If you feel worse or faint/confused, call 911. Rest indoors"
      );
    }

    return msg;
  }

  /**
   * Main medical response generation - replicating Python logic
   */
  async generateMedicalResponse(patientData, symptomText, weatherContext = {}) {
    try {
      const feelsLike =
        weatherContext.feelsLike ||
        (await this.estimateFeelsLike(patientData.zipcode));
      const age = patientData.age;

      // Extract symptoms using heuristic from Python
      const symptomResult = this.heuristicExtractor(symptomText);
      const hasSymptom = symptomResult.has_symptom;
      const severe = symptomResult.severe;
      const categories = symptomResult.categories;

      // Emergency response for severe symptoms
      if (severe) {
        return {
          smsMessage: this.EMERGENCY_EN,
          riskLevel: "emergency",
          urgency: "emergency",
          emergencyAlert: true,
          escalationLevel: "emergency",
          nextCheckInHours: 0.5,
          confidence: 0.95,
          monitoringRecommendation: "immediate",
          advice: this.EMERGENCY_EN,
        };
      }

      // Calculate risk score
      const risk = this.riskScore(age, feelsLike, hasSymptom, severe);

      let smsMessage;
      let nextCheckInHours;
      let escalationLevel;
      let urgency;

      if (hasSymptom) {
        // Generate tailored symptom advice
        smsMessage = this.composeSymptomAdvice(
          feelsLike,
          risk.band,
          categories
        );

        // Set monitoring schedule based on risk band (from Python)
        nextCheckInHours =
          risk.band === "HIGH" ? 2 : risk.band === "MED" ? 3 : 6;
        escalationLevel = risk.band === "HIGH" ? "urgent" : "monitor";
        urgency = risk.band === "HIGH" ? "urgent" : "routine";
      } else {
        // No symptoms - brief advice
        smsMessage = `Today's peak feels-like ~${feelsLike}°F. Plan errands early/late, drink water often, and find AC.`;
        nextCheckInHours = 24;
        escalationLevel = "none";
        urgency = "routine";
      }

      // Format for SMS
      smsMessage = this.formatForSMS(smsMessage);

      return {
        smsMessage,
        riskLevel: risk.band.toLowerCase(), // Convert HIGH/MED/LOW to high/medium/low
        urgency,
        emergencyAlert: false,
        escalationLevel,
        nextCheckInHours,
        confidence: 0.9,
        monitoringRecommendation:
          risk.band === "HIGH"
            ? "frequent"
            : risk.band === "MED"
            ? "standard"
            : "minimal",
        advice: smsMessage, // For backward compatibility
      };
    } catch (error) {
      console.error("❌ HeatCare AI error:", error.message);
      throw new Error(`HeatCare AI failed: ${error.message}`);
    }
  }

  /**
   * Generate weather alert
   */
  async generateWeatherAlert(patientData, weatherData, alertLevel) {
    try {
      const feelsLike = weatherData.feelsLike || 95;
      const age = patientData.age;

      // Assess risk factors
      const riskFactors = this.assessRiskFactors(patientData);

      let message = `🌡️ ${alertLevel.toUpperCase()}: ${feelsLike}°F feels like in ${
        weatherData.city || "your area"
      }. `;

      if (alertLevel === "emergency") {
        message += "Stay indoors with AC. Avoid all outdoor activity.";
        if (age >= 65) {
          message += " Extra risk at 65+ - check cooling centers.";
        }
      } else {
        message += "Stay cool, hydrated. Limit outdoor activity 11am-6pm.";
      }

      return {
        message: this.formatForSMS(message),
        urgency: alertLevel === "emergency" ? "emergency" : "routine",
        riskFactors,
      };
    } catch (error) {
      console.error("Weather alert generation error:", error);
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
   * Generate poll response
   */
  async generatePollResponse(patientData, pollResponse, originalSymptoms) {
    try {
      const responses = {
        better:
          "Glad you're feeling better. Keep sipping water, avoid midday heat, and use AC or cool spaces.",
        much_better:
          "Excellent! Keep staying hydrated and cool. Continue avoiding heat exposure during peak hours.",
        same: "Thanks. Keep hydrating, stay in AC, and avoid exertion. If not better, consider contacting a clinician.",
        worse: this.EMERGENCY_EN,
        emergency: this.EMERGENCY_EN,
        1: "Glad you're feeling better. Keep sipping water, avoid midday heat, and use AC or cool spaces.",
        2: "Thanks. Keep hydrating, stay in AC, and avoid exertion. If not better, consider contacting a clinician.",
        3: this.EMERGENCY_EN,
      };

      const message =
        responses[pollResponse.toLowerCase()] ||
        "Thanks for the update. Keep resting in AC and drinking water. If symptoms persist, contact a clinician.";

      const escalationLevel =
        pollResponse.toLowerCase() === "worse" || pollResponse === "3"
          ? "emergency"
          : pollResponse.toLowerCase() === "same" || pollResponse === "2"
          ? "monitor"
          : "none";

      const nextAction =
        escalationLevel === "emergency" ? "emergency" : "continue";

      return {
        message: this.formatForSMS(message),
        escalationLevel,
        nextAction,
      };
    } catch (error) {
      console.error("Poll response generation error:", error);
      throw new Error(`Poll response generation failed: ${error.message}`);
    }
  }

  /**
   * Assess risk factors for patient
   */
  assessRiskFactors(patientData) {
    const riskFactors = [];

    if (patientData.age >= 65) riskFactors.push("age_65_plus");
    if (patientData.isPregnant) riskFactors.push("pregnancy");
    if (patientData.smoker) riskFactors.push("smoker");

    const conditions = this.parseJsonField(patientData.chronicConditions);
    if (conditions.includes("heart_disease")) riskFactors.push("heart_disease");
    if (conditions.includes("diabetes")) riskFactors.push("diabetes");
    if (conditions.includes("kidney_disease"))
      riskFactors.push("kidney_disease");

    return riskFactors;
  }

  /**
   * Get current weather from shared weather service
   */
  async getCurrentWeather(zipcode) {
    try {
      const weather = await this.weatherService.getCurrentWeather(zipcode);
      return {
        temperature: weather.temperature,
        feelsLike: weather.feelsLike,
        humidity: weather.humidity,
        description: weather.description,
        city: weather.city,
        zipcode: zipcode,
      };
    } catch (error) {
      console.error(`Weather service error for ${zipcode}:`, error.message);
      return this.getFallbackWeather(zipcode);
    }
  }

  /**
   * Get weather forecast for heat wave detection
   */
  async getWeatherForecast(zipcode, days = 5) {
    try {
      if (!this.weatherApiKey) {
        return this.getFallbackForecast(zipcode, days);
      }

      const axios = require("axios");
      const response = await axios.get(`${this.weatherApiUrl}/forecast`, {
        params: {
          zip: `${zipcode},US`,
          appid: this.weatherApiKey,
          units: "imperial",
        },
        timeout: 5000,
      });

      const forecasts = response.data.list.slice(0, days * 8); // 8 forecasts per day (3-hour intervals)

      return forecasts.map((item) => ({
        date: new Date(item.dt * 1000),
        temperature: Math.round(item.main.temp),
        feelsLike: Math.round(item.main.feels_like),
        humidity: item.main.humidity,
        description: item.weather[0].description,
      }));
    } catch (error) {
      console.error(`Forecast API error for ${zipcode}:`, error.message);
      return this.getFallbackForecast(zipcode, days);
    }
  }

  /**
   * Detect heat wave conditions
   */
  async detectHeatWave(zipcode) {
    try {
      const currentWeather = await this.getCurrentWeather(zipcode);
      const forecast = await this.getWeatherForecast(zipcode, 3);

      // Heat wave criteria (based on Python logic)
      const HEAT_WAVE_THRESHOLD = 95; // °F feels like
      const EXTREME_HEAT_THRESHOLD = 105; // °F feels like

      const today = currentWeather.feelsLike;
      const upcoming = forecast.slice(0, 8).map((f) => f.feelsLike); // Next 24 hours

      let alertLevel = "none";
      let daysAffected = 0;
      let maxFeelsLike = today;

      // Check current conditions
      if (today >= EXTREME_HEAT_THRESHOLD) {
        alertLevel = "emergency";
      } else if (today >= HEAT_WAVE_THRESHOLD) {
        alertLevel = "warning";
      }

      // Check upcoming forecast
      const heatDays = upcoming.filter((temp) => temp >= HEAT_WAVE_THRESHOLD);
      daysAffected = Math.ceil(heatDays.length / 8); // Convert 3-hour periods to days

      maxFeelsLike = Math.max(today, ...upcoming);

      // Escalate alert if sustained heat
      if (daysAffected >= 2 && maxFeelsLike >= HEAT_WAVE_THRESHOLD) {
        alertLevel = alertLevel === "none" ? "warning" : "emergency";
      }

      return {
        alertLevel,
        currentTemp: today,
        maxFeelsLike,
        daysAffected,
        city: currentWeather.city,
        zipcode,
        isHeatWave: alertLevel !== "none",
        description: this.getHeatWaveDescription(
          alertLevel,
          maxFeelsLike,
          daysAffected
        ),
      };
    } catch (error) {
      console.error(`Heat wave detection error for ${zipcode}:`, error.message);
      return {
        alertLevel: "none",
        currentTemp: 85,
        maxFeelsLike: 85,
        daysAffected: 0,
        city: "Unknown",
        zipcode,
        isHeatWave: false,
        description: "Unable to check heat conditions",
      };
    }
  }

  /**
   * Generate heat wave alert message
   */
  generateHeatWaveAlert(heatWaveData, patientData) {
    const { alertLevel, maxFeelsLike, daysAffected, city } = heatWaveData;
    const age = patientData.age;
    const riskFactors = this.assessRiskFactors(patientData);

    let message = "";
    let urgency = "routine";

    if (alertLevel === "emergency") {
      message = `🚨 EXTREME HEAT EMERGENCY: ${maxFeelsLike}°F expected in ${city}! `;
      message += "Stay indoors with AC. Avoid ALL outdoor activity. ";
      urgency = "emergency";

      if (age >= 65) {
        message += "65+ at HIGH RISK - check cooling centers now!";
      } else {
        message += "Check on elderly neighbors.";
      }
    } else if (alertLevel === "warning") {
      message = `⚠️ HEAT WAVE ALERT: ${maxFeelsLike}°F feels like in ${city} `;
      message += `for ${daysAffected} day(s). `;
      message += "Stay cool, hydrate often, avoid 11am-6pm outdoor activity.";
      urgency = "urgent";

      if (riskFactors.length > 0) {
        message += " Extra precautions needed.";
      }
    }

    return {
      message: this.formatForSMS(message),
      urgency,
      alertLevel,
      riskFactors,
    };
  }

  /**
   * Get heat wave description
   */
  getHeatWaveDescription(alertLevel, maxTemp, days) {
    if (alertLevel === "emergency") {
      return `Extreme heat emergency with feels-like temperatures up to ${maxTemp}°F`;
    } else if (alertLevel === "warning") {
      return `Heat wave warning with ${maxTemp}°F feels-like for ${days} day(s)`;
    }
    return "Normal heat conditions";
  }

  /**
   * Fallback weather data when API is unavailable
   */
  getFallbackWeather(zipcode) {
    const z = parseInt(zipcode) || 0;
    const baseTemp = 90 + (z % 10); // Vary by ZIP

    return {
      temperature: baseTemp,
      feelsLike: baseTemp + 5,
      humidity: 60,
      description: "partly cloudy",
      city: `ZIP ${zipcode}`,
      zipcode,
    };
  }

  /**
   * Fallback forecast when API is unavailable
   */
  getFallbackForecast(zipcode, days) {
    const forecasts = [];
    const baseTemp = 90 + (parseInt(zipcode) % 10);

    for (let i = 0; i < days * 8; i++) {
      forecasts.push({
        date: new Date(Date.now() + i * 3 * 60 * 60 * 1000), // 3-hour intervals
        temperature: baseTemp + Math.random() * 10 - 5,
        feelsLike: baseTemp + 5 + Math.random() * 10 - 5,
        humidity: 50 + Math.random() * 30,
        description: "partly cloudy",
      });
    }

    return forecasts;
  }

  /**
   * Estimate feels like temperature - enhanced with weather API
   */
  async estimateFeelsLike(zipcode) {
    try {
      const weather = await this.getCurrentWeather(zipcode);
      return weather.feelsLike;
    } catch (error) {
      // Fallback to simple ZIP-based heuristic from Python
      const z = parseInt(zipcode) || 0;
      return 95 + (z % 6);
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
   * Get real-time weather with minutely updates
   */
  async getRealtimeWeather(zipcode) {
    try {
      const now = Date.now();
      const lastUpdate = this.lastWeatherUpdate.get(zipcode) || 0;

      // Check if we need to update (every minute)
      if (
        now - lastUpdate < this.WEATHER_UPDATE_INTERVAL &&
        this.weatherCache.has(zipcode)
      ) {
        console.log(`🌤️ Using cached weather for ${zipcode}`);
        return this.weatherCache.get(zipcode);
      }

      console.log(`🌤️ Fetching fresh weather for ${zipcode}...`);
      const weather = await this.getCurrentWeather(zipcode);

      // Add wave status
      const waveStatus = this.detectWeatherWave(weather);
      weather.waveStatus = waveStatus;

      // Cache the result
      this.weatherCache.set(zipcode, weather);
      this.lastWeatherUpdate.set(zipcode, now);

      return weather;
    } catch (error) {
      console.error(`Weather update error for ${zipcode}:`, error);
      return this.getFallbackWeather(zipcode);
    }
  }

  /**
   * Detect heat wave, cold wave, or normal conditions
   */
  detectWeatherWave(weatherData) {
    const { temp, feelsLike } = weatherData;

    // Heat wave detection (based on feels-like temperature)
    if (feelsLike >= this.EXTREME_HEAT_THRESHOLD) {
      return {
        type: "extreme_heat",
        level: "emergency",
        message: "🚨 EXTREME HEAT EMERGENCY",
        description: `Feels like ${feelsLike}°F - life-threatening conditions`,
        urgency: "emergency",
      };
    } else if (feelsLike >= this.HEAT_WAVE_THRESHOLD) {
      return {
        type: "heat_wave",
        level: "warning",
        message: "🌡️ HEAT WAVE WARNING",
        description: `Feels like ${feelsLike}°F - dangerous heat`,
        urgency: "high",
      };
    }

    // Cold wave detection (based on actual temperature)
    if (temp <= this.EXTREME_COLD_THRESHOLD) {
      return {
        type: "extreme_cold",
        level: "emergency",
        message: "🧊 EXTREME COLD EMERGENCY",
        description: `${temp}°F - hypothermia risk`,
        urgency: "emergency",
      };
    } else if (temp <= this.COLD_WAVE_THRESHOLD) {
      return {
        type: "cold_wave",
        level: "warning",
        message: "❄️ COLD WAVE WARNING",
        description: `${temp}°F - freezing conditions`,
        urgency: "high",
      };
    }

    // Normal conditions
    return {
      type: "normal",
      level: "safe",
      message: "🌤️ Normal weather conditions",
      description: `${temp}°F, feels like ${feelsLike}°F`,
      urgency: "routine",
    };
  }

  /**
   * Generate real-time weather status message
   */
  generateWeatherStatusMessage(zipcode, weatherData) {
    const { waveStatus } = weatherData;
    const timestamp = new Date().toLocaleTimeString();

    let message = `${waveStatus.message} (${timestamp})\n`;
    message += `📍 ZIP ${zipcode}: ${waveStatus.description}`;

    // Add safety advice based on wave type
    switch (waveStatus.type) {
      case "extreme_heat":
        message += "\n🚨 Stay indoors with AC! Avoid ALL outdoor activity.";
        break;
      case "heat_wave":
        message += "\n⚠️ Limit outdoor time. Stay hydrated and cool.";
        break;
      case "extreme_cold":
        message += "\n🚨 Stay indoors with heat! Hypothermia risk outside.";
        break;
      case "cold_wave":
        message += "\n❄️ Bundle up warm. Limit outdoor exposure.";
        break;
      default:
        message += "\n✅ Safe weather conditions today.";
    }

    return this.formatForSMS(message);
  }

  /**
   * Generate patient check-in reminder based on weather alert level
   */
  generateCheckInReminder(waveStatus, patientData) {
    const checkInIntervals = {
      emergency: 15, // minutes - check every 15 minutes during emergencies
      high: 30, // minutes - check every 30 minutes during warnings
      routine: 60, // minutes - hourly check during normal conditions
    };

    const urgencyMap = {
      emergency: checkInIntervals.emergency,
      high: checkInIntervals.high,
      routine: checkInIntervals.routine,
    };

    const checkInMinutes = urgencyMap[waveStatus.urgency] || 60;

    return {
      intervalMinutes: checkInMinutes,
      nextCheckIn: new Date(Date.now() + checkInMinutes * 60 * 1000),
      priority: waveStatus.urgency,
      message: this.generateCheckInMessage(waveStatus, patientData),
      weatherAlert: true,
      alertType: waveStatus.type,
    };
  }

  /**
   * Generate personalized check-in message for weather alerts
   */
  generateCheckInMessage(waveStatus, patientData) {
    const { firstName, age } = patientData;
    const isVulnerable = age >= 65;

    let message = `Hi ${firstName}! Weather check: ${waveStatus.message}\n\n`;

    switch (waveStatus.type) {
      case "extreme_heat":
        message += isVulnerable
          ? "🚨 URGENT: Are you in AC right now? Reply 1=Yes in AC / 2=No AC / 3=Need help"
          : "🚨 How are you handling the extreme heat? Reply 1=Fine in AC / 2=Hot but OK / 3=Need help";
        break;

      case "heat_wave":
        message += isVulnerable
          ? "⚠️ How are you feeling in this heat? Reply 1=Good & cool / 2=A bit warm / 3=Not well"
          : "⚠️ Quick heat check - how are you doing? Reply 1=Fine / 2=Warm / 3=Struggling";
        break;

      case "extreme_cold":
        message += isVulnerable
          ? "🚨 URGENT: Are you warm indoors? Reply 1=Yes warm / 2=Cold inside / 3=Need help"
          : "🚨 How are you staying warm? Reply 1=Fine & warm / 2=A bit cold / 3=Need help";
        break;

      case "cold_wave":
        message += isVulnerable
          ? "❄️ How are you handling the cold? Reply 1=Warm inside / 2=Chilly / 3=Too cold"
          : "❄️ Quick cold check - staying warm? Reply 1=Fine / 2=Cool / 3=Cold";
        break;

      default:
        message +=
          "How are you feeling today? Reply 1=Great / 2=OK / 3=Not well";
    }

    return this.formatForSMS(message);
  }

  /**
   * Start minutely weather monitoring for a zipcode with patient reminders
   */
  startWeatherMonitoring(zipcode, callback, patientData = null) {
    console.log(`🌤️ Starting minutely weather monitoring for ${zipcode}`);

    let lastAlertLevel = null;
    let reminderTimer = null;

    const monitor = async () => {
      try {
        const weather = await this.getRealtimeWeather(zipcode);
        const statusMessage = this.generateWeatherStatusMessage(
          zipcode,
          weather
        );

        // Check if alert level changed - schedule patient check-ins
        const currentAlertLevel = weather.waveStatus.urgency;

        if (currentAlertLevel !== lastAlertLevel && patientData) {
          console.log(
            `🔔 Alert level changed: ${lastAlertLevel} → ${currentAlertLevel}`
          );

          // Clear existing reminder timer
          if (reminderTimer) {
            clearInterval(reminderTimer);
            reminderTimer = null;
          }

          // Generate check-in reminder
          const checkInReminder = this.generateCheckInReminder(
            weather.waveStatus,
            patientData
          );

          // Schedule patient check-ins based on urgency
          if (
            currentAlertLevel === "emergency" ||
            currentAlertLevel === "high"
          ) {
            console.log(
              `🚨 Scheduling patient check-ins every ${checkInReminder.intervalMinutes} minutes`
            );

            // Immediate check-in for new emergency/high alerts
            if (callback) {
              callback({
                type: "patient_checkin",
                zipcode,
                weather,
                statusMessage,
                waveStatus: weather.waveStatus,
                checkInReminder,
                immediate: true,
                timestamp: new Date().toISOString(),
              });
            }

            // Set up recurring reminders
            reminderTimer = setInterval(() => {
              if (callback) {
                callback({
                  type: "patient_checkin",
                  zipcode,
                  weather,
                  statusMessage,
                  waveStatus: weather.waveStatus,
                  checkInReminder,
                  immediate: false,
                  timestamp: new Date().toISOString(),
                });
              }
            }, checkInReminder.intervalMinutes * 60 * 1000);
          }

          lastAlertLevel = currentAlertLevel;
        }

        // Regular weather update callback
        if (callback) {
          callback({
            type: "weather_update",
            zipcode,
            weather,
            statusMessage,
            waveStatus: weather.waveStatus,
            timestamp: new Date().toISOString(),
          });
        }

        console.log(
          `📊 Weather update for ${zipcode}: ${weather.waveStatus.type}`
        );
      } catch (error) {
        console.error(`Weather monitoring error for ${zipcode}:`, error);
      }
    };

    // Initial check
    monitor();

    // Set up minutely updates
    const intervalId = setInterval(monitor, this.WEATHER_UPDATE_INTERVAL);

    return {
      stop: () => {
        clearInterval(intervalId);
        if (reminderTimer) {
          clearInterval(reminderTimer);
        }
        console.log(`🛑 Stopped weather monitoring for ${zipcode}`);
      },
      intervalId,
      reminderTimer,
    };
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
      throw new Error(`HeatCare risk assessment failed: ${error.message}`);
    }
  }
}

module.exports = new HeatCareAI();
