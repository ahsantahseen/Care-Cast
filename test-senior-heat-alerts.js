#!/usr/bin/env node

// Test the Senior Heat Alert System
const seniorHeatAlerts = require('./services/seniorHeatAlerts');

console.log('🧪 Testing Senior Heat Alert System\n');

async function testSeniorAlerts() {
  // Test senior citizens with different risk profiles
  const testSeniors = [
    {
      firstName: 'Mary',
      age: 72,
      zipcode: '85001', // Phoenix (hot)
      phoneNumber: '+19342120686',
      chronicConditions: ['diabetes', 'heart_disease'],
      medications: ['insulin', 'blood_thinner']
    },
    {
      firstName: 'Robert',
      age: 68,
      zipcode: '90210', // Beverly Hills
      phoneNumber: '+15551234567',
      chronicConditions: [],
      medications: ['vitamin_d']
    },
    {
      firstName: 'Linda',
      age: 81,
      zipcode: '10001', // NYC
      phoneNumber: '+15559876543',
      chronicConditions: ['copd', 'kidney_disease'],
      medications: ['inhaler', 'water_pill', 'heart_med']
    }
  ];

  console.log('📍 Testing senior heat alerts for different ZIP codes and risk levels:\n');

  for (const senior of testSeniors) {
    console.log(`👤 Testing: ${senior.firstName}, age ${senior.age}, ZIP ${senior.zipcode}`);
    console.log(`   Health: ${senior.chronicConditions.length} conditions, ${senior.medications.length} meds`);
    
    try {
      // Generate senior-specific heat alert
      const alert = await seniorHeatAlerts.generateSeniorHeatAlert(senior.zipcode, senior);
      
      console.log(`   🚨 Alert Level: ${alert.urgency.toUpperCase()}`);
      console.log(`   🎯 Risk Level: ${alert.riskLevel.toUpperCase()}`);
      console.log(`   ⏰ Check-in Frequency: Every ${alert.checkInMinutes} minutes`);
      console.log(`   📱 Message Preview:\n   "${alert.message.substring(0, 100)}..."`);
      
      // Test health check-in message
      if (alert.urgency === 'emergency' || alert.urgency === 'high') {
        const checkinMsg = seniorHeatAlerts.generateSeniorHealthCheckin(alert.heatWaveData, senior);
        console.log(`   🔔 Check-in Message Preview:\n   "${checkinMsg.substring(0, 80)}..."`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    console.log('─'.repeat(70));
  }
}

async function testHealthResponses() {
  console.log('\n🩺 Testing Health Check-in Responses:\n');
  
  const testSenior = {
    firstName: 'Betty',
    age: 75,
    zipcode: '85001'
  };
  
  const mockHeatWave = {
    maxFeelsLike: 108, // Extreme heat
    alertLevel: 'emergency'
  };

  const responses = [
    { code: '1', meaning: 'Feeling good/safe' },
    { code: '2', meaning: 'Somewhat warm/OK' },
    { code: '3', meaning: 'Not feeling well' }
  ];

  for (const response of responses) {
    console.log(`📱 Response: "${response.code}" (${response.meaning})`);
    
    const result = seniorHeatAlerts.processSeniorHealthResponse(
      response.code, 
      mockHeatWave, 
      testSenior
    );
    
    console.log(`   🎯 Urgency: ${result.urgency.toUpperCase()}`);
    console.log(`   ⏰ Next Check-in: ${result.nextCheckInMinutes} minutes`);
    console.log(`   🚨 Escalate: ${result.escalate ? 'YES' : 'NO'}`);
    console.log(`   💬 Response: "${result.message.substring(0, 80)}..."`);
    console.log('');
  }
}

async function runTests() {
  try {
    await testSeniorAlerts();
    await testHealthResponses();
    
    console.log('\n✅ Senior Heat Alert System Testing Complete!');
    console.log('\n🎯 Key Features Demonstrated:');
    console.log('   • Lower heat thresholds for seniors (90°F vs 95°F)');
    console.log('   • Age-specific risk assessment');
    console.log('   • Health condition awareness');
    console.log('   • Medication heat warnings');
    console.log('   • Frequent health check-ins during heat events');
    console.log('   • Emergency escalation for seniors');
    console.log('   • Clear, actionable safety instructions');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

runTests();
