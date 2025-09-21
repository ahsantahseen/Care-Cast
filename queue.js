const { Queue } = require("bullmq");
const IORedis = require("ioredis");

// Create Redis connection directly to avoid circular dependency
const connection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

// WhatsApp queue for handling WhatsApp messages
const whatsappQueue = new Queue("whatsapp-queue", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

// Health monitoring cron queue for scheduled check-ups
const healthCronQueue = new Queue("health-cron-queue", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

// Helper function to schedule weather-based patient check-ins
const scheduleWeatherAlertCheckin = async (
  phoneNumber,
  waveStatus,
  patientData
) => {
  // Cancel any existing weather alert monitoring
  await cancelHealthCheckups(phoneNumber, "weather-alert");

  // Determine check-in frequency based on weather urgency
  const weatherIntervals = {
    emergency: 15, // Every 15 minutes for extreme conditions
    high: 30, // Every 30 minutes for warning conditions
    routine: 60, // Every 60 minutes for normal monitoring
  };

  const intervalMinutes = weatherIntervals[waveStatus.urgency] || 60;

  // Only schedule frequent check-ins for emergency/high alert conditions
  if (waveStatus.urgency === "emergency" || waveStatus.urgency === "high") {
    await healthCronQueue.add(
      "weather-alert-checkin",
      {
        phoneNumber,
        waveStatus,
        patientData,
        intervalMinutes,
        checkNumber: 1,
        startTime: new Date().toISOString(),
        tag: "weather-alert",
      },
      {
        delay: intervalMinutes * 60 * 1000, // First check after interval
        jobId: `weather-alert-${phoneNumber}`,
      }
    );

    console.log(
      `🔔 Scheduled weather alert check-ins for ${phoneNumber} every ${intervalMinutes} minutes (${waveStatus.type})`
    );
  }
};

// Helper function to schedule recurring health monitoring based on symptom severity
const scheduleHealthCheckup = async (
  phoneNumber,
  symptom,
  riskLevel = "medium",
  tag = "symptom"
) => {
  // Cancel any existing monitoring for this user with the same tag
  await cancelHealthCheckups(phoneNumber, tag);

  // Determine monitoring interval based on symptom/risk level
  const monitoringIntervals = {
    critical: 2, // Every 2 minutes for critical symptoms
    high: 5, // Every 5 minutes for high-risk symptoms
    medium: 15, // Every 15 minutes for medium symptoms
    low: 60, // Every 60 minutes for low-risk symptoms
    emergency: 1, // Every 1 minute for emergencies
  };

  const intervalMinutes =
    monitoringIntervals[riskLevel] || monitoringIntervals.medium;

  // Schedule the first checkup
  await healthCronQueue.add(
    "recurring-health-monitor",
    {
      phoneNumber,
      symptom,
      riskLevel,
      intervalMinutes,
      checkNumber: 1,
      startTime: new Date().toISOString(),
      tag, // Add tag to job data
    },
    {
      delay: intervalMinutes * 60 * 1000, // First check after interval
      jobId: `recurring-monitor-${phoneNumber}-${tag}`, // Tag-specific job ID
    }
  );

  console.log(
    `✅ Scheduled recurring ${riskLevel} monitoring [${tag}] for ${phoneNumber} every ${intervalMinutes} minutes`
  );
};

// Helper function to schedule daily routine checkups
const scheduleDailyCheckup = async (phoneNumber) => {
  // Cancel any existing daily checkup
  await cancelHealthCheckups(phoneNumber, "daily");

  // Schedule daily checkup at 9 AM every day
  const now = new Date();
  const next9AM = new Date();
  next9AM.setHours(9, 0, 0, 0);

  // If it's already past 9 AM today, schedule for tomorrow
  if (now >= next9AM) {
    next9AM.setDate(next9AM.getDate() + 1);
  }

  const delay = next9AM.getTime() - now.getTime();

  await healthCronQueue.add(
    "daily-health-checkup",
    {
      phoneNumber,
      checkTime: next9AM.toISOString(),
      tag: "daily",
    },
    {
      delay,
      jobId: `daily-checkup-${phoneNumber}`,
      repeat: { every: 24 * 60 * 60 * 1000 }, // Repeat every 24 hours
    }
  );

  console.log(
    `✅ Scheduled daily checkup for ${phoneNumber} at 9:00 AM (next: ${next9AM.toLocaleDateString()})`
  );
};

// Helper function to cancel health monitoring for a user
const cancelHealthCheckups = async (phoneNumber, tag = "all") => {
  try {
    if (tag === "all") {
      // Cancel all types of monitoring
      const jobTypes = ["symptom", "daily", "weather-alert"];
      for (const jobTag of jobTypes) {
        await cancelHealthCheckups(phoneNumber, jobTag);
      }
      return;
    }

    if (tag === "daily") {
      // Cancel daily checkup
      const dailyJobId = `daily-checkup-${phoneNumber}`;
      const dailyJob = await healthCronQueue.getJob(dailyJobId);
      if (dailyJob) {
        await dailyJob.remove();
        console.log(`✅ Cancelled daily checkup: ${dailyJobId}`);
      }
    } else if (tag === "symptom") {
      // Cancel symptom-based monitoring
      const symptomJobId = `recurring-monitor-${phoneNumber}-symptom`;
      const symptomJob = await healthCronQueue.getJob(symptomJobId);
      if (symptomJob) {
        await symptomJob.remove();
        console.log(`✅ Cancelled symptom monitoring: ${symptomJobId}`);
      }
    } else if (tag === "weather-alert") {
      // Cancel weather alert monitoring
      const weatherJobId = `weather-alert-${phoneNumber}`;
      const weatherJob = await healthCronQueue.getJob(weatherJobId);
      if (weatherJob) {
        await weatherJob.remove();
        console.log(`✅ Cancelled weather alert monitoring: ${weatherJobId}`);
      }
    } else {
      // Cancel specific tag
      const taggedJobId = `recurring-monitor-${phoneNumber}-${tag}`;
      const taggedJob = await healthCronQueue.getJob(taggedJobId);
      if (taggedJob) {
        await taggedJob.remove();
        console.log(`✅ Cancelled ${tag} monitoring: ${taggedJobId}`);
      }
    }

    // Also cancel any legacy interval-based jobs (backwards compatibility)
    const intervals = [1, 2, 5, 10, 15, 60];
    for (const interval of intervals) {
      try {
        const legacyJobId = `health-checkup-${phoneNumber}-${tag}-${interval}min`;
        const legacyJob = await healthCronQueue.getJob(legacyJobId);
        if (legacyJob) {
          await legacyJob.remove();
          console.log(`✅ Cancelled legacy job: ${legacyJobId}`);
        }
      } catch (error) {
        // Legacy job not found, continue
      }
    }
  } catch (error) {
    console.log(
      `❌ Error cancelling ${tag} monitoring for ${phoneNumber}:`,
      error.message
    );
  }
};

// Helper function to change monitoring frequency
const updateMonitoringFrequency = async (
  phoneNumber,
  newRiskLevel,
  tag = "symptom"
) => {
  try {
    // Cancel current monitoring for this specific tag
    await cancelHealthCheckups(phoneNumber, tag);

    // Start new monitoring with updated frequency (only for symptom-based monitoring)
    if (tag === "symptom") {
      await scheduleHealthCheckup(phoneNumber, "updated", newRiskLevel, tag);
    }

    console.log(
      `✅ Updated ${tag} monitoring frequency for ${phoneNumber} to ${newRiskLevel}`
    );
  } catch (error) {
    console.error(`❌ Error updating monitoring frequency:`, error);
  }
};

module.exports = {
  whatsappQueue,
  healthCronQueue,
  scheduleHealthCheckup,
  scheduleDailyCheckup,
  scheduleWeatherAlertCheckin,
  cancelHealthCheckups,
  updateMonitoringFrequency,
  get weatherMonitor() {
    return require("./jobs/weatherMonitor");
  },
};

// Initialize jobs after exports to avoid circular dependency
setImmediate(() => {
  const weatherMonitor = require("./jobs/weatherMonitor");

  // Schedule weather monitoring job (every 30 minutes)
  healthCronQueue.add(
    "weather-monitoring",
    {},
    {
      repeat: { every: 60 * 1000 }, // Every 60 seconds (DEMO MODE - was too frequent)
      jobId: "weather-monitor-job",
    }
  );

  // Schedule heat wave monitoring job (every 2 hours)
  healthCronQueue.add(
    "heat-wave-monitoring",
    {},
    {
      repeat: { every: 30 * 1000 }, // Every 30 seconds (DEMO MODE)
      jobId: "heat-wave-monitor-job",
    }
  );

  console.log(
    "✅ Weather monitoring job scheduled (every 60 seconds - DEMO MODE)"
  );
  console.log(
    "✅ Heat wave monitoring job scheduled (every 30 seconds - DEMO MODE)"
  );
});
