// Test Twilio WhatsApp Configuration
const { getTwilioClient } = require('./services');

async function testTwilioConfig() {
  console.log('🔍 Testing Twilio WhatsApp Configuration');
  console.log('=====================================');
  
  const twilio = getTwilioClient();
  
  console.log('📋 Configuration:');
  console.log('  Account SID:', twilio.accountSid);
  console.log('  WhatsApp Number:', process.env.TWILIO_WHATSAPP_NUMBER);
  console.log('  Environment:', process.env.NODE_ENV || 'development');
  
  // Test 1: Try to send to sandbox number itself
  console.log('\n🧪 Test 1: Sending to sandbox number...');
  try {
    const message = await twilio.messages.create({
      body: 'Test message to sandbox',
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    });
    console.log('✅ Success! Message SID:', message.sid);
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('   Code:', error.code);
    console.log('   Status:', error.status);
  }
  
  // Test 2: Try different phone number formats
  console.log('\n🧪 Test 2: Testing different formats...');
  const testNumbers = [
    '+14155238886',
    'whatsapp:+14155238886',
    '+1-415-523-8886',
    '14155238886'
  ];
  
  for (const number of testNumbers) {
    try {
      console.log(`   Testing format: ${number}`);
      const message = await twilio.messages.create({
        body: 'Format test',
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${number}`,
      });
      console.log(`   ✅ Success with ${number}!`);
      break;
    } catch (error) {
      console.log(`   ❌ Failed with ${number}: ${error.message}`);
    }
  }
  
  console.log('\n💡 Possible Solutions:');
  console.log('1. Check Twilio Console for WhatsApp sandbox status');
  console.log('2. Verify phone number is connected to sandbox');
  console.log('3. Check if WhatsApp Business API is enabled');
  console.log('4. Try using a different phone number');
}

if (require.main === module) {
  testTwilioConfig();
}

module.exports = { testTwilioConfig };
