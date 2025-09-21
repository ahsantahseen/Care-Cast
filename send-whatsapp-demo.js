// Quick WhatsApp weather alert sender
const { getPrismaClient, getTwilioClient } = require("./services");
const weatherService = require("./services/weatherService");

// ⚠️  UPDATE THIS WITH YOUR WHATSAPP NUMBER ⚠️
const YOUR_PHONE_NUMBER = "+14155238886"; // Using sandbox number for testing

async function sendQuickDemo() {
  console.log("📱 QUICK WHATSAPP WEATHER DEMO");
  console.log("===============================");

  const demoPatient = {
    firstName: "Muhammad",
    lastName: "Ahsan",
    phoneNumber: YOUR_PHONE_NUMBER,
    zipcode: "85001", // Phoenix, AZ
    age: 72,
    chronicConditions: ["diabetes", "heart_disease"],
    medications: ["lisinopril", "metformin", "furosemide"], // Heat-sensitive medications
  };

  // Mock 100°F weather
  const originalGetCurrentWeather = weatherService.getCurrentWeather;
  const originalDetectHeatWave = weatherService.detectHeatWave;

  weatherService.getCurrentWeather = async function (zipCode) {
    return {
      zipCode: zipCode,
      temperature: 100,
      feelsLike: 108,
      humidity: 45,
      description: "Very Hot",
      condition: "Clear",
      windSpeed: 8,
      city: "Phoenix",
      state: "AZ",
      alerts: [],
      source: "demo",
    };
  };

  weatherService.detectHeatWave = async function (zipCode) {
    return {
      alertLevel: "warning",
      currentTemp: 100,
      maxFeelsLike: 108,
      daysAffected: 2,
      city: "Phoenix",
      zipcode: zipCode,
      isHeatWave: true,
      description: "Heat wave warning with 108°F feels-like for 2 day(s)",
    };
  };

  try {
    console.log(`👤 Demo Patient: ${demoPatient.firstName}`);
    console.log(`📞 Phone: ${demoPatient.phoneNumber}`);
    console.log(
      `🏥 Age: ${demoPatient.age}, Medications: ${demoPatient.medications.join(
        ", "
      )}`
    );
    console.log(`📍 ZIP Code: ${demoPatient.zipcode}`);
    console.log("");

    // Generate weather alert
    console.log("🌡️ Generating 100°F weather alert...");
    const alert = await weatherService.generateAdvancedWeatherAlert(
      demoPatient.zipcode,
      demoPatient
    );

    console.log(`📝 Alert Message: "${alert.message}"`);
    console.log(`🚨 Urgency: ${alert.urgency.toUpperCase()}`);
    console.log(`⚠️  Risk Factors: ${alert.riskFactors?.join(", ") || "None"}`);
    console.log("");

    // Send WhatsApp message
    console.log("📤 Sending to WhatsApp...");
    const twilio = getTwilioClient();

    const message = await twilio.messages.create({
      body: alert.message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${demoPatient.phoneNumber}`,
    });

    console.log("✅ WhatsApp message sent successfully!");
    console.log(`   Message SID: ${message.sid}`);
    console.log(`   Status: ${message.status}`);
    console.log("");
    console.log("📱 Check your WhatsApp for the weather alert!");
  } catch (error) {
    console.error("❌ Error sending WhatsApp message:", error.message);

    if (error.message.includes("not a valid WhatsApp endpoint")) {
      console.log("\n💡 Troubleshooting tips:");
      console.log(
        "1. Make sure your phone number is connected to Twilio WhatsApp sandbox"
      );
      console.log("2. Send 'join <sandbox-code>' to +14155238886 first");
      console.log("3. Verify the phone number format includes country code");
    }
  } finally {
    // Restore original methods
    weatherService.getCurrentWeather = originalGetCurrentWeather;
    weatherService.detectHeatWave = originalDetectHeatWave;
  }
}

// Different temperature scenarios
async function sendCustomAlert(temperature = 100) {
  console.log(`🌡️ Sending ${temperature}°F alert...`);

  // Update the mock weather based on temperature
  weatherService.getCurrentWeather = async function (zipCode) {
    return {
      zipCode: zipCode,
      temperature: temperature,
      feelsLike: temperature + 8,
      humidity: 45,
      description: temperature >= 105 ? "Extremely Hot" : "Very Hot",
      condition: "Clear",
      city: "Phoenix",
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
    };
  };

  await sendQuickDemo();
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const temp = parseInt(args[0]);
    if (temp && temp >= 60 && temp <= 120) {
      sendCustomAlert(temp);
    } else {
      console.log("Usage: node send-whatsapp-demo.js [temperature]");
      console.log("Example: node send-whatsapp-demo.js 105");
      console.log("Temperature must be between 60-120°F");
    }
  } else {
    sendQuickDemo();
  }
}

module.exports = { sendQuickDemo, sendCustomAlert };
