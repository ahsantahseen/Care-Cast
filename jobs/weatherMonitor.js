// Weather monitoring cron job - checks all users' weather and sends alerts
const { whatsappQueue } = require("../queue");
const weatherService = require("../services/weatherService");
const medgemmaService = require("../services/medgemmaService");
const { getPrismaClient } = require("../services");

class WeatherMonitor {
  constructor() {
    this.prisma = getPrismaClient();
    this.isRunning = false;
    this.lastRun = null;
  }

  /**
   * Main weather monitoring job
   * Runs every 30 minutes to check all users' weather
   */
  async runWeatherCheck() {
    if (this.isRunning) {
      console.log("⏸️  Weather check already running, skipping...");
      return;
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      console.log("🌡️  Starting weather monitoring job...");

      // Get all active patients with complete ZIP codes
      const patients = await this.prisma.patient.findMany({
        where: {
          zipcode: {
            not: "",
          },
          phoneNumber: {
            not: "",
          },
        },
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          zipcode: true,
          age: true,
          preExistingConditions: true,
          chronicConditions: true,
          medications: true,
          isPregnant: true,
          smoker: true,
          activityLevel: true,
          preferredLanguage: true,
        },
      });

      console.log(`📊 Checking weather for ${patients.length} patients`);

      if (patients.length === 0) {
        console.log("ℹ️  No patients to monitor");
        return;
      }

      // Group patients by ZIP code to minimize API calls
      const zipGroups = this.groupPatientsByZip(patients);
      const uniqueZips = Object.keys(zipGroups);

      console.log(`🗺️  Monitoring ${uniqueZips.length} unique ZIP codes`);

      // Get weather data for all ZIP codes
      const weatherResults = await weatherService.getBulkWeather(uniqueZips);

      let alertsSent = 0;
      let errorsCount = 0;

      // Process each ZIP code's weather
      for (const weatherData of weatherResults) {
        if (!weatherData.success) {
          console.error(
            `❌ Weather fetch failed for ${weatherData.zipCode}: ${weatherData.error}`
          );
          errorsCount++;
          continue;
        }

        const patientsInZip = zipGroups[weatherData.zipCode];
        const alerts = await this.processZipWeather(weatherData, patientsInZip);
        alertsSent += alerts;
      }

      const duration = ((new Date() - startTime) / 1000).toFixed(2);
      console.log(`✅ Weather monitoring completed in ${duration}s`);
      console.log(`📤 Sent ${alertsSent} weather alerts`);
      if (errorsCount > 0) {
        console.log(`⚠️  ${errorsCount} ZIP codes had errors`);
      }

      this.lastRun = new Date();
    } catch (error) {
      console.error("❌ Weather monitoring job failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process weather data for a specific ZIP code and its patients
   */
  async processZipWeather(weatherData, patients) {
    let alertsSent = 0;

    const { weather, heatwave } = weatherData;

    // Check if any alerts are needed
    const shouldAlert = this.shouldSendWeatherAlert(weather, heatwave);

    if (!shouldAlert.alert) {
      console.log(
        `ℹ️  No alerts needed for ${weather.zipCode} (${weather.feelsLike}°F)`
      );
      return 0;
    }

    console.log(
      `🚨 ${shouldAlert.level} alert for ${weather.zipCode}: ${shouldAlert.reason}`
    );

    // Send personalized alerts to each patient in this ZIP
    for (const patient of patients) {
      try {
        const alertMessage = await this.generatePersonalizedAlert(
          patient,
          weather,
          heatwave,
          shouldAlert
        );

        await whatsappQueue.add("send-whatsapp", {
          to: patient.phoneNumber,
          message: alertMessage,
        });

        // Log the alert
        await this.logWeatherAlert(patient, weather, heatwave, alertMessage);

        alertsSent++;

        // Rate limiting
        await this.delay(500); // 500ms between messages
      } catch (error) {
        console.error(
          `❌ Failed to send alert to ${patient.phoneNumber}:`,
          error.message
        );
      }
    }

    return alertsSent;
  }

  /**
   * Determine if weather alert should be sent
   */
  shouldSendWeatherAlert(weather, heatwave) {
    // Emergency conditions
    if (heatwave.warningLevel === "emergency") {
      return {
        alert: true,
        level: "emergency",
        reason: `Extreme heat emergency (${weather.feelsLike}°F feels like)`,
      };
    }

    // Heat warnings
    if (heatwave.warningLevel === "warning") {
      return {
        alert: true,
        level: "warning",
        reason: `Heat warning in effect (${weather.feelsLike}°F feels like)`,
      };
    }

    // Heat watch
    if (heatwave.warningLevel === "watch") {
      return {
        alert: true,
        level: "watch",
        reason: `Heat advisory (${weather.feelsLike}°F feels like)`,
      };
    }

    // High temperature threshold
    if (weather.feelsLike >= 95) {
      return {
        alert: true,
        level: "caution",
        reason: `High heat index (${weather.feelsLike}°F feels like)`,
      };
    }

    return { alert: false };
  }

  /**
   * Generate personalized weather alert using MedGemma
   */
  async generatePersonalizedAlert(patient, weather, heatwave, alertLevel) {
    try {
      // Check if patient has high-risk conditions
      const highRiskFactors = this.assessPatientRisk(patient, weather);

      // Use MedGemma for personalized weather alert
      const weatherAlert = await medgemmaService.generateWeatherAlert(
        patient,
        weather,
        alertLevel.level
      );

      // Start with the AI-generated message
      let alertMessage = weatherAlert.message;

      // Add risk factors if identified
      if (weatherAlert.riskFactors && weatherAlert.riskFactors.length > 0) {
        alertMessage += `\n\n⚠️ *Your risks*: ${weatherAlert.riskFactors.join(
          ", "
        )}`;
      }

      // Add emergency guidance for severe alerts
      if (
        alertLevel.level === "emergency" ||
        weatherAlert.urgency === "emergency"
      ) {
        alertMessage += `\n\n🆘 Call 911 if: confusion, fainting, trouble breathing`;
      }

      return alertMessage;
    } catch (error) {
      console.error("❌ Error generating personalized alert:", error);

      // Fallback to basic alert
      return this.generateBasicAlert(patient, weather, heatwave, alertLevel);
    }
  }

  /**
   * Generate basic weather alert (fallback)
   */
  generateBasicAlert(patient, weather, heatwave, alertLevel) {
    let message = "";

    if (alertLevel.level === "emergency") {
      message = `🚨 *HEAT EMERGENCY*\n${weather.city}: ${weather.feelsLike}°F feels like\n\nSTAY INDOORS with AC. Avoid all outdoor activity. Check on elderly/vulnerable. Call 911 for heat emergencies.`;
    } else if (alertLevel.level === "warning") {
      message = `⚠️ *HEAT WARNING*\n${weather.city}: ${weather.feelsLike}°F feels like\n\nLimit outdoor activity 11am-6pm. Stay hydrated. Use cooling centers if needed. Monitor for heat symptoms.`;
    } else {
      message = `🌡️ *Heat Advisory*\n${weather.city}: ${weather.feelsLike}°F feels like\n\nIncrease water intake. Take frequent breaks outdoors. Stay in shade/AC when possible.`;
    }

    // Add age-specific advice
    if (patient.age >= 65) {
      message += `\n\n👴 *Senior Alert*: You're at higher risk. Stay cool and hydrated.`;
    }

    return message;
  }

  /**
   * Assess patient's heat-related risk factors
   */
  assessPatientRisk(patient, weather) {
    const riskFactors = [];

    if (patient.age >= 65) riskFactors.push("Age 65+");
    if (patient.age >= 80) riskFactors.push("Age 80+");
    if (patient.isPregnant) riskFactors.push("Pregnancy");

    // Check chronic conditions
    const conditions = this.parseJsonField(patient.chronicConditions);
    const highRiskConditions = [
      "diabetes",
      "heart disease",
      "kidney disease",
      "copd",
    ];
    conditions.forEach((condition) => {
      if (
        highRiskConditions.some((risk) =>
          condition.toLowerCase().includes(risk)
        )
      ) {
        riskFactors.push("Chronic condition");
      }
    });

    // Check medications that increase heat sensitivity
    const medications = this.parseJsonField(patient.medications);
    const heatSensitiveMeds = ["diuretic", "beta blocker", "ace inhibitor"];
    medications.forEach((med) => {
      if (
        heatSensitiveMeds.some((sensitive) =>
          med.toLowerCase().includes(sensitive)
        )
      ) {
        riskFactors.push("Heat-sensitive medication");
      }
    });

    return [...new Set(riskFactors)]; // Remove duplicates
  }

  /**
   * Log weather alert to database
   */
  async logWeatherAlert(patient, weather, heatwave, message) {
    try {
      await this.prisma.message.create({
        data: {
          from: "system",
          to: patient.phoneNumber,
          body: message,
          direction: "outgoing",
          messageType: "weather_alert",
          status: "queued",
        },
      });
    } catch (error) {
      console.error("❌ Failed to log weather alert:", error);
    }
  }

  /**
   * Group patients by ZIP code for efficient processing
   */
  groupPatientsByZip(patients) {
    const groups = {};

    patients.forEach((patient) => {
      if (!groups[patient.zipcode]) {
        groups[patient.zipcode] = [];
      }
      groups[patient.zipcode].push(patient);
    });

    return groups;
  }

  /**
   * Utilities
   */
  parseJsonField(jsonString) {
    if (!jsonString) return [];
    try {
      return JSON.parse(jsonString);
    } catch {
      return [];
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.getNextRunTime(),
    };
  }

  getNextRunTime() {
    if (!this.lastRun) return "Not scheduled";

    const next = new Date(this.lastRun);
    next.setMinutes(next.getMinutes() + 30); // Run every 30 minutes
    return next;
  }
}

module.exports = new WeatherMonitor();
