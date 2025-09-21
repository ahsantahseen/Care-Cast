// Comprehensive demo for weather alert system with various scenarios
const weatherService = require('./services/weatherService');
const weatherMonitor = require('./jobs/weatherMonitor');

// Demo patients with different risk profiles
const demoPatients = [
  {
    id: 1,
    firstName: "John",
    lastName: "Senior",
    phoneNumber: "+15551234567",
    zipcode: "85001",
    age: 72,
    chronicConditions: ["diabetes", "heart_disease"],
    medications: ["lisinopril", "metformin", "furosemide"], // Heat-sensitive meds
    scenario: "High-risk senior with heat-sensitive medications"
  },
  {
    id: 2,
    firstName: "Maria",
    lastName: "Young",
    phoneNumber: "+15551234568",
    zipcode: "85001",
    age: 28,
    chronicConditions: [],
    medications: [],
    scenario: "Healthy young adult"
  },
  {
    id: 3,
    firstName: "Robert",
    lastName: "Diabetic",
    phoneNumber: "+15551234569",
    zipcode: "85001",
    age: 58,
    chronicConditions: ["diabetes"],
    medications: ["metformin", "hydrochlorothiazide"], // Diuretic
    scenario: "Middle-aged with diabetes and diuretic"
  }
];

// Weather scenarios to test
const weatherScenarios = [
  {
    name: "Extreme Heat",
    temperature: 110,
    feelsLike: 118,
    alertLevel: "emergency",
    description: "Life-threatening heat conditions"
  },
  {
    name: "Dangerous Heat",
    temperature: 100,
    feelsLike: 108,
    alertLevel: "warning",
    description: "Your demo scenario - 100°F with medications"
  },
  {
    name: "Hot Weather",
    temperature: 95,
    feelsLike: 102,
    alertLevel: "watch",
    description: "Hot conditions requiring caution"
  },
  {
    name: "Warm Weather",
    temperature: 85,
    feelsLike: 88,
    alertLevel: "none",
    description: "Warm but manageable conditions"
  },
  {
    name: "Comfortable",
    temperature: 75,
    feelsLike: 75,
    alertLevel: "none",
    description: "Pleasant weather conditions"
  }
];

// Store original methods
const originalGetCurrentWeather = weatherService.getCurrentWeather;
const originalDetectHeatWave = weatherService.detectHeatWave;

function setupWeatherMocks(scenario) {
  weatherService.getCurrentWeather = async function(zipCode) {
    return {
      zipCode: zipCode,
      temperature: scenario.temperature,
      feelsLike: scenario.feelsLike,
      humidity: 45,
      description: scenario.description,
      condition: scenario.temperature >= 100 ? "Extremely Hot" : scenario.temperature >= 95 ? "Very Hot" : "Clear",
      windSpeed: 8,
      uvIndex: Math.min(11, Math.floor(scenario.temperature / 10)),
      timestamp: new Date().toISOString(),
      city: "Phoenix",
      state: "AZ",
      alerts: scenario.temperature >= 105 ? [{
        event: "Excessive Heat Warning",
        severity: "extreme",
        urgency: "immediate"
      }] : [],
      source: "demo"
    };
  };

  weatherService.detectHeatWave = async function(zipCode) {
    return {
      alertLevel: scenario.alertLevel,
      currentTemp: scenario.temperature,
      maxFeelsLike: scenario.feelsLike,
      daysAffected: scenario.temperature >= 100 ? 2 : scenario.temperature >= 95 ? 1 : 0,
      city: "Phoenix",
      zipcode: zipCode,
      isHeatWave: scenario.temperature >= 95,
      description: scenario.description
    };
  };
}

function restoreOriginalMethods() {
  weatherService.getCurrentWeather = originalGetCurrentWeather;
  weatherService.detectHeatWave = originalDetectHeatWave;
}

async function runScenario(weatherScenario, patient) {
  console.log(`\n🎭 SCENARIO: ${weatherScenario.name} for ${patient.scenario}`);
  console.log(`   Patient: ${patient.firstName} (age ${patient.age})`);
  console.log(`   Temperature: ${weatherScenario.temperature}°F (feels like ${weatherScenario.feelsLike}°F)`);
  
  setupWeatherMocks(weatherScenario);
  
  try {
    // Generate advanced weather alert
    const alert = await weatherService.generateAdvancedWeatherAlert(patient.zipcode, patient);
    
    console.log(`   📱 Alert: "${alert.message}"`);
    console.log(`   🚨 Urgency: ${alert.urgency.toUpperCase()}`);
    
    if (alert.riskFactors && alert.riskFactors.length > 0) {
      console.log(`   ⚠️  Risk Factors: ${alert.riskFactors.join(", ")}`);
    }
    
    // Also test heat wave specific alert
    const heatwave = await weatherService.detectHeatWave(patient.zipcode);
    const heatAlert = weatherService.generateHeatWaveAlert(heatwave, patient);
    
    if (heatAlert.message !== alert.message) {
      console.log(`   🔥 Heat Alert: "${heatAlert.message}"`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

async function runComprehensiveDemo() {
  console.log("🎬 COMPREHENSIVE WEATHER ALERT DEMO");
  console.log("=====================================");
  console.log("Testing different weather conditions and patient profiles\n");

  // Test your specific scenario first
  console.log("🎯 YOUR REQUESTED DEMO: 100°F with medications");
  console.log("=" .repeat(50));
  
  const yourScenario = weatherScenarios.find(s => s.name === "Dangerous Heat");
  const highRiskPatient = demoPatients[0]; // John with medications
  
  await runScenario(yourScenario, highRiskPatient);
  
  console.log("\n" + "=".repeat(50));
  console.log("🧪 ADDITIONAL TEST SCENARIOS");
  console.log("=" .repeat(50));

  // Test a few key scenarios
  const testCases = [
    { weather: weatherScenarios[0], patient: demoPatients[0] }, // Extreme heat + high risk
    { weather: weatherScenarios[1], patient: demoPatients[1] }, // 100°F + healthy young
    { weather: weatherScenarios[2], patient: demoPatients[2] }, // 95°F + diabetes
    { weather: weatherScenarios[3], patient: demoPatients[0] }, // 85°F + high risk
    { weather: weatherScenarios[4], patient: demoPatients[1] }, // 75°F + healthy
  ];
  
  for (const testCase of testCases) {
    await runScenario(testCase.weather, testCase.patient);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for readability
  }

  console.log("\n✅ DEMO COMPLETED!");
  console.log("=====================================");
  console.log("Key improvements made:");
  console.log("• Fixed undefined values in heat wave alerts");
  console.log("• Added specific 100°F temperature threshold");
  console.log("• Added medication-based risk assessment");
  console.log("• Reduced redundant messaging");
  console.log("• Improved message clarity and urgency levels");
  
  restoreOriginalMethods();
}

// Interactive demo function
async function runInteractiveDemo(temperature = 100, patientIndex = 0) {
  const patient = demoPatients[patientIndex] || demoPatients[0];
  const scenario = {
    name: "Custom",
    temperature: temperature,
    feelsLike: temperature + 8,
    alertLevel: temperature >= 105 ? "emergency" : temperature >= 100 ? "warning" : temperature >= 95 ? "watch" : "none",
    description: `Custom ${temperature}°F scenario`
  };
  
  console.log("🎮 INTERACTIVE DEMO");
  console.log("==================");
  await runScenario(scenario, patient);
  restoreOriginalMethods();
}

// Run the appropriate demo based on command line args
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length >= 1) {
    // Interactive mode: node demo-comprehensive-alerts.js 100 0
    const temp = parseInt(args[0]) || 100;
    const patientIdx = parseInt(args[1]) || 0;
    runInteractiveDemo(temp, patientIdx);
  } else {
    // Full demo
    runComprehensiveDemo();
  }
}

module.exports = { runComprehensiveDemo, runInteractiveDemo, demoPatients, weatherScenarios };
