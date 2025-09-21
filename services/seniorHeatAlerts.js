// Senior Heat Alert System - Focused on senior citizen safety during heat waves
const weatherService = require('./weatherService');
const { scheduleWeatherAlertCheckin } = require('../queue');

class SeniorHeatAlerts {
  constructor() {
    // Senior-specific thresholds (more conservative)
    this.SENIOR_HEAT_THRESHOLD = 90; // °F feels like (lower than general population)
    this.SENIOR_EXTREME_THRESHOLD = 100; // °F feels like
    this.SENIOR_AGE_CUTOFF = 65;

    // Check-in frequencies for seniors during heat events
    this.SENIOR_CHECKIN_INTERVALS = {
      extreme: 15, // Every 15 minutes during extreme heat
      high: 30,    // Every 30 minutes during heat waves  
      warning: 60, // Every hour during heat warnings
      normal: 240  // Every 4 hours normal monitoring
    };
  }

  /**
   * Generate senior-focused heat alert
   */
  async generateSeniorHeatAlert(zipcode, seniorData) {
    try {
      const heatWaveData = await weatherService.detectHeatWave(zipcode);
      const { firstName, age, chronicConditions, medications } = seniorData;
      
      // Assess senior's heat vulnerability
      const riskLevel = this.assessSeniorHeatRisk(heatWaveData, seniorData);
      
      let message = `Hi ${firstName}! `;
      let urgency = 'routine';
      let checkInMinutes = this.SENIOR_CHECKIN_INTERVALS.normal;

      if (heatWaveData.maxFeelsLike >= this.SENIOR_EXTREME_THRESHOLD) {
        // EXTREME HEAT - Immediate action needed
        message += `🚨 EXTREME HEAT EMERGENCY: ${heatWaveData.maxFeelsLike}°F in ZIP ${zipcode}!\n\n`;
        message += `💡 IMMEDIATE ACTIONS:\n`;
        message += `• Stay indoors with AC/fan\n`;
        message += `• Drink water every 15 mins\n`;
        message += `• Call 911 if dizzy/confused\n`;
        message += `• Have emergency contact ready`;
        
        urgency = 'emergency';
        checkInMinutes = this.SENIOR_CHECKIN_INTERVALS.extreme;
        
      } else if (heatWaveData.maxFeelsLike >= this.SENIOR_HEAT_THRESHOLD) {
        // HEAT WAVE - Enhanced precautions
        message += `⚠️ HEAT WAVE ALERT: ${heatWaveData.maxFeelsLike}°F feels like in ZIP ${zipcode}.\n\n`;
        message += `🛡️ SENIOR SAFETY PLAN:\n`;
        message += `• Stay cool indoors 11am-6pm\n`;
        message += `• Drink water hourly\n`;
        message += `• Check on neighbors\n`;
        message += `• Wear light colors if outside`;
        
        urgency = 'high';
        checkInMinutes = this.SENIOR_CHECKIN_INTERVALS.high;
        
      } else {
        // NORMAL CONDITIONS - Routine check
        message += `🌤️ Weather check for ZIP ${zipcode}: ${heatWaveData.maxFeelsLike}°F expected today.\n\n`;
        message += `☀️ DAILY REMINDERS:\n`;
        message += `• Stay hydrated\n`;
        message += `• Take breaks in shade\n`;
        message += `• Have a great day!`;
        
        urgency = 'routine';
        checkInMinutes = this.SENIOR_CHECKIN_INTERVALS.normal;
      }

      // Add medication warnings if applicable
      if (medications && medications.length > 0 && heatWaveData.maxFeelsLike >= this.SENIOR_HEAT_THRESHOLD) {
        message += `\n\n💊 NOTE: Heat may affect your medications. Stay extra cool!`;
      }

      return {
        message: this.formatForSMS(message),
        urgency,
        riskLevel,
        checkInMinutes,
        heatWaveData,
        seniorSpecific: true
      };
      
    } catch (error) {
      console.error(`Senior heat alert error for ${zipcode}:`, error);
      return this.getSafetyFallbackMessage(seniorData);
    }
  }

  /**
   * Generate health check-in message for seniors during heat events
   */
  generateSeniorHealthCheckin(heatWaveData, seniorData) {
    const { firstName, age } = seniorData;
    const feelsLike = heatWaveData.maxFeelsLike;
    
    let message = `Hi ${firstName}! Heat safety check (${feelsLike}°F feels like):\n\n`;
    
    if (feelsLike >= this.SENIOR_EXTREME_THRESHOLD) {
      // Emergency check-in - critical symptoms
      message += `🚨 URGENT CHECK-IN:\n`;
      message += `Are you safe and cool right now?\n\n`;
      message += `Reply:\n`;
      message += `1 = Yes, I'm cool & safe\n`;
      message += `2 = I'm warm but OK\n`;
      message += `3 = I need help/feel unwell`;
      
    } else if (feelsLike >= this.SENIOR_HEAT_THRESHOLD) {
      // Heat wave check-in - preventive
      message += `⚠️ HEAT WAVE CHECK-IN:\n`;
      message += `How are you feeling in this heat?\n\n`;
      message += `Reply:\n`;
      message += `1 = Great, staying cool\n`;
      message += `2 = A little warm\n`;
      message += `3 = Not feeling well`;
      
    } else {
      // Routine senior check-in
      message += `☀️ DAILY WELLNESS CHECK:\n`;
      message += `How are you feeling today?\n\n`;
      message += `Reply:\n`;
      message += `1 = Feeling great\n`;
      message += `2 = Doing OK\n`;
      message += `3 = Could be better`;
    }

    return this.formatForSMS(message);
  }

  /**
   * Assess senior's specific heat vulnerability
   */
  assessSeniorHeatRisk(heatWaveData, seniorData) {
    const { age, chronicConditions, medications } = seniorData;
    let riskScore = 0;

    // Base risk from age
    if (age >= 75) riskScore += 3;
    else if (age >= 65) riskScore += 2;

    // Risk from health conditions
    const highRiskConditions = ['heart_disease', 'diabetes', 'kidney_disease', 'copd'];
    if (chronicConditions) {
      riskScore += chronicConditions.filter(condition => 
        highRiskConditions.includes(condition)
      ).length;
    }

    // Risk from medications
    if (medications && medications.length > 2) riskScore += 1;

    // Risk from heat level
    if (heatWaveData.maxFeelsLike >= this.SENIOR_EXTREME_THRESHOLD) riskScore += 3;
    else if (heatWaveData.maxFeelsLike >= this.SENIOR_HEAT_THRESHOLD) riskScore += 2;

    // Determine risk level
    if (riskScore >= 6) return 'critical';
    if (riskScore >= 4) return 'high';
    if (riskScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Schedule senior-specific health check-ins during heat events
   */
  async scheduleSeniorHeatMonitoring(phoneNumber, zipcode, seniorData) {
    try {
      const heatWaveData = await weatherService.detectHeatWave(zipcode);
      
      // Only schedule intensive monitoring during heat events
      if (heatWaveData.maxFeelsLike >= this.SENIOR_HEAT_THRESHOLD) {
        const alert = await this.generateSeniorHeatAlert(zipcode, seniorData);
        
        // Schedule check-ins based on heat severity
        await scheduleWeatherAlertCheckin(phoneNumber, {
          urgency: alert.urgency,
          type: 'senior_heat_monitoring',
          message: `Senior heat monitoring active for ${zipcode}`
        }, seniorData);
        
        console.log(`🔔 Scheduled senior heat monitoring for ${seniorData.firstName} (${phoneNumber}) - ${alert.urgency} level`);
        
        return alert;
      }
      
      return null; // No special monitoring needed
      
    } catch (error) {
      console.error(`Error scheduling senior heat monitoring:`, error);
      throw error;
    }
  }

  /**
   * Process senior's health check-in response
   */
  processSeniorHealthResponse(response, heatWaveData, seniorData) {
    const { firstName } = seniorData;
    const feelsLike = heatWaveData.maxFeelsLike;
    
    let responseMessage = '';
    let nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.normal;
    let urgency = 'routine';

    switch (response) {
      case '1': // Feeling good
        responseMessage = `Wonderful ${firstName}! Keep staying cool and hydrated. `;
        if (feelsLike >= this.SENIOR_HEAT_THRESHOLD) {
          responseMessage += `Continue avoiding outdoor activity during peak heat (11am-6pm).`;
          nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.high;
        } else {
          nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.normal;
        }
        urgency = 'routine';
        break;

      case '2': // Somewhat warm/OK
        responseMessage = `Thanks for the update ${firstName}. Stay in the coolest room, drink water frequently. `;
        if (feelsLike >= this.SENIOR_EXTREME_THRESHOLD) {
          responseMessage += `Consider calling a family member to check on you.`;
          nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.extreme;
          urgency = 'high';
        } else {
          nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.high;
          urgency = 'medium';
        }
        break;

      case '3': // Not feeling well
        responseMessage = `${firstName}, I'm concerned about you. `;
        if (feelsLike >= this.SENIOR_EXTREME_THRESHOLD) {
          responseMessage += `🚨 PLEASE CALL 911 if you feel dizzy, confused, or nauseous. Get to AC immediately and have someone check on you.`;
          urgency = 'emergency';
          nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.extreme;
        } else {
          responseMessage += `Move to the coolest place available, drink cool water, and consider contacting your doctor or a family member.`;
          urgency = 'high';
          nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.high;
        }
        break;

      default:
        responseMessage = `${firstName}, I didn't understand your response. Please reply 1, 2, or 3 to let me know how you're feeling.`;
        nextCheckInMinutes = this.SENIOR_CHECKIN_INTERVALS.high;
        urgency = 'medium';
    }

    return {
      message: this.formatForSMS(responseMessage),
      nextCheckInMinutes,
      urgency,
      escalate: response === '3' && feelsLike >= this.SENIOR_EXTREME_THRESHOLD
    };
  }

  /**
   * Safety fallback message when systems fail
   */
  getSafetyFallbackMessage(seniorData) {
    const { firstName } = seniorData;
    return {
      message: this.formatForSMS(
        `Hi ${firstName}! Weather system unavailable. SAFETY REMINDER: Stay indoors during hot weather, drink water hourly, and call 911 if you feel unwell. Stay safe!`
      ),
      urgency: 'routine',
      riskLevel: 'unknown',
      checkInMinutes: this.SENIOR_CHECKIN_INTERVALS.normal,
      seniorSpecific: true
    };
  }

  /**
   * Format message for SMS (160 character limit consideration)
   */
  formatForSMS(message) {
    // For seniors, we prioritize clarity over character limits
    // But still try to keep it reasonable
    if (message.length > 300) {
      // Only truncate very long messages, preserve critical safety info
      const lines = message.split('\n');
      let truncated = '';
      for (const line of lines) {
        if ((truncated + line).length > 280) break;
        truncated += line + '\n';
      }
      return truncated.trim() + '...';
    }
    return message;
  }
}

module.exports = new SeniorHeatAlerts();
