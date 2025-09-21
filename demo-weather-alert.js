// Demo script for weather alerts with 100°F temperature and high-risk patient
const weatherService = require('./services/weatherService');

// Create a demo patient with medications (high-risk)
const demoPatient = {
  id: 999,
  firstName: "John",
  lastName: "Demo",
  phoneNumber: "+15551234567",
  zipcode: "85001", // Phoenix, AZ - typically hot
  age: 72,
  chronicConditions: ["diabetes", "heart_disease"],
  medications: ["lisinopril", "metformin", "furosemide"], // Includes diuretic (heat-sensitive)
  isPregnant: false,
  smoker: false,
  activityLevel: "moderate",
  preferredLanguage: "en"
};

// Mock weather service to return 100°F for demo
const originalGetCurrentWeather = weatherService.getCurrentWeather;
const originalDetectHeatWave = weatherService.detectHeatWave;

// Override weather service methods for demo
weatherService.getCurrentWeather = async function(zipCode) {
  console.log(`🌡️ [DEMO] Simulating 100°F weather for ${zipCode}`);
  return {
    zipCode: zipCode,
    temperature: 100,
    feelsLike: 108,
    humidity: 45,
    description: "Very Hot",
    condition: "Clear",
    windSpeed: 8,
    uvIndex: 9,
    timestamp: new Date().toISOString(),
    city: "Phoenix",
    state: "AZ",
    alerts: [],
    source: "demo"
  };
};

weatherService.detectHeatWave = async function(zipCode) {
  console.log(`🔥 [DEMO] Detecting heat wave for ${zipCode}`);
  return {
    alertLevel: "warning",
    currentTemp: 100,
    maxFeelsLike: 108,
    daysAffected: 2,
    city: "Phoenix",
    zipcode: zipCode,
    isHeatWave: true,
    description: "Heat wave warning with 108°F feels-like for 2 day(s)"
  };
};

async function runDemo() {
  try {
    console.log("🎬 Starting Weather Alert Demo");
    console.log("=====================================");
    console.log("Demo Patient:", demoPatient.firstName, demoPatient.lastName);
    console.log("Age:", demoPatient.age);
    console.log("Medications:", demoPatient.medications.join(", "));
    console.log("ZIP Code:", demoPatient.zipcode);
    console.log("");

    // Test 1: Current weather
    console.log("1️⃣ Getting current weather...");
    const weather = await weatherService.getCurrentWeather(demoPatient.zipcode);
    console.log(`   Temperature: ${weather.temperature}°F (feels like ${weather.feelsLike}°F)`);
    console.log(`   Condition: ${weather.condition}`);
    console.log("");

    // Test 2: Heat wave detection
    console.log("2️⃣ Detecting heat wave...");
    const heatwave = await weatherService.detectHeatWave(demoPatient.zipcode);
    console.log(`   Alert Level: ${heatwave.alertLevel}`);
    console.log(`   Heat Wave Detected: ${heatwave.isHeatWave}`);
    console.log(`   Description: ${heatwave.description}`);
    console.log("");

    // Test 3: Generate personalized alert
    console.log("3️⃣ Generating personalized weather alert...");
    const alert = await weatherService.generateAdvancedWeatherAlert(demoPatient.zipcode, demoPatient);
    console.log(`   Alert Message: "${alert.message}"`);
    console.log(`   Urgency: ${alert.urgency}`);
    console.log(`   Alert Level: ${alert.alertLevel}`);
    if (alert.riskFactors && alert.riskFactors.length > 0) {
      console.log(`   Risk Factors: ${alert.riskFactors.join(", ")}`);
    }
    console.log("");

    // Test 4: Generate heat wave specific alert
    console.log("4️⃣ Generating heat wave alert...");
    const heatAlert = weatherService.generateHeatWaveAlert(heatwave, demoPatient);
    console.log(`   Heat Alert: "${heatAlert.message}"`);
    console.log(`   Urgency: ${heatAlert.urgency}`);
    if (heatAlert.riskFactors && heatAlert.riskFactors.length > 0) {
      console.log(`   Risk Factors: ${heatAlert.riskFactors.join(", ")}`);
    }
    console.log("");

    console.log("✅ Demo completed successfully!");
    console.log("=====================================");

  } catch (error) {
    console.error("❌ Demo failed:", error.message);
    console.error(error.stack);
  } finally {
    // Restore original methods
    weatherService.getCurrentWeather = originalGetCurrentWeather;
    weatherService.detectHeatWave = originalDetectHeatWave;
    console.log("🔄 Restored original weather service methods");
  }
}

// Run the demo
if (require.main === module) {
  runDemo();
}

module.exports = { runDemo, demoPatient };
