const { Worker } = require("bullmq");
const {
  getPrismaClient,
  getTwilioClient,
  getRedisConnection,
  getWhatsAppConfig,
} = require("./services");
const HeatWaveMonitor = require("./jobs/heatWaveMonitor");

const connection = getRedisConnection();
const prisma = getPrismaClient();
const twilio = getTwilioClient();
const whatsappConfig = getWhatsAppConfig();

// WhatsApp message worker
const whatsappWorker = new Worker(
  "whatsapp-queue",
  async (job) => {
    const { to, message, mediaUrl } = job.data;

    console.log(`[WhatsApp Worker] Sending message to ${to}: ${message}`);

    try {
      // Prepare WhatsApp message options
      const messageOptions = {
        body: message,
        from: whatsappConfig.from,
        to: whatsappConfig.formatPhoneNumber(to),
        // Status callback URL for delivery tracking
        statusCallback: `${
          process.env.BASE_URL || "https://24a3ffeedf11.ngrok-free.app"
        }/twilio/status-webhook`,
      };

      // Add media if provided
      if (mediaUrl) {
        messageOptions.mediaUrl = [mediaUrl];
      }

      // Send WhatsApp message via Twilio
      const twilioMessage = await twilio.messages.create(messageOptions);

      console.log(
        `[WhatsApp Worker] Message sent successfully. SID: ${twilioMessage.sid}`
      );

      // Log outgoing message to database
      await prisma.message.create({
        data: {
          from: whatsappConfig.from,
          to: messageOptions.to,
          body: message,
          direction: "outgoing",
          messageType: "whatsapp",
          messageSid: twilioMessage.sid,
          status: twilioMessage.status,
        },
      });

      return {
        status: "sent",
        messageSid: twilioMessage.sid,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[WhatsApp Worker] Error sending message:`, error);

      // Log failed message attempt
      await prisma.message.create({
        data: {
          from: whatsappConfig.from,
          to: whatsappConfig.formatPhoneNumber(to),
          body: message,
          direction: "outgoing",
          messageType: "whatsapp",
          status: "failed",
          errorMessage: error.message,
        },
      });

      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
    removeOnComplete: 100,
    removeOnFail: 50,
  }
);

// Health monitoring cron worker
const healthCronWorker = new Worker(
  "health-cron-queue",
  async (job) => {
    const { phoneNumber, checkType } = job.data;

    console.log(`[Health Worker] Processing ${job.name} for ${phoneNumber}`);

    if (job.name === "daily_health_check") {
      return await processDailyHealthCheck(job);
    } else if (job.name === "daily-health-checkup") {
      return await processDailyRoutineCheckup(job);
    } else if (job.name === "weather-monitoring") {
      return await processWeatherMonitoring(job);
    } else if (job.name === "heat-wave-monitoring") {
      return await processHeatWaveMonitoring(job);
    } else if (job.name === "ai_symptom") {
      return await processAISymptomCheck(job);
    } else if (job.name === "weather-alert-checkin") {
      return await processWeatherAlertCheckin(job);
    } else if (job.name === "recurring-health-monitor") {
      return await processRecurringHealthMonitor(job);
    } else {
      // Legacy symptom monitoring (backwards compatibility)
      return await processLegacySymptomCheck(job);
    }
  },
  {
    connection,
    concurrency: 3,
    removeOnComplete: 50,
    removeOnFail: 25,
  }
);

// Process daily health check
async function processDailyHealthCheck(job) {
  const { phoneNumber, patientData } = job.data;

  try {
    const patientName = patientData.firstName || "there";

    const dailyMessage =
      `Good morning ${patientName}! 🌅\n\n` +
      `📊 *Daily Health Check*\n\n` +
      `How are you feeling today? Please reply:\n\n` +
      `1️⃣ Excellent - feeling great\n` +
      `2️⃣ Good - normal energy\n` +
      `3️⃣ Fair - a bit tired\n` +
      `4️⃣ Poor - not feeling well\n` +
      `5️⃣ Urgent - need medical attention\n\n` +
      `🌡️ Today's weather alerts and health tips will follow!`;

    // Send daily check message
    await twilio.messages.create({
      body: dailyMessage,
      from: whatsappConfig.from,
      to: whatsappConfig.formatPhoneNumber(phoneNumber),
      statusCallback: `${
        process.env.BASE_URL || "https://24a3ffeedf11.ngrok-free.app"
      }/twilio/status-webhook`,
    });

    // Log the message
    await prisma.message.create({
      data: {
        from: whatsappConfig.from,
        to: whatsappConfig.formatPhoneNumber(phoneNumber),
        body: dailyMessage,
        direction: "outgoing",
        messageType: "daily_health_check",
      },
    });

    console.log(
      `[Daily Health] Sent daily check to ${patientName} (${phoneNumber})`
    );

    return {
      status: "sent",
      type: "daily_health_check",
      recipient: phoneNumber,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      `[Daily Health] Error processing daily check for ${phoneNumber}:`,
      error
    );
    throw error;
  }
}

// Process AI symptom monitoring check
async function processAISymptomCheck(job) {
  const {
    phoneNumber,
    patientData,
    riskLevel,
    checkNumber,
    totalChecks,
    analysisSnapshot,
  } = job.data;

  try {
    const patientName = patientData.firstName || "there";

    let checkMessage;

    if (riskLevel === "CRITICAL") {
      checkMessage =
        `🚨 *CRITICAL MONITORING - Check ${checkNumber}/${totalChecks}*\n\n` +
        `Hi ${patientName}, this is an urgent health check.\n\n` +
        `How are you feeling right now?\n\n` +
        `⚡ Reply immediately:\n` +
        `1️⃣ Much better\n` +
        `2️⃣ About the same\n` +
        `3️⃣ Getting worse\n` +
        `🚨 EMERGENCY - Call 911 if severe!`;
    } else if (riskLevel === "HIGH") {
      checkMessage =
        `⚠️ *HIGH RISK MONITORING - Check ${checkNumber}/${totalChecks}*\n\n` +
        `Hi ${patientName}, checking on your condition.\n\n` +
        `How are your symptoms?\n\n` +
        `Please reply:\n` +
        `1️⃣ Much better\n` +
        `2️⃣ Slightly better\n` +
        `3️⃣ About the same\n` +
        `4️⃣ Getting worse\n` +
        `5️⃣ Need medical help`;
    } else {
      checkMessage =
        `💙 *Health Check - ${checkNumber}/${totalChecks}*\n\n` +
        `Hi ${patientName}, how are you feeling?\n\n` +
        `Please reply:\n` +
        `1️⃣ Much better\n` +
        `2️⃣ Better\n` +
        `3️⃣ About the same\n` +
        `4️⃣ A bit worse\n` +
        `5️⃣ Much worse`;
    }

    // Send the check-in message
    await twilio.messages.create({
      body: checkMessage,
      from: whatsappConfig.from,
      to: whatsappConfig.formatPhoneNumber(phoneNumber),
      statusCallback: `${
        process.env.BASE_URL || "https://24a3ffeedf11.ngrok-free.app"
      }/twilio/status-webhook`,
    });

    // Log the message
    await prisma.message.create({
      data: {
        from: whatsappConfig.from,
        to: whatsappConfig.formatPhoneNumber(phoneNumber),
        body: checkMessage,
        direction: "outgoing",
        messageType: "ai_symptom_check",
        errorMessage: JSON.stringify({ riskLevel, checkNumber, totalChecks }),
      },
    });

    console.log(
      `[AI Monitoring] Sent ${riskLevel} risk check ${checkNumber}/${totalChecks} to ${patientName}`
    );

    return {
      status: "sent",
      type: "ai_symptom_check",
      riskLevel,
      checkNumber,
      totalChecks,
      recipient: phoneNumber,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      `[AI Monitoring] Error processing symptom check for ${phoneNumber}:`,
      error
    );
    throw error;
  }
}

// Process weather alert check-in
async function processWeatherAlertCheckin(job) {
  const { phoneNumber, waveStatus, patientData, intervalMinutes, checkNumber } =
    job.data;

  try {
    console.log(
      `🔔 [Weather Alert] Sending check-in to ${phoneNumber} (${waveStatus.type})`
    );

    // Import services
    const weatherService = require("./services/weatherService");
    const seniorHeatAlerts = require("./services/seniorHeatAlerts");
    const heatcareAI = require("./services/heatcareAI");

    // Generate age-appropriate check-in message
    let checkInMessage;
    if (patientData.age >= 65) {
      // Use senior-specific health check-in
      const heatWaveData = await weatherService.detectHeatWave(
        patientData.zipcode
      );
      checkInMessage = seniorHeatAlerts.generateSeniorHealthCheckin(
        heatWaveData,
        patientData
      );
      console.log(
        `👴 Senior-specific check-in for ${patientData.firstName} (age ${patientData.age})`
      );
    } else {
      // Use general check-in message
      checkInMessage = heatcareAI.generateCheckInMessage(
        waveStatus,
        patientData
      );
    }

    // Send check-in message
    await whatsappQueue.add("send-whatsapp", {
      to: phoneNumber,
      message: checkInMessage,
    });

    // Schedule next check-in if alert is still active
    const nextCheckNumber = (checkNumber || 1) + 1;
    if (waveStatus.urgency === "emergency" || waveStatus.urgency === "high") {
      await healthCronQueue.add(
        "weather-alert-checkin",
        {
          phoneNumber,
          waveStatus,
          patientData,
          intervalMinutes,
          checkNumber: nextCheckNumber,
          startTime: job.data.startTime,
          tag: "weather-alert",
        },
        {
          delay: intervalMinutes * 60 * 1000,
          jobId: `weather-alert-${phoneNumber}`,
        }
      );
    }

    console.log(
      `✅ [Weather Alert] Sent check-in ${nextCheckNumber} to ${patientData.firstName}`
    );

    return {
      status: "sent",
      type: "weather_alert_checkin",
      alertType: waveStatus.type,
      urgency: waveStatus.urgency,
      checkNumber: nextCheckNumber,
      recipient: phoneNumber,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      `❌ [Weather Alert] Error sending check-in to ${phoneNumber}:`,
      error
    );
    throw error;
  }
}

// Process daily routine checkup (scheduled at 9 AM every day)
async function processDailyRoutineCheckup(job) {
  const { phoneNumber, checkTime, tag } = job.data;

  try {
    console.log(`[Daily Routine] Processing daily checkup for ${phoneNumber}`);

    const dailyMessage =
      `🌅 *Good Morning!* Daily Health Check\n\n` +
      `How are you feeling today? This is your routine daily check-in.\n\n` +
      `Please reply:\n` +
      `1️⃣ Excellent - Great day ahead!\n` +
      `2️⃣ Good - Feeling normal\n` +
      `3️⃣ Okay - A bit tired\n` +
      `4️⃣ Not great - Not feeling well\n` +
      `5️⃣ Poor - Need medical attention\n\n` +
      `💡 *Remember:* This is separate from any symptom monitoring you may also receive.\n` +
      `Have a wonderful day! 🌞`;

    // Send the daily checkup message
    await twilio.messages.create({
      body: dailyMessage,
      from: whatsappConfig.from,
      to: whatsappConfig.formatPhoneNumber(phoneNumber),
      statusCallback: `${
        process.env.BASE_URL || "https://24a3ffeedf11.ngrok-free.app"
      }/twilio/status-webhook`,
    });

    // Log the message
    await prisma.message.create({
      data: {
        from: whatsappConfig.from,
        to: whatsappConfig.formatPhoneNumber(phoneNumber),
        body: dailyMessage,
        direction: "outgoing",
        messageType: "daily_routine_checkup",
      },
    });

    console.log(`✅ [Daily Routine] Sent daily checkup to ${phoneNumber}`);

    return {
      status: "sent",
      type: "daily_routine_checkup",
      tag: "daily",
      recipient: phoneNumber,
      timestamp: new Date().toISOString(),
      nextCheckup: "Tomorrow at 9:00 AM",
    };
  } catch (error) {
    console.error(
      `❌ [Daily Routine] Error processing daily checkup for ${phoneNumber}:`,
      error
    );
    throw error;
  }
}

// Process recurring health monitoring (one job at a time, reschedules itself)
async function processRecurringHealthMonitor(job) {
  const {
    phoneNumber,
    symptom,
    riskLevel,
    intervalMinutes,
    checkNumber,
    startTime,
    tag,
  } = job.data;

  try {
    console.log(
      `[Recurring Monitor] Check #${checkNumber} for ${phoneNumber} (${riskLevel} risk, ${intervalMinutes}min interval) [${tag}]`
    );

    // Create monitoring message based on risk level
    let monitoringMessage;

    if (riskLevel === "emergency") {
      monitoringMessage =
        `🚨 *EMERGENCY MONITORING #${checkNumber}*\n\n` +
        `Hi! Critical health check - how are you feeling RIGHT NOW?\n\n` +
        `Reply:\n` +
        `1️⃣ Much better\n` +
        `2️⃣ About the same\n` +
        `3️⃣ Getting worse\n` +
        `🚨 Call 911 if severe!`;
    } else if (riskLevel === "critical") {
      monitoringMessage =
        `🔴 *CRITICAL CHECK #${checkNumber}*\n\n` +
        `Hi! How are your symptoms now?\n\n` +
        `Reply:\n` +
        `1️⃣ Much better\n` +
        `2️⃣ Slightly better\n` +
        `3️⃣ No change\n` +
        `4️⃣ Getting worse\n` +
        `5️⃣ Need help`;
    } else if (riskLevel === "high") {
      monitoringMessage =
        `🟠 *HIGH RISK CHECK #${checkNumber}*\n\n` +
        `Hi! Checking on your ${symptom} symptoms.\n\n` +
        `How do you feel?\n` +
        `1️⃣ Better\n` +
        `2️⃣ Same\n` +
        `3️⃣ Worse`;
    } else if (riskLevel === "medium") {
      monitoringMessage =
        `🟡 *HEALTH CHECK #${checkNumber}*\n\n` +
        `Hi! How are you feeling?\n\n` +
        `Reply: 1️⃣ Better  2️⃣ Same  3️⃣ Worse`;
    } else {
      // low
      monitoringMessage =
        `💙 *ROUTINE CHECK #${checkNumber}*\n\n` +
        `Hi! Quick health update?\n\n` +
        `Reply: 1️⃣ Good  2️⃣ Okay  3️⃣ Not great`;
    }

    // Send the monitoring message
    await twilio.messages.create({
      body: monitoringMessage,
      from: whatsappConfig.from,
      to: whatsappConfig.formatPhoneNumber(phoneNumber),
      statusCallback: `${
        process.env.BASE_URL || "https://24a3ffeedf11.ngrok-free.app"
      }/twilio/status-webhook`,
    });

    // Log the message
    await prisma.message.create({
      data: {
        from: whatsappConfig.from,
        to: whatsappConfig.formatPhoneNumber(phoneNumber),
        body: monitoringMessage,
        direction: "outgoing",
        messageType: "recurring_health_monitor",
      },
    });

    console.log(
      `✅ [Recurring Monitor] Sent ${riskLevel} check #${checkNumber} to ${phoneNumber}`
    );

    // Schedule the NEXT recurring check (this is how it continues)
    const { scheduleHealthCheckup } = require("./queue");
    await scheduleHealthCheckup(phoneNumber, symptom, riskLevel, tag);

    return {
      status: "sent_and_rescheduled",
      type: "recurring_health_monitor",
      tag,
      riskLevel,
      checkNumber,
      nextCheckIn: `${intervalMinutes} minutes`,
      recipient: phoneNumber,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      `❌ [Recurring Monitor] Error processing check for ${phoneNumber}:`,
      error
    );
    throw error;
  }
}

// Weather monitoring job processor
async function processWeatherMonitoring(job) {
  try {
    console.log(`🌡️ [Weather Monitor] Starting weather check job`);

    const weatherMonitor = require("./jobs/weatherMonitor");
    await weatherMonitor.runWeatherCheck();

    return {
      status: "completed",
      type: "weather_monitoring",
      timestamp: new Date().toISOString(),
      message: "Weather monitoring completed successfully",
    };
  } catch (error) {
    console.error(`❌ [Weather Monitor] Error:`, error);
    throw error;
  }
}

// Heat wave monitoring job
async function processHeatWaveMonitoring(job) {
  try {
    console.log(`🌡️ [Heat Wave Monitor] Starting heat wave monitoring job`);

    const heatWaveMonitor = new HeatWaveMonitor();
    const results = await heatWaveMonitor.checkAllUsers();

    return {
      status: "completed",
      type: "heat_wave_monitoring",
      timestamp: new Date().toISOString(),
      message: `Heat wave monitoring completed: ${results.alertsSent} alerts sent, ${results.errorsCount} errors`,
      stats: results,
    };
  } catch (error) {
    console.error(`❌ [Heat Wave Monitor] Error:`, error);
    throw error;
  }
}

// Legacy symptom check (backwards compatibility)
async function processLegacySymptomCheck(job) {
  const {
    phoneNumber,
    symptom,
    checkupNumber,
    totalCheckups,
    intervalMinutes,
  } = job.data;

  console.log(
    `[Health Cron] Checkup ${checkupNumber}/${totalCheckups} for ${phoneNumber} (${symptom} - ${intervalMinutes}min)`
  );

  try {
    // Create interactive message with buttons
    const interactiveMessage = createHealthCheckupMessage(
      symptom,
      checkupNumber,
      totalCheckups,
      intervalMinutes
    );

    // Send interactive WhatsApp message with quick reply buttons
    const messageOptions = {
      from: whatsappConfig.from,
      to: phoneNumber.startsWith("whatsapp:")
        ? phoneNumber
        : `whatsapp:${phoneNumber}`,
      body: interactiveMessage.body,
      // Twilio format for interactive messages
      contentSid: null, // For freeform interactive messages
      contentVariables: JSON.stringify({
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: interactiveMessage.body,
          },
          action: {
            buttons: interactiveMessage.buttons,
          },
          footer: {
            text: interactiveMessage.footer,
          },
        },
      }),
    };

    // Create poll-like interactive message
    const pollMessage = createHealthPollMessage(
      interactiveMessage,
      phoneNumber
    );
    const twilioMessage = await twilio.messages.create(pollMessage);

    // Log the checkup message
    await prisma.message.create({
      data: {
        from: whatsappConfig.from,
        to: messageOptions.to,
        body: interactiveMessage.body,
        direction: "outgoing",
        messageType: "whatsapp",
        messageSid: twilioMessage.sid,
        status: twilioMessage.status,
      },
    });

    return {
      status: "sent",
      checkupNumber,
      messageSid: twilioMessage.sid,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[Health Cron] Error sending checkup:`, error);
    throw error;
  }
}

// Function to create interactive health checkup messages with WhatsApp buttons
const createHealthCheckupMessage = (
  symptom,
  checkupNumber,
  totalCheckups,
  intervalMinutes
) => {
  const checkupMessages = {
    1: {
      title: "🕐 *1-Minute Health Check*",
      urgency: "immediate",
    },
    2: {
      title: "🕔 *5-Minute Health Check*",
      urgency: "high",
    },
    3: {
      title: "🕒 *15-Minute Health Check*",
      urgency: "medium",
    },
    4: {
      title: "🕐 *1-Hour Health Check*",
      urgency: "routine",
    },
  };

  const currentCheck = checkupMessages[checkupNumber] || checkupMessages[4];

  let bodyText = `${currentCheck.title}\n\n`;
  bodyText += `Following up on your "${symptom}" symptoms...\n\n`;

  if (checkupNumber === 1) {
    bodyText += "🚨 *IMMEDIATE CHECK* - How are you feeling RIGHT NOW?";
  } else if (checkupNumber === 2) {
    bodyText += "⚠️ *URGENT CHECK* - Has your condition improved?";
  } else if (checkupNumber === 3) {
    bodyText += "📋 *STATUS CHECK* - Please update us on your condition:";
  } else {
    bodyText += "📊 *ROUTINE CHECK* - How are you feeling now?";
  }

  if (checkupNumber < totalCheckups) {
    const nextInterval = [1, 5, 15, 60][checkupNumber] || 60;
    bodyText += `\n\n⏰ Next check-in in ${nextInterval} minutes`;
  }

  bodyText +=
    "\n\n💡 *Tip:* If you feel worse at any time, don't wait - call 911 immediately!";

  return {
    type: "interactive",
    body: bodyText,
    buttons: [
      {
        type: "reply",
        reply: {
          id: "much_better",
          title: "✅ Much Better",
        },
      },
      {
        type: "reply",
        reply: {
          id: "slightly_better",
          title: "🟡 Slightly Better",
        },
      },
      {
        type: "reply",
        reply: {
          id: "same_symptoms",
          title: "⚪ Same",
        },
      },
    ],
    footer: "Tap a button or reply 'worse' or 'emergency' for urgent help",
  };
};

// Function to create poll-like interactive message for sandbox/development
const createHealthPollMessage = (interactiveMessage, phoneNumber) => {
  const pollBody = `📊 *HEALTH CHECK POLL*\n\n${interactiveMessage.body}\n\n`;

  // Create a poll-like interface with emojis and easy responses
  const pollOptions =
    `*How are you feeling? React or reply:*\n\n` +
    `✅ *BETTER* - Reply "better" or "1"\n` +
    `🟡 *SLIGHTLY BETTER* - Reply "slightly" or "2"\n` +
    `⚪ *SAME* - Reply "same" or "3"\n` +
    `🟠 *WORSE* - Reply "worse" or "4"\n` +
    `🚨 *EMERGENCY* - Reply "emergency" or "911"\n\n` +
    `💡 *Just type one word to respond quickly!*`;

  return {
    from: whatsappConfig.from,
    to: phoneNumber.startsWith("whatsapp:")
      ? phoneNumber
      : `whatsapp:${phoneNumber}`,
    body: pollBody + pollOptions,
  };
};

// Function to create emergency/worsening condition list message
const createEmergencyListMessage = (symptom) => {
  return {
    type: "interactive",
    body: `🚨 *URGENT HEALTH STATUS UPDATE*\n\nYour "${symptom}" symptoms need immediate attention.\n\nPlease select your current condition:`,
    list: {
      button: "Select Status",
      sections: [
        {
          title: "Current Condition",
          rows: [
            {
              id: "worse_condition",
              title: "🟠 Getting Worse",
              description:
                "Symptoms are worsening - need more frequent monitoring",
            },
            {
              id: "emergency_help",
              title: "🚨 Emergency",
              description: "Need immediate medical help - call 911",
            },
            {
              id: "stable_worse",
              title: "📉 Stable but Poor",
              description: "Not improving but not getting worse",
            },
          ],
        },
      ],
    },
    footer: "Select the option that best describes your current state",
  };
};

// Worker event handlers for WhatsApp
whatsappWorker.on("completed", (job, result) => {
  console.log(`[WhatsApp Job Completed] ${job.id}:`, result);
});

whatsappWorker.on("failed", (job, err) => {
  console.error(`[WhatsApp Job Failed] ${job.id}: ${err.message}`);
});

whatsappWorker.on("progress", (job, progress) => {
  console.log(`[WhatsApp Job Progress] ${job.id}: ${progress}%`);
});

whatsappWorker.on("error", (err) => {
  console.error(`[WhatsApp Worker Error]:`, err);
});

// Worker event handlers for Health Cron
healthCronWorker.on("completed", (job, result) => {
  console.log(`[Health Cron Completed] ${job.id}:`, result);
});

healthCronWorker.on("failed", (job, err) => {
  console.error(`[Health Cron Failed] ${job.id}: ${err.message}`);
});

healthCronWorker.on("error", (err) => {
  console.error(`[Health Cron Worker Error]:`, err);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log("Shutting down workers gracefully...");
  await Promise.all([whatsappWorker.close(), healthCronWorker.close()]);
  await prisma.$disconnect();
  console.log("All workers shut down successfully");
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

console.log("🚀 WhatsApp & Health Cron workers started successfully");
console.log(
  `📱 WhatsApp sandbox number: ${process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER}`
);
console.log("👥 WhatsApp worker concurrency: 3");
console.log("🏥 Health cron worker concurrency: 2");

module.exports = {
  whatsappWorker,
  healthCronWorker,
};
