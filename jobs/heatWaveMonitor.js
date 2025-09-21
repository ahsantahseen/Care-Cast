// Heat Wave Monitoring Cron Job
// Focuses on senior citizens (65+) with ZIP-based heat alerts

const weatherService = require("../services/weatherService");
const seniorHeatAlerts = require("../services/seniorHeatAlerts");
const { getPrismaClient, getTwilioClient } = require("../services");

class HeatWaveMonitor {
  constructor() {
    this.prisma = getPrismaClient();
    this.twilio = getTwilioClient();
    this.sentAlerts = new Map(); // Track sent alerts to avoid duplicates
  }

  /**
   * Main heat wave monitoring job
   */
  async checkAllUsers() {
    try {
      console.log("🌡️ Starting heat wave monitoring check...");

      // Get senior citizens (65+) with zip codes - primary focus
      const users = await this.prisma.patient.findMany({
        where: {
          zipcode: {
            not: "",
          },
          phoneNumber: {
            not: "",
          },
          // Prioritize seniors but include all users for heat safety
          age: {
            gte: 0, // Include all ages, but we'll prioritize seniors in processing
          },
        },
        select: {
          id: true,
          firstName: true,
          phoneNumber: true,
          zipcode: true,
          age: true,
          isPregnant: true,
          smoker: true,
          chronicConditions: true,
          preExistingConditions: true,
          medications: true,
        },
      });

      console.log(`📋 Checking weather for ${users.length} users...`);

      let alertsSent = 0;
      let errorsCount = 0;

      // Group users by zipcode to reduce API calls
      const usersByZip = this.groupUsersByZipcode(users);

      for (const [zipcode, zipUsers] of Object.entries(usersByZip)) {
        try {
          // Check for heat wave in this zipcode
          const heatWaveData = await weatherService.detectHeatWave(zipcode);

          console.log(
            `📍 ${zipcode} (${zipUsers.length} users): ${heatWaveData.description}`
          );

          // Send senior-focused alerts for heat conditions
          // Seniors get alerts at lower thresholds (90°F vs 95°F)
          const seniorUsers = zipUsers.filter((user) => user.age >= 65);
          const otherUsers = zipUsers.filter((user) => user.age < 65);

          // Priority 1: Send senior-specific alerts
          for (const senior of seniorUsers) {
            try {
              const alertSent = await this.sendSeniorHeatAlert(
                senior,
                heatWaveData
              );
              if (alertSent) {
                alertsSent++;
                console.log(
                  `🎯 Senior alert sent to ${senior.firstName} (age ${senior.age})`
                );
              }
            } catch (error) {
              console.error(
                `Error sending senior alert to ${senior.firstName}:`,
                error.message
              );
              errorsCount++;
            }
          }

          // Priority 2: Send AI-powered alerts for all users during significant conditions
          if (heatWaveData.isHeatWave && heatWaveData.alertLevel !== "none") {
            for (const user of otherUsers) {
              try {
                const alertSent = await this.sendAdvancedWeatherAlert(
                  user,
                  heatWaveData
                );
                if (alertSent) {
                  alertsSent++;
                }
              } catch (error) {
                console.error(
                  `Error sending AI alert to user ${user.id}:`,
                  error.message
                );
                errorsCount++;
              }
            }
          }

          // Small delay between zipcodes to be nice to the API
          await this.delay(1000);
        } catch (error) {
          console.error(
            `Error checking weather for zipcode ${zipcode}:`,
            error.message
          );
          errorsCount++;
        }
      }

      console.log(`✅ Heat wave monitoring complete:`);
      console.log(`   📨 Alerts sent: ${alertsSent}`);
      console.log(`   ❌ Errors: ${errorsCount}`);
      console.log(`   📍 Zipcodes checked: ${Object.keys(usersByZip).length}`);

      return {
        alertsSent,
        errorsCount,
        zipcodesChecked: Object.keys(usersByZip).length,
      };
    } catch (error) {
      console.error("❌ Heat wave monitoring job failed:", error.message);
      throw error;
    }
  }

  /**
   * Send senior-specific heat wave alert (lower thresholds, health-focused)
   */
  async sendSeniorHeatAlert(senior, heatWaveData) {
    try {
      // Check for duplicate alerts
      const alertKey = `senior-${senior.zipcode}-${new Date().toDateString()}`;
      if (this.sentAlerts.has(alertKey)) {
        console.log(
          `⏭️ Skipping duplicate senior alert for ${senior.firstName}`
        );
        return false;
      }

      // Use senior-specific alert system
      const seniorAlert = await seniorHeatAlerts.generateSeniorHeatAlert(
        senior.zipcode,
        senior
      );

      // Send WhatsApp message
      const message = await this.twilio.messages.create({
        body: seniorAlert.message,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${senior.phoneNumber}`,
        statusCallback: process.env.BASE_URL
          ? `${process.env.BASE_URL}/webhook/status`
          : undefined,
      });

      console.log(
        `📱 Senior heat alert sent to ${senior.firstName} (age ${senior.age}): ${seniorAlert.urgency} level`
      );

      // Schedule health check-ins during heat events
      if (
        seniorAlert.urgency === "emergency" ||
        seniorAlert.urgency === "high"
      ) {
        await seniorHeatAlerts.scheduleSeniorHeatMonitoring(
          senior.phoneNumber,
          senior.zipcode,
          senior
        );
      }

      // Log the senior alert
      await this.logHeatWaveAlert(
        message.sid,
        senior,
        seniorAlert,
        "senior_heat_alert"
      );

      // Mark as sent
      this.sentAlerts.add(alertKey);

      return true;
    } catch (error) {
      console.error(
        `Failed to send senior heat alert to ${senior.firstName}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Send heat wave alert to a specific user (general population)
   */
  async sendHeatWaveAlert(user, heatWaveData) {
    try {
      // Check if we already sent an alert for this heat wave
      const alertKey = `${user.zipcode}-${
        heatWaveData.alertLevel
      }-${new Date().toDateString()}`;

      if (this.sentAlerts.has(alertKey)) {
        console.log(
          `⏭️  Skipping duplicate alert for user ${user.firstName} in ${user.zipcode}`
        );
        return false;
      }

      // Generate personalized alert message
      const alert = weatherService.generateHeatWaveAlert(heatWaveData, user);

      // Send WhatsApp message
      const message = await this.twilio.messages.create({
        body: alert.message,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${user.phoneNumber}`,
        statusCallback: process.env.BASE_URL
          ? `${process.env.BASE_URL}/webhook/status`
          : undefined,
      });

      console.log(
        `📱 Heat wave alert sent to ${user.firstName} (${
          user.zipcode
        }): ${alert.message.substring(0, 50)}...`
      );

      // Log the alert in database
      await this.logHeatWaveAlert(user, heatWaveData, alert, message.sid);

      // Mark as sent to avoid duplicates
      this.sentAlerts.set(alertKey, true);

      return true;
    } catch (error) {
      console.error(
        `Failed to send heat wave alert to ${user.firstName}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Send advanced AI-powered weather alert to user
   */
  async sendAdvancedWeatherAlert(user, heatWaveData) {
    try {
      // Check for duplicate alerts
      const alertKey = `ai-${user.zipcode}-${new Date().toDateString()}`;
      if (this.sentAlerts.has(alertKey)) {
        console.log(`⏭️ Skipping duplicate AI alert for user ${user.id}`);
        return false;
      }

      // Generate AI-powered weather alert
      const aiAlert = await weatherService.generateAdvancedWeatherAlert(
        user.zipcode,
        user
      );

      // Send WhatsApp message
      const message = await this.twilio.messages.create({
        body: aiAlert.message,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${user.phoneNumber}`,
        statusCallback: process.env.BASE_URL
          ? `${process.env.BASE_URL}/webhook/status`
          : undefined,
      });

      console.log(
        `🤖📱 AI weather alert sent to ${user.firstName}: ${aiAlert.urgency} level (AI: ${aiAlert.aiGenerated})`
      );

      // Log the alert with AI flag
      await this.logHeatWaveAlert(
        user,
        heatWaveData,
        aiAlert,
        message.sid,
        aiAlert.aiGenerated ? "ai_weather_alert" : "weather_alert"
      );

      // Mark as sent
      this.sentAlerts.set(alertKey, true);

      return true;
    } catch (error) {
      console.error(
        `Failed to send AI weather alert to ${user.firstName}:`,
        error.message
      );
      // Fallback to regular alert
      return await this.sendHeatWaveAlert(user, heatWaveData);
    }
  }

  /**
   * Log heat wave alert in database
   */
  async logHeatWaveAlert(
    user,
    heatWaveData,
    alert,
    messageSid,
    alertType = "heat_wave_alert"
  ) {
    try {
      await this.prisma.message.create({
        data: {
          patientId: user.id,
          phoneNumber: user.phoneNumber,
          direction: "outbound",
          body: alert.message,
          messageSid: messageSid,
          messageType: alertType,
          metadata: JSON.stringify({
            alertLevel: heatWaveData.alertLevel,
            maxFeelsLike: heatWaveData.maxFeelsLike,
            daysAffected: heatWaveData.daysAffected,
            city: heatWaveData.city,
            urgency: alert.urgency,
            riskFactors: alert.riskFactors,
            aiGenerated: alert.aiGenerated || false,
            weatherContext: alert.weatherContext || {},
          }),
        },
      });
    } catch (error) {
      console.error("Failed to log heat wave alert:", error.message);
    }
  }

  /**
   * Group users by zipcode to optimize API calls
   */
  groupUsersByZipcode(users) {
    const grouped = {};

    for (const user of users) {
      if (!user.zipcode) continue;

      if (!grouped[user.zipcode]) {
        grouped[user.zipcode] = [];
      }

      grouped[user.zipcode].push(user);
    }

    return grouped;
  }

  /**
   * Delay helper for rate limiting
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up old alert tracking (run once per day)
   */
  cleanupAlertTracking() {
    this.sentAlerts.clear();
    console.log("🧹 Cleaned up heat wave alert tracking");
  }

  /**
   * Get heat wave monitoring stats
   */
  async getMonitoringStats() {
    try {
      const totalUsers = await this.prisma.patient.count({
        where: {
          zipcode: {
            not: "",
          },
          phoneNumber: {
            not: "",
          },
        },
      });

      const uniqueZipcodes = await this.prisma.patient.findMany({
        where: {
          zipcode: {
            not: "",
          },
        },
        select: {
          zipcode: true,
        },
        distinct: ["zipcode"],
      });

      const recentAlerts = await this.prisma.message.count({
        where: {
          messageType: "heat_wave_alert",
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      return {
        totalUsers,
        uniqueZipcodes: uniqueZipcodes.length,
        recentAlerts,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error getting monitoring stats:", error.message);
      return null;
    }
  }
}

module.exports = HeatWaveMonitor;
