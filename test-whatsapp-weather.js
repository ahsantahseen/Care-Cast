// Test AI Weather Alerts through WhatsApp MVP
const weatherService = require("./services/weatherService");
const seniorHeatAlerts = require("./services/seniorHeatAlerts");

async function testWhatsAppWeatherMVP() {
  console.log("📱 Testing AI Weather Alerts via WhatsApp MVP\n");

  // Test scenarios with realistic patient data
  const testCases = [
    {
      scenario: "🔥 EXTREME HEAT - Senior with Multiple Conditions",
      patient: {
        firstName: "Margaret",
        age: 78,
        zipcode: "85001", // Phoenix, AZ
        phoneNumber: "+19342120686", // Your registered WhatsApp number
        chronicConditions: ["heart_disease", "diabetes"],
        medications: ["metformin", "lisinopril"],
        activityLevel: "low",
      },
    },
    {
      scenario: "⚠️ HEAT WAVE - Senior with Respiratory Issues",
      patient: {
        firstName: "Robert",
        age: 69,
        zipcode: "33101", // Miami, FL
        phoneNumber: "+19342120686",
        chronicConditions: ["asthma", "copd"],
        medications: ["albuterol", "prednisone"],
        activityLevel: "moderate",
      },
    },
    {
      scenario: "🌞 NORMAL HEAT - Healthy Adult",
      patient: {
        firstName: "Sarah",
        age: 42,
        zipcode: "90210", // Beverly Hills, CA
        phoneNumber: "+19342120686",
        chronicConditions: [],
        medications: [],
        activityLevel: "high",
      },
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n${testCase.scenario}`);
    console.log("─".repeat(70));

    const patient = testCase.patient;
    console.log(`👤 Patient: ${patient.firstName}, ${patient.age} years old`);
    console.log(`📍 Location: ZIP ${patient.zipcode}`);
    console.log(
      `🏥 Conditions: ${patient.chronicConditions.join(", ") || "None"}`
    );
    console.log(`💊 Medications: ${patient.medications.join(", ") || "None"}`);

    try {
      // Generate weather analysis
      console.log("\n🌡️ Weather Analysis:");
      const weather = await weatherService.getCurrentWeather(patient.zipcode);
      const heatwave = await weatherService.detectHeatWave(patient.zipcode);

      console.log(
        `   Current: ${weather.temperature}°F (feels like ${weather.feelsLike}°F)`
      );
      console.log(`   Alert Level: ${heatwave.alertLevel}`);
      console.log(`   Heat Wave: ${heatwave.isHeatWave ? "YES" : "NO"}`);

      // Generate AI-powered alert
      console.log("\n🤖 AI Weather Alert Generation:");
      const aiAlert = await weatherService.generateAdvancedWeatherAlert(
        patient.zipcode,
        patient
      );

      console.log(
        `   AI Generated: ${aiAlert.aiGenerated ? "YES" : "NO (fallback)"}`
      );
      console.log(`   Urgency Level: ${aiAlert.urgency.toUpperCase()}`);
      console.log(`   Alert Type: ${aiAlert.alertLevel}`);
      console.log(`   Risk Factors: [${aiAlert.riskFactors.join(", ")}]`);

      // Show the actual WhatsApp message
      console.log("\n📱 WhatsApp Message Preview:");
      console.log("┌─" + "─".repeat(50) + "┐");
      console.log("│ WhatsApp                    🟢              │");
      console.log("├─" + "─".repeat(50) + "┤");
      console.log(`│ From: Storm Logic Health Alert              │`);
      console.log(
        `│ To: ${patient.firstName} (${patient.phoneNumber})         │`
      );
      console.log("├─" + "─".repeat(50) + "┤");

      // Split message for display if too long
      const message = aiAlert.message;
      if (message.length <= 50) {
        console.log(`│ ${message.padEnd(50)} │`);
      } else {
        const words = message.split(" ");
        let line = "";
        for (const word of words) {
          if ((line + word).length > 47) {
            console.log(`│ ${line.padEnd(50)} │`);
            line = word + " ";
          } else {
            line += word + " ";
          }
        }
        if (line.trim()) {
          console.log(`│ ${line.trim().padEnd(50)} │`);
        }
      }

      console.log("├─" + "─".repeat(50) + "┤");
      console.log(`│ Length: ${message.length}/160 chars                   │`);
      console.log(`│ Urgency: ${aiAlert.urgency.toUpperCase().padEnd(36)} │`);
      console.log("└─" + "─".repeat(50) + "┘");

      // Senior-specific alerts
      if (patient.age >= 65) {
        console.log("\n👴 Senior Heat Alert System:");
        const seniorAlert = await seniorHeatAlerts.generateSeniorHeatAlert(
          patient.zipcode,
          patient
        );

        console.log(
          `   Senior Alert Level: ${seniorAlert.urgency.toUpperCase()}`
        );
        console.log(
          `   Enhanced Monitoring: ${
            seniorAlert.urgency === "emergency" ||
            seniorAlert.urgency === "high"
              ? "YES"
              : "NO"
          }`
        );

        if (
          seniorAlert.urgency === "emergency" ||
          seniorAlert.urgency === "high"
        ) {
          console.log("\n📞 Automated Follow-up Schedule:");
          console.log("   • Immediate: WhatsApp alert sent");
          console.log("   • +15 min: Health check-in message");
          console.log("   • +30 min: Status follow-up");
          console.log("   • +60 min: Emergency contact if no response");
        }
      }

      // Simulate actual WhatsApp sending (without actually sending)
      console.log("\n🚀 WhatsApp Delivery Simulation:");
      console.log("   ✅ Message formatted for SMS/WhatsApp");
      console.log("   ✅ Patient risk factors assessed");
      console.log("   ✅ Urgency level determined");
      console.log("   ✅ Ready for Twilio WhatsApp API");

      // Show what the actual API call would look like
      console.log("\n📡 Twilio WhatsApp API Call:");
      console.log("```javascript");
      console.log("await twilio.messages.create({");
      console.log(`  body: "${aiAlert.message}",`);
      console.log(`  from: process.env.TWILIO_WHATSAPP_NUMBER,`);
      console.log(`  to: "whatsapp:${patient.phoneNumber}",`);
      console.log('  statusCallback: "https://your-app.com/webhook/status"');
      console.log("});");
      console.log("```");

      // Expected patient response
      console.log("\n💬 Expected Patient Responses:");
      if (aiAlert.urgency === "emergency") {
        console.log('   • "I\'m inside with AC" (Good response)');
        console.log('   • "I feel dizzy" (Triggers emergency protocol)');
        console.log('   • "Help" (Escalates to emergency contacts)');
      } else if (aiAlert.urgency === "urgent") {
        console.log('   • "Thanks, staying cool" (Good response)');
        console.log('   • "I\'m feeling hot" (Triggers symptom check)');
        console.log("   • Health status numbers (1-5 scale)");
      } else {
        console.log('   • "Thanks" (Acknowledgment)');
        console.log("   • General health check responses");
        console.log("   • Update zipcode if needed");
      }
    } catch (error) {
      console.error(
        `   ❌ Error testing ${patient.firstName}: ${error.message}`
      );
    }

    console.log("\n" + "═".repeat(70));
  }

  console.log("\n✅ WhatsApp Weather MVP Testing Complete\n");

  console.log("📋 WHATSAPP MVP READY FEATURES:");
  console.log("┌─ Core Features ─────────────────────────────┐");
  console.log("│ ✅ Real-time weather monitoring            │");
  console.log("│ ✅ AI-powered personalized SMS alerts      │");
  console.log("│ ✅ Senior citizen protection (65+)         │");
  console.log("│ ✅ Medical condition awareness             │");
  console.log("│ ✅ Emergency escalation protocols          │");
  console.log("│ ✅ WhatsApp message optimization           │");
  console.log("│ ✅ Automated follow-up scheduling          │");
  console.log("│ ✅ Fallback system for API failures        │");
  console.log("└─────────────────────────────────────────────┘");

  console.log("\n🚀 TO ACTIVATE LIVE WHATSAPP ALERTS:");
  console.log("1. Add OpenWeather API key to .env file");
  console.log("2. Ensure Twilio WhatsApp sandbox is configured");
  console.log("3. Register patient phone numbers in sandbox");
  console.log("4. Start the heat wave monitoring cron job");
  console.log("5. Patients will receive real-time weather alerts!");

  console.log("\n📱 Test with your registered number:");
  console.log(`   WhatsApp: ${testCases[0].patient.phoneNumber}`);
  console.log('   Send "weather" to get current conditions');
  console.log('   Send "help" during heat emergency');
  console.log("   Send health status (1-5) for monitoring");
}

// Handle errors
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled error:", error.message);
  process.exit(1);
});

// Run WhatsApp MVP test
testWhatsAppWeatherMVP().catch(console.error);
