// Setup script to add demo patient and send WhatsApp weather alerts
const { getPrismaClient, getTwilioClient } = require("./services");
const weatherService = require("./services/weatherService");
const weatherMonitor = require("./jobs/weatherMonitor");

async function setupDemoPatient() {
  const prisma = getPrismaClient();

  // For demo purposes, using a placeholder - you'll need to update this
  const demoPhoneNumber = "+19342120686"; // UPDATE THIS WITH YOUR NUMBER

  const demoPatient = {
    firstName: "Muhammad",
    phoneNumber: demoPhoneNumber,
    zipcode: "85001", // Phoenix, AZ (hot weather)
    age: 72,
    chronicConditions: ["diabetes", "heart_disease"],
    medications: ["lisinopril", "metformin", "furosemide"], // Heat-sensitive medications
    consentGiven: true,
    consentDate: new Date(),
    registrationComplete: true,
    monitoringEnabled: true,
    riskLevel: "high",
    activityLevel: "moderate",
  };

  try {
    // Check if patient already exists
    const existingPatient = await prisma.patient.findUnique({
      where: { phoneNumber: demoPhoneNumber },
    });

    if (existingPatient) {
      console.log(
        `✅ Patient already exists: ${existingPatient.firstName} (ID: ${existingPatient.id})`
      );
      return existingPatient;
    }

    // Create new demo patient
    const patient = await prisma.patient.create({
      data: demoPatient,
    });

    console.log(
      `✅ Demo patient created: ${patient.firstName} (ID: ${patient.id})`
    );
    console.log(`   Phone: ${patient.phoneNumber}`);
    console.log(`   ZIP: ${patient.zipcode}`);
    console.log(`   Age: ${patient.age}`);
    console.log(`   Medications: ${JSON.stringify(patient.medications)}`);

    return patient;
  } catch (error) {
    console.error("❌ Error creating demo patient:", error.message);
    throw error;
  }
}

async function sendTestWeatherAlert(patient, temperature = 100) {
  const twilio = getTwilioClient();

  console.log(`\n🌡️ Generating weather alert for ${temperature}°F...`);

  // Mock the weather service for demo
  const originalGetCurrentWeather = weatherService.getCurrentWeather;
  const originalDetectHeatWave = weatherService.detectHeatWave;

  weatherService.getCurrentWeather = async function (zipCode) {
    return {
      zipCode: zipCode,
      temperature: temperature,
      feelsLike: temperature + 8,
      humidity: 45,
      description: "Very Hot",
      condition: "Clear",
      windSpeed: 8,
      uvIndex: 9,
      timestamp: new Date().toISOString(),
      city: "Phoenix",
      state: "AZ",
      alerts:
        temperature >= 105
          ? [
              {
                event: "Excessive Heat Warning",
                severity: "extreme",
              },
            ]
          : [],
      source: "demo",
    };
  };

  weatherService.detectHeatWave = async function (zipCode) {
    return {
      alertLevel:
        temperature >= 105
          ? "emergency"
          : temperature >= 100
          ? "warning"
          : "watch",
      currentTemp: temperature,
      maxFeelsLike: temperature + 8,
      daysAffected: temperature >= 100 ? 2 : 1,
      city: "Phoenix",
      zipcode: zipCode,
      isHeatWave: temperature >= 95,
      description: `Heat conditions for ${temperature}°F`,
    };
  };

  try {
    // Generate the weather alert
    const alert = await weatherService.generateAdvancedWeatherAlert(
      patient.zipcode,
      patient
    );

    console.log(`📝 Generated Alert: "${alert.message}"`);
    console.log(`🚨 Urgency Level: ${alert.urgency.toUpperCase()}`);

    // Send via WhatsApp
    console.log(`\n📤 Sending WhatsApp message to ${patient.phoneNumber}...`);

    const message = await twilio.messages.create({
      body: alert.message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${patient.phoneNumber}`,
    });

    console.log(`✅ WhatsApp message sent!`);
    console.log(`   Message SID: ${message.sid}`);
    console.log(`   Status: ${message.status}`);

    // Log to database
    const prisma = getPrismaClient();
    await prisma.message.create({
      data: {
        patientId: patient.id,
        from: "system",
        to: patient.phoneNumber,
        body: alert.message,
        direction: "outgoing",
        messageType: "weather_alert",
        messageSid: message.sid,
        status: message.status,
      },
    });

    console.log(`📊 Alert logged to database`);

    return { alert, message };
  } catch (error) {
    console.error("❌ Error sending WhatsApp alert:", error.message);
    throw error;
  } finally {
    // Restore original methods
    weatherService.getCurrentWeather = originalGetCurrentWeather;
    weatherService.detectHeatWave = originalDetectHeatWave;
  }
}

async function testDifferentTemperatures(patient) {
  console.log("\n🌡️ Testing different temperature scenarios...");
  console.log("=".repeat(50));

  const temperatures = [75, 85, 95, 100, 105, 110];

  for (const temp of temperatures) {
    console.log(`\n🌡️ Testing ${temp}°F...`);

    try {
      await sendTestWeatherAlert(patient, temp);
      console.log(`✅ ${temp}°F alert sent successfully`);

      // Wait 2 seconds between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed to send ${temp}°F alert:`, error.message);
    }
  }
}

async function runWeatherMonitoringDemo(patient) {
  console.log("\n⚡ Running weather monitoring job for demo...");

  // Override the weather service to return hot conditions
  const originalGetBulkWeather = weatherService.getBulkWeather;

  weatherService.getBulkWeather = async function (zipCodes) {
    return zipCodes.map((zipCode) => ({
      zipCode,
      success: true,
      weather: {
        zipCode,
        temperature: 100,
        feelsLike: 108,
        humidity: 45,
        description: "Very Hot",
        condition: "Clear",
        city: "Phoenix",
        state: "AZ",
        alerts: [],
      },
      heatwave: {
        alertLevel: "warning",
        currentTemp: 100,
        maxFeelsLike: 108,
        warningLevel: "warning",
        heatwaveDetected: true,
        peakTemp: 108,
        heatwaveDays: 2,
      },
    }));
  };

  try {
    await weatherMonitor.runWeatherCheck();
    console.log("✅ Weather monitoring demo completed");
  } catch (error) {
    console.error("❌ Weather monitoring demo failed:", error.message);
  } finally {
    // Restore original method
    weatherService.getBulkWeather = originalGetBulkWeather;
  }
}

async function main() {
  try {
    console.log("🎬 WHATSAPP WEATHER ALERT DEMO");
    console.log("==============================");

    // Step 1: Setup demo patient
    const patient = await setupDemoPatient();

    // Step 2: Send a single test alert for 100°F
    console.log("\n📱 SENDING SINGLE DEMO ALERT (100°F)...");
    await sendTestWeatherAlert(patient, 100);

    // Step 3: Ask user what they want to test
    console.log(
      "\n🎯 Demo completed! Your demo alert should appear in WhatsApp."
    );
    console.log("\nNext steps:");
    console.log("1. Check your WhatsApp for the weather alert");
    console.log("2. To test different temperatures, run:");
    console.log("   node setup-whatsapp-demo.js test-temps");
    console.log("3. To run full weather monitoring, run:");
    console.log("   node setup-whatsapp-demo.js monitor");
    console.log("4. To send custom temp alert, run:");
    console.log("   node setup-whatsapp-demo.js custom 105");
  } catch (error) {
    console.error("❌ Demo failed:", error.message);
    process.exit(1);
  }
}

// Handle command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "test-temps") {
    setupDemoPatient().then((patient) => testDifferentTemperatures(patient));
  } else if (command === "monitor") {
    setupDemoPatient().then((patient) => runWeatherMonitoringDemo(patient));
  } else if (command === "custom" && args[1]) {
    const temp = parseInt(args[1]);
    setupDemoPatient().then((patient) => sendTestWeatherAlert(patient, temp));
  } else {
    main();
  }
}

module.exports = { setupDemoPatient, sendTestWeatherAlert };
