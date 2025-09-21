// Test various weather scenarios with AI-powered SMS alerts
const weatherService = require('./services/weatherService');
const seniorHeatAlerts = require('./services/seniorHeatAlerts');

async function testWeatherScenarios() {
  console.log('🌡️ Testing Real-World Weather Scenarios\n');
  
  const scenarios = [
    {
      title: "🔥 EXTREME HEAT EMERGENCY",
      zipcode: "85001", // Phoenix, AZ
      patient: {
        firstName: "Margaret",
        age: 78,
        chronicConditions: ["heart_disease", "diabetes", "kidney_disease"],
        medications: ["metformin", "lisinopril", "furosemide"],
        activityLevel: "low",
        phoneNumber: "+19342120686"
      },
      expected: "Emergency-level alert with immediate action required"
    },
    
    {
      title: "⚠️ HEAT WAVE WARNING",
      zipcode: "33101", // Miami, FL  
      patient: {
        firstName: "Carlos",
        age: 69,
        chronicConditions: ["asthma", "hypertension"],
        medications: ["albuterol", "amlodipine"],
        activityLevel: "moderate",
        phoneNumber: "+19342120686"
      },
      expected: "Senior heat warning with enhanced precautions"
    },
    
    {
      title: "🌞 MODERATE HEAT ADVISORY",
      zipcode: "90210", // Beverly Hills, CA
      patient: {
        firstName: "Jennifer",
        age: 45,
        chronicConditions: [],
        medications: [],
        activityLevel: "high",
        phoneNumber: "+19342120686"
      },
      expected: "General heat advisory for healthy adult"
    },
    
    {
      title: "❄️ COOL WEATHER CONDITIONS",
      zipcode: "10001", // New York, NY
      patient: {
        firstName: "David",
        age: 52,
        chronicConditions: ["diabetes"],
        medications: ["metformin"],
        activityLevel: "moderate",
        phoneNumber: "+19342120686"
      },
      expected: "Normal weather update, no heat concerns"
    },
    
    {
      title: "🚨 HIGH-RISK SENIOR",
      zipcode: "85001", // Phoenix, AZ (same hot location)
      patient: {
        firstName: "Eleanor",
        age: 82,
        chronicConditions: ["heart_disease", "diabetes", "copd"],
        medications: ["digoxin", "insulin", "prednisone"],
        activityLevel: "low",
        isPregnant: false,
        smoker: false,
        phoneNumber: "+19342120686"
      },
      expected: "Maximum protection senior alert with emergency protocols"
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n${scenario.title}`);
    console.log('─'.repeat(60));
    console.log(`📍 Location: ZIP ${scenario.zipcode}`);
    console.log(`👤 Patient: ${scenario.patient.firstName}, age ${scenario.patient.age}`);
    console.log(`🏥 Conditions: ${scenario.patient.chronicConditions.length ? scenario.patient.chronicConditions.join(', ') : 'None'}`);
    console.log(`💊 Medications: ${scenario.patient.medications.length ? scenario.patient.medications.join(', ') : 'None'}`);
    console.log(`🎯 Expected: ${scenario.expected}\n`);

    try {
      // Step 1: Get raw weather data
      console.log('📊 WEATHER DATA:');
      const weather = await weatherService.getCurrentWeather(scenario.zipcode);
      console.log(`   Temperature: ${weather.temperature}°F (feels like ${weather.feelsLike}°F)`);
      console.log(`   Condition: ${weather.condition} - ${weather.description}`);
      console.log(`   UV Index: ${weather.uvIndex}, Humidity: ${weather.humidity}%`);
      
      // Step 2: Analyze heat wave conditions
      console.log('\n🌡️ HEAT ANALYSIS:');
      const heatAnalysis = await weatherService.detectHeatWave(scenario.zipcode);
      console.log(`   Alert Level: ${heatAnalysis.alertLevel.toUpperCase()}`);
      console.log(`   Heat Wave: ${heatAnalysis.isHeatWave ? 'YES' : 'NO'}`);
      if (heatAnalysis.isHeatWave) {
        console.log(`   Peak Temp: ${heatAnalysis.maxFeelsLike}°F for ${heatAnalysis.daysAffected} days`);
      }
      
      // Step 3: Risk factor assessment
      console.log('\n⚠️ RISK ASSESSMENT:');
      const riskFactors = weatherService.assessRiskFactors(scenario.patient);
      console.log(`   Risk Factors: [${riskFactors.join(', ')}]`);
      
      const isHighRisk = scenario.patient.age >= 65 || scenario.patient.chronicConditions.length >= 2;
      console.log(`   High Risk Patient: ${isHighRisk ? 'YES' : 'NO'}`);
      
      // Step 4: AI-powered weather advice
      console.log('\n🤖 AI WEATHER ASSISTANT:');
      const aiAdvice = await weatherService.getAIWeatherAdvice(scenario.zipcode, scenario.patient);
      console.log(`   AI Generated: ${aiAdvice.aiGenerated ? 'YES' : 'NO (fallback)'}`);
      console.log(`   Urgency: ${aiAdvice.urgency.toUpperCase()}`);
      console.log(`   Message Length: ${aiAdvice.message.length}/160 chars`);
      console.log(`   📱 SMS: "${aiAdvice.message}"`);
      
      // Step 5: Senior-specific alerts (if applicable)
      if (scenario.patient.age >= 65) {
        console.log('\n👴 SENIOR ALERT SYSTEM:');
        const seniorAlert = await seniorHeatAlerts.generateSeniorHeatAlert(
          scenario.zipcode, 
          scenario.patient
        );
        console.log(`   Senior Alert Level: ${seniorAlert.urgency.toUpperCase()}`);
        console.log(`   📱 Senior SMS: "${seniorAlert.message}"`);
        
        if (seniorAlert.urgency === 'emergency' || seniorAlert.urgency === 'high') {
          console.log(`   🚨 ENHANCED MONITORING ACTIVATED`);
        }
      }
      
      // Step 6: Advanced weather alert (full system)
      console.log('\n🚀 ADVANCED ALERT SYSTEM:');
      const advancedAlert = await weatherService.generateAdvancedWeatherAlert(
        scenario.zipcode, 
        scenario.patient
      );
      console.log(`   Final Alert Level: ${advancedAlert.alertLevel.toUpperCase()}`);
      console.log(`   Final Urgency: ${advancedAlert.urgency.toUpperCase()}`);
      console.log(`   AI Enhanced: ${advancedAlert.aiGenerated}`);
      console.log(`   📱 Final SMS: "${advancedAlert.message}"`);
      
      // Step 7: Action recommendations
      console.log('\n📋 RECOMMENDED ACTIONS:');
      if (advancedAlert.urgency === 'emergency') {
        console.log('   🆘 IMMEDIATE: Stay indoors, AC required, call for help if needed');
        console.log('   ⏰ MONITORING: Check every 15-30 minutes');
        console.log('   📞 CONTACT: Healthcare provider, family/neighbors');
      } else if (advancedAlert.urgency === 'urgent') {
        console.log('   ⚠️ PRECAUTIONS: Limit outdoor activity, increase hydration');
        console.log('   ⏰ MONITORING: Check every 1-2 hours');
        console.log('   📞 CONTACT: Check on patient periodically');
      } else {
        console.log('   ✅ ROUTINE: Normal activities with weather awareness');
        console.log('   ⏰ MONITORING: Daily check-in sufficient');
      }
      
    } catch (error) {
      console.error(`   ❌ Error in scenario: ${error.message}`);
    }
    
    console.log('\n' + '═'.repeat(80));
  }
  
  console.log('\n✅ Weather Scenario Testing Complete');
  console.log('\n📊 SUMMARY OF CAPABILITIES:');
  console.log('   • Real-time weather monitoring with One Call API 3.0');
  console.log('   • AI-powered personalized SMS responses');
  console.log('   • Senior-focused heat protection (65+ enhanced alerts)');
  console.log('   • Risk-based alert escalation (emergency/urgent/routine)');
  console.log('   • SMS-optimized messages (160 character limit)');
  console.log('   • Medical condition awareness (heart, diabetes, etc.)');
  console.log('   • Automatic monitoring frequency adjustment');
  console.log('   • Fallback system for API failures');
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run scenario tests
testWeatherScenarios().catch(console.error);
